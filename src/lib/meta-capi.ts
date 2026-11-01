import { serviceFetch } from "../brand/service-transport";
const fetch: typeof globalThis.fetch = (input,init) => serviceFetch("analytics",input,init);
// Meta Conversions API — the Purchase the browser could not send.
//
// WHY THIS EXISTS
//   src/lib/meta-pixel.ts fires Purchase from the checkout page once Razorpay
//   confirms. That path is accurate and it stays. But it only runs if the tab
//   is still open and fbevents.js was not blocked — and on Meta's traffic that
//   is a much bigger "if" than on Google's: iOS Safari, in-app browsers and
//   content blockers are exactly where Instagram and Facebook ads land. This
//   is the same failure src/lib/ga-mp.ts was written for (a paid order that
//   produced no analytics event at all, 19 Sep 2026), and the same remedy:
//   send the event from the moment the money is RECORDED, server side.
//
// WHY THERE IS NO CLAIM COLUMN HERE
//   ga-mp.ts claims each order with `ga_purchase_sent_at` because GA4's
//   Measurement Protocol has no server-side deduplication — send twice and GA
//   counts twice. Meta does: it drops a duplicate (event_name, event_id) pair
//   for 48 hours, which is the documented mechanism the browser Purchase
//   already relies on to avoid double-counting against this file. So the
//   verify route and the webhook may both call this for the same order, and
//   the browser may fire too; Meta keeps one. Adding a column would buy
//   nothing and cost a migration.
//
//   The single event_id both sides use is metaPurchaseEventId(), imported
//   rather than re-derived — see the note in meta-pixel.ts.
//
// CREDENTIAL-GATED
//   Without META_CAPI_TOKEN this module is a no-op that returns "skipped".
//   Nothing here can fail a checkout: every caller runs it in after().
//
// Pure functions first (hashing, payload shape) so they are testable without
// a database or network; the impure sender is at the bottom.

import { isInternalOrder } from "@/lib/internal-orders";
import { createHash } from "node:crypto";
import { metaCapiToken } from "@/lib/meta-env";
import { metaContentId, metaPurchaseEventId, META_CONTENT_TYPE } from "@/lib/meta-pixel";
import { normalisePhone } from "@/lib/google-ads";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0";

/** The pixel the server reports against — the same one the browser loads. */
export function metaCapiPixelId(): string | undefined {
  return process.env.META_PIXEL_ID || process.env.NEXT_PUBLIC_META_PIXEL_ID;
}

export function metaCapiConfigured(): boolean {
  return Boolean(metaCapiToken() && metaCapiPixelId());
}

/** Meta requires user identifiers SHA-256 hashed over the normalised value. */
export function metaHash(value: string | null | undefined): string | null {
  const v = value?.trim().toLowerCase();
  if (!v) return null;
  return createHash("sha256").update(v).digest("hex");
}

export type MetaUserInput = {
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  /** Meta's own browser/click cookies, when the request carried them. */
  fbp?: string | null;
  fbc?: string | null;
  ip?: string | null;
  userAgent?: string | null;
};

/**
 * Hashed user_data. Match quality rises with each identifier present, so we
 * send every one we actually hold — and never a placeholder for one we do not,
 * because a hashed empty string is a real hash of a real value that matches
 * nobody and drags the reported match rate down.
 *
 * fbp/fbc, the client IP and the user agent are NOT hashed: Meta's schema
 * takes those raw, and hashing them makes them unmatchable.
 */
export function metaUserData(input: MetaUserInput): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const em = metaHash(input.email);
  if (em) out.em = [em];
  const phone = normalisePhone(input.phone ?? null);
  // Meta wants digits only, country code included, no "+".
  const ph = metaHash(phone ? phone.replace(/\D/g, "") : null);
  if (ph) out.ph = [ph];

  const name = input.name?.trim();
  if (name) {
    const parts = name.split(/\s+/);
    const fn = metaHash(parts[0]);
    if (fn) out.fn = [fn];
    if (parts.length > 1) {
      const ln = metaHash(parts[parts.length - 1]);
      if (ln) out.ln = [ln];
    }
  }

  if (input.fbp) out.fbp = input.fbp;
  if (input.fbc) out.fbc = input.fbc;
  if (input.ip) out.client_ip_address = input.ip;
  if (input.userAgent) out.client_user_agent = input.userAgent;
  return out;
}

