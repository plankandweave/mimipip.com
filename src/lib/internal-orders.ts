/** Owner checkout validations are operational orders, not acquired customers.
 * Exact addresses only: never exclude every customer at a company domain.
 * This affects measurement and labels, never payment or fulfilment. */
export function isInternalOrder(email: string | null | undefined): boolean {
  return [
    "roheena@plankandweave.com",
    "roheena@zyvorah.com",
    "roheena@magnitudegroup.in",
    // Samir Shah, co-founder — #82 (8 October 2026) was his checkout test.
    "samir@plankandweave.com",
    // The automated phone checkout walk (scripts/verify-checkout-flow.mjs).
    // It stops at the Razorpay window and never pays.
    "flow-check@zyvorah.com",
  ].includes(email?.trim().toLowerCase() ?? "");
}
