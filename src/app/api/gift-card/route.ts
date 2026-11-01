import { NextResponse, after } from "next/server";
import { autoSubscribe } from "@/lib/subscribe";
import { supabase } from "@/lib/supabase";
import { maybeCreateRazorpayOrder } from "@/lib/razorpay";

export const runtime = "nodejs";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Buy a Zyvorah gift card. Creates a pending card + a Razorpay order; the card
// is activated (and its code revealed) only after the payment is verified.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);

  const purchaserEmail = (body?.purchaserEmail ?? "").trim();
  if (!EMAIL_RE.test(purchaserEmail)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  // The buyer saw the subscribe line under "Buy gift card"; the recipient did not.
  after(() => autoSubscribe(purchaserEmail, "gift-card"));
  const recipientEmail = (body?.recipientEmail ?? "").trim();
  if (recipientEmail && !EMAIL_RE.test(recipientEmail)) {
    return NextResponse.json({ error: "invalid_recipient" }, { status: 400 });
  }

  // Amount clamped server-side (RPC clamps too).
  const amount = Math.min(50000, Math.max(500, Math.floor(Number(body?.amount) || 0)));
  if (amount < 500) return NextResponse.json({ error: "invalid_amount" }, { status: 400 });

  // A gift card is a paid product — never create one without a payment path.
  if (!process.env.RAZORPAY_KEY_ID) {
    return NextResponse.json({ error: "payments_unavailable" }, { status: 503 });
  }

  const { data, error } = await supabase.rpc("create_gift_card", {
    p_amount: amount,
    p_purchaser_email: purchaserEmail,
    p_purchaser_name: (body?.purchaserName ?? "").trim() || null,
    p_recipient_email: recipientEmail || purchaserEmail,
    p_recipient_name: (body?.recipientName ?? "").trim() || null,
    p_message: String(body?.message ?? "").trim().slice(0, 300) || null,
    p_design: String(body?.design ?? "general").trim().slice(0, 40) || "general",
  });
  if (error) {
    console.error("create_gift_card failed:", error.message);
    return NextResponse.json({ error: "create_failed" }, { status: 400 });
  }

  const row = (Array.isArray(data) ? data[0] : data) as { gift_id: string; amount: number };

  const razorpay = await maybeCreateRazorpayOrder(amount, `gift-${row.gift_id.slice(0, 8)}`);
  if (razorpay) {
    await supabase.rpc("set_gift_card_razorpay", { p_gift_id: row.gift_id, p_rzp: razorpay.razorpayOrderId });
  }

  return NextResponse.json({
    giftId: row.gift_id,
    amount,
    razorpay,
    paymentPending: !razorpay,
  });
}
