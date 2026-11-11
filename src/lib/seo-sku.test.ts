import { test } from "node:test";
import assert from "node:assert/strict";
import { googleSku, structuredSku } from "./seo";

// Search Console, 5 October 2026: "Invalid value in field sku" — studio codes
// such as "BD 0001" went into Product structured data with the space intact.
test("a studio code with a space becomes a valid SKU", () => {
  assert.equal(structuredSku("BD 0001"), "BD-0001");
});

test("a clean code or handle passes through unchanged", () => {
  assert.equal(structuredSku("LA-00026"), "LA-00026");
  assert.equal(structuredSku("chateau-village"), "chateau-village");
});

test("no whitespace, no non-ASCII, never longer than 50", () => {
  const s = structuredSku("  Rāga  mural\t" + "x".repeat(80));
  assert.match(s, /^[A-Za-z0-9._-]+$/);
  assert.ok(s.length <= 50);
});

// Search Console, 6 October 2026: "Invalid string length in field sku" on
// every size of Wabi-Sabi Mountains over Indigo Water — a long handle pushed
// ZYV-<HANDLE>-<SIZE>-<MATERIAL> to 51 (Soft Matte is PNW), past Google's 50.
test("an over-long variant SKU fits in 50 and stays unique per variant", () => {
  const skus = ["10X8FT", "12X8FT", "8X10FT"].map((size) =>
    googleSku(`ZYV-JAPANESE-INSPIRED-HOME-LIVING-DINING-${size}-PNW`),
  );
  for (const s of skus) {
    assert.ok(s.length <= 50, `${s} is ${s.length}`);
    assert.match(s, /^[A-Za-z0-9._-]+$/);
  }
  assert.equal(new Set(skus).size, skus.length);
});

test("a SKU that already fits is unchanged, so accepted ids never move", () => {
  assert.equal(googleSku("ZYV-MATI-JODI-01-8X10FT-NW"), "ZYV-MATI-JODI-01-8X10FT-NW");
  const fifty = "ZYV-" + "A".repeat(46);
  assert.equal(googleSku(fifty), fifty);
});

test("the shortened SKU is stable across builds", () => {
  const raw = "ZYV-JAPANESE-INSPIRED-HOME-LIVING-DINING-10X8FT-PNW";
  assert.equal(googleSku(raw), googleSku(raw));
});
