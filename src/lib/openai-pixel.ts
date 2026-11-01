/**
 * OpenAI (ChatGPT) advertising pixel.
 *
 * ChatGPT already sends us organic referrals — this is what lets a paid
 * placement there be attributed instead of landing in "direct". The pixel id
 * is issued per-property by OpenAI and is public by design (it travels in the
 * page source), so it lives here rather than in a secret; an env var can still
 * override it without a code change if the property is ever re-issued.
 */
export const OPENAI_PIXEL_ID =
  process.env.NEXT_PUBLIC_OPENAI_PIXEL_ID || "RFuJ88LYaC9aHBKy8txxVu";

/**
 * The loader OpenAI hands out, verbatim apart from two things: the pixel id is
 * injected, and `debug` is OFF in production — the supplied snippet ships
 * `debug: true`, which logs every event to the customer's console.
 */
export function openAiPixelBootstrap(pixelId: string, debug: boolean): string {
  return `!function(w,d,s,u){if(w.location?.pathname?.startsWith("/trace/")||w.location?.pathname?.startsWith("/walk/"))return;if(w.oaiq)return;var q=function(){q.q.push(arguments)};q.q=[];w.oaiq=q;var j=d.createElement(s);j.async=1;j.src=u;var f=d.getElementsByTagName(s)[0];f.parentNode.insertBefore(j,f)}(window,document,"script","https://bzrcdn.openai.com/sdk/oaiq.min.js");if(window.oaiq)oaiq("init",{pixelId:${JSON.stringify(pixelId)},debug:${debug}});`;
}

// ---------------------------------------------------------------------------
// Events
//
// The contract below is not guesswork — it is what bzrcdn.openai.com/sdk/
// oaiq.min.js actually validates, read off the SDK and confirmed against
// developers.openai.com/ads/measurement-pixel:
//
//   command    "measure", <eventName>, <eventProps>, <eventOptions>
//   event      order_created, whose documented data `type` is "contents"
//   props      type, amount, currency, contents   (anything else is REJECTED —
//              the SDK drops unknown fields with "is not a documented field")
//   contents[] id, name, content_type, quantity, amount, currency
//   options    event_id, custom_event_name, opt_out
//
// TWO TRAPS, BOTH SILENT
//
// 1. `amount` MUST BE AN INTEGER IN THE CURRENCY'S MINOR UNIT. The SDK's
//    validator is a plain Number.isInteger check, so ₹12,499.50 sent as
//    12499.5 is dropped as "invalid_amount" and the order simply never
//    appears; sent as 12499 it is accepted and reported as ₹124.99 — a
//    hundredfold understatement that the bidder would happily optimise
//    against. Everything here goes through toMinorUnits(), once.
//
// 2. Identity is set on `init`, not on the event. Re-initialising the same
//    pixel id with a `user` object is the supported way to add it later (the
//    SDK reuses the existing pixel state and only re-emits a session
//    diagnostic, never a second page view), which is what lets checkout hand
//    over the shopper's email and phone the way Meta's advanced matching
//    does. The SDK hashes them with SHA-256 in the browser; raw values never
//    leave the page.
//
// VALUE IS WHAT THE SHOPPER PAYS. Like Meta and unlike GA4, no GST is netted
// out: this is the number the card was charged and the number an ad platform's
// ROAS is measured against. See the long note in src/lib/meta-pixel.ts.

import type { CurrencyCode } from "@/lib/markets";

type Oaiq = (...args: unknown[]) => void;

declare global {
  interface Window {
    oaiq?: Oaiq;
  }
}

/** INR and USD are both two-decimal; there is no zero-decimal market here. */
export function toMinorUnits(amount: number): number | null {
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

function ready(): boolean {
  return typeof window !== "undefined" && typeof window.oaiq === "function";
}

/**
 * Hand the pixel the shopper's contact details so a conversion can be matched
 * to the person who saw the ad. Call BEFORE the event it should apply to.
 */
export function openAiIdentify(input: { email?: string | null; phone?: string | null }): void {
  try {
    if (!ready()) return;
    const email = input.email?.trim().toLowerCase();
    const phone = input.phone?.replace(/\D/g, "");
    const user: Record<string, string> = {};
    if (email) user.email = email;
    if (phone) user.phone = phone;
    if (!Object.keys(user).length) return;
    window.oaiq!("init", { pixelId: OPENAI_PIXEL_ID, user });
  } catch {
    /* telemetry must never break checkout */
  }
}

export type OpenAiOrderItem = {
  /** Catalogue id, identical to the feed's item_group_id. */
  id?: string | null;
  name?: string | null;
  quantity?: number;
  /** Presentment line total in MAJOR units; converted here. */
  amount?: number;
};

export type OpenAiOrder = {
  orderId: string;
  currency: CurrencyCode;
  /** Presentment total the shopper pays, INCLUDING shipping and tax, in major units. */
  amount: number;
  contents?: OpenAiOrderItem[];
};

/** Fire order_created once per order in this browser session. */
export function openAiOrderCreated(order: OpenAiOrder): void {
  try {
    if (!ready()) return;
    const eventId = order.orderId.trim().replace(/[^a-zA-Z0-9_-]/g, "");
    const amount = toMinorUnits(order.amount);
    // A zero-value order is withheld, exactly as the Meta path withholds it —
    // the two channels must never disagree about whether a sale happened.
    if (!eventId || amount === null || amount <= 0) return;

    const dedupKey = `zyv_oai_order_${eventId}`;
    try {
      if (sessionStorage.getItem(dedupKey)) return;
    } catch {
      /* the stable event_id remains a second line of deduplication */
    }

    const props: Record<string, unknown> = { type: "contents", amount, currency: order.currency };
    const contents = (order.contents ?? [])
      .map((item) => {
        const entry: Record<string, unknown> = {};
        if (item.id) entry.id = item.id;
        if (item.name) entry.name = item.name;
        if (Number.isFinite(item.quantity)) entry.quantity = Math.max(1, Math.round(item.quantity as number));
        const lineAmount = item.amount === undefined ? null : toMinorUnits(item.amount);
        if (lineAmount !== null) entry.amount = lineAmount;
        return entry;
      })
      .filter((entry) => Object.keys(entry).length > 0);
    if (contents.length) props.contents = contents;

    window.oaiq!("measure", "order_created", props, { event_id: eventId });
    try { sessionStorage.setItem(dedupKey, "1"); } catch { /* storage can be unavailable */ }
  } catch {
    /* telemetry must never interrupt a paid order */
  }
}
