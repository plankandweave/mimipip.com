import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { metaPurchase, metaSamplePurchase, metaPurchaseValue, metaContentId } from "./meta-pixel";
import { capiAccounting, metaPurchaseBody, metaPaidEventTime, metaOrderIdentity, type CapiOrderRow } from "./meta-capi";
import { gaPurchaseAccounting } from "./ga";

const now = Date.parse("2026-10-03T04:21:00Z");
const order: CapiOrderRow = { id: "synthetic", zvy: "ZVY-SYNTHETIC", order_number: 1001, total: 16000,
  notes: null, email: "buyer@example.invalid", phone: null, billing_name: null, paid_at: "2026-10-03T04:20:00Z", placed_via: "web" };
function browser() {
  const calls: unknown[][] = [];
  const storage = new Map<string,string>();
  Object.defineProperty(globalThis, "window", { configurable: true, value: { __zyvMetaPixelId: "offline", fbq: (...args: unknown[]) => calls.push(args) } });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: { getItem: (key:string) => storage.get(key), setItem: (key:string,value:string) => storage.set(key,value) } });
  return calls;
}
test("sample browser and CAPI use one custom event and identical ID; no standard Purchase", () => {
  const calls = browser();
  const identity = metaOrderIdentity({ ...order, order_number: 77, placed_via: "sample", zvy: null });
  metaSamplePurchase({ pixelId: "offline", orderId: identity.orderId, currency: "INR", value: 200 });
  metaSamplePurchase({ pixelId: "offline", orderId: identity.orderId, currency: "INR", value: 200 });
  const body = metaPurchaseBody({ ...identity, currency: "INR", value: 200, eventTime: 1791001200, handles: [], user: {} })!;
  const event = (body.data as Record<string,unknown>[])[0];
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "trackCustom");
  assert.equal(calls[0][1], "SamplePurchase");
  assert.equal(event.event_name, calls[0][1]);
  assert.equal(event.event_id, (calls[0][3] as {eventID:string}).eventID);
  assert.equal(event.event_id, "zyvorah_purchase_sample-77");
});
test("retail browser and CAPI preserve standard Purchase, total and catalogue group identity", () => {
  const calls = browser();
  const accounting = gaPurchaseAccounting({ total: 16000, shipping: 0, presentment: { currency: "INR", countryCode: "IN" } })!;
  const identity = metaOrderIdentity(order);
  metaPurchase({ ...accounting, pixelId: "offline", orderId: identity.orderId, handles: ["wildflower-reverie"] });
  const server = capiAccounting(order)!;
  assert.equal(metaPurchaseValue(accounting), server.value);
  const body = metaPurchaseBody({ ...identity, ...server, handles: ["wildflower-reverie"], eventTime: 1791001200, user: {} })!;
  const event = (body.data as Record<string,unknown>[])[0];
  assert.equal(event.event_name, "Purchase");
  assert.equal(event.event_id, (calls[0][3] as {eventID:string}).eventID);
  assert.deepEqual(event.custom_data, calls[0][2]);
  assert.equal(metaContentId("wildflower-reverie"), "ZYV-WILDFLOWER-REVERIE");
});
test("USD browser and server agree on charged presentment rather than INR order total", () => {
  const input = { presentment: { currency: "USD", countryCode: "US", goods: 180, delivery: 45 } };
  const browserAccounting = gaPurchaseAccounting(input)!;
  const server = capiAccounting({ ...order, notes: JSON.stringify({ presentmentCurrency: "USD", presentmentGoods: 180, presentmentDelivery: 45 }) })!;
  assert.equal(metaPurchaseValue(browserAccounting), 225);
  assert.deepEqual(server, { currency: "USD", value: 225 });
});
test("owner #79 remains excluded from sample CAPI; zero and undefined values cannot become purchases", () => {
  const event = { ...metaOrderIdentity({ ...order, order_number: 79, placed_via: "sample" }), currency: "INR", value: 200, handles: [], eventTime: 1791001200, user: { email: " ROHEENA@PLANKANDWEAVE.COM " } };
  assert.equal(metaPurchaseBody(event), null);
  for (const value of [0, NaN, Infinity, -1, 0.001, undefined as unknown as number]) {
    assert.equal(metaPurchaseBody({ ...event, user: {}, value }), null);
  }
  assert.equal(metaPurchaseBody({ ...event, user: {}, currency: "" }), null);
});
test("legacy missing, invalid, future and over-seven-day paid times cannot be fabricated as now", () => {
  for (const paidAt of [null, "invalid", "2026-10-04T00:00:00Z", "2026-09-19T15:48:37Z"]) {
    assert.equal(metaPaidEventTime(paidAt, now), null);
  }
  assert.equal(metaPaidEventTime(order.paid_at, now), Math.floor(Date.parse(order.paid_at!) / 1000));
});
test("sample UI uses the separate event; CAPI reads classification and gift-only checkout has server coverage", () => {
  const sample = readFileSync("src/components/OrderSample.tsx", "utf8");
  assert.match(sample, /metaSamplePurchase\(/);
  assert.doesNotMatch(sample, /\bmetaPurchase\(/);
  const sender = readFileSync("src/lib/meta-capi.ts", "utf8");
  assert.match(sender, /\.select\("[^"\n]*paid_at, placed_via"\)/);
  const checkout = readFileSync("src/app/api/checkout/route.ts", "utf8");
  const giftBranch = checkout.slice(checkout.indexOf("if (giftApplied > 0 && payable <= 0)"), checkout.indexOf("} else {", checkout.indexOf("if (giftApplied > 0 && payable <= 0)")));
  // Since 7 Oct 2026 the gift-paid branch (and the ₹0 collaboration branch)
  // hand "paid" to one shared list, lib/paid-without-gateway.ts — which must
  // still send Meta's Purchase, and only after the order is marked paid.
  assert.ok(giftBranch.indexOf('if(paidError)') < giftBranch.indexOf('afterPaidWithoutGateway'));
  assert.match(giftBranch, /await afterPaidWithoutGateway\(\{[\s\S]*method: "gift_card"/);
  const shared = readFileSync("src/lib/paid-without-gateway.ts", "utf8");
  assert.match(shared, /after\(\(\) => sendMetaPurchaseForOrder\(order.order_id, input.metaContext\)\)/);
});
