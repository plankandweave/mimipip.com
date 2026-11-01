// Meta Pixel — client-side event helpers.
//
// The base pixel is mounted in app/layout.tsx and activates only when
// NEXT_PUBLIC_META_PIXEL_ID is set at build time, so every helper here must be
// a silent no-op when fbq is absent (pixel unconfigured, script blocked, SSR).
// Telemetry must never break the shop.
//
// SHAPE OF THIS FILE
//   These mirror the GA4 funnel in src/lib/ga.ts one for one, and are called
//   from the SAME call sites, so the two can never drift into disagreeing
//   about what happened. Where GA says view_item, Meta says ViewContent.
//
// THE ONE PLACE META AND GA DELIBERATELY DIFFER: VALUE
//   GA4 reports GOODS revenue — India's GST-inclusive store price is netted
//   down with exGst() before it is sent. Meta's `value` is what the shopper
//   actually PAYS, tax and shipping included, because that is the number its
//   bidder optimises ROAS against and the number the card was charged. Netting
//   GST out of a Meta value would understate every Indian conversion by ~15%
//   and quietly train the bidder on the wrong target. metaPurchaseValue()
//   encodes this for Purchase; the funnel helpers below take presentment
//   amounts for the same reason.
//
// CONTENT IDS MUST MATCH THE CATALOGUE FEED
//   Meta can only join an event to a catalogue item if content_ids carries an
//   id the feed actually published. The feed
//   (src/app/feeds/google-merchant.xml/route.ts, which Meta reads in the same
//   RSS format Google does) publishes `g:id` per representative VARIANT —
//   "ZYV-MATI-JODI-01-8X10FT-NW" — and `g:item_group_id` per DESIGN —
//   "ZYV-MATI-JODI-01".
//
//   We send the GROUP id, with content_type "product_group". That is not a
//   shortcut, it is the only correct answer here: this shop is made to
//   measure. A shopper who configures a 3.4m x 2.6m wall has bought a size
//   that is not, and can never be, a row in the feed — the feed carries a
//   handful of representative sizes precisely because the real ones are
//   continuous. Sending a constructed variant SKU would send an id the
//   catalogue has never heard of, and Meta would drop the match silently.
//   The design is the thing being advertised, and the design is what matches.

import type { CurrencyCode } from "@/lib/markets";
import { marketGoodsFromInr } from "@/lib/markets";

type MetaFbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  push?: (...args: unknown[]) => void;
  loaded?: boolean;
  version?: string;
  queue?: unknown[][];
};

declare global {
  interface Window {
    fbq?: MetaFbq;
    _fbq?: MetaFbq;
    __zyvMetaPixelId?: string;
  }
}

/** Meta's join key for a catalogue GROUP — see the header note. */
export const META_CONTENT_TYPE = "product_group";

/**
 * The catalogue id for a design, identical to the feed's `g:item_group_id`.
 *
 * Kept here rather than in the feed route because BOTH sides must agree and
 * the server Conversions API needs it too — one function, three callers, no
 * chance of a stray toUpperCase() drifting a whole channel's attribution.
 */
export function metaContentId(handle: string): string | null {
  const normalized = handle.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  return normalized ? `ZYV-${normalized}` : null;
}

/** Content ids for a set of cart lines, de-duplicated, order preserved. */
export function metaContentIds(handles: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const handle of handles) {
    const id = handle ? metaContentId(handle) : null;
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * What the shopper pays, in the currency they are charged.
 *
 * India's catalogue amounts are already GST-inclusive, so they pass straight
 * through; other markets price in USD off the same INR base.
 */
export function metaPresentmentFromInr(
  amountInr: number,
  countryCode: string,
  currency: CurrencyCode,
): number {
  return currency === "INR" ? amountInr : marketGoodsFromInr(amountInr, countryCode);
}

export type MetaPurchase = {
  pixelId?: string;
  orderId: string;
  currency: CurrencyCode;
  /** Goods revenue after discount, excluding shipping and tax. */
  value: number;
  shipping?: number;
  tax?: number;
  /** Product handles in the order, for catalogue attribution. */
  handles?: (string | null | undefined)[];
};

export function metaPurchaseEventId(orderId: string): string | null {
  const normalized = orderId.trim().replace(/[^a-zA-Z0-9_-]/g, "");
  return normalized ? `zyvorah_purchase_${normalized}` : null;
}

/** Meta Purchase value is the shopper's total paid presentment, including shipping and tax. */
export function metaPurchaseValue(input: Pick<MetaPurchase, "value" | "shipping" | "tax">): number | null {
  const parts = [input.value, input.shipping ?? 0, input.tax ?? 0];
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) return null;
  const total = Math.round(parts.reduce((sum, part) => sum + part, 0) * 100) / 100;
  // The server path (metaPurchaseAccounting) refuses a zero total; the browser
  // must agree, or it sends the Purchase the server deliberately withheld.
  return total > 0 ? total : null;
}

