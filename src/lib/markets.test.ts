import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WALLPAPER_PACKAGE,
  chargeableWeightKg,
  internationalDeliveryUsd,
  internationalTransitWorkingDays,
  marketFor,
  normalizeCountryCode,
  quoteMarketOrder,
  volumetricWeightKg,
} from "./markets";

test("country codes are validated and normalized", () => {
  assert.equal(normalizeCountryCode(" in "), "IN");
  assert.equal(normalizeCountryCode("us"), "US");
  assert.equal(normalizeCountryCode("XX"), null);
  assert.equal(normalizeCountryCode(null), null);
});

test("India remains INR with shipping included and no delivery surcharge", () => {
  const market = marketFor("IN");
  const quote = quoteMarketOrder({ amountInr: 16_000, countryCode: "IN", areaSqFt: 80 });

  assert.equal(market.currency, "INR");
  assert.equal(market.shippingIncluded, true);
  assert.equal(quote.goods, 16_000);
  assert.equal(quote.delivery, 0);
  assert.equal(quote.total, 16_000);
});

test("a collaboration gift that includes delivery lands on 0 abroad", () => {
  // Abbie's wall (Canada, 9 October 2026): 247.5 x 77 in of Blossom Cascade,
  // 132.344 sq ft. Taken to 0 by her code, the order must not still owe the
  // US$80 delivery — that would open a payment window on a gift.
  const charged = quoteMarketOrder({ amountInr: 0, countryCode: "CA", areaSqFt: 132.344 });
  const gifted = quoteMarketOrder({ amountInr: 0, countryCode: "CA", areaSqFt: 132.344, waiveDelivery: true });
  assert.equal(charged.delivery, 80);
  assert.deepEqual({ delivery: gifted.delivery, total: gifted.total }, { delivery: 0, total: 0 });
});

test("international prices use market tiers rather than spot currency conversion", () => {
  const us = quoteMarketOrder({ amountInr: 16_000, countryCode: "US", areaSqFt: 80 });
  const ae = quoteMarketOrder({ amountInr: 16_000, countryCode: "AE", areaSqFt: 80 });
  const np = quoteMarketOrder({ amountInr: 16_000, countryCode: "NP", areaSqFt: 80 });

  assert.deepEqual(
    { goods: us.goods, delivery: us.delivery, total: us.total, currency: us.currency },
    { goods: 280, delivery: 64, total: 344, currency: "USD" },
  );
  assert.equal(ae.goods, 313.6, "premium markets carry a higher goods basis");
  assert.equal(np.goods, 201.6, "value markets carry a lower goods basis");
  assert.ok(us.total > us.goods, "international delivery is built into the shown total");
});

test("the shipping basis uses a 1400 mm by 75 mm tube and courier chargeable weight", () => {
  assert.equal(WALLPAPER_PACKAGE.lengthMm, 1400);
  assert.equal(WALLPAPER_PACKAGE.diameterMm, 75);
  assert.equal(volumetricWeightKg(), 1.58);
  assert.equal(chargeableWeightKg(80), 2.5);
});

test("regional delivery allowances vary by destination and exclude India", () => {
  assert.equal(internationalDeliveryUsd("IN", 80), 0);
  assert.ok(internationalDeliveryUsd("US", 80) > internationalDeliveryUsd("NP", 80));
  assert.deepEqual(internationalTransitWorkingDays("NP"), { min: 5, max: 10 });
  assert.deepEqual(internationalTransitWorkingDays("US"), { min: 8, max: 15 });
});
