import { test } from "node:test";
import assert from "node:assert/strict";
import { collectionScope } from "./queries";

test("wallpaper style and mood landings exclude similarly tagged canvas and borders", () => {
  for (const [rule_tag, kind] of [
    ["Floral", "category"], ["Tropical", "category"],
    ["Vintage", "category"], ["Mood: Romantic", "mood"],
  ] as const) {
    assert.deepEqual(collectionScope({ rule_tag, rule_tags: null, category_scope: null, kind }), {
      tags: [rule_tag], category: "wallpaper",
    });
  }
});

test("family subcollections and curated collections retain their own scope", () => {
  assert.deepEqual(collectionScope({ rule_tag: "Floral", rule_tags: ["Floral", "Botanical"], category_scope: "border", kind: "other" }), {
    tags: ["Floral", "Botanical"], category: "border",
  });
  assert.deepEqual(collectionScope({ rule_tag: "Tropical Oasis", rule_tags: null, category_scope: null, kind: "curated" }), {
    tags: ["Tropical Oasis"], category: null,
  });
});
