// Google Analytics 4 — client-side event helpers.
//
// The base tag lives in app/layout.tsx and activates only when
// NEXT_PUBLIC_GA_ID is set at build time, so every helper here must be a
// silent no-op when gtag is absent (GA unconfigured, script blocked, SSR).
// Analytics must never break the shop.
//
// These cover the four GA4 e-commerce funnel events that make Analytics
// actually useful for a store — view_item → add_to_cart → begin_checkout →
// purchase — in the shopper's actual checkout currency. page_view for SPA navigations is handled by
// GA4's enhanced measurement (history-change tracking), so nothing here fires
// on route changes.

import { isInternalOrder } from "@/lib/internal-orders";
import type { CartItem } from "@/components/CartProvider";
import { adsConversion, adsSetUserData, type AdsUserData } from "@/lib/google-ads";
import { marketGoodsFromInr, type CurrencyCode } from "@/lib/markets";
import { exGst } from "@/lib/pricing";

type GaParams = Record<string, unknown>;

type CheckoutPresentment = { countryCode: string; currency: CurrencyCode; goods: number; delivery: number };

/** Convert the server-authoritative checkout result to GA's accounting model. */
export function gaPurchaseAccounting(input: unknown): {
  countryCode: string;
  currency: CurrencyCode;
  value: number;
  shipping: number;
  tax: number;
  coupon?: string;
} | null {
  if (!input || typeof input !== "object") return null;
  const data = input as Record<string, unknown>;
  const presentment = data.presentment as Partial<CheckoutPresentment> | null | undefined;
  const currency = presentment?.currency;
  const countryCode = typeof presentment?.countryCode === "string" ? presentment.countryCode : null;
  if (!countryCode || (currency !== "INR" && currency !== "USD")) return null;

  if (currency === "USD") {
    const value = Number(presentment?.goods);
    const shipping = Number(presentment?.delivery);
    if (!Number.isFinite(value) || !Number.isFinite(shipping) || value <= 0 || shipping < 0) return null;
    return { countryCode, currency, value, shipping, tax: 0, coupon: typeof data.discountCode === "string" ? data.discountCode : undefined };
  }

  const total = Number(data.total);
  const shippingInclusive = Number(data.shipping ?? 0);
  // A purchase must have a value. `Number(null)` is 0, and total === shipping
  // leaves no goods revenue, so both routes used to emit a zero-value sale —
  // see the note in purchaseParamsFor (src/lib/ga-mp.ts), which this mirrors.
  if (!Number.isFinite(total) || !Number.isFinite(shippingInclusive) || total <= shippingInclusive || shippingInclusive < 0) return null;
  const value = exGst(total - shippingInclusive);
  const shipping = exGst(shippingInclusive);
  return {
    countryCode,
    currency,
    value,
    shipping,
    tax: total - value - shipping,
    coupon: typeof data.discountCode === "string" ? data.discountCode : undefined,
  };
}

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function gaEvent(name: string, params?: GaParams): void {
  try {
    if (typeof window === "undefined" || typeof window.gtag !== "function") return;
    window.gtag("event", name, params ?? {});
  } catch {
    /* telemetry must never break the UI */
  }
}

/** GA item value is goods revenue, so India's GST-inclusive store price is netted. */
export function gaGoodsFromInr(amountInr: number, countryCode: string, currency: CurrencyCode): number {
  return currency === "INR" ? exGst(amountInr) : marketGoodsFromInr(amountInr, countryCode);
}

export function gaViewItem(handle: string, title?: string): void {
  // item_name must be the design's real title — GA's item reports are read by
  // name, and a handle ("mati-jodi-01") tells nobody which design sold.
  gaEvent("view_item", { items: [{ item_id: handle, item_name: title || handle }] });
}

export function gaAddToCart(input: {
  productHandle: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  /** the design's real title, from the cart line the API just returned */
  title?: string;
  /** the chosen material, so add_to_cart matches the checkout events */
  materialName?: string;
  countryCode?: string;
  currency?: CurrencyCode;
}): void {
  const countryCode = input.countryCode ?? "IN";
  const currency = input.currency ?? "INR";
  const quantity = Math.max(1, input.quantity);
  const value = gaGoodsFromInr(input.lineTotal, countryCode, currency);
  gaEvent("add_to_cart", {
    currency,
    value,
    items: [
      {
        item_id: input.productHandle,
        item_name: input.title || input.productHandle,
        item_variant: input.materialName,
        price: value / quantity,
        quantity,
      },
    ],
  });
}

/**
 * One add_to_cart for a basket of lines added in a single shopper action —
 * the GA4 sibling of metaAddToCartLines. GA4's schema is natively multi-item,
 * so the concept's walls ride as separate `items` under one event rather than
 * one event per wall.
 *
 * Value is netted with gaGoodsFromInr, unlike Meta's raw presentment.
 */