export type MetaPurchaseEvent = {
  sample?: boolean;
  orderId: string;
  /** Total the shopper paid, tax and shipping included — see meta-pixel.ts. */
  value: number;
  currency: string;
  /** Product handles in the order. */
  handles: (string | null | undefined)[];
  /** Unix seconds the money was recorded. Meta rejects events over 7 days old. */
  eventTime: number;
  /** The checkout page URL, when known. */
  eventSourceUrl?: string | null;
  user: MetaUserInput;
};

/** The Graph API payload for one Purchase. Exported for tests. */
export function metaPurchaseBody(event: MetaPurchaseEvent): Record<string, unknown> | null {
  if (isInternalOrder(event.user.email)) return null;
  const eventId = metaPurchaseEventId(event.orderId);
  if (!eventId) return null;
  if (!Number.isFinite(event.value) || Math.round(event.value * 100) <= 0) return null;
  if (event.currency !== "INR" && event.currency !== "USD") return null;
  if (!Number.isInteger(event.eventTime) || event.eventTime <= 0) return null;

  const contentIds: string[] = [];
  for (const handle of event.handles) {
    const id = handle ? metaContentId(handle) : null;
    if (id && !contentIds.includes(id)) contentIds.push(id);
  }

  const custom_data: Record<string, unknown> = {
    currency: event.currency,
    value: Math.round(event.value * 100) / 100,
  };
  if (contentIds.length) {
    custom_data.content_ids = contentIds;
    custom_data.content_type = META_CONTENT_TYPE;
  }

  const body: Record<string, unknown> = {
    data: [
      {
        event_name: event.sample ? "SamplePurchase" : "Purchase",
        event_time: event.eventTime,
        event_id: eventId,
        action_source: "website",
        ...(event.eventSourceUrl ? { event_source_url: event.eventSourceUrl } : {}),
        user_data: metaUserData(event.user),
        custom_data,
      },
    ],
  };
  // Events Manager → Test Events pairs on this code. Setting it routes events
  // to the test stream so a live pixel can be verified without polluting it.
  const testCode = process.env.META_TEST_EVENT_CODE;
  if (testCode) body.test_event_code = testCode;
  return body;
}

/* ── impure ─────────────────────────────────────────────────────────────── */

type SendResult = "sent" | "skipped" | "failed";

/** Post one Purchase to the Conversions API. Never throws. */
export async function sendMetaPurchase(event: MetaPurchaseEvent): Promise<SendResult> {
  try {
    const token = metaCapiToken();
    const pixelId = metaCapiPixelId();
    if (!token || !pixelId) return "skipped";
    const body = metaPurchaseBody(event);
    if (!body) {
      console.error(`meta capi: order ${event.orderId} has no usable accounting`);
      return "failed";
    }
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(`meta capi: events returned ${res.status} for order ${event.orderId}:`, await res.text());
      return "failed";
    }
    return "sent";
  } catch (e) {
    console.error("meta capi purchase failed:", e);
    return "failed";
  }
}

export type CapiOrderRow = {
  id: string;
  zvy: string | null;
  order_number: number;
  total: number | string | null;
  notes: string | null;
  email: string | null;
  phone: string | null;
  billing_name: string | null;
  paid_at: string | null;
  placed_via?: string | null;
};

/** Never invent a new payment time for a legacy row or replay. */
export function metaPaidEventTime(paidAt: string | null, nowMs = Date.now()): number | null {
  const paidMs = paidAt ? Date.parse(paidAt) : NaN;
  if (!Number.isFinite(paidMs) || paidMs > nowMs || nowMs - paidMs > 7 * 24 * 60 * 60 * 1000) return null;
  return Math.floor(paidMs / 1000);
}

