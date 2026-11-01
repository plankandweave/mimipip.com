import { istDateKey, istMidnight, istWeekday, addIstDays, formatIstDate } from "@/lib/ist";
// The ONE master shipping configuration for Zyvorah. Every surface that quotes
// a timeline, charge or coverage — product page, shipping policy, checkout copy,
// order emails — must read from here, so the site can never contradict itself.
//
// Honesty rules baked in:
//  - Standard wallpaper ships FREE across India. Small orders are billed at
//    the 20 sq ft minimum instead (pricing.ts) — the courier charge is WAIVED
//    once that minimum is billed (Roheena 2026-08-13), surviving only as a
//    checkout_cart safety net (migration 0091) against under-billed lines.
//  - International delivery is included in the country-adjusted USD price.
//    Import duties, local taxes and customs charges are never included.
//  - Every timeline is an estimate in working days, and is labelled as such.
//  - The dispatch clock starts at order confirmation (payment received), not
//    at the end of the 12-hour cancellation window (Roheena 2026-09-22).
//  - The promise is a DELIVERY promise, counted in working days (Sundays
//    excluded) from confirmation (Roheena 2026-10-07):
//      Standard — dispatched within 5, delivered within 5 more: 10 in all.
//      Express  — dispatched the next working day by a faster courier,
//                 delivered within 3 more: 4 in all.
//    Never quote same-day dispatch, and never a total shorter than these.

export type ShipTier = {
  key: string;
  label: string;
  /** Production/dispatch time, human phrase. */
  production: string;
  /** Delivery charge, human phrase. */
  charge: string;
  /** Where it applies. */
  coverage: string;
  /** Whether this tier is live and orderable today. */
  live: boolean;
};

// Master policy table (matches the published shipping policy exactly).
export const SHIPPING_TIERS: ShipTier[] = [
  {
    key: "sample",
    label: "Printed design sample",
    production: "2 working days",
    charge: "₹200 each",
    coverage: "India",
    live: true,
  },
  {
    key: "standard",
    label: "Standard wallpaper",
    production: "Dispatched within 5 working days · delivered within 10 working days",
    charge: "Free · wallpaper is billed at a minimum of 20 sq ft",
    coverage: "India",
    live: true,
  },
  {
    key: "express",
    label: "Express delivery",
    production: "Dispatched the next working day · delivered within 4 working days",
    charge: "₹1,000 per wallpaper + ₹500 per order",
    coverage: "India",
    live: true,
  },
  {
    key: "commercial",
    label: "Commercial project",
    production: "7–10 working days after approval",
    charge: "Included in project quotation",
    coverage: "India",
    live: true,
  },
  {
    key: "international",
    label: "International",
    production: "Within 5 working days · 5–18 working days transit by region",
    charge: "Included in the country-adjusted USD price · duties and customs excluded",
    coverage: "Worldwide",
    live: true,
  },
];

// Standard-wallpaper facts, used verbatim in short copy so nothing drifts.
export const STANDARD_SHIPPING = {
  free: true,
  coverage: "India",
  productionWorkingDays: 5,
  // Wallpaper billing floor (mirrors MIN_WALLPAPER_SQFT in pricing.ts). The
  // ₹1,000 courier is WAIVED once this minimum is billed, so shipping is free
  // on every normally-priced order; checkout_cart keeps the courier only as a
  // safety net against an under-billed line.
  minBilledSqFt: 20,
  smallOrderCourierINR: 1000,
  // Nationwide transit window after dispatch (honest range, labelled estimate).
  transitMinWorkingDays: 2,
  transitMaxWorkingDays: 5,
  /** Dispatch + transit: the number the customer is promised. */
  deliveryWorkingDays: 10,
  blurb:
    "Free shipping across India on every standard wallpaper order (wallpaper is billed at a minimum of 20 sq ft).",
  // Shown alongside any dispatch-time promise — dispatch can run past the
  // usual window around major festivals or long weekends, when production
  // and courier pickup both slow down.
  exceptionsNote:
    "Dispatch may take a little longer around major festivals (e.g. Diwali) or long weekends.",
} as const;

