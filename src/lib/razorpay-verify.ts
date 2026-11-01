import { createHmac, timingSafeEqual } from "node:crypto";

// Razorpay signature checks, shared by every route that confirms money.
// Two DIFFERENT algorithms — do not mix them up:
//  - Checkout callback: HMAC-SHA256 hex of `${order_id}|${payment_id}` with
//    RAZORPAY_KEY_SECRET (what the browser hands back after checkout.js).
//  - Webhook: HMAC-SHA256 hex of the RAW request body with the separate
//    webhook secret configured in the Razorpay dashboard.

/** Constant-time compare so the HMAC check can't be probed via response timing. */
function safeEqual(expected: string, given: string): boolean {
  const expBuf = Buffer.from(expected);
  const sigBuf = Buffer.from(given);
  return expBuf.length === sigBuf.length && timingSafeEqual(expBuf, sigBuf);
}

/** Verify the signature Razorpay checkout.js returns to the browser. */
export function verifyCheckoutSignature(
  orderId: string,
  paymentId: string,
  signature: string,
  secret: string,
): boolean {
  const expected = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  return safeEqual(expected, String(signature));
}

/** Verify a Razorpay webhook: HMAC of the raw body, not of any field pair. */
export function verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqual(expected, String(signature));
}
