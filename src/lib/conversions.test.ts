import assert from "node:assert/strict";
import test from "node:test";
import type { CartItem } from "@/components/CartProvider";
import { conversionLead, conversionSignUp } from "@/lib/conversions";
import { gaAddPaymentInfo, gaAddShippingInfo, gaRemoveFromCart, gaViewCart } from "@/lib/ga";
import { ADS_CONVERSION, GOOGLE_ADS_ID } from "@/lib/google-ads";

function captureGtag() {
  const calls: unknown[][] = [];
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { gtag: (...args: unknown[]) => calls.push(args) },
  });
  return calls;
}

const item = {
  item_id: "line-1",
  handle: "mati-jodi-01",
  title: "Jodi",
  material_slug: "smooth-matt",
  material_name: "Soft Matte",
  width_cm: 100,
  height_cm: 100,
  area_sqft: 20,
  unit_price: 200,
  quantity: 2,
  line_total: 4_000,
  image: null,
  preview_url: null,
} satisfies CartItem;

test("a lead reaches GA4 as generate_lead AND Google Ads as the enquiry action", () => {
  const calls = captureGtag();
  conversionLead({ leadType: "enquiry", topic: "Hospitality", user: { email: " Amit@Example.com ", phone: "98765 43210" } });

  assert.deepEqual(calls[0], ["event", "generate_lead", { currency: "INR", value: 500, lead_type: "enquiry", topic: "Hospitality" }]);
  assert.deepEqual(calls[1], ["set", "user_data", { email: "amit@example.com", phone_number: "+919876543210" }]);
  assert.deepEqual(calls[2], ["event", "conversion", { send_to: `${GOOGLE_ADS_ID}/${ADS_CONVERSION.enquiry}` }]);
});

test("a sign-up reaches GA4 with its method and Google Ads as the sign-up action", () => {
  const calls = captureGtag();
  conversionSignUp({ method: "newsletter", user: { email: "a@b.co" } });

  assert.deepEqual(calls[0], ["event", "sign_up", { method: "newsletter" }]);
  assert.deepEqual(calls[2], ["event", "conversion", { send_to: `${GOOGLE_ADS_ID}/${ADS_CONVERSION.signUp}` }]);
});

test("cart and checkout steps value India lines ex-GST and carry the step detail", () => {
  const calls = captureGtag();
  const base = { items: [item], countryCode: "IN", currency: "INR" as const };
  gaViewCart(base);
  gaRemoveFromCart({ item, countryCode: "IN", currency: "INR" });
  gaAddShippingInfo({ ...base, shippingTier: "express", coupon: "WELCOME" });
  gaAddPaymentInfo({ ...base, paymentType: "razorpay" });

  const names = calls.map((c) => c[1]);
  assert.deepEqual(names, ["view_cart", "remove_from_cart", "add_shipping_info", "add_payment_info"]);
  const view = calls[0]?.[2] as { value: number; items: { price: number; quantity: number }[] };
  assert.equal(view.value, 3390); // ₹4000 incl. 18% GST, rounded to the rupee
  assert.equal(view.items[0]?.quantity, 2);
  assert.ok(Math.abs(view.items[0]!.price * 2 - view.value) < 0.01);
  assert.equal((calls[2]?.[2] as { shipping_tier: string }).shipping_tier, "express");
  assert.equal((calls[2]?.[2] as { coupon: string }).coupon, "WELCOME");
  assert.equal((calls[3]?.[2] as { payment_type: string }).payment_type, "razorpay");
});

test("empty carts fire nothing", () => {
  const calls = captureGtag();
  gaViewCart({ items: [], countryCode: "IN", currency: "INR" });
  gaAddShippingInfo({ items: [], countryCode: "IN", currency: "INR", shippingTier: "standard" });
  assert.equal(calls.length, 0);
});