// Express DELIVERY facts. ₹1,000 per wallpaper (each distinct design/line
// item in the order) + a flat ₹500 order-handling fee — set by the business
// 2026-07-20. Available nationwide: we don't have a real courier eligible-city
// list, so we never gate it behind a fake pincode check.
//
// Since 2026-10-07 (Roheena) Express is a faster courier as well as priority
// printing: it leaves us the next working day and is delivered within 3
// working days after that — 4 working days in all, against Standard's 10.
export const EXPRESS_SHIPPING = {
  coverage: "India",
  productionWorkingDays: 1,
  transitMinWorkingDays: 1,
  transitMaxWorkingDays: 3,
  /** Dispatch + transit: the number the customer is promised. */
  deliveryWorkingDays: 4,
  perWallpaperCharge: 1000,
  perOrderCharge: 500,
  exceptionsNote: STANDARD_SHIPPING.exceptionsNote,
  // The single sentence comparing the two — reused verbatim everywhere
  // Express is mentioned so the site can't contradict itself.
  speedNote:
    "Express is printed first and travels by a faster courier, so it reaches you in about 4 working days. Standard takes about 10.",
} as const;

/** ₹1,000 × number of wallpapers in the order + a flat ₹500 order fee. */
export function expressSurcharge(wallpaperCount: number): number {
  if (wallpaperCount <= 0) return 0;
  return wallpaperCount * EXPRESS_SHIPPING.perWallpaperCharge + EXPRESS_SHIPPING.perOrderCharge;
}

/** The order copy's delivery line, from what the order stored: `shipping`
 *  can be the small-order courier, the Express surcharge, or both — label
 *  whatever it actually is, never a blanket "Express". */
export function shippingLineFor(
  shipping: number,
  speed: string | null,
  wallpaperLines: number,
): { label: string; amount: number } | null {
  if (!(shipping > 0)) return null;
  if (speed !== "express") return { label: "Courier (small order)", amount: shipping };
  const expressPart = expressSurcharge(wallpaperLines);
  return {
    label: shipping > expressPart ? "Courier (small order) + Express delivery" : "Express delivery",
    amount: shipping,
  };
}

export const INTERNATIONAL_LIVE = true;

/** Add N working days to a date, skipping Sundays (couriers work Saturdays here). */
/**
 * Working days from an instant, counted on the Indian calendar.
 *
 * The workshop's Sundays are Indian Sundays and its "today" is the Indian
 * today. Using the ambient `getDate`/`getDay` counted them in UTC on Workers,
 * so every quoted date after 18:30 UTC was a day short and the Sunday skip
 * landed on the wrong day.
 */
export function addWorkingDays(from: Date, days: number): Date {
  let key = istDateKey(from);
  let added = 0;
  while (added < days) {
    key = addIstDays(key, 1);
    if (istWeekday(istMidnight(key)) !== 0) added += 1; // 0 = Sunday
  }
  return istMidnight(key);
}

export type DeliveryEstimate = {
  dispatchBy: Date;
  deliveryFrom: Date;
  deliveryTo: Date;
};

/**
 * Standard-wallpaper delivery estimate from "now". Pincode is accepted for
 * future zone-based tuning, but the current window is a single honest
 * nationwide estimate — we never quote a precision we can't hold.
 */
export function estimateStandardDelivery(now: Date = new Date()): DeliveryEstimate {
  const dispatchBy = addWorkingDays(now, STANDARD_SHIPPING.productionWorkingDays);
  const deliveryFrom = addWorkingDays(dispatchBy, STANDARD_SHIPPING.transitMinWorkingDays);
  const deliveryTo = addWorkingDays(dispatchBy, STANDARD_SHIPPING.transitMaxWorkingDays);
  return { dispatchBy, deliveryFrom, deliveryTo };
}

/** Express delivery estimate — next-working-day dispatch, faster courier. */
export function estimateExpressDelivery(now: Date = new Date()): DeliveryEstimate {
  const dispatchBy = addWorkingDays(now, EXPRESS_SHIPPING.productionWorkingDays);
  const deliveryFrom = addWorkingDays(dispatchBy, EXPRESS_SHIPPING.transitMinWorkingDays);
  const deliveryTo = addWorkingDays(dispatchBy, EXPRESS_SHIPPING.transitMaxWorkingDays);
  return { dispatchBy, deliveryFrom, deliveryTo };
}

export function formatShipDate(d: Date): string {
  return formatIstDate(d, { day: "numeric", month: "long" });
}

/** A valid Indian pincode is exactly 6 digits and doesn't start with 0. */
export function isValidPincode(pin: string): boolean {
  return /^[1-9]\d{5}$/.test(pin.trim());
}
