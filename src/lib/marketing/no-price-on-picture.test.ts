// The founder, 26 September 2026: "I don't want to add a price ever on any
// story." The frames are museum labels — name, provenance, meaning. A price
// belongs in the caption, never stamped across someone's room.
//
//   npx tsx --test src/lib/marketing/no-price-on-picture.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { lowerThirdSvg, editorialBlockSvg } from "./media/brand";

const HERE = dirname(fileURLToPath(import.meta.url));

test("the composer never builds a price into a picture's sub-line", () => {
  const src = readFileSync(join(HERE, "pipeline.ts"), "utf8");
  // The two lines that feed StillSpec.sub. A price here lands on the frame.
  assert.ok(
    !/sub = .*fromPrice/.test(src),
    "the feed sub-line must not interpolate a price — it is drawn onto the image",
  );
  assert.ok(
    !/priceLine = .*camp\.price/.test(src),
    "the campaign sub-line must not interpolate a price — it is drawn onto the image",
  );
});

test("a rupee figure never reaches the drawn type, even if one is passed", () => {
  // Defence in depth: whatever a caller hands in, these builders are what
  // actually draw, so the assertion is on their output.
  const feed = lowerThirdSvg(1080, 1350, "Ikka — Hukum", "made to measure", "Zyvorah · Taash");
  const story = editorialBlockSvg(1080, 430, {
    kicker: "Zyvorah · Taash",
    title: "Ikka — Hukum",
    line: "Every deck holds four.",
  });
  for (const [name, svg] of [["feed", feed], ["story", story]] as const) {
    assert.ok(!svg.includes("₹"), `${name}: a rupee sign was drawn into the frame`);
    assert.ok(!/sq\s*ft/i.test(svg), `${name}: a per-square-foot rate was drawn into the frame`);
  }
});
