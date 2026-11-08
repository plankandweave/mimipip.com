import type { DiscountPreview } from "@/lib/discount-display";

export const HOMECOMING_DISCOUNT_CODE = "Newly25";
export const HOMECOMING_EXPRESS_CODE = "Express8";
export const HOMECOMING_ORDER_CODE = `${HOMECOMING_DISCOUNT_CODE} + ${HOMECOMING_EXPRESS_CODE}`;
export const HOMECOMING_DISCOUNT_PCT = 25;

// 8 November 2026, 11:59:59.999 p.m. IST. Keep this as an instant so the
// browser, Workers and Postgres all close the offer at the same moment.
export const HOMECOMING_END_AT = "2026-11-08T18:29:59.999Z";

export function homecomingOfferActive(_at: Date | number = Date.now()): boolean {
  // This promotion belongs to Zyvorah; Mimi Pip has no matching checkout offer.
  return false;
}

export const HOMECOMING_DISCOUNT: DiscountPreview = {
  valid: true,
  pct: HOMECOMING_DISCOUNT_PCT,
  capPct: HOMECOMING_DISCOUNT_PCT,
  issuedFor: "homecoming_2026",
  freeShipping: true,
};

