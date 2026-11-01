import { isInternalOrder } from "@/lib/internal-orders";
import { NextResponse, after } from "next/server";
import { autoSubscribe } from "@/lib/subscribe";
import { refusePartnerPurchase } from "@/lib/partner-mode";
import { cookies } from "next/headers";
import { TASTE_COOKIE } from "@/lib/taste";
import { visitorTokenOf } from "@/lib/server-events";
import { gaIdsFromCookies } from "@/lib/ga-mp";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabase } from "@/lib/supabase";
import { maybeCreateRazorpayOrder } from "@/lib/razorpay";
import { isSampleFinish } from "@/lib/sample-finishes";
import { isSampleableHandle } from "@/lib/queries";
import { SAMPLE_UNIT_PRICE, enqueueSampleCards } from "@/lib/sample-print";

export const runtime = "nodejs";

// A printed design sample is DESIGN × MATERIAL — ₹200 per line, no separate
// quantity. Selecting 2 finishes for one design creates 2 explicit lines and
// charges ₹400, never an ambiguous "how many" total. Reuses /api/razorpay/verify
// for payment, since the order lives in the same `orders` table (placed_via =
// 'sample').

export async function POST(req: Request) {
  // A partner's person never buys through the retail till — their wall goes
  // to a customer project and procurement releases it (src/lib/partner-mode.ts).
  const partnerRefusal = await refusePartnerPurchase();
  if (partnerRefusal) return partnerRefusal;

  // Service role, not the anon key: these SECURITY DEFINER RPCs have no
  // internal auth gate, so as anon they were reachable from the browser key.
  const sb = supabaseAdmin();
  if (!sb) {
    console.error("sample-order: SUPABASE_SERVICE_ROLE_KEY not configured");
    return NextResponse.json({ error: "server_misconfigured" }, { status: 503 });
  }

  const body = await req.json().catch(() => null);

  const email = (body?.email ?? "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  // The order button carries the subscribe line (SubscribeDisclosure).
  after(() => autoSubscribe(email, "samples"));

  // Samples are paid — never create one without a payment path.
  if (!process.env.RAZORPAY_KEY_ID) {
    return NextResponse.json({ error: "payments_unavailable" }, { status: 503 });
  }

  const addr = body?.address ?? {};
  const name = (body?.name ?? "").trim();
  const line1 = (addr.line1 ?? "").trim();
  const city = (addr.city ?? "").trim();
  const pincode = (addr.pincode ?? "").trim();
  if (!name || !line1 || !city || !/^[1-9]\d{5}$/.test(pincode)) {
    return NextResponse.json({ error: "invalid_address" }, { status: 400 });
  }

  const design = body?.design ?? {};
  const designHandle = String(design.handle ?? "").trim();
  let designTitle = String(design.title ?? "").trim();
  if (!designHandle || !designTitle) {
    return NextResponse.json({ error: "missing_design" }, { status: 400 });
  }

  // Samples require verified wallpaper artwork and available Soft Matte stock. The
  // pickers already filter to it, but this is the check that actually holds:
  // the client sends the handle, so without it a stale page or a hand-made
  // request could bank a paid order for a design we aren't sampling.
  if (!(await isSampleableHandle(designHandle))) {
    return NextResponse.json({ error: "design_not_sampleable" }, { status: 400 });
  }

  const { data: selectedDesign, error: designError } = await supabase.from("products").select("title").eq("handle", designHandle).single();
  if (designError || !selectedDesign) return NextResponse.json({ error: "design_unavailable" }, { status: 503 });
  designTitle = selectedDesign.title;

  // Only finishes we can actually print, and each at most once — the note below
  // is what the print desk works from, so an unrecognised or duplicated string
  // off the client would bank a paid order against stock that doesn't exist.
  const requested: unknown[] = Array.isArray(body?.finishes) ? body.finishes : [];
  const finishes: string[] = [
    ...new Set(requested.filter((s): s is string => typeof s === "string" && isSampleFinish(s))),
  ];
  if (!finishes.length) {
    return NextResponse.json({ error: "missing_finishes" }, { status: 400 });
  }

  // One ₹200 line per selected finish — amount is fully server-computed, never
  // trusted from the client.
  const amount = finishes.length * SAMPLE_UNIT_PRICE;

  const note =
    `Printed design sample — ${designTitle} (${designHandle})\n` +
    finishes.map((f) => `${designTitle} · ${f} · Qty 1 · Rs ${SAMPLE_UNIT_PRICE}`).join("\n");

  const phone = (body?.phone ?? "").trim() || null;
  const shippingAddress = {
    name,
    line1,
    city,
    state: (addr.state ?? "").trim() || null,
    pincode,
  };

  const { data, error } = await supabase.rpc("create_sample_order", {
    p_email: email,
    p_phone: phone,
    p_shipping_address: shippingAddress,
    p_note: note,
    p_amount: amount,
  });
  if (error) {
    console.error("create_sample_order failed:", error.message);
    return NextResponse.json({ error: "order_failed" }, { status: 400 });
  }

  const row = (Array.isArray(data) ? data[0] : data) as { order_id: string; order_number: number };

  // Optional buyer GST details for the dispatch-time tax invoice.
  const gstin = typeof body?.gstin === "string" ? body.gstin.trim().toUpperCase() : null;
  const billingName = typeof body?.billingName === "string" ? body.billingName.trim() : null;
  if (gstin || billingName) {
    const { error: gstErr } = await sb.rpc("set_order_gst", {
      p_order_id: row.order_id,
      p_gstin: gstin,
      p_billing_name: billingName,
    });
    if (gstErr) console.error("set_order_gst (sample) failed:", gstErr.message);
  }

  // Record the design × finish structurally NOW — this request is the only
  // place they exist as values; after it they survive only as prose in `note`.
  // The rows land 'unpaid' and cannot reach production until payment activates
  // them. Never fatal: the note is still there for a person to work from.
  try {
    const { queued, skipped } = await enqueueSampleCards({
      orderId: row.order_id,
      orderNumber: row.order_number,
      designHandle,
      designTitle,
      finishes,
    });
    if (skipped.length) {
      console.error(`sample order ${row.order_number}: ${queued} card(s) queued, ${skipped.length} need hand-setting (${skipped.join(", ")})`);
    }
  } catch (e) {
    console.error(`sample card enqueue failed (order ${row.order_number}):`, e);
  }

  const razorpay = await maybeCreateRazorpayOrder(amount, `sample-${row.order_number}`);
  if (!razorpay) {
    // Keys ARE configured (checked above), so a null here means Razorpay
    // rejected the order create (e.g. 401 auth failure — bad/mismatched keys,
    // or a regenerated secret). Samples are pay-now: never pretend a payment
    // link is coming (no such automation exists) and never bank an unpayable
    // order. Surface a real error so the customer retries and the failure is
    // visible instead of silently degrading.
    console.error(`sample-order ${row.order_number}: razorpay init failed after order create`);
    return NextResponse.json(
      { error: "payment_init_failed", orderNumber: row.order_number },
      { status: 502 },
    );
  }

  await supabase.rpc("set_order_razorpay", {
    p_order_id: row.order_id,
    p_rzp_order_id: razorpay.razorpayOrderId,
  });

  // The GA client, so the paid sample can be reported server-side even if the
  // browser is gone when Razorpay confirms (src/lib/ga-mp.ts). Best-effort.
  try {
    const store = await cookies();
    const gaIds = isInternalOrder(email) ? null : gaIdsFromCookies((n) => store.get(n)?.value, process.env.NEXT_PUBLIC_GA_ID);
    const visitorToken = visitorTokenOf(store.get(TASTE_COOKIE)?.value);
    if (gaIds || visitorToken) {
      const { error } = await sb.from("orders").update({
        ...(visitorToken ? { visitor_token: visitorToken } : {}),
        ...(gaIds ? { ga_client_id: gaIds.clientId, ga_session_id: gaIds.sessionId } : {}),
      }).eq("id", row.order_id);
      if (error) console.error("sample order attribution failed:", error.message);
    }
  } catch (e) {
    console.error("sample order ga ids failed:", e);
  }

  return NextResponse.json({
    orderNumber: row.order_number,
    orderId: row.order_id,
    amount,
    lineCount: finishes.length,
    razorpay,
  });
}
