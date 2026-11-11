import assert from "node:assert/strict";
import test from "node:test";
import {
  initializeMetaPixel, metaAddToCart, metaContentId, metaContentIds, metaInitiateCheckout,
  metaAddToCartLines, metaPresentmentFromInr, metaPurchase, metaPurchaseEventId, metaPurchaseValue, metaSearch, metaViewContent,
} from "@/lib/meta-pixel";

function browser() {
  const calls: unknown[][] = [];
  const session = new Map<string, string>();
  Object.defineProperty(globalThis, "window", { configurable: true, value: { fbq: (...args: unknown[]) => calls.push(args), __zyvMetaPixelId: "pixel-1" } });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: { getItem: (key: string) => session.get(key) ?? null, setItem: (key: string, value: string) => session.set(key, value) } });
  return calls;
}

test("purchase uses a stable order event id and fires once per session", () => {
  const calls = browser();
  const purchase = { pixelId: "pixel-1", orderId: "ZVY-42", currency: "INR" as const, value: 1_000, shipping: 100, tax: 180 };
  metaPurchase(purchase);
  metaPurchase(purchase);
  assert.equal(metaPurchaseEventId(" ZVY-42 "), "zyvorah_purchase_ZVY-42");
  assert.deepEqual(calls, [["track", "Purchase", { currency: "INR", value: 1_280 }, { eventID: "zyvorah_purchase_ZVY-42" }]]);
});

test("purchase requires the configured Pixel even when an unrelated fbq exists", () => {
  const calls = browser();
  metaPurchase({ pixelId: "pixel-2", orderId: "ZVY-44", currency: "USD", value: 128 });
  metaPurchase({ orderId: "ZVY-44", currency: "USD", value: 128 });
  assert.equal(calls.length, 0);
});

test("Meta bootstrap exposes the documented queue fields and queued events drain through callMethod", () => {
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  assert.equal(initializeMetaPixel("pixel-1"), true);
  const fbq = window.fbq!;
  assert.equal(fbq.loaded, true);
  assert.equal(fbq.version, "2.0");
  assert.equal(fbq.push, fbq);
  assert.equal(window._fbq, fbq);
  assert.deepEqual(fbq.queue, [["init", "pixel-1"]]);
  const drained: unknown[][] = [];
  fbq.callMethod = (...args: unknown[]) => drained.push(args);
  for (const args of fbq.queue ?? []) fbq(...args);
  fbq.queue = [];
  assert.deepEqual(drained, [["init", "pixel-1"]]);
});

test("purchase value is total paid presentment and rejects invalid amounts", () => {
  assert.equal(metaPurchaseValue({ value: 70, shipping: 58, tax: 0 }), 128);
  assert.equal(metaPurchaseValue({ value: 10.005, shipping: 0, tax: 0 }), 10.01);
  assert.equal(metaPurchaseValue({ value: 70, shipping: -1, tax: 0 }), null);
});


test("a content id is the feed's g:item_group_id — change one and catalogue matching dies silently", () => {
  assert.equal(metaContentId("mati-jodi-01"), "ZYV-MATI-JODI-01");
  assert.equal(metaContentId(" Taash_02 "), "ZYV-TAASH_02");
  assert.equal(metaContentId("   "), null);
  assert.deepEqual(metaContentIds(["a", "a", null, undefined, "b"]), ["ZYV-A", "ZYV-B"]);
});

test("Purchase carries the catalogue ids, so Meta can attribute it to a catalogue ad", () => {
  const calls = browser();
  metaPurchase({ pixelId: "pixel-1", orderId: "ZVY-50", currency: "INR", value: 1_000, shipping: 0, tax: 180, handles: ["mati-jodi-01"] });
  const params = calls[0]![2] as Record<string, unknown>;
  assert.deepEqual(params.content_ids, ["ZYV-MATI-JODI-01"]);
  assert.equal(params.content_type, "product_group");
  assert.equal(params.value, 1_180);
});