export function gaAddToCartLines(input: {
  lines: { handle: string; title?: string; materialName?: string; lineTotalInr: number; quantity?: number }[];
  countryCode?: string;
  currency?: CurrencyCode;
}): void {
  const countryCode = input.countryCode ?? "IN";
  const currency = input.currency ?? "INR";
  const items = input.lines
    .filter((line) => Number.isFinite(line.lineTotalInr))
    .map((line) => {
      const quantity = Math.max(1, line.quantity ?? 1);
      const value = gaGoodsFromInr(line.lineTotalInr, countryCode, currency);
      return {
        item_id: line.handle,
        item_name: line.title || line.handle,
        item_variant: line.materialName,
        price: value / quantity,
        quantity,
      };
    });
  if (!items.length) return;
  gaEvent("add_to_cart", {
    currency,
    value: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    items,
  });
}

export function gaBeginCheckout(input: {
  items: CartItem[];
  value: number;
  countryCode: string;
  currency: CurrencyCode;
}): void {
  const { items } = input;
  if (!items.length) return;
  const eventItems = purchaseItems(input).map(({ discount: _discount, coupon: _coupon, ...item }) => item);
  gaEvent("begin_checkout", {
    currency: input.currency,
    value: input.value,
    items: eventItems,
  });
}

export function gaPurchase(input: {
  transactionId: string;
  /** Item revenue after discount, excluding shipping and tax. */
  value: number;
  items: CartItem[];
  countryCode: string;
  currency: CurrencyCode;
  shipping?: number;
  tax?: number;
  coupon?: string;
  /** Checkout contact details, for Google Ads enhanced conversions. */
  user?: AdsUserData;
}): void {
  sendPurchase(input.transactionId, {
    currency: input.currency,
    value: input.value,
    shipping: input.shipping,
    tax: input.tax,
    coupon: input.coupon,
    items: purchaseItems(input),
  }, undefined, input.user);
}

/** Track sample revenue without bidding on it as a full-wall purchase. */
export function gaSamplePurchase(input: {
  transactionId: string;
  amount: number;
  designHandle: string;
  designTitle: string;
  finishes: string[];
  /** Sample-order contact details, for Google Ads enhanced conversions. */
  user?: AdsUserData;
}): void {
  if (!Number.isFinite(input.amount) || input.amount < 0 || !input.finishes.length) return;
  const value = exGst(input.amount);
  let allocated = 0;
  const items = input.finishes.map((finish, index) => {
    const price = index === input.finishes.length - 1
      ? value - allocated
      : Math.floor(value / input.finishes.length);
    allocated += price;
    return {
      item_id: input.designHandle,
      item_name: `${input.designTitle} sample`,
      item_variant: finish,
      price,
      quantity: 1,
    };
  });
  sendPurchase(input.transactionId, {
    currency: "INR",
    value,
    shipping: 0,
    tax: input.amount - value,
    items,
  }, () => {
    // Google Ads counts samples as their own conversion action, created from
    // this GA event name in Ads (Goals → Conversions → "sample_purchase").
    gaEvent("sample_purchase", { transaction_id: input.transactionId, currency: "INR", value });
  }, input.user, false);
}

function sendPurchase(transactionId: string, params: GaParams, after?: () => void, user?: AdsUserData, primaryPurchase = true): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function" || isInternalOrder(user?.email)) return;
  const dedupKey = `zyv_ga_purchase_${transactionId}`;
  try {
    if (sessionStorage.getItem(dedupKey)) return;
  } catch {
    // Storage can be unavailable in private browsing; GA's transaction_id is
    // still a second line of defence against duplicate purchase revenue.
  }
  gaEvent("purchase", {
    transaction_id: transactionId,
    ...params,
  });
  // Google Ads' own Purchase action (Primary, bids on this). Same dedup key as
  // GA, same transaction_id so Ads can drop a repeat on its side too. User
  // data goes first so the tag can attach hashed email/phone to the hit.
  if (primaryPurchase) {
    if (user) adsSetUserData(user);
    adsConversion("purchase", {
      value: typeof params.value === "number" ? params.value : undefined,
      currency: typeof params.currency === "string" ? params.currency : undefined,
      transaction_id: transactionId,
    });
  }
  after?.();
  try {
    sessionStorage.setItem(dedupKey, "1");
  } catch {
    /* see storage note above */
  }
}

/**
 * Allocate the authoritative paid item revenue proportionally over cart lines.
 * Order-level discounts are thereby reflected in every item's paid unit price,
 * while `discount` remains useful as a separate GA item metric. The final line
 * receives the rounding remainder so sum(price * quantity) reconciles to value.
 */