/** True when the configured Pixel is the one initialised in this browser. */
function pixelReady(pixelId?: string): boolean {
  const configured = pixelId?.trim() || (typeof window !== "undefined" ? window.__zyvMetaPixelId : undefined);
  if (!configured || typeof window === "undefined") return false;
  if (window.__zyvMetaPixelId !== configured) return false;
  return typeof window.fbq === "function";
}

/**
 * Send one standard event. Every helper below funnels through here so the
 * "never throw" guarantee is made in exactly one place.
 */
export function metaTrack(
  event: string,
  params?: Record<string, unknown>,
  options?: { eventId?: string; pixelId?: string },
): void {
  try {
    if (!pixelReady(options?.pixelId)) return;
    if (options?.eventId) window.fbq!("track", event, params ?? {}, { eventID: options.eventId });
    else window.fbq!("track", event, params ?? {});
  } catch {
    /* telemetry must never break the shop */
  }
}

/** Fire a browser Purchase once per order in this browser session. */
export function metaPurchase(input: MetaPurchase): void {
  metaPaidEvent(input, false);
}

/** Samples retain revenue without training the full-wall Purchase objective. */
export function metaSamplePurchase(input: MetaPurchase): void {
  metaPaidEvent(input, true);
}

function metaPaidEvent(input: MetaPurchase, sample: boolean): void {
  const pixelId = input.pixelId?.trim();
  if (!pixelId || typeof window === "undefined" || window.__zyvMetaPixelId !== pixelId) return;
  if (typeof window.fbq !== "function") return;
  const eventId = metaPurchaseEventId(input.orderId);
  const value = metaPurchaseValue(input);
  if (!eventId || value === null) return;
  const dedupKey = `zyv_meta_${eventId}`;
  try { if (sessionStorage.getItem(dedupKey)) return; }
  catch { /* Meta's stable event_id remains a second deduplication line. */ }
  const contentIds = metaContentIds(input.handles ?? []);
  const params: Record<string, unknown> = { currency: input.currency, value };
  if (contentIds.length) {
    params.content_ids = contentIds;
    params.content_type = META_CONTENT_TYPE;
  }
  try {
    window.fbq(sample ? "trackCustom" : "track", sample ? "SamplePurchase" : "Purchase", params, { eventID: eventId });
    try { sessionStorage.setItem(dedupKey, "1"); } catch { /* storage can be unavailable */ }
  } catch { /* telemetry must never interrupt checkout */ }
}

/** A shopper opened a design. Meta's retargeting and catalogue ads start here. */
export function metaViewContent(input: {
  handle: string;
  title?: string;
  /** Presentment price of the shown configuration, when the page knows one. */
  value?: number;
  currency?: CurrencyCode;
}): void {
  const contentId = metaContentId(input.handle);
  if (!contentId) return;
  const params: Record<string, unknown> = {
    content_ids: [contentId],
    content_type: META_CONTENT_TYPE,
    content_name: input.title || input.handle,
  };
  if (Number.isFinite(input.value) && (input.value as number) >= 0) {
    params.value = input.value;
    params.currency = input.currency ?? "INR";
  }
  metaTrack("ViewContent", params);
}

export function metaAddToCart(input: {
  handle: string;
  title?: string;
  /** GST-inclusive INR line total, exactly as the cart API returned it. */
  lineTotalInr: number;
  quantity: number;
  countryCode?: string;
  currency?: CurrencyCode;
}): void {
  const contentId = metaContentId(input.handle);
  if (!contentId || !Number.isFinite(input.lineTotalInr)) return;
  const countryCode = input.countryCode ?? "IN";
  const currency = input.currency ?? "INR";
  metaTrack("AddToCart", {
    content_ids: [contentId],
    content_type: META_CONTENT_TYPE,
    content_name: input.title || input.handle,
    contents: [{ id: contentId, quantity: Math.max(1, input.quantity) }],
    currency,
    value: metaPresentmentFromInr(input.lineTotalInr, countryCode, currency),
  });
}

