// The single-product select must carry the two columns the HomeLane
// catalogue route gates on. On 2026-09-22 it did not: PRODUCT_SELECT fetched
// neither flat_verified nor is_service, so `product.flat_verified !== true`
// was true for EVERY design and a HomeLane designer could see the whole grid
// but pick nothing — each tile answered 404 "Choose a verified catalogue
// wallpaper". The card select used for search had the columns, which is why
// the tiles appeared at all. Read as source text so the test needs no
// Supabase client.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

test("PRODUCT_SELECT fetches the columns the partner catalogue gate reads", () => {
  const src = readFileSync(fileURLToPath(new URL("./queries.ts", import.meta.url)), "utf8");
  const m = src.match(/const PRODUCT_SELECT = `([\s\S]*?)`;/);
  assert.ok(m, "PRODUCT_SELECT not found");
  const cols = m[1].split("\n")[1].split(",").map((c) => c.trim());
  assert.ok(cols.includes("flat_verified"), "flat_verified missing from PRODUCT_SELECT");
  assert.ok(cols.includes("is_service"), "is_service missing from PRODUCT_SELECT");
});
