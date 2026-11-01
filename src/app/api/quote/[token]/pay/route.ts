import { NextResponse } from "next/server";
import { verifyCheckoutSignature } from "@/lib/razorpay-verify";
import { maybeCreateRazorpayOrder } from "@/lib/razorpay";
import { fetchQuote, markQuotePaid } from "@/lib/zyvorah-quote-os";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Pay a site-visit quotation.
 *
 * POST            → open a Razorpay order for the quoted amount.
 * POST ?verify=1  → check the signature and, only then, tell the OS it is paid.
 *
 * The amount is taken from the OS, never from the browser: a page that could
 * name its own price would be a page that could buy a wall for one rupee.
 */

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const url = new URL(req.url);
  const quote = await fetchQuote(token);
  if (!quote) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // ── Verify half ─────────────────────────────────────────────────────────
  if (url.searchParams.get("verify") === "1") {
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

    const res = await markQuotePaid(token, String(paymentId), Number(quote.grandTotal ?? 0));
    if (!res.ok) {
      // The money is real and Razorpay has it. Never tell the customer it
      // failed — say it's received and let a human reconcile the OS side.
      console.error("[quote/pay] OS could not record a VERIFIED payment:", token, paymentId, res.error);
      return NextResponse.json({
        ok: true,
        warning: "Payment received. Our team is confirming your order — you'll hear from us shortly.",
      });
    }
    return NextResponse.json({ ok: true });
  }

  // ── Create half ─────────────────────────────────────────────────────────
  if (quote.acceptedAt || quote.paidAt) {
    return NextResponse.json({ error: "already_accepted" }, { status: 409 });
  }
  const amount = Number(quote.grandTotal ?? 0);
  if (!(amount > 0)) return NextResponse.json({ error: "no_amount" }, { status: 409 });

  const rzp = await maybeCreateRazorpayOrder(amount, `zyq-${quote.orderId}`);
  if (!rzp) return NextResponse.json({ error: "payments_not_configured" }, { status: 503 });
  return NextResponse.json({ ok: true, razorpay: rzp, amountInr: amount });
}
