// A price tier is not an aesthetic.
//
// This file exists because the failure it guards is SILENT and has already
// happened once: "Autograph" sat in the collections table as kind='curated',
// so the Shop menu listed it between Calm and Tropical Oasis as though it were
// a set of designs drawn to sit together. Nothing threw. A shopper reading the
// word was promised a look and got a price band.
//
// Migration 0145 gave series and sets their own kind, which is the real fix.
// This pins the backstop: `kind` is ordinary data, and a re-seed that writes
// 'curated' would put a tier back on /collections exactly as silently. The
// tags come from TIER_LABEL, so a tier added there is excluded on the same
// commit rather than the next time someone notices.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PRICE_TIER_TAGS, TIER_LABEL, AUTOGRAPH_TIER, SAANJHA_TIER, ATELIER_TIER,
} from "./pricing";

test("every price tier's tag is kept off the aesthetics shelf", () => {
  for (const tier of [AUTOGRAPH_TIER, SAANJHA_TIER, ATELIER_TIER]) {
    const label = TIER_LABEL[tier];
    assert.ok(label, `${tier} must have a label`);
    assert.equal(
      PRICE_TIER_TAGS.has(label),
      true,
      `"${label}" is a price tier and must never be listed as a collection`,
    );
  }
});

test("a real collection is not mistaken for a tier", () => {
  // The exclusion must be exactly the tiers. Over-matching would empty the
  // Collections axis — the opposite failure, and just as quiet.
  for (const real of ["Katha", "Ikat", "Stallion Spirit", "Calm", "TAASH", "Phone Booth"]) {
    assert.equal(PRICE_TIER_TAGS.has(real), false, `"${real}" is a collection`);
  }
});
