// What fronts a tile.
//
// Three rules, each guarding a failure that is SILENT — nothing throws, the
// grid just stops meaning anything. All three have actually happened:
//
//   1. an editorial pin wins            — nothing else knows horses belong in
//                                          an office and not a nursery
//   2. one DESIGN fronts one tile       — a bull fronted five of eight rooms
//   3. one COLLECTION fronts one tile   — then four horses fronted four
//
// The design/image test is the one to watch: an earlier fix compared IMAGE
// URLs and passed the broken grid unchanged, because a room tile shows that
// room's render and five tiles of one design are five different URLs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickDistinctFronts } from "./index-tiles";
import type { ProductCardData } from "./types";

const design = (handle: string, tags: string[] = [], image: string | null = `${handle}.jpg`) =>
  ({ handle, image, tags }) as ProductCardData;

const COLLECTIONS = new Set(["Stallion Spirit", "Untamed Grace", "Katha"]);
const collectionsOf = (p: ProductCardData) => (p.tags ?? []).filter((t) => COLLECTIONS.has(t));

test("rule 1 — an editorial pin wins over the ranking", () => {
  // The pinned design is LAST in the shortlist, so ranking would never reach
  // it and this can only pass if the pin is honoured. (An earlier version of
  // this test pinned the second item, which the de-duplication would have
  // chosen anyway — it passed with pins switched off entirely.)
  const shortlist = [
    design("dual-momentum", ["Stallion Spirit"]),
    design("thunderous-gallop", ["Stallion Spirit"]),
    design("golden-charge", ["Stallion Spirit"]),
    design("the-run-of-nine", ["Stallion Spirit"]),
  ];
  const rooms = [{ key: "nursery", pin: null as string | null }, { key: "office", pin: "the-run-of-nine" }];
  const picked = pickDistinctFronts(rooms, () => shortlist, { pinnedHandle: (r) => r.pin, collectionsOf });

  const byKey = Object.fromEntries(picked.map((p) => [p.row.key, p.front.handle]));
  assert.equal(byKey.office, "the-run-of-nine", "the pinned design must front its tile");
  assert.equal(picked.find((p) => p.row.key === "office")?.pinned, true);
});

test("rule 1 — a pin is placed before the unpinned tiles compete for it", () => {
  // Ordering matters: the unpinned tile comes first and the pinned design is
  // the best thing on its shortlist, so a one-pass algorithm hands it over and
  // leaves the pinned tile with something else.
  const best = design("the-run-of-nine", ["Stallion Spirit"]);
  const rooms = [{ key: "nursery", pin: null as string | null }, { key: "office", pin: "the-run-of-nine" }];
  const picked = pickDistinctFronts(rooms, () => [best, design("blossom-sky")], {
    pinnedHandle: (r) => r.pin,
    collectionsOf,
  });

  const byKey = Object.fromEntries(picked.map((p) => [p.row.key, p.front.handle]));
  assert.equal(byKey.office, "the-run-of-nine", "the pin must be claimed before earlier tiles pick");
  assert.equal(byKey.nursery, "blossom-sky");
});

test("rule 1 — a pin naming a design that no longer qualifies is ignored, not fatal", () => {
  const picked = pickDistinctFronts([{ pin: "deleted-design" }], () => [design("still-here")], {
    pinnedHandle: (r) => r.pin,
  });
  assert.equal(picked.length, 1, "a stale pin must not blank the tile");
  assert.equal(picked[0].front.handle, "still-here");
  assert.equal(picked[0].pinned, false);
});

test("rule 2 — a design that tops every collection still fronts only one tile", () => {
  const bull = design("bull-watercolour", ["Untamed Grace"]);
  const rooms = ["living", "bedroom", "kids", "office"];
  const picked = pickDistinctFronts(rooms, (r) => [bull, design(`${r}-second`)]);

  const fronts = picked.map((p) => p.front.handle);
  assert.equal(new Set(fronts).size, 4, `each tile needs its own design, got ${fronts.join(", ")}`);
});

test("rule 2 — the same design in different room renders is still the same design", () => {
  // THE regression: same handle, different image per room.
  const rooms = ["living", "bedroom", "kids"];
  const picked = pickDistinctFronts(rooms, (r) => [
    design("bull-watercolour", [], `bull-in-${r}.jpg`),
    design(`${r}-second`, [], `${r}-second.jpg`),
  ]);
  assert.equal(
    new Set(picked.map((p) => p.front.handle)).size,
    3,
    "de-duplication must key on the design, not the image URL",
  );
});

test("rule 3 — four different horses is still one collection", () => {
  const horses = ["dual-momentum", "thunderous-gallop", "golden-charge", "the-run-of-nine"].map((h) =>
    design(h, ["Stallion Spirit"]),
  );
  const rooms = ["bedroom", "office", "dining", "foyer"];
  // Every room's shortlist leads with the whole horse collection, then one
  // design of its own — exactly the catalogue that produced four horse tiles.
  const picked = pickDistinctFronts(rooms, (r) => [...horses, design(`${r}-own`)], { collectionsOf });

  const stallionTiles = picked.filter((p) => collectionsOf(p.front).includes("Stallion Spirit"));
  assert.equal(stallionTiles.length, 1, "one collection may front one tile, however many designs it has");
});

test("rule 3 relaxes rather than blanking a tile", () => {
  // A collection with nothing but designs from an already-shown collection
  // repeats one: a seen picture beats a hole in the grid.
  const only = design("shared", ["Katha"]);
  const picked = pickDistinctFronts(["first", "second"], () => [only], { collectionsOf });
  assert.equal(picked.length, 2);
  assert.equal(picked[1].front.handle, "shared");
});

test("a collection with no imaged design drops out entirely", () => {
  const picked = pickDistinctFronts(["empty", "real"], (r) =>
    r === "empty" ? [design("unrendered", [], null)] : [design("has-art")],
  );
  assert.deepEqual(picked.map((p) => p.row), ["real"]);
});

test("count reports the imaged designs behind the tile", () => {
  const picked = pickDistinctFronts(["c"], () => [design("a"), design("b"), design("c", [], null)]);
  assert.equal(picked[0].count, 2);
});

test("a relaxation is recorded, so the live check can tell it from a bug", () => {
  const only = design("shared", ["Katha"]);
  const picked = pickDistinctFronts(["first", "second", "third"], (r) =>
    r === "third" ? [design("katha-two", ["Katha"])] : [only], { collectionsOf });
  assert.deepEqual(picked.map((p) => p.relaxed), ["none", "design", "collection"]);
  assert.deepEqual(picked[0].collections, ["Katha"]);
});