test("ViewContent and AddToCart name the design and quote what the shopper would pay", () => {
  const calls = browser();
  metaViewContent({ handle: "mati-jodi-01", title: "Mati Jodi" });
  metaAddToCart({ handle: "mati-jodi-01", title: "Mati Jodi", lineTotalInr: 11_800, quantity: 2 });
  assert.equal(calls[0]![1], "ViewContent");
  assert.deepEqual((calls[0]![2] as Record<string, unknown>).content_ids, ["ZYV-MATI-JODI-01"]);
  const cart = calls[1]![2] as Record<string, unknown>;
  assert.equal(calls[1]![1], "AddToCart");
  // GST-inclusive, unlike GA's 10,000 — the deliberate divergence.
  assert.equal(cart.value, 11_800);
  assert.deepEqual(cart.contents, [{ id: "ZYV-MATI-JODI-01", quantity: 2 }]);
});

test("InitiateCheckout sums the basket and needs at least one real design", () => {
  const calls = browser();
  metaInitiateCheckout({ handles: ["a", "b"], value: 5_000, currency: "INR", numItems: 3 });
  metaInitiateCheckout({ handles: [null], value: 5_000, currency: "INR", numItems: 1 });
  assert.equal(calls.length, 1);
  const params = calls[0]![2] as Record<string, unknown>;
  assert.deepEqual(params.content_ids, ["ZYV-A", "ZYV-B"]);
  assert.equal(params.num_items, 3);
});

test("INR passes through as the charged amount; other markets convert", () => {
  assert.equal(metaPresentmentFromInr(11_800, "IN", "INR"), 11_800);
  assert.notEqual(metaPresentmentFromInr(11_800, "US", "USD"), 11_800);
});

test("every helper is a silent no-op when the configured pixel is not the one loaded", () => {
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  metaViewContent({ handle: "a" });
  metaAddToCart({ handle: "a", lineTotalInr: 1, quantity: 1 });
  metaInitiateCheckout({ handles: ["a"], value: 1, currency: "INR", numItems: 1 });
  metaSearch("botanical");
  assert.equal(typeof window.fbq, "undefined");
});

test("an empty search is not a search", () => {
  const calls = browser();
  metaSearch("   ");
  metaSearch("botanical");
  assert.equal(calls.length, 1);
  assert.equal((calls[0]![2] as Record<string, unknown>).search_string, "botanical");
});

test("the browser Meta Purchase refuses a zero value, as the server does", () => {
  assert.equal(metaPurchaseValue({ value: 0, shipping: 0, tax: 0 }), null);
  assert.equal(metaPurchaseValue({ value: 1_000, shipping: 100, tax: 180 }), 1_280);
});


test("a whole concept is ONE AddToCart, with a quantity per design, not one event per wall", () => {
  const calls = browser();
  // Two walls of one design plus a wall of another — one shopper action.
  metaAddToCartLines({
    lines: [
      { handle: "mati-jodi-01", title: "Mati Jodi", lineTotalInr: 10_000, quantity: 1 },
      { handle: "mati-jodi-01", title: "Mati Jodi", lineTotalInr: 5_000, quantity: 1 },
      { handle: "taash-02", title: "Taash", lineTotalInr: 2_000, quantity: 1 },
    ],
  });
  // Firing per wall would inflate the count and wreck the ATC:Purchase ratio
  // Meta's bidder learns from.
  assert.equal(calls.length, 1);
  const params = calls[0]![2] as Record<string, unknown>;
  assert.deepEqual(params.contents, [
    { id: "ZYV-MATI-JODI-01", quantity: 2 },
    { id: "ZYV-TAASH-02", quantity: 1 },
  ]);
  assert.deepEqual(params.content_ids, ["ZYV-MATI-JODI-01", "ZYV-TAASH-02"]);
  // Raw GST-inclusive sum — GA would net this down, Meta must not.
  assert.equal(params.value, 17_000);
});

test("an idempotent replay adds no lines, so it reports nothing at all", () => {
  const calls = browser();
  metaAddToCartLines({ lines: [] });
  metaAddToCartLines({ lines: [{ handle: "   ", lineTotalInr: 100 }] });
  assert.equal(calls.length, 0);
});

test("a concept priced in another market converts, and a broken line total is dropped not sent as NaN", () => {
  const calls = browser();
  metaAddToCartLines({ lines: [{ handle: "a", lineTotalInr: 10_000 }], countryCode: "US", currency: "USD" });
  const usd = (calls[0]![2] as Record<string, unknown>).value as number;
  assert.ok(Number.isFinite(usd) && usd !== 10_000);
  metaAddToCartLines({ lines: [{ handle: "b", lineTotalInr: Number.NaN }] });
  assert.equal(calls.length, 1);
});
