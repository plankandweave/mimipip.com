import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabase } from "@/lib/supabase";
import { maybeCreateRazorpayOrder } from "@/lib/razorpay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Open a payment window for an order that was placed but never paid for.
 *
 * The create half only — the browser hands Razorpay's response to the existing
 * /api/razorpay/verify, which maps it back by razorpay_order_id and does
 * everything a paid order needs (gift deduction, discount redemption, the print
 * files checkout may have missed, the OS push, the founder's note). A second,
 * thinner "paid" path here would be a paid order that silently skipped all of
 * that.
 *
 * The amount is the order's own stored total, never the browser's. A fresh
 * Razorpay order every time, for the same reason the resume path in
 * /api/checkout mints one: the stored id belongs to an attempt that was never
 * paid, and nothing records the amount it was opened for.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;

  const { data, error } = await supabase.rpc("order_pay_context", { p_token: token });
  if (error) {
    console.error("order_pay_context failed:", error.message);
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }
  const order = data as {
    order_id: string;
    order_number: number;
    total: number | string;
    pending_gift_code: string | null;
  } | null;
  // Null covers both "no such order" and "nothing left to pay" — the page
  // renders from the same state, so it cannot honestly ask for money here.
  if (!order) return NextResponse.json({ error: "not_payable" }, { status: 409 });

  // A gift card reserved at checkout still covers its part; the deduction
  // happens at /api/razorpay/verify, never here.
  const orderTotal = Math.round(Number(order.total));
  let giftApplied = 0;
  if (order.pending_gift_code) {
    const { data: st } = await supabase.rpc("gift_card_status", { p_code: order.pending_gift_code });
    const s = st as { valid?: boolean; balance?: number } | null;
    if (s?.valid && (s.balance ?? 0) > 0) giftApplied = Math.min(s.balance!, orderTotal);
  }
  const payable = Math.max(0, orderTotal - giftApplied);
  // The token RPC proved ownership; the anon client cannot read private orders.
  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ error: "payments_unavailable" }, { status: 503 });
  const { data: saved, error: savedError } = await admin.from("orders").select("notes").eq("id", order.order_id).maybeSingle();
  if (savedError || !saved) return NextResponse.json({ error: "payments_unavailable" }, { status: 503 });
  let presentment: { presentmentCurrency?: "INR" | "USD"; presentmentTotal?: number; marketCountry?: string } = {};
  try {
    presentment = JSON.parse((saved as { notes?: string | null } | null)?.notes ?? "{}");
  } catch {
    presentment = {};
  }
  const currency = presentment.presentmentCurrency === "USD" ? "USD" : "INR";
  const paymentAmount = currency === "USD" && Number(presentment.presentmentTotal) > 0
    ? Number(presentment.presentmentTotal)
    : payable;

  // Covered in full by the card is a state change on a live order, not a
  // payment window. Checkout's resume path refuses it for the same reason.
  if (payable <= 0) {
    return NextResponse.json(
      {
        error: "needs_help",
        detail: `Order #${order.order_number} needs no further payment — email hello@zyvorah.com and we'll confirm it.`,
      },
      { status: 409 },
    );
  }

  const razorpay = await maybeCreateRazorpayOrder(
    paymentAmount,
    `order-${order.order_number}`,
    { market_country: presentment.marketCountry ?? "IN", resumed: "true" },
    currency,
  );
  if (!razorpay) return NextResponse.json({ error: "payments_unavailable" }, { status: 503 });

  const { error: mappingError } = await supabase.rpc("set_order_razorpay", {
    p_order_id: order.order_id,
    p_rzp_order_id: razorpay.razorpayOrderId,
  });

  if (mappingError) return NextResponse.json({ error: "payments_unavailable" }, { status: 503 });
  return NextResponse.json({ ok: true, razorpay, payable, giftApplied });
}
