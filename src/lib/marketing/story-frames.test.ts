// Two founder rules about Story frames (26 September 2026), both of which the
// desk was breaking:
//
//   "the images will always be full and the text will be aligned"
//   "it can be the same wallpaper, but it should be another display of it …
//    it can never be the same image in two stories continuously at all"
//
//   npx tsx --test src/lib/marketing/story-frames.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseLeadScene } from "./pipeline";

const B = "https://zyvorah.com/media/product-images/taash-parakh";
const SCENES = [`${B}/scene-living.png`, `${B}/scene-bedroom.png`, `${B}/scene-office.png`];

test("the same picture is never handed out twice", () => {
  const used: string[] = [];
  for (let i = 0; i < SCENES.length; i++) {
    const url = chooseLeadScene(SCENES, { chapterIndex: i, avoidUrls: [...used] });
    assert.ok(url, `run ${i} should still find an unused picture`);
    assert.ok(!used.includes(url!), `run ${i} repeated ${url}`);
    used.push(url!);
  }
  assert.equal(new Set(used).size, SCENES.length);
});

test("a design whose pictures are all spent yields nothing, rather than repeating one", () => {
  // This is the signal that tells the caller to move to another design —
  // the founder's rule is that the frame may not repeat, not that the design
  // may not come round again.
  assert.equal(chooseLeadScene(SCENES, { avoidUrls: [...SCENES] }), null);
});

test("avoiding some pictures still returns one of the rest", () => {
  const url = chooseLeadScene(SCENES, { avoidUrls: [SCENES[0], SCENES[1]] });
  assert.equal(url, SCENES[2]);
});
