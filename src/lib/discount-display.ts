// What the cart and checkout pages show for a discount code — one copy, so
// the two pages cannot drift from each other or from checkout_cart_v2's math.

/** The answer /api/discount/check returns, as the pages hold it. */
export type DiscountPreview = {
  valid: boolean;
  pct?: number;
  reason?: string;
  issuedFor?: string;
  /** Most the code may take off; 50 when an older server leaves it out. */
  capPct?: number;
  maxValueInr?: number | null;
  freeShipping?: boolean;
  personalTo?: string;
  allowedHandles?: string[] | null;
};

/**
 * The rupees a code takes off the goods total. Mirrors checkout_cart_v2:
 * pct capped (50 for an OS code, 100 for a collaboration), rounded, then held
 * under the offer's own rupee ceiling. Shipping is never discounted.
 */
export function discountAmount(goodsTotal: number, d: DiscountPreview | null | undefined): number {
  if (!d?.valid || !d.pct || d.pct <= 0 || goodsTotal <= 0) return 0;
  const pct = Math.min(d.pct, d.capPct ?? 50);
  let amount = Math.round((goodsTotal * pct) / 100);
  if (d.maxValueInr != null && d.maxValueInr > 0) amount = Math.min(amount, Math.round(d.maxValueInr));
  return amount;
}

/** Whether the code waives the small-order courier. */
export const waivesCourier = (d: DiscountPreview | null | undefined): boolean => !!(d?.valid && d.freeShipping);

/** The line under the field when a code is refused. */
export function refusalCopy(d: DiscountPreview): string {
  switch (d.reason) {
    case "already_redeemed":
      return "That code has already been used.";
    case "expired":
      return "That code has expired.";
    case "trade_account":
      return "Your account already buys at your agreed trade price — discount codes don't apply on top of it.";
    case "not_allowed":
      return "That code isn't a discount we honour.";
    case "wrong_email":
      return d.personalTo
        ? `That code is personal to ${d.personalTo}. Please check out with that email address.`
        : "That code is personal to another email address.";
    case "wrong_design":
      return "That code covers a particular design. Please keep only that design in your basket.";
    default:
      return "That code isn't valid.";
  }
}

/** The label of the applied discount, e.g. "Collaboration (100% off wallpaper)".
 *  `money` is the page's market formatter, so the ceiling reads in the
 *  shopper's own currency like every other figure on the bill. */
export function appliedLabel(d: DiscountPreview, money: (amountInr: number) => string): string {
  const what = d.issuedFor === "creator_collab" ? "Collaboration" : "Discount";
  return `${what} (${Math.min(d.pct ?? 0, d.capPct ?? 50)}% off wallpaper${d.maxValueInr ? `, up to ${money(d.maxValueInr)}` : ""})`;
}
