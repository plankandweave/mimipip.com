import { NextResponse } from "next/server";
import { requireTradePartner } from "@/lib/trade-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { maybeCreatePaymentLink } from "@/lib/razorpay";
import { isValidGstin } from "@/lib/gst";
import { sendEmail } from "@/lib/email";
import { tradePaymentLinkEmail } from "@/lib/email-templates";
import { formatINR } from "@/lib/pricing";

export const runtime = "nodejs";
export const maxDuration = 60;

// Trade partner order placement (Phase 2). Money is involved, so this route
// deliberately does NOT use the anon-key client anywhere — every DB call goes
// through supabaseAdmin() (service role). The pricing itself is never trusted
// from this request body either: trade_checkout (0070_trade_orders.sql)
// recomputes every rupee server-side from product_materials.price_per_sqft;
// this route only shapes/validates the request and never forwards a
// line_total/unit_price/total to the RPC.

type TradeOrderItemInput = {
  design_source?: string;
  product_id?: string;
  design_ref?: string | null;
  material_id?: string;
  width_cm?: number;
  height_cm?: number;
  quantity?: number;
  markup_pct?: number;
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PINCODE_RE = /^[1-9][0-9]{5}$/;

function badRequest(error: string, detail?: unknown) {
  return NextResponse.json({ error, ...(detail !== undefined ? { detail } : {}) }, { status: 400 });
}

export async function POST(req: Request) {
  const { partner, blocked } = await requireTradePartner();
  if (blocked) return blocked;

  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ error: "service_unavailable" }, { status: 503 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return badRequest("invalid_body");

  const customer = body.customer ?? {};
  const email = typeof customer.email === "string" ? customer.email.trim() : "";
  if (!EMAIL_RE.test(email)) return badRequest("invalid_customer_email");
  const phone = typeof customer.phone === "string" ? customer.phone.trim() : "";
  const name = typeof customer.name === "string" ? customer.name.trim() : "";
  if (!name) return badRequest("customer_name_required");
  const gstinRaw = typeof customer.gstin === "string" ? customer.gstin.trim().toUpperCase() : "";
  if (gstinRaw && !isValidGstin(gstinRaw)) return badRequest("invalid_customer_gstin");

  // Shape mirrors /api/checkout's shippingAddress — same fields the rest of
  // the order pipeline (invoice, shipping labels) already expects.
  const addr = body.shippingAddress ?? {};
  const line1 = typeof addr.line1 === "string" ? addr.line1.trim() : "";
  const city = typeof addr.city === "string" ? addr.city.trim() : "";
  const state = typeof addr.state === "string" ? addr.state.trim() : "";
  const pincode = typeof addr.pincode === "string" ? addr.pincode.trim() : "";
  if (!line1 || !city || !PINCODE_RE.test(pincode)) return badRequest("invalid_shipping_address");
  const shippingAddress = { name: name, line1, city, state, pincode };

  const itemsIn: TradeOrderItemInput[] = Array.isArray(body.items) ? body.items : [];
  if (itemsIn.length === 0) return badRequest("no_items");

  // Shape-validate only — every price is recomputed inside trade_checkout.
  // This loop exists to fail fast with a clear error, not to compute anything
  // that gets trusted downstream.
  const items = [];
  for (const it of itemsIn) {
    if (it.design_source !== "catalogue" && it.design_source !== "own") {
      return badRequest("invalid_item_design_source");
    }
    if (typeof it.product_id !== "string" || !it.product_id) return badRequest("invalid_item_product_id");
    if (typeof it.material_id !== "string" || !it.material_id) return badRequest("invalid_item_material_id");
    if (!(typeof it.width_cm === "number" && it.width_cm > 0)) return badRequest("invalid_item_width");
    if (!(typeof it.height_cm === "number" && it.height_cm > 0)) return badRequest("invalid_item_height");
    if (!(typeof it.quantity === "number" && Number.isInteger(it.quantity) && it.quantity >= 1)) {
      return badRequest("invalid_item_quantity");
    }
    const markupPct = typeof it.markup_pct === "number" ? it.markup_pct : 0;
    if (it.design_source === "own" && (typeof it.design_ref !== "string" || !it.design_ref)) {
      return badRequest("invalid_item_design_ref");
    }
    items.push({
      design_source: it.design_source,
      product_id: it.product_id,
      design_ref: it.design_source === "own" ? it.design_ref : null,
      material_id: it.material_id,
      width_cm: it.width_cm,
      height_cm: it.height_cm,
      quantity: it.quantity,
      markup_pct: markupPct,
    });
  }

  const express = body.express === true;

  const { data, error } = await admin.rpc("trade_checkout", {
    p_partner_id: partner.id,
    p_customer_email: email,
    p_customer_phone: phone || null,
    p_customer_name: name,
    p_customer_gstin: gstinRaw || null,
    p_shipping_address: shippingAddress,
    p_items: items,
    p_express: express,
  });
  if (error) {
    console.error("trade_checkout failed:", error.message);
    return NextResponse.json({ error: "checkout_failed", detail: error.message }, { status: 400 });
  }

  const result = data as {
    order_id: string;
    order_number: number;
    subtotal: number;
    shipping: number;
    markup_total: number;
    total: number;
  };

  // Give every line its print crop (the design image + cover fit) now, while
  // the order is fresh — the payment webhook pushes this order to the OS print
  // queue and a line without artwork is dropped from that push. Best-effort:
  // the webhook re-runs the same backfill before pushing, so a failure here
  // costs nothing but this log line.
  try {
    const { ensureTradePrintCrops } = await import("@/lib/trade-os");
    await ensureTradePrintCrops(admin, result.order_id);
  } catch (e) {
    console.error("trade order print-crop backfill failed:", e);
  }

  // Payment link — full payment only, no partial (spec: "Full payment
  // required"). If Razorpay isn't configured or the call fails, the order
  // still exists (pending/pending, matches retail's "never fulfilled without
  // payment" posture) — surface that clearly rather than pretending success.
  const link = await maybeCreatePaymentLink({
    amountInr: Math.round(result.total),
    referenceId: `trade-${result.order_number}`,
    description: `Zyvorah order #${result.order_number}`,
    customer: { name, email, contact: phone || undefined },
  });

  if (!link) {
    return NextResponse.json(
      {
        error: "payment_link_unavailable",
        orderId: result.order_id,
        orderNumber: result.order_number,
        total: result.total,
      },
      { status: 503 },
    );
  }

  await admin
    .from("orders")
    .update({ payment_link_id: link.id, payment_link_url: link.shortUrl })
    .eq("id", result.order_id);

  // Co-branded email to the END CUSTOMER — the partner's logo, never Zyvorah
  // pretending to be the partner (Zyvorah stays seller of record per spec).
  const { data: partnerRow } = await admin
    .from("trade_partners")
    .select("legal_name, logo_url")
    .eq("id", partner.id)
    .maybeSingle();

  try {
    const tpl = tradePaymentLinkEmail({
      partnerName: partnerRow?.legal_name ?? partner.legal_name,
      partnerLogoUrl: partnerRow?.logo_url ?? null,
      orderNumber: result.order_number,
      totalLabel: formatINR(result.total),
      paymentUrl: link.shortUrl,
    });
    await sendEmail({ to: email, subject: tpl.subject, html: tpl.html });
  } catch (e) {
    console.error("trade payment-link email failed:", e);
  }

  return NextResponse.json({
    orderId: result.order_id,
    orderNumber: result.order_number,
    subtotal: result.subtotal,
    shipping: result.shipping,
    markupTotal: result.markup_total,
    total: result.total,
    paymentLinkUrl: link.shortUrl,
    paymentLinkId: link.id,
  });
}

// Minimal list for the future dashboard (Phase 5) — this partner's own orders
// only, newest first.
export async function GET() {
  const { partner, blocked } = await requireTradePartner();
  if (blocked) return blocked;

  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ error: "service_unavailable" }, { status: 503 });

  const { data, error } = await admin
    .from("orders")
    .select(
      "id, order_number, status, payment_status, email, phone, subtotal, shipping, markup_total, total, payment_link_url, created_at",
    )
    .eq("trade_partner_id", partner.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("trade orders list failed:", error.message);
    return NextResponse.json({ error: "list_failed" }, { status: 500 });
  }

  return NextResponse.json({ orders: data ?? [] });
}
