import assert from "node:assert/strict";
import test from "node:test";
import type { CartItem } from "@/components/CartProvider";
import { gaAddToCart, gaBeginCheckout, gaPurchase, gaPurchaseAccounting, gaSamplePurchase } from "@/lib/ga";

const item = {
  item_id: "line-1",
  handle: "sample-design",
  title: "Sample Design",
  material_slug: "smooth-matt",
  material_name: "Soft Matte",
  width_cm: 100,
  height_cm: 100,
  area_sqft: 20,
  unit_price: 200,
  quantity: 1,
  line_total: 4_000,
  image: null,
  preview_url: null,
} satisfies CartItem;

function captureEvents() {
  const calls: unknown[][] = [];
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { gtag: (...args: unknown[]) => calls.push(args) },
  });
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
  return calls;
}

test("add_to_cart uses international presentment currency and line value", () => {
  const calls = captureEvents();
  gaAddToCart({
    productHandle: item.handle,
    title: item.title,
    materialName: item.material_name,
    unitPrice: item.unit_price,
    quantity: item.quantity,
    lineTotal: item.line_total,
    countryCode: "US",
    currency: "USD",
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]?.slice(0, 2), ["event", "add_to_cart"]);
  const payload = calls[0]?.[2] as { currency: string; value: number; items: { price: number }[] };
  assert.equal(payload.currency, "USD");
  assert.equal(payload.value, 70);
  assert.equal(payload.items[0]?.price, 70);
});

test("add_to_cart and begin_checkout reconcile India ex-GST item revenue", () => {
  const calls = captureEvents();
  const two = { ...item, quantity: 2, line_total: 8_000 };
  gaAddToCart({
    productHandle: two.handle,
    title: two.title,
    materialName: two.material_name,
    unitPrice: two.unit_price,
    quantity: two.quantity,
    lineTotal: two.line_total,
    countryCode: "IN",
    currency: "INR",
  });
  gaBeginCheckout({ items: [two], value: 6_780, countryCode: "IN", currency: "INR" });

  for (const call of calls) {
    const payload = call[2] as { value: number; items: { price: number; quantity: number }[] };
    assert.equal(payload.items.reduce((sum, line) => sum + line.price * line.quantity, 0), payload.value);
    assert.equal(payload.value, 6_780);
  }
});

test("purchase sends the paid presentment once per transaction", () => {
  const calls = captureEvents();
  const purchase = {
    transactionId: "ZVY-42",
    value: 70,
    items: [item],
    countryCode: "US",
    currency: "USD" as const,
    shipping: 58,
    tax: 0,
    user: { email: " Buyer@Example.com ", phone: "98765 43210" },
  };

  gaPurchase(purchase);
  gaPurchase(purchase);

  // GA purchase, then enhanced-conversion user data, then the Google Ads
  // Purchase action — once, despite the repeat call.
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[0]?.slice(0, 2), ["event", "purchase"]);
  assert.deepEqual(calls[1], ["set", "user_data", { email: "buyer@example.com", phone_number: "+919876543210" }]);
  assert.deepEqual(calls[2], ["event", "conversion", {
    send_to: "AW-18449342468/_PV5CO3y94AdEITAqt1E",
    value: 70,
    currency: "USD",
    transaction_id: "ZVY-42",
  }]);
  const payload = calls[0]?.[2] as { transaction_id: string; currency: string; value: number; shipping: number };
  assert.deepEqual(payload, {
    transaction_id: "ZVY-42",
    currency: "USD",
    value: 70,
    shipping: 58,
    tax: 0,
    coupon: undefined,
    items: [{
      item_id: "sample-design",
      item_name: "Sample Design",
      item_variant: "Soft Matte",
      price: 70,
      discount: 0,
      coupon: undefined,
      quantity: 1,
    }],
  });
});

test("purchase allocates a discounted India value across quantities and separates GST", () => {
  const calls = captureEvents();
  const second = { ...item, item_id: "line-2", handle: "second-design", title: "Second Design", quantity: 2, line_total: 8_000 };

  gaPurchase({
    transactionId: "ZVY-43",
    value: 9_153,
    items: [item, second],
    countryCode: "IN",
    currency: "INR",
    shipping: 0,
    tax: 1_647,
    coupon: "SAVE10",
  });

  const payload = calls[0]?.[2] as { value: number; tax: number; coupon: string; items: { price: number; quantity: number; discount: number }[] };
  assert.equal(payload.value, 9_153);
  assert.equal(payload.tax, 1_647);
  assert.equal(payload.coupon, "SAVE10");
  assert.equal(payload.items.reduce((sum, line) => sum + line.price * line.quantity, 0), payload.value);
  assert.ok(payload.items.every((line) => line.discount > 0));
});