/**
 * One AddToCart for a basket of lines added in a single shopper action.
 *
 * The office concept builder adds a whole room at once — up to 120 walls in
 * one click. That is ONE add-to-cart as a shopper understands it, and it must
 * be one event: firing per wall would inflate the AddToCart count and wreck
 * the AddToCart-to-Purchase ratio Meta's bidder learns from.
 *
 * `contents` carries a quantity per DESIGN (two walls of the same design is
 * quantity 2), while `value` is the raw GST-inclusive sum — see the header
 * note on why Meta's value is not GA's.
 */
export function metaAddToCartLines(input: {
  lines: { handle: string; title?: string; lineTotalInr: number; quantity?: number }[];
  countryCode?: string;
  currency?: CurrencyCode;
}): void {
  const countryCode = input.countryCode ?? "IN";
  const currency = input.currency ?? "INR";

  // Collapse to one entry per design, summing quantities and money.
  const byId = new Map<string, { id: string; quantity: number; name?: string }>();
  let totalInr = 0;
  for (const line of input.lines) {
    const id = metaContentId(line.handle);
    if (!id || !Number.isFinite(line.lineTotalInr)) continue;
    totalInr += line.lineTotalInr;
    const seen = byId.get(id);
    const quantity = Math.max(1, line.quantity ?? 1);
    if (seen) seen.quantity += quantity;
    else byId.set(id, { id, quantity, name: line.title });
  }
  if (!byId.size) return;

  const contents = [...byId.values()];
  metaTrack("AddToCart", {
    content_ids: contents.map((c) => c.id),
    content_type: META_CONTENT_TYPE,
    content_name: contents[0]!.name,
    contents: contents.map((c) => ({ id: c.id, quantity: c.quantity })),
    currency,
    value: metaPresentmentFromInr(totalInr, countryCode, currency),
  });
}

export function metaInitiateCheckout(input: {
  handles: (string | null | undefined)[];
  /** Presentment cart value the shopper is about to pay. */
  value: number;
  currency: CurrencyCode;
  numItems: number;
}): void {
  const contentIds = metaContentIds(input.handles);
  if (!contentIds.length || !Number.isFinite(input.value)) return;
  metaTrack("InitiateCheckout", {
    content_ids: contentIds,
    content_type: META_CONTENT_TYPE,
    currency: input.currency,
    value: input.value,
    num_items: Math.max(1, input.numItems),
  });
}

/** An enquiry, sample request or contact form — Meta's lead-optimisation goal. */
export function metaLead(input?: { topic?: string; value?: number; currency?: CurrencyCode }): void {
  const params: Record<string, unknown> = {};
  if (input?.topic) params.content_name = input.topic;
  if (Number.isFinite(input?.value)) {
    params.value = input!.value;
    params.currency = input?.currency ?? "INR";
  }
  metaTrack("Lead", params);
}

/** A new customer account or newsletter sign-up. */
export function metaCompleteRegistration(method?: string): void {
  metaTrack("CompleteRegistration", method ? { content_name: method } : {});
}

export function metaSearch(query: string): void {
  const term = query.trim().slice(0, 100);
  if (!term) return;
  metaTrack("Search", { search_string: term, content_type: META_CONTENT_TYPE });
}

/**
 * Advanced matching: hand Meta the shopper's contact details so a conversion
 * can be attributed to the person who saw the ad on another device. Meta's
 * own script hashes these in the browser; raw values never leave as raw.
 */
export function metaUserData(input: { email?: string | null; phone?: string | null }): void {
  try {
    if (!pixelReady()) return;
    const em = input.email?.trim().toLowerCase();
    const ph = input.phone?.replace(/\D/g, "");
    const data: Record<string, string> = {};
    if (em) data.em = em;
    if (ph) data.ph = ph;
    if (!Object.keys(data).length) return;
    window.fbq!("init", window.__zyvMetaPixelId!, data);
  } catch {
    /* telemetry must never break checkout */
  }
}

/** Install Meta's documented queueing bootstrap, then initialise the configured Pixel. */
export function initializeMetaPixel(pixelId: string): boolean {
  const configuredId = pixelId.trim();
  if (typeof window === "undefined" || !configuredId) return false;
  if (window.__zyvMetaPixelId === configuredId && typeof window.fbq === "function") return true;

  if (typeof window.fbq !== "function") {
    const fbq: MetaFbq = (...args: unknown[]) => {
      if (fbq.callMethod) fbq.callMethod(...args);
      else fbq.queue?.push(args);
    };
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = "2.0";
    fbq.queue = [];
    window.fbq = fbq;
    window._fbq = fbq;
  }
  window.fbq("init", configuredId);
  window.__zyvMetaPixelId = configuredId;
  return true;
}