function purchaseItems(input: {
  value: number;
  items: CartItem[];
  countryCode: string;
  currency: CurrencyCode;
  coupon?: string;
}) {
  const precision = input.currency === "INR" ? 0 : 2;
  const scale = 10 ** precision;
  const targetUnits = Math.round(input.value * scale);
  const weights = input.items.map((item) => Math.max(0, item.line_total));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  let allocatedUnits = 0;

  return input.items.map((item, index) => {
    const units = index === input.items.length - 1
      ? targetUnits - allocatedUnits
      : Math.floor(targetUnits * (totalWeight > 0 ? weights[index]! / totalWeight : 1 / input.items.length));
    allocatedUnits += units;
    const lineRevenue = units / scale;
    const quantity = Math.max(1, item.quantity);
    const paidUnitPrice = lineRevenue / quantity;
    const originalLine = input.currency === "INR"
      ? exGst(item.line_total)
      : marketGoodsFromInr(item.line_total, input.countryCode);
    const originalUnitPrice = originalLine / quantity;
    return {
      item_id: item.handle,
      item_name: item.title,
      item_variant: item.material_name,
      price: paidUnitPrice,
      discount: Math.max(0, originalUnitPrice - paidUnitPrice),
      coupon: input.coupon,
      quantity,
    };
  });
}

/* ------------------------------------------------------------------------ */
/* The rest of the funnel, and the non-commerce goals                        */
/*                                                                           */
/* Google Ads, Meta and ChatGPT ads all send traffic here, and GA4 is the    */
/* one place where all three can be compared side by side — but only if GA  */
/* sees every goal, not just the purchase. Everything below is a GA4        */
/* recommended event name, so the standard reports pick it up unprompted.   */
/* ------------------------------------------------------------------------ */

/** Cart lines in GA item shape, valued as ex-GST goods in the presentment currency. */
function cartEventItems(items: CartItem[], countryCode: string, currency: CurrencyCode) {
  return items.map((item) => {
    const quantity = Math.max(1, item.quantity);
    const line = gaGoodsFromInr(item.line_total, countryCode, currency);
    return {
      item_id: item.handle,
      item_name: item.title,
      item_variant: item.material_name,
      price: line / quantity,
      quantity,
    };
  });
}

function cartValue(items: CartItem[], countryCode: string, currency: CurrencyCode): number {
  return gaGoodsFromInr(items.reduce((sum, item) => sum + item.line_total, 0), countryCode, currency);
}

/** The cart page opened with something in it. */
export function gaViewCart(input: { items: CartItem[]; countryCode: string; currency: CurrencyCode }): void {
  if (!input.items.length) return;
  gaEvent("view_cart", {
    currency: input.currency,
    value: cartValue(input.items, input.countryCode, input.currency),
    items: cartEventItems(input.items, input.countryCode, input.currency),
  });
}

/** A line left the cart — the one drop-off the purchase funnel otherwise hides. */
export function gaRemoveFromCart(input: { item: CartItem; countryCode: string; currency: CurrencyCode }): void {
  gaEvent("remove_from_cart", {
    currency: input.currency,
    value: cartValue([input.item], input.countryCode, input.currency),
    items: cartEventItems([input.item], input.countryCode, input.currency),
  });
}

/** Address accepted and the order posted — shipping is now known. */
export function gaAddShippingInfo(input: {
  items: CartItem[];
  countryCode: string;
  currency: CurrencyCode;
  shippingTier: "standard" | "express";
  coupon?: string;
}): void {
  if (!input.items.length) return;
  gaEvent("add_shipping_info", {
    currency: input.currency,
    value: cartValue(input.items, input.countryCode, input.currency),
    shipping_tier: input.shippingTier,
    coupon: input.coupon,
    items: cartEventItems(input.items, input.countryCode, input.currency),
  });
}

/** The payment window opened. Between this and `purchase` is payment failure. */
export function gaAddPaymentInfo(input: {
  items: CartItem[];
  countryCode: string;
  currency: CurrencyCode;
  paymentType: "razorpay" | "gift_card" | "collaboration";
  coupon?: string;
}): void {
  if (!input.items.length) return;
  gaEvent("add_payment_info", {
    currency: input.currency,
    value: cartValue(input.items, input.countryCode, input.currency),
    payment_type: input.paymentType,
    coupon: input.coupon,
    items: cartEventItems(input.items, input.countryCode, input.currency),
  });
}

export type LeadType = "contact" | "enquiry" | "sample_request";

/**
 * A form that puts a human in touch with the studio. Valued at the same fixed
 * ₹500 the Google Ads "Enquiry" action uses, so GA's key-event value and the
 * Ads conversion value agree. `lead_type` and `topic` are registered as
 * event-scoped custom dimensions on the property (docs/campaign-tracking.md).
 */
export function gaGenerateLead(input: { leadType: LeadType; topic?: string }): void {
  gaEvent("generate_lead", {
    currency: "INR",
    value: 500,
    lead_type: input.leadType,
    ...(input.topic ? { topic: input.topic.slice(0, 80) } : {}),
  });
}

export type SignUpMethod = "email_otp" | "mobile_otp" | "newsletter";

/** An account door completed, or a newsletter address accepted. */
export function gaSignUp(method: SignUpMethod): void {
  gaEvent("sign_up", { method });
}
