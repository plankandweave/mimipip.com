import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The allocator sends each wall photo to the vision model as BYTES, never a
// URL. A signed zyvorah.com/api/files URL is refused by Anthropic's fetcher
// (robots.txt disallows /api), which broke every allocation once media moved to
// R2/Cloudflare (15 Sep 2026). Guard the regression.
test("allocateDesigns attaches wall photos as base64 bytes, not a URL", () => {
  const src = readFileSync(new URL("./site-batch.ts", import.meta.url), "utf8");
  const seg = src.slice(src.indexOf("const wallImages"), src.indexOf("CANDIDATE DESIGNS"));
  assert.ok(seg.includes('type: "base64"'), "wall photo is a base64 image block");
  assert.ok(!/wallImages\.push\([^)]*type:\s*"url"/.test(seg), "no URL image block (robots-blocked)");
  assert.ok(seg.includes("thumbnailBytesRemote"), "downscaled via the media container, not a render-CDN URL");
});
