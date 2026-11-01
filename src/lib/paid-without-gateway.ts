import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { settlePaidOrder, produceThenNotify } from "@/lib/retail-paid";
import { sendMetaPurchaseForOrder } from "@/lib/meta-capi";
import { sendGaPurchaseForOrder } from "@/lib/ga-mp";
import { recordCommercialEvent } from "@/lib/server-events";
import { redeemDiscount } from "@/lib/discounts";
import type { ShippingOrder } from "@/lib/fulfillment/types";

/**
 * An order confirmed with NO payment leg: covered in full by a gift card, or
 * taken to ₹0 by a creator collaboration code. No Razorpay order exists, so
 * neither /api/razorpay/verify nor the webhook will ever run for it — and
 * everything a paid order needs happens there. Until 7 October 2026 the
 * gift-paid branch of checkout did its own shorter list and never pushed the
 * order to the OS at all. This is the one list, for both.
 */
export async function afterPaidWithoutGateway(input: {
  order: ShippingOrder;
  method: "gift_card" | "creator_collab";
  discountCode: string | null;
  visitorToken: string | null;
  customerId: string | null;
  orderTotalInr: number;
  metaContext: Parameters<typeof sendMetaPurchaseForOrder>[1];
}): Promise<void> {
  const { order } = input;
  const orderRef = { orderId: order.order_id, orderNumber: order.order_number };

  // The system of record must hear about it, AS SETTLED. The OS stamps a sale
  // paid when the push carries a payment block (markSalePaid in the OS's
  // wallpaper-payment.ts), and without one a website order is booked unpaid —
  // the retail chaser would then dun a creator for a wall we gave her. The
  // reference names the method; nothing on the OS looks it up at Razorpay,
  // and the amount is the order total as stored (₹0 for a collaboration).
  // Idempotent on the order ref, env-gated, never throws past here.
  //
  // The ZVY number comes first (lib/retail-paid.ts): nothing is numbered
  // before payment any more, and the OS must not mint its own.
  const reference = input.method === "creator_collab"
    ? `COLLAB-${input.discountCode ?? order.order_number}`
    : `GIFTCARD-${order.order_number}`;
  await settlePaidOrder(order.order_id, { paymentReference: reference, shipping: order });

  // Spend the code now the order is confirmed — a collaboration row records
  // the order it bought; anything else is burnt on the OS.
  if (input.discountCode) after(() => redeemDiscount(input.discountCode!, orderRef));

  // The payment event: subject names the method so a replay is one row.
  after(() =>
    recordCommercialEvent({
      event: "payment_captured",
      subject: `${input.method}:${order.order_id}`,
      token: input.visitorToken,
      customerId: input.customerId,
      valueInr: input.orderTotalInr,
      meta: { method: input.method, order_number: order.order_number, discount_code: input.discountCode },
    }),
  );
  after(() => sendGaPurchaseForOrder(order.order_id));
  after(() => sendMetaPurchaseForOrder(order.order_id, input.metaContext));
  // Print files and the order copy, then the confirmation email that links it.
  after(() => produceThenNotify(order.order_id));
}

/** The shipping payload mark_order_paid_by_rzp returns, read for an order
 *  confirmed another way, so the OS push is the same shape either way. */
export async function loadShippingOrder(orderId: string): Promise<ShippingOrder | null> {
  const db = supabaseAdmin();
  if (!db) return null;
  const { data: o } = await db
    .from("orders")
    .select("id, order_number, email, phone, subtotal, shipping_address")
    .eq("id", orderId)
    .maybeSingle();
  if (!o) return null;
  const { data: items } = await db
    .from("order_items")
    .select("product_title, quantity, line_total, area_sqft, height_cm")
    .eq("order_id", orderId);
  const row = o as { id: string; order_number: number; email: string | null; phone: string | null; subtotal: number; shipping_address: ShippingOrder["shipping_address"] };
  return {
    order_id: row.id,
    order_number: row.order_number,
    email: row.email,
    phone: row.phone,
    subtotal: Number(row.subtotal),
    shipping_address: row.shipping_address,
    items: ((items ?? []) as { product_title: string; quantity: number; line_total: number; area_sqft: number; height_cm: number }[]).map((it) => ({
      title: it.product_title,
      qty: it.quantity,
      line_total: Number(it.line_total),
      area_sqft: Number(it.area_sqft),
      height_cm: Number(it.height_cm),
    })),
  };
}
