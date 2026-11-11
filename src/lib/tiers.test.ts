// Exclusivity, pinned.
//
// This file exists because the failure it guards is SILENT. When "exclusive to
// zyvorah.com" was written as `price_tier === 'autograph'`, adding a second
// exclusive tier did not break a build or throw at runtime — the new tier
// simply answered "not exclusive" and appeared on a reseller's storefront,
// where nobody would look for it. If a change makes these fail, the change is
// leaking a collection.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AUTOGRAPH_TIER, SAANJHA_TIER, ATELIER_TIER, EXCLUSIVE_TIERS,
  isAutographTier, isExclusiveTier, TIER_LABEL,
} from "./pricing";

test("every tier above standard is withheld from reseller storefronts", () => {
  for (const t of [AUTOGRAPH_TIER, SAANJHA_TIER, ATELIER_TIER]) {
    assert.equal(isExclusiveTier(t), true, `${t} must be exclusive`);
  }
  // Standard is the catalogue, and an unset tier must never be treated as
  // exclusive by accident — that would withhold ordinary designs from partners.
  assert.equal(isExclusiveTier("standard"), false);
  assert.equal(isExclusiveTier(null), false);
  assert.equal(isExclusiveTier(undefined), false);
});

test("Saanjha is not Autograph", () => {
  // The whole point of the tier. They share a rate today by coincidence; they
  // must not share the badge, the linen pin, or autograph_rate().
  assert.equal(isAutographTier(SAANJHA_TIER), false);
  assert.equal(isAutographTier(ATELIER_TIER), false);
  assert.equal(isAutographTier(AUTOGRAPH_TIER), true);
  assert.notEqual(TIER_LABEL[SAANJHA_TIER], TIER_LABEL[AUTOGRAPH_TIER]);
});

test("a new tier cannot be added without deciding whether it is exclusive", () => {
  // EXCLUSIVE_TIERS and price_tiers.exclusive in the database are the same
  // fact written twice and must be changed together. This asserts the shape of
  // the list so a tier added to one side without the other is noticed here
  // rather than on a partner's storefront.
  assert.deepEqual([...EXCLUSIVE_TIERS], ["autograph", "saanjha", "atelier"]);
  for (const t of EXCLUSIVE_TIERS) {
    assert.ok(TIER_LABEL[t], `${t} has no label — a tier a customer can reach must have a name`);
  }
});
