import test from "node:test";
import assert from "node:assert/strict";
import { filterReviewedStyleTags } from "./reviewed-style-tags";

test("repair cannot reintroduce rejected seascape styles or the founder's Art exclusions", () => {
  assert.deepEqual(filterReviewedStyleTags("pool-deck-wall", ["Art", "Abstract", "Pattern", "Textures", "Landscape", "Blue", "Living Room"]), ["Landscape", "Blue", "Living Room"]);
});

test("review exclusions accept canonicalisation variants without changing valid tags", () => {
  assert.deepEqual(filterReviewedStyleTags("pool-deck-wall", [" abstract ", "PATTERN", "Botanical"]), ["Botanical"]);
});

test("a rejected tag remains available to designs where it belongs", () => {
  const tags = ["Art", "Abstract", "Pattern", "Blue"];
  assert.deepEqual(filterReviewedStyleTags("new-abstract-composition", tags), tags);
});
