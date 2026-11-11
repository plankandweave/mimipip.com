import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { unfinishedRangeSeeds, roomRepairSeeds } from "./unfinished-ranges-seeds";

test("the four reserved ranges ship complete, correctly measured artwork and room files", () => {
  assert.equal(unfinishedRangeSeeds.length, 4);
  const handles = new Set<string>();
  for (const seed of unfinishedRangeSeeds) {
    assert.equal(seed.products.length, 2);
    assert.ok(seed.products.some(p => p.handle === seed.collection.hero_product_handle));
    for (const p of seed.products) {
      assert.ok(!handles.has(p.handle)); handles.add(p.handle);
      assert.ok(p.tags.includes(seed.collection.rule_tag));
      assert.equal(p.images.filter(i => i.isFlat).length, 1);
      assert.equal(p.images.filter(i => i.isFeatured).length, 1);
      assert.ok(p.images.some(i => i.isFeatured && !i.isFlat && i.sceneKey));
      for (const i of p.images) {
        const bytes = readFileSync(path.join(process.cwd(), "public", seed.assetDir, p.handle, i.file));
        assert.equal(bytes.subarray(1, 4).toString(), "PNG");
        assert.equal(bytes.readUInt32BE(16), i.width, `${p.handle}/${i.file} width`);
        assert.equal(bytes.readUInt32BE(20), i.height, `${p.handle}/${i.file} height`);
      }
    }
  }
  assert.equal(handles.size, 8);
});

test("border products keep length pricing and real 100 by 10 cm segment proportions", () => {
  const borders = unfinishedRangeSeeds.flatMap(s => s.products).filter(p => p.category === "border");
  assert.equal(borders.length, 4);
  for (const p of borders) {
    assert.deepEqual(p.border, { heightCm: 10, pricePerMetre: 220, segmentLengthM: 1 });
    const flat = p.images.find(i => i.isFlat)!;
    assert.equal(flat.width / flat.height, p.border!.segmentLengthM * 100 / p.border!.heightCm);
  }
});

test("room repairs only append correctly measured room images to named existing designs", () => {
  for (const seed of roomRepairSeeds) {
    assert.equal(seed.imagesOnly, true);
    assert.equal(seed.products.length, 1);
    const product = seed.products[0];
    assert.deepEqual(product.tags, [seed.collection.rule_tag]);
    assert.ok(product.images.every(i => !i.isFlat && !i.isFeatured && i.sceneKey));
    for (const i of product.images) {
      const bytes = readFileSync(path.join(process.cwd(), "public", seed.assetDir, product.handle, i.file));
      assert.equal(bytes.readUInt32BE(16), i.width);
      assert.equal(bytes.readUInt32BE(20), i.height);
    }
  }
});
