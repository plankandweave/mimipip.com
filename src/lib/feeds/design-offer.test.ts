import { test } from "node:test";
import assert from "node:assert/strict";
import { designOffer } from "./design-offer";

test("shopping offer uses each design's assigned surface and catalogue rate", () => {
  assert.deepEqual(
    designOffer([{ available: true, price_per_sqft: 300, materials: { slug: "linen-touch", coming_soon: false } }]),
    { rate: 300, surface: "linen feel", slug: "linen-touch" },
  );
  assert.deepEqual(
    designOffer([{ available: true, price_per_sqft: 200, materials: { slug: "smooth-matt", coming_soon: false } }]),
    { rate: 200, surface: "smooth matte surface", slug: "smooth-matt" },
  );
});

test("shopping offer does not advertise unavailable or blocked surfaces", () => {
  assert.equal(designOffer([{ available: false, price_per_sqft: 300, materials: { slug: "linen-touch", coming_soon: false } }]), null);
  assert.equal(designOffer([{ available: true, price_per_sqft: 300, materials: { slug: "linen-touch", coming_soon: true } }]), null);
});