test("paid samples report purchase revenue once with finish variants", () => {
  const calls = captureEvents();
  const purchase = {
    transactionId: "sample-91",
    amount: 400,
    designHandle: "room-for-ideas-20",
    designTitle: "Room to Breathe",
    finishes: ["Soft Matte", "Textured Linen"],
  };

  gaSamplePurchase(purchase);
  gaSamplePurchase(purchase);

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0]?.slice(0, 2), ["event", "purchase"]);
  assert.ok(calls.every((call) => call[1] !== "conversion"));
  assert.deepEqual(calls[1], ["event", "sample_purchase", { transaction_id: "sample-91", currency: "INR", value: 339 }]);
  const payload = calls[0]?.[2] as {
    transaction_id: string;
    currency: string;
    value: number;
    tax: number;
    items: { item_id: string; item_name: string; item_variant: string; price: number; quantity: number }[];
  };
  assert.equal(payload.transaction_id, "sample-91");
  assert.equal(payload.currency, "INR");
  assert.equal(payload.value, 339);
  assert.equal(payload.tax, 61);
  assert.equal(payload.items.reduce((sum, line) => sum + line.price * line.quantity, 0), payload.value);
  assert.deepEqual(payload.items.map((line) => line.item_variant), ["Soft Matte", "Textured Linen"]);
  assert.ok(payload.items.every((line) => line.item_id === "room-for-ideas-20"));
});

test("checkout accounting excludes India shipping and GST after discount", () => {
  assert.deepEqual(gaPurchaseAccounting({
    total: 12_570,
    shipping: 1_770,
    discountCode: "SAVE10",
    presentment: { countryCode: "IN", currency: "INR", goods: 12_570, delivery: 0 },
  }), {
    countryCode: "IN",
    currency: "INR",
    value: 9_153,
    shipping: 1_500,
    tax: 1_917,
    coupon: "SAVE10",
  });
});

test("checkout accounting separates international goods and delivery and fails closed", () => {
  assert.deepEqual(gaPurchaseAccounting({
    total: 4_000,
    shipping: 0,
    presentment: { countryCode: "US", currency: "USD", goods: 70, delivery: 58, total: 128 },
  }), {
    countryCode: "US",
    currency: "USD",
    value: 70,
    shipping: 58,
    tax: 0,
    coupon: undefined,
  });
  assert.equal(gaPurchaseAccounting({ total: 4_000 }), null);
});

test("the browser refuses a zero-value purchase exactly as the server does", () => {
  // Mirrors the ga-mp.ts guard: Number(null) is 0, and total === shipping
  // leaves no goods revenue. Either way GA4 would report a sale worth nothing
  // and Google Ads would bid against a conversion that appears to be free.
  const inr = { countryCode: "IN", currency: "INR" as const, goods: 0, delivery: 0 };
  assert.equal(gaPurchaseAccounting({ total: null, shipping: 0, presentment: inr }), null);
  assert.equal(gaPurchaseAccounting({ total: 0, shipping: 0, presentment: inr }), null);
  assert.equal(gaPurchaseAccounting({ total: 1_770, shipping: 1_770, presentment: inr }), null);
  assert.equal(gaPurchaseAccounting({
    total: 0, shipping: 0,
    presentment: { countryCode: "US", currency: "USD", goods: 0, delivery: 0 },
  }), null);
  // A real sale still passes — the guard must not be so tight it drops revenue.
  assert.ok(gaPurchaseAccounting({ total: 1_180, shipping: 0, presentment: inr }));
});

test("owner validation orders do not become GA or Google Ads purchases", () => {
  const calls = captureEvents();
  gaSamplePurchase({ transactionId: "sample-internal", amount: 200, designHandle: "test", designTitle: "Test", finishes: ["Soft Matte"], user: { email: " Roheena@PlankAndWeave.com " } });
  assert.equal(calls.length, 0);
  gaSamplePurchase({ transactionId: "sample-customer", amount: 200, designHandle: "test", designTitle: "Test", finishes: ["Soft Matte"], user: { email: "customer@plankandweave.com" } });
  assert.ok(calls.some(call => call[1] === "purchase"));
});
