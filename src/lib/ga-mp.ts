import { serviceFetch } from '@/brand/service-transport';
const fetch: typeof globalThis.fetch = (input, init) => serviceFetch('analytics', input, init);
// GA4 Measurement Protocol — the purchase the browser could not send.
//
// src/lib/ga.ts fires `purchase` from the checkout page once Razorpay
// confirms. That is the accurate path (items, coupon, presentment currency)
// and it stays. But it only runs if the tab is still open and the script is
// not blocked — on 19 Sep 2026 a paid ₹200 order produced no GA purchase at
// all. So the server sends the same event from the moment the money is
// recorded (verify route AND webhook), addressed to the same GA client the
// visitor had at checkout. GA4 dedups purchases by transaction_id per client,
// so a browser that did fire is not counted twice.
//
// Pure functions first (cookie parsing, payload shape) so they are testable
// without a database or network; the impure sender is at the bottom.

import { isInternalOrder } from "@/lib/internal-orders";
import type { SupabaseClient } from "@supabase/supabase-js";
import { exGst } from "@/lib/pricing";

export type GaIds = { clientId: string; sessionId: string | null };

/**
 * Read the GA client id (and, when present, the session id) out of the request
 * cookies. `_ga` = "GA1.1.<client>"; `_ga_<STREAM>` = "GS1.1.<session>.…".
 */
export function gaIdsFromCookies(
  get: (name: string) => string | undefined,
  measurementId: string | undefined,
): GaIds | null {
  const ga = get("_ga");
  const m = ga?.match(/^GA\d+\.\d+\.(\d+\.\d+)$/);
  if (!m) return null;
  let sessionId: string | null = null;
  const stream = measurementId?.replace(/^G-/, "");
  if (stream) {
    const cookie = get(`_ga_${stream}`);
    // GS2 labels fields instead of keeping GS1's positional format.
    sessionId = cookie?.match(/^GS1\.\d+\.(\d+)\./)?.[1]
      ?? cookie?.match(/^GS2\.\d+\.(?:[^$]*\$)*s(\d+)(?:\$|$)/)?.[1]
      ?? null;
  }
  return { clientId: m[1]!, sessionId };
}

export type PurchaseOrderRow = {
  id: string;
  zvy: string | null;
  order_number: number;
  currency: string | null;
  total: number | string | null;
  shipping: number | string | null;
  discount_code: string | null;
  notes: string | null;
  placed_via: string | null;
  ga_client_id: string | null;
  ga_session_id: string | null;
  paid_at: string | null;
  email?: string | null;
};

export type PurchaseItem = { item_id: string; item_name: string; item_variant?: string; price: number; quantity: number };

/**
 * The same accounting the browser uses (see gaPurchaseAccounting in ga.ts):
 * INR = goods ex-GST, shipping ex-GST, tax the remainder; USD = the stored
 * presentment goods and delivery, no tax. Sample orders use the sample's own
 * transaction id so the two paths dedup against each other.
 */
export function purchaseParamsFor(order: PurchaseOrderRow, items: PurchaseItem[]) {
  if (isInternalOrder(order.email)) return null;
  const transaction_id = order.placed_via === "sample"
    ? `sample-${order.order_number}`
    : order.zvy ?? `#${order.order_number}`;
  let presentment: { presentmentCurrency?: string; presentmentGoods?: number; presentmentDelivery?: number } = {};
  try { if (order.notes) presentment = JSON.parse(order.notes); } catch { /* prose notes are fine */ }

  if (presentment.presentmentCurrency === "USD") {
    const value = Number(presentment.presentmentGoods);
    const shipping = Number(presentment.presentmentDelivery ?? 0);
    // See the note below: zero goods revenue is not a purchase.
    if (!Number.isFinite(value) || value <= 0) return null;
    return { transaction_id, currency: "USD", value, shipping, tax: 0, coupon: order.discount_code ?? undefined, items };
  }

  // `Number(null)` is 0 — finite, and not less than a 0 shipping — so an order
  // with no total sailed through every guard here and was sent to GA4 as a
  // real sale worth nothing. That is worse than sending nothing at all: the
  // property reports a purchase with no revenue, and Google Ads bids against
  // a conversion action that appears to convert for free. The same hole opens
  // when total === shipping, which passes `total < shippingIncl` but leaves no
  // goods revenue behind. Both are refused: a purchase must have a value.
  if (order.total === null || order.total === "") return null;
  const total = Number(order.total);
  const shippingIncl = Number(order.shipping ?? 0);
  if (!Number.isFinite(total) || !Number.isFinite(shippingIncl) || total <= shippingIncl) return null;
  const value = exGst(total - shippingIncl);
  const shipping = exGst(shippingIncl);
  // Item prices are re-allocated so sum(price × qty) reconciles to value.
  const weights = items.map((it) => Math.max(0, it.price * it.quantity));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let allocated = 0;
  const reconciled = items.map((it, i) => {
    const line = i === items.length - 1
      ? value - allocated
      : Math.floor(value * (totalWeight > 0 ? weights[i]! / totalWeight : 1 / items.length));
    allocated += line;
    return { ...it, price: line / Math.max(1, it.quantity) };
  });
  return {
    transaction_id,
    currency: "INR",
    value,
    shipping,
    tax: total - value - shipping,
    coupon: order.discount_code ?? undefined,
    items: reconciled,
  };
}

