import assert from "node:assert/strict";
import test from "node:test";
import { madeToMeasureVariants, sampleVariant, unitRateLabel } from "@/lib/variants";

const SOFT_MATTE = { slug: "smooth-matt", name: "Soft Matte", pricePerSqFt: 200 };

test("the per-square-foot rate is what makes a mural comparable to a roll", () => {
  // A 12 × 8 ft wall at ₹200/sq ft bills ₹19,200 — the number a shopper sees
  // next to a ₹6,000 roll. The rate has to read back as the rate.
  assert.equal(unitRateLabel(19_200, 96), "₹200/sq ft");
  // The feed prices each country's items in that country's currency, so the
  // rate in the title has to follow — a US listing read "₹3.50/sq ft", the
  // converted number under the wrong sign.
  assert.equal(unitRateLabel(336, 96, "USD"), "$3.50/sq ft");
  assert.equal(unitRateLabel(19_200, 96, "INR"), "₹200/sq ft");
  assert.equal(unitRateLabel(32_000, 80), "₹400/sq ft");
});

test("the rate is omitted rather than invented when the maths cannot hold", () => {
  // A sample has no printed wall area. Dividing by it once produced "₹Infinity".
  assert.equal(unitRateLabel(200, 0), null);
  assert.equal(unitRateLabel(200, -5), null);
  assert.equal(unitRateLabel(0, 96), null);
  assert.equal(unitRateLabel(Number.NaN, 96), null);
});

test("every made-to-measure variant can state a rate", () => {
  const variants = madeToMeasureVariants("https://zyvorah.com", "ivory-arbor", [SOFT_MATTE]);
  assert.ok(variants.length > 0);
  for (const v of variants) {
    const rate = unitRateLabel(v.price, v.areaSqFt);
    assert.ok(rate, `no rate for ${v.sku}`);
    assert.match(rate, /^₹\d+\/sq ft$/);
  }
});

test("the sample is a ₹200 A4 swatch that opens the sample flow", () => {
  const v = sampleVariant("https://zyvorah.com", "ivory-arbor", 200);
  assert.equal(v.price, 200);
  assert.equal(v.sku, "ZYV-IVORY-ARBOR-SAMPLE-A4");
  // ?sample=1 is what auto-opens the sample panel on the product page; without
  // it the ad lands on a ₹19,200 wall and the ₹200 promise is broken.
  assert.equal(v.url, "https://zyvorah.com/products/ivory-arbor?sample=1");
  assert.equal(v.areaSqFt, 0);
  assert.equal(v.materialSlug, "smooth-matt");
});

test("a sample never carries a square-foot rate", () => {
  const v = sampleVariant("https://zyvorah.com", "ivory-arbor", 200);
  assert.equal(unitRateLabel(v.price, v.areaSqFt), null);
});

test("sample SKUs cannot collide with a size SKU", () => {
  const sizes = madeToMeasureVariants("https://zyvorah.com", "ivory-arbor", [SOFT_MATTE]);
  const sample = sampleVariant("https://zyvorah.com", "ivory-arbor", 200);
  assert.ok(!sizes.some((v) => v.sku === sample.sku));
});
