import { NextResponse, after } from "next/server";
import { verifyCheckoutSignature } from "@/lib/razorpay-verify";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { recordCommercialEvent } from "@/lib/server-events";
import { settlePaidOrder, produceThenNotify, spendReservedGift } from "@/lib/retail-paid";
import { sendGaPurchaseForOrder } from "@/lib/ga-mp";
import { sendMetaPurchaseForOrder } from "@/lib/meta-capi";
import { metaContextFromRequest } from "@/lib/meta-request";
import { releaseSoldExclusiveFromNav } from "@/lib/concept-availability";

export const runtime = "nodejs";

// Verifies the Razorpay payment signature server-side (HMAC-SHA256 of
// `${order_id}|${payment_id}` with the key secret) before marking the order
// paid. Never trust the client's claim of payment without this check.
export async function POST(req: Request) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return NextResponse.json({ error: "payments_not_configured" }, { status: 503 });

  const body = await req.json().catch(() => null);
  const orderId = body?.razorpay_order_id;
  const paymentId = body?.razorpay_payment_id;
  const signature = body?.razorpay_signature;
  if (!orderId || !paymentId || !signature) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  if (!verifyCheckoutSignature(orderId, paymentId, signature, secret)) {
    return NextResponse.json({ error: "signature_mismatch" }, { status: 400 });
  }

  const admin=supabaseAdmin();
  if(!admin)return NextResponse.json({error:"payments_unavailable"},{status:503});
  const { data, error } = await admin.rpc("mark_order_paid_by_rzp", {
    p_rzp_order_id: orderId,
    p_payment_id: paymentId,
    p_signature: signature,
  });
  if (error) {
    console.error("mark_order_paid_by_rzp failed:", error.message);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  const payload = data as import("@/lib/fulfillment/types").ShippingOrder;
  after(() => releaseSoldExclusiveFromNav(payload.order_id));

  // If a gift card was reserved for this order (partial coverage), deduct it now
  // that the remainder is paid — never before, so an abandoned payment can't
  // spend the balance.
  try {
    const { data: bundle } = await admin.rpc("get_order_for_invoice", { p_order_id: payload.order_id });
    const order = (bundle as { order?: { pending_gift_code?: string | null; discount_code?: string | null } } | null)?.order;
    // Claimed once, so the webhook reporting this same capture cannot spend it
    // a second time (lib/retail-paid.ts).
    if (order?.pending_gift_code) await spendReservedGift(payload.order_id);
    // Payment confirmed → burn the order's discount code on the OS. Redeem
    // only fires here (never at checkout) so an abandoned payment can't waste
    // the customer's one-time code.
    if (order?.discount_code) {
      // A creator collaboration code is spent on its own row; any other code
      // on the OS (lib/discounts.ts decides which).
      const { redeemDiscount } = await import("@/lib/discounts");
      after(() => redeemDiscount(order.discount_code!, { orderId: payload.order_id, orderNumber: payload.order_number }));
    }
  } catch (e) {
    console.error("gift apply on payment failed:", e);
  }

  // NOTE: courier booking deliberately does NOT happen here any more.
  //
  // Paid ≠ shippable: booking at payment mints an AWB (and, once a pickup is
  // generated, summons a courier) for a mural that has not been printed yet.
  // Every web order reaches the OS below, and the OS books it against the one
  // event that means the print is really committed — the bridge acking the
  // files into the hot folder. Booking here as well would produce two
  // Shiprocket orders for one shipment — the store and the OS number their
  // Shiprocket orders differently, so Shiprocket would not even dedupe them.
  // See lib/zyvorah-shiprocket.ts in the OS; there is no courier client left
  // in this app at all.

  // Paid → the order becomes an order: its ZVY number, a sample's cards and
  // the OS push carrying this payment (lib/retail-paid.ts — the same steps the
  // webhook runs when the browser never comes back). The number is returned
  // so the confirmation and the browser's purchase events quote it.
  const zvy = await settlePaidOrder(payload.order_id, {
    paymentReference: String(paymentId),
    shipping: payload,
  });

  // The print files, the order copy and then the customer's confirmation
  // email, after the response: nothing was produced before payment, and a
  // print master is not worth delaying the confirmation over. Idempotent per
  // order, so the webhook reporting the same capture cannot double any of it.
  after(() => produceThenNotify(payload.order_id));

  // Paid → record the payment. Subject is the Razorpay payment id, which is the
  // whole idempotency story: the webhook may report this same capture, and both
  // paths hash to one event_key, so the two cannot double-count each other and
  // neither has to know the other exists.
  //
  // The visitor token is read off the order rather than a cookie — this route is
  // called by the browser, but the webhook is not, and both must attribute the
  // same payment the same way.
  after(async () => {
    const { data: attr } = await admin
      .from("orders")
      .select("visitor_token, total")
      .eq("id", payload.order_id)
      .maybeSingle();
    await recordCommercialEvent({
      event: "payment_captured",
      subject: paymentId,
      token: (attr as { visitor_token?: string | null } | null)?.visitor_token ?? null,
      valueInr: (attr as { total?: number | null } | null)?.total ?? null,
      meta: { method: "razorpay", order_id: payload.order_id, order_number: payload.order_number },
    });
  });

  // Paid → the GA4 purchase from the server, addressed to the checkout's GA
  // client. The browser fires its own on this same response; GA dedups the
  // pair by transaction_id. Idempotent with the webhook through the claim.
  after(() => sendGaPurchaseForOrder(payload.order_id));

  // Paid → the same Purchase to Meta's Conversions API, carrying the _fbp and
  // _fbc cookies this request arrived with so the conversion can be joined to
  // the ad click that started it. The browser fires its own on this response;
  // Meta dedups the pair on the shared event id, so the webhook may repeat it.
  const metaContext = metaContextFromRequest(req);
  after(() => sendMetaPurchaseForOrder(payload.order_id, metaContext));

  return NextResponse.json({ ok: true, orderNumber: payload.order_number, zvy });
}
