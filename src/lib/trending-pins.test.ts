// The Trending pins (src/lib/trending-pins.ts) sit on the most valuable pixels
// of the site, so the rules that keep them honest are pinned here: a pin draws
// through the homepage variety tracker and is never shown twice, shows a
// render or nothing, respects the frame it is cropped into, appears only on
// listings the design belongs to, and on a room page only in that room.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createVarietyTracker } from "./homepage-variety";
import {
  configureHref,
  trendingForCollection,
  trendingForHomepage,
  trendingInScope,
  TRENDING_HANDLES,
  TRENDING_MATERIAL_SLUG,
  TRENDING_PINS,
  TRENDING_ROW_SIZE,
  type TrendingCard,
} from "./trending-pins";

const card = (handle: string, over: Partial<TrendingCard> = {}): TrendingCard => ({
  handle,
  title: handle,
  image: `https://zyvorah.com/media/product-images/${handle}/scene-living.png`,
  imageAlt: handle,
  imageIsFlat: false,
  imageScene: "living",
  imageWidth: 1536,
  imageHeight: 1024,
  orientation: null,
  fromPricePerSqft: 200,
  category: "wallpaper",
  tags: ["Living Room", "Botanical"],
  pinMaterial: { slug: TRENDING_MATERIAL_SLUG, name: "Soft Matte", rate: 200 },
  ...over,
});

test("the pin list is two dated, evidenced, distinct designs", () => {
  assert.equal(TRENDING_PINS.length, TRENDING_ROW_SIZE);
  assert.deepEqual([...TRENDING_HANDLES], ["wildflower-reverie", "la-00026"]);
  assert.equal(new Set(TRENDING_HANDLES).size, TRENDING_HANDLES.length);
  for (const pin of TRENDING_PINS) {
    assert.match(pin.since, /^\d{4}-\d{2}-\d{2}$/, `${pin.handle} has no date`);
    assert.ok(pin.evidence.length > 20, `${pin.handle} has no evidence`);
  }
});

test("the one-tap link opens the builder with the pinned finish pre-selected", () => {
  assert.equal(configureHref("la-00026", "smooth-matt"), "/products/la-00026?material=smooth-matt&configure=1");
  // A design without the finish still gets the one tap, on its own finishes.
  assert.equal(configureHref("la-00026", null), "/products/la-00026?configure=1");
  assert.equal(configureHref("odd handle"), "/products/odd%20handle?configure=1");
});

test("scope: category must match, base tags match on ANY tag, no scope selects nothing", () => {
  const c = card("x");
  assert.equal(trendingInScope(c, { tags: null, category: "wallpaper" }), true);
  assert.equal(trendingInScope(c, { tags: null, category: "canvas" }), false);
  assert.equal(trendingInScope(c, { tags: ["Botanical", "Geometric"], category: null }), true);
  assert.equal(trendingInScope(c, { tags: ["Geometric"], category: null }), false);
  assert.equal(trendingInScope(c, { tags: ["Botanical"], category: "canvas" }), false);
  assert.equal(trendingInScope(c, { tags: null, category: null }), false);
  assert.equal(trendingInScope({ category: "wallpaper", tags: undefined }, { tags: ["Botanical"], category: null }), false);
});

test("homepage: pins claim through the variety tracker and are never shown twice", () => {
  const variety = createVarietyTracker([]);
  const a = card("a");
  const b = card("b");
  const out = trendingForHomepage([a, b], variety);
  assert.deepEqual(out.map((p) => p.handle), ["a", "b"]);
  assert.equal(variety.designUsed("a"), true);
  assert.equal(variety.designUsed("b"), true);
  // A later row asking for the same designs gets nothing.
  assert.equal(variety.pickDesign([a, b]), null);
});

test("homepage: a pin an earlier row already holds is skipped, not duplicated", () => {
  const variety = createVarietyTracker([]);
  variety.claimDesign(card("a"));
  const out = trendingForHomepage([card("a"), card("b")], variety);
  assert.deepEqual(out.map((p) => p.handle), ["b"]);
});

test("homepage: a swatch, an unmeasured picture or a vertical piece drops the pin (rules 9 and 7)", () => {
  const variety = createVarietyTracker([]);
  const flat = card("flat", { imageIsFlat: true, imageScene: null });
  const unmeasured = card("unmeasured", { imageWidth: null, imageHeight: null });
  const tall = card("tall", { imageWidth: 1792, imageHeight: 2688 });
  const declared = card("declared", { orientation: "vertical" });
  const imageless = card("none", { image: null });
  const good = card("good");
  const out = trendingForHomepage([flat, unmeasured, tall, declared, imageless, good], variety);
  assert.deepEqual(out.map((p) => p.handle), ["good"]);
  for (const h of ["flat", "unmeasured", "tall", "declared", "none"]) assert.equal(variety.designUsed(h), false, h);
});

test("homepage: pin order is kept and the row never exceeds its size", () => {
  const variety = createVarietyTracker([]);
  const out = trendingForHomepage([card("b"), card("a"), card("c")], variety);
  assert.deepEqual(out.map((p) => p.handle), ["b", "a"]);
  assert.equal(variety.designUsed("c"), false);
});

test("collection: first page only, and only where the design belongs", () => {
  const scope = { tags: ["Botanical"], category: null };
  const cards = [card("a"), card("b", { tags: ["Geometric"] })];
  assert.deepEqual(trendingForCollection(cards, scope, { page: 1, kind: "curated" }).map((p) => p.handle), ["a"]);
  assert.deepEqual(trendingForCollection(cards, scope, { page: 2, kind: "curated" }), []);
  // The wallpaper landing selects the whole family.
  assert.deepEqual(
    trendingForCollection(cards, { tags: null, category: "wallpaper" }, { page: 1, kind: "category" }).map((p) => p.handle),
    ["a", "b"],
  );
});

test("collection: a room page shows the pin in THAT room or not at all (room rule 1)", () => {
  const scope = { tags: ["Living Room"], category: null };
  const inRoom = card("a", { imageScene: "living" });
  const otherRoom = card("b", { tags: ["Living Room"], imageScene: "bedroom" });
  const flat = card("c", { tags: ["Living Room"], imageIsFlat: true, imageScene: null });
  const out = trendingForCollection([inRoom, otherRoom, flat], scope, { page: 1, kind: "room", roomKey: "living" });
  assert.deepEqual(out.map((p) => p.handle), ["a"]);
  // A room page whose room could not be named shows no pin.
  assert.deepEqual(trendingForCollection([inRoom], scope, { page: 1, kind: "room", roomKey: undefined }), []);
});

test("collection: a deity series is never pinned into a child's room", () => {
  const scope = { tags: ["Kids"], category: null };
  const ganesha = card("dwadasha-ganesha", { tags: ["Kids"], imageScene: "kidsroom" });
  assert.deepEqual(trendingForCollection([ganesha], scope, { page: 1, kind: "room", roomKey: "kidsroom" }), []);
});
