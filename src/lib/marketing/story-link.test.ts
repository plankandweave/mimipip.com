import { test } from "node:test";
import assert from "node:assert/strict";
import { storyProductUrl } from "./story-link";
import { normaliseDocumentSlot } from "./plan";

test("Story destinations never accept missing, synthetic plate or unsafe handles", () => {
  for (const handle of [null, "", "plate-the-first-clue-story", "../other", "padma?x=1", "https://evil.example", "Padma"]) assert.equal(storyProductUrl(handle), null);
  assert.equal(storyProductUrl("taash-jodi"), "https://zyvorah.com/products/taash-jodi");
});

test("finished Story import keeps an optional exact-design destination without requiring one", () => {
  const base = { date: "2026-10-02", format: "story" as const, caption: "Jodi", art: { image_url: "https://media.zyvorah.com/frame.jpg" } };
  const withoutDesign = normaliseDocumentSlot(base, 0);
  assert.equal(withoutDesign.art?.story_link_url, undefined);
  assert.equal(withoutDesign.art?.story_link_required, false);
  const row = normaliseDocumentSlot({ ...base, art: { ...base.art, story_design_handle: "taash-jodi", story_link_url: "https://zyvorah.com/" } }, 0);
  assert.equal(row.art?.story_link_url, "https://zyvorah.com/products/taash-jodi");
  assert.equal(row.art?.story_link_required, false);
  assert.doesNotThrow(() => normaliseDocumentSlot({ ...base, status: "idea" }, 0));
});
