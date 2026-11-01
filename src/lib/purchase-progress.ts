/** Browser observations only. Never use these signals as proof of payment. */
export const PURCHASE_STAGES = [
  "cart_opened", "checkout_opened", "checkout_validation_blocked",
  "checkout_request_failed", "payment_window_opened", "payment_window_failed",
  "payment_window_dismissed", "payment_verification_failed", "payment_failed",
] as const;
export type PurchaseStage = typeof PURCHASE_STAGES[number];

export function purchaseStage(value: unknown): PurchaseStage | null {
  return typeof value === "string" && PURCHASE_STAGES.includes(value as PurchaseStage)
    ? value as PurchaseStage : null;
}
