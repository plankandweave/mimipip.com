import assert from "node:assert/strict";
import test from "node:test";
import { gaIdsFromCookies, mpBody, purchaseParamsFor, type PurchaseOrderRow } from "@/lib/ga-mp";

const jar = (c: Record<string, string>) => (n: string) => c[n];

test("GA client and session ids come out of the two cookies", () => {
  const ids = gaIdsFromCookies(jar({
    _ga: "GA1.1.1234567890.1758540000",
    _ga_HMR15BBLWK: "GS1.1.1758541111.3.1.1758541200.0.0.0",
  }), "G-HMR15BBLWK");
  assert.deepEqual(ids, { clientId: "1234567890.1758540000", sessionId: "1758541111" });
});

test("no _ga cookie means no ids; a stream cookie alone is not enough", () => {
  assert.equal(gaIdsFromCookies(jar({ _ga_HMR15BBLWK: "GS1.1.1.1.1.1.0.0.0" }), "G-HMR15BBLWK"), null);
  assert.deepEqual(gaIdsFromCookies(jar({ _ga: "GA1.1.5.6" }), undefined), { clientId: "5.6", sessionId: null });
});

const order: PurchaseOrderRow = {
  id: "o1", zvy: "ZVY-0042", order_number: 42, currency: "INR", total: 11800, shipping: 1180,
  discount_code: "WELCOME", notes: JSON.stringify({ presentmentCurrency: "INR" }), placed_via: null,
  ga_client_id: "1.2", ga_session_id: "9", paid_at: "2026-09-22T10:00:00.000Z",
};

test("India purchase is goods ex-GST, shipping ex-GST, tax the remainder, items reconciled", () => {
  const p = purchaseParamsFor(order, [
    { item_id: "a", item_name: "A", price: 5000, quantity: 1 },
    { item_id: "b", item_name: "B", price: 2500, quantity: 2 },
  ])!;
  assert.equal(p.transaction_id, "ZVY-0042");
  assert.equal(p.value, 9000);
  assert.equal(p.shipping, 1000);
  assert.equal(p.tax, 1800);
  assert.equal(p.coupon, "WELCOME");
  const sum = p.items.reduce((s, it) => s + it.price * it.quantity, 0);
  assert.ok(Math.abs(sum - 9000) < 0.01);
});

test("USD purchase uses the stored presentment and no tax", () => {
  const p = purchaseParamsFor({
    ...order, notes: JSON.stringify({ presentmentCurrency: "USD", presentmentGoods: 140, presentmentDelivery: 35 }),
  }, [{ item_id: "a", item_name: "A", price: 140, quantity: 1 }])!;
  assert.deepEqual([p.currency, p.value, p.shipping, p.tax], ["USD", 140, 35, 0]);
});

test("samples use the sample transaction id so both paths dedup", () => {
  const p = purchaseParamsFor({ ...order, placed_via: "sample", zvy: null, total: 400, shipping: 0 }, [])!;
  assert.equal(p.transaction_id, "sample-42");
  assert.equal(p.value, 339);
});

test("the MP body is addressed to the client with the paid time and session", () => {
  const p = purchaseParamsFor(order, [])!;
  const body = mpBody(order, p);
  assert.equal(body.client_id, "1.2");
  assert.equal(body.timestamp_micros, String(Date.parse("2026-09-22T10:00:00.000Z") * 1000));
  assert.equal(body.events[0]!.name, "purchase");
  assert.equal(body.events[0]!.params.session_id, "9");
  assert.equal(body.events[0]!.params.sent_from, "server");
});

test("a missing total is refused, not sent as a zero-value purchase", () => {
  // Number(null) is 0, which is finite and not less than a 0 shipping — so a
  // null total sailed through as a real sale worth nothing. GA4 then reports
  // a purchase with no revenue, and Google Ads bids against it as if the
  // click converted for free. Silence is the correct output here.
  const items = [{ item_id: "a", item_name: "A", price: 100, quantity: 1 }];
  assert.equal(purchaseParamsFor({ ...order, total: null, shipping: null }, items), null);
  assert.equal(purchaseParamsFor({ ...order, total: 0, shipping: 0 }, items), null);
  assert.equal(purchaseParamsFor({ ...order, total: "", shipping: 0 }, items), null);
});

test("a shipping-only order carries no goods revenue and is refused", () => {
  // total === shipping passes the `total < shippingIncl` guard but leaves
  // value 0 — the same zero-value purchase by another route.
  const items = [{ item_id: "a", item_name: "A", price: 100, quantity: 1 }];
  assert.equal(purchaseParamsFor({ ...order, total: 1180, shipping: 1180 }, items), null);
});

test("server purchase fallback excludes owner validations, not the company domain", () => {
  assert.equal(purchaseParamsFor({ ...order, email: "roheena@plankandweave.com" }, []), null);
  assert.ok(purchaseParamsFor({ ...order, email: "buyer@plankandweave.com" }, []));
});


test("GS2 session fields are labelled and may be reordered; malformed values stay unknown", () => {
  const client = { _ga: "GA1.1.5.6" };
  for (const cookie of ["GS2.1.s1758541111$o3$g1$t1758541200", "GS2.1.o3$g1$s1758541111$t1758541200"]) {
    assert.deepEqual(gaIdsFromCookies(jar({ ...client, _ga_TEST: cookie }), "G-TEST"), { clientId: "5.6", sessionId: "1758541111" });
  }
  for (const cookie of ["GS2.1.swrong$o3", "GS2.1.s123oops$o3", "GS2.1.o3$g1", "GS3.1.s123$o3"]) {
    assert.equal(gaIdsFromCookies(jar({ ...client, _ga_TEST: cookie }), "G-TEST")?.sessionId, null);
  }
  assert.equal(gaIdsFromCookies(jar({ _ga_TEST: "GS2.1.s1758541111$o3" }), "G-TEST"), null);
});
