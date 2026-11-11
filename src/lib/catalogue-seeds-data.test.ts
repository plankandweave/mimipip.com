// A self-publishing collection writes straight to the live catalogue, so the
// catalogue rules are checked against exactly the rows it will insert.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { nafasSeed, winterWorldsSeed } from "./catalogue-seeds-data";
import { NAFAS_DESIGNS, NAFAS_RATE } from "./nafas";
import { SCENARIO_BY_KEY } from "./studio-scenes";

const seeds = [nafasSeed, winterWorldsSeed];

for (const seed of seeds) {
  const name = seed.collection.handle;

  test(`${name}: every design has exactly one flat, and it is the last picture`, () => {
    for (const p of seed.products) {
      const flats = p.images.filter((i) => i.isFlat);
      assert.equal(flats.length, 1, p.handle);
      const last = [...p.images].sort((a, b) => a.position - b.position).at(-1);
      assert.ok(last?.isFlat, `${p.handle}: flat must sort last`);
      assert.equal(p.images.filter((i) => i.isFeatured).length, 1, `${p.handle}: one featured image`);
      assert.ok(!flats[0].isFeatured, `${p.handle}: the flat never fronts a card`);
    }
  });

  test(`${name}: every design has a room render (homepage rule 9)`, () => {
    for (const p of seed.products) assert.ok(p.images.some((i) => !i.isFlat && i.sceneKey), p.handle);
  });

  test(`${name}: every room a design is tagged for has a render of it (room rule 3)`, () => {
    for (const p of seed.products) {
      for (const img of p.images.filter((i) => i.sceneKey)) {
        const scene = SCENARIO_BY_KEY.get(img.sceneKey!);
        assert.ok(scene, `${p.handle}: unknown scene ${img.sceneKey}`);
        for (const t of scene!.roomTags ?? []) assert.ok(p.tags.includes(t), `${p.handle}: scene ${img.sceneKey} implies tag ${t}`);
      }
      // No room tag without a picture of that room.
      for (const t of ["Bedroom", "Living Room", "Nursery", "Toddler", "Teen"]) {
        assert.ok(!p.tags.includes(t), `${p.handle}: tagged ${t} without a render of it`);
      }
    }
  });

  test(`${name}: every bundled file ships in public/`, () => {
    for (const p of seed.products) {
      for (const img of p.images) {
        const f = path.join(process.cwd(), "public", seed.assetDir, p.handle, img.file);
        assert.ok(existsSync(f), f);
        assert.ok(img.width > 0 && img.height > 0, `${p.handle}/${img.file} must be measured`);
      }
    }
  });

  test(`${name}: the collection tag is on every design, and the hero is one of them`, () => {
    for (const p of seed.products) assert.ok(p.tags.includes(seed.collection.rule_tag), p.handle);
    assert.ok(seed.products.some((p) => p.handle === seed.collection.hero_product_handle));
    assert.equal(new Set(seed.products.map((p) => p.handle)).size, seed.products.length);
  });
}

test("Nafas launches at ₹300 per sq ft on Smooth Matt, in the Kids collection", () => {
  assert.equal(NAFAS_RATE, 300);
  assert.equal(nafasSeed.ratePerSqFt, 300);
  assert.equal(nafasSeed.materialSlug, "smooth-matt");
  assert.equal(nafasSeed.products.length, NAFAS_DESIGNS.length);
  for (const p of nafasSeed.products) assert.ok(p.tags.includes("Kids"), p.handle);
});

test("Nafas's royalty is paid to her mother at 20%, reusing an existing partner row", () => {
  const r = nafasSeed.royalty!;
  assert.equal(r.name, "Maral Yazaarloo Pattrick");
  assert.equal(r.rate, 0.2);
  assert.ok(r.name.toLowerCase().includes(r.match), "the lookup must find the row this seed would create");
});
