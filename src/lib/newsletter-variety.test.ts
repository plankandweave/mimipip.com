import test from "node:test";
import assert from "node:assert/strict";
import { selectNewsletterDesigns } from "./newsletter-variety";
import type { ProductCardData } from "./types";
const card = (handle: string, tags: string[], extra = {}): ProductCardData => ({
  handle, title: handle, tags, image: `${handle}.jpg`, imageAlt: handle,
  fromPricePerSqft: 200, ...extra,
});
const collections = [
  { handle: "stallion", tags: ["horses", "stallion"] },
  { handle: "botanical", tags: ["leaves"] },
  { handle: "abstract", tags: ["abstract"] },
];
test("a room change cannot bring back last month's Stallion collection", () => {
  const pool = [card("new-horse", ["horses", "office"]), card("leaf", ["leaves", "office"]), card("shape", ["abstract", "office"])];
  const out = selectNewsletterDesigns(pool, collections, [{ handle: "old-horse", tags: ["stallion", "living"] }], "2026-11-02");
  assert.deepEqual(new Set(out.map(p => p.handle)), new Set(["leaf", "shape"]));
});
test("curated collections are unique within an issue, facet tags do not exclude designs", () => {
  const pool = [card("horse1", ["horses", "blue"]), card("horse2", ["stallion", "blue"]), card("leaf", ["leaves", "blue"]), card("shape", ["abstract", "blue"])];
  const out = selectNewsletterDesigns(pool, collections, [], "2026-11-02");
  assert.equal(out.length, 3);
  assert.equal(out.filter(p => p.tags?.some(t => ["horses", "stallion"].includes(t))).length, 1);
});
test("exact repeats, flat images, missing images and duplicate handles cannot fill gaps", () => {
  const pool = [card("old", []), card("flat", [], { imageIsFlat: true }), card("missing", [], { image: null }), card("fresh", []), card("fresh", [])];
  assert.deepEqual(selectNewsletterDesigns(pool, [], [{ handle: "old", tags: [] }], "2026-11-02").map(p => p.handle), ["fresh"]);
});
test("weekly selection is reproducible and independent of catalogue ranking", () => {
  const pool = Array.from({ length: 20 }, (_, i) => card(`design-${i}`, []));
  const pick = (p: ProductCardData[], week: string) => selectNewsletterDesigns(p, [], [], week).map(p => p.handle);
  assert.deepEqual(pick(pool, "2026-11-02"), pick([...pool].reverse(), "2026-11-02"));
  assert.notDeepEqual(pick(pool, "2026-11-02"), pick(pool, "2026-11-09"));
});
