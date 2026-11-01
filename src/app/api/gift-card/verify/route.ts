import { NextResponse } from "next/server";
import { verifyCheckoutSignature } from "@/lib/razorpay-verify";
import { supabase } from "@/lib/supabase";
import { sendEmail } from "@/lib/email";
import { giftCardRecipientEmail } from "@/lib/email-templates";
import { formatINR } from "@/lib/pricing";

export const runtime = "nodejs";

// Verify the Razorpay payment for a gift-card purchase, then activate the card
// and return its code to reveal to the buyer.
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

  const { data, error } = await supabase.rpc("activate_gift_card_by_rzp", {
    p_rzp: orderId,
    p_payment_id: paymentId,
  });
  if (error || !data) {
    console.error("activate_gift_card_by_rzp failed:", error?.message);
    return NextResponse.json({ error: "activate_failed" }, { status: 500 });
  }

  const card = data as {
    gift_id: string; code: string; amount: number;
    recipient_email: string | null; recipient_name: string | null;
    purchaser_email: string | null; purchaser_name: string | null; message: string | null;
    design: string | null;
  };

  // Auto-email the recipient (idempotent — a client retry can't double-send).
  if (card.recipient_email) {
    const { data: claimed } = await supabase.rpc("claim_gift_card_notification", { p_gift_id: card.gift_id });
    if (claimed) {
      const isSelfPurchase = !card.purchaser_email || card.recipient_email === card.purchaser_email;
      const { subject, html } = giftCardRecipientEmail({
        code: card.code,
        amountLabel: formatINR(card.amount),
        recipientName: card.recipient_name,
        purchaserName: card.purchaser_name,
        message: card.message,
        isSelfPurchase,
        design: card.design || "general",
      });
      sendEmail({ to: card.recipient_email, subject, html }).catch((e) => console.error("gift card email failed:", e));
    }
  }

  return NextResponse.json({ ok: true, code: card.code, amount: card.amount, recipientEmail: card.recipient_email });
}