export function mpBody(order: PurchaseOrderRow, params: NonNullable<ReturnType<typeof purchaseParamsFor>>) {
  const paidAt = order.paid_at ? Date.parse(order.paid_at) : NaN;
  return {
    client_id: order.ga_client_id,
    ...(Number.isFinite(paidAt) ? { timestamp_micros: String(Math.round(paidAt * 1000)) } : {}),
    events: [
      {
        name: "purchase",
        params: {
          ...params,
          ...(order.ga_session_id ? { session_id: order.ga_session_id } : {}),
          engagement_time_msec: 1,
          // So the property can tell the two paths apart in a comparison.
          sent_from: "server",
        },
      },
    ],
  };
}

/* ------------------------------ impure ------------------------------ */

const MP_ENDPOINT = "https://www.google-analytics.com/mp/collect";

/**
 * Send the order's purchase to GA4 once. Idempotent through a claim on
 * ga_purchase_sent_at; silent when the order carries no GA client (the
 * visitor blocked the tag — nothing to address the hit to) or when the
 * Worker has no API secret. Never throws: telemetry must not break payment.
 */
export async function sendGaPurchaseForOrder(orderId: string): Promise<"sent" | "skipped" | "already" | "failed"> {
  try {
    const secret = process.env.GA4_MP_API_SECRET;
    const measurementId = process.env.GA4_MEASUREMENT_ID || process.env.NEXT_PUBLIC_GA_ID;
    // Lazy: supabase-admin is server-only, and the pure half of this file is
    // exercised by node tests.
    const { supabaseAdmin } = await import("@/lib/supabase-admin");
    const admin = supabaseAdmin();
    if (!secret || !measurementId || !admin) return "skipped";

    // Claim first. A verify call and a webhook for the same payment race here;
    // exactly one of them gets the row back.
    const { data: order, error } = await admin
      .from("orders")
      .update({ ga_purchase_sent_at: new Date().toISOString() })
      .eq("id", orderId)
      .is("ga_purchase_sent_at", null)
      .eq("payment_status", "paid")
      .not("ga_client_id", "is", null)
      .select("id, zvy, order_number, currency, total, shipping, discount_code, notes, placed_via, ga_client_id, ga_session_id, paid_at, email")
      .maybeSingle();
    if (error) { console.error("ga mp claim failed:", error.message); return "failed"; }
    if (!order) return "already";

    const row = order as PurchaseOrderRow;
    if (isInternalOrder(row.email)) return "skipped";
    const items = await itemsFor(admin, row);
    const params = purchaseParamsFor(row, items);
    if (!params) { console.error(`ga mp: order ${row.order_number} has no usable accounting`); return "failed"; }

    const url = new URL(MP_ENDPOINT);
    url.searchParams.set("measurement_id", measurementId);
    url.searchParams.set("api_secret", secret);
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mpBody(row, params)) });
    if (!res.ok) {
      console.error(`ga mp: collect returned ${res.status} for order ${row.order_number}`);
      // Release the claim so a retry (the webhook, a redelivery) can try again.
      await admin.from("orders").update({ ga_purchase_sent_at: null }).eq("id", orderId);
      return "failed";
    }
    return "sent";
  } catch (e) {
    console.error("ga mp purchase failed:", e);
    return "failed";
  }
}

async function itemsFor(admin: SupabaseClient, order: PurchaseOrderRow): Promise<PurchaseItem[]> {
  if (order.placed_via === "sample") {
    const { data } = await admin
      .from("sample_print_queue")
      .select("design_handle, design_title, material_name")
      .eq("order_id", order.id);
    const cards = (data ?? []) as { design_handle: string; design_title: string; material_name: string | null }[];
    const each = cards.length ? exGst(Number(order.total)) / cards.length : 0;
    return cards.map((c) => ({
      item_id: c.design_handle,
      item_name: `${c.design_title} sample`,
      item_variant: c.material_name ?? undefined,
      price: each,
      quantity: 1,
    }));
  }
  const { data } = await admin
    .from("order_items")
    .select("product_title, material_name, quantity, line_total, products(handle)")
    .eq("order_id", order.id);
  const rows = (data ?? []) as { product_title: string; material_name: string | null; quantity: number; line_total: number | string; products: { handle: string } | { handle: string }[] | null }[];
  return rows.map((r) => {
    const p = Array.isArray(r.products) ? r.products[0] : r.products;
    const qty = Math.max(1, Number(r.quantity) || 1);
    return {
      item_id: p?.handle ?? r.product_title,
      item_name: r.product_title,
      item_variant: r.material_name ?? undefined,
      price: exGst(Number(r.line_total)) / qty,
      quantity: qty,
    };
  });
}