export function metaOrderIdentity(order: Pick<CapiOrderRow, "zvy" | "order_number" | "placed_via">) {
  const sample = order.placed_via === "sample";
  return { sample, orderId: sample ? `sample-${order.order_number}` : order.zvy ?? String(order.order_number) };
}

/**
 * Value and currency exactly as the shopper was charged.
 *
 * India: `total` is already the GST-inclusive amount the card was debited, so
 * it passes straight through — this is the deliberate divergence from
 * purchaseParamsFor() in ga-mp.ts, which nets GST out for GA. Other markets
 * store the presentment split on the order's notes, same as GA reads it.
 */
export function capiAccounting(order: CapiOrderRow): { value: number; currency: string } | null {
  let presentment: { presentmentCurrency?: string; presentmentGoods?: number; presentmentDelivery?: number } = {};
  try { if (order.notes) presentment = JSON.parse(order.notes); } catch { /* prose notes are fine */ }

  if (presentment.presentmentCurrency === "USD") {
    const goods = Number(presentment.presentmentGoods);
    const delivery = Number(presentment.presentmentDelivery ?? 0);
    if (!Number.isFinite(goods) || !Number.isFinite(delivery) || goods <= 0 || delivery < 0) return null;
    return { value: Math.round((goods + delivery) * 100) / 100, currency: "USD" };
  }

  // Number(null) is 0, not NaN — so a null total would sail past a bare
  // isFinite check and report a ₹0 Purchase to Meta, which is worse than
  // reporting none: it trains the bidder that these shoppers are worthless.
  if (order.total === null || order.total === undefined || order.total === "") return null;
  const total = Number(order.total);
  // ...and a total of exactly 0 is the same trap one step further on: finite,
  // non-negative, and still not a sale. A purchase must have a value.
  if (!Number.isFinite(total) || total <= 0) return null;
  return { value: total, currency: "INR" };
}

/**
 * Send the Purchase for a paid order. Safe to call more than once and from
 * more than one route — Meta deduplicates on the event id.
 */
export async function sendMetaPurchaseForOrder(
  orderId: string,
  context?: { fbp?: string | null; fbc?: string | null; ip?: string | null; userAgent?: string | null },
): Promise<SendResult | "already"> {
  try {
    if (!metaCapiConfigured()) return "skipped";
    const { supabaseAdmin } = await import("@/lib/supabase-admin");
    const admin = supabaseAdmin();
    if (!admin) return "skipped";

    const { data, error } = await admin
      .from("orders")
      .select("id, zvy, order_number, total, notes, email, phone, billing_name, paid_at, placed_via")
      .eq("id", orderId)
      .eq("payment_status", "paid")
      .maybeSingle();
    if (error) { console.error("meta capi order read failed:", error.message); return "failed"; }
    if (!data) return "already";

    const order = data as CapiOrderRow;
    if (isInternalOrder(order.email)) return "skipped";
    const accounting = capiAccounting(order);
    if (!accounting) { console.error(`meta capi: order ${order.order_number} has no usable accounting`); return "failed"; }

    const { data: itemRows } = await admin
      .from("order_items")
      .select("products(handle)")
      .eq("order_id", order.id);
    const handles = ((itemRows ?? []) as { products: { handle: string } | { handle: string }[] | null }[])
      .map((r) => (Array.isArray(r.products) ? r.products[0]?.handle : r.products?.handle) ?? null);

    // Meta rejects events older than seven days; a webhook redelivery for a
    // long-settled order is better dropped here than sent and refused.
    const eventTime = metaPaidEventTime(order.paid_at);
    if (eventTime === null) return "skipped";

    return await sendMetaPurchase({
      ...metaOrderIdentity(order),
      value: accounting.value,
      currency: accounting.currency,
      handles,
      eventTime,
      user: {
        email: order.email,
        phone: order.phone,
        name: order.billing_name,
        fbp: context?.fbp,
        fbc: context?.fbc,
        ip: context?.ip,
        userAgent: context?.userAgent,
      },
    });
  } catch (e) {
    console.error("meta capi purchase failed:", e);
    return "failed";
  }
}
