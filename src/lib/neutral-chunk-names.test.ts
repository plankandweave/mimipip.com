import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isBlockableChunkName, neutralFileNames } from "./neutral-chunk-names";

test("the chunks that took the product page down are renamed", () => {
  // 7 October 2026: blocking any one of these removed the wall builder.
  for (const name of ["meta-pixel", "openai-pixel", "ga", "google-ads", "MetaPixel", "AdsConsentToggle", "ga-mp", "meta-capi", "conversions", "TrafficSource", "visitor-ready"]) {
    assert.equal(isBlockableChunkName(name), true, name);
  }
});

test("ordinary chunks keep their names", () => {
  for (const name of ["ProductGallery", "OrderSample", "MarketProvider", "framework", "vinext", "SiteImage", "pricing", "gst", "markets", "WallBuilderStage", "Header", "page", "layout", "saved-contact", "image-quality"]) {
    assert.equal(isBlockableChunkName(name), false, name);
  }
});

test("the file-name pattern keeps its directory and hash", () => {
  const fn = neutralFileNames("_next/static/chunks/[name]-[hash].js");
  assert.equal(typeof fn, "function");
  const f = fn as (c: { name: string }) => string;
  assert.equal(f({ name: "meta-pixel" }), "_next/static/chunks/m-[hash].js");
  assert.equal(f({ name: "ProductGallery" }), "_next/static/chunks/[name]-[hash].js");
  assert.equal(neutralFileNames("entry.js"), "entry.js");
});

test("the client build applies the rename", () => {
  const config = readFileSync(new URL("../../vite.config.ts", import.meta.url), "utf8");
  assert.match(config, /neutralFileNames/);
  assert.match(config, /chunkFileNames/);
});
