import test from "node:test";
import assert from "node:assert/strict";
import { ahimsaCarouselSources } from "./ahimsa-carousel";

const handles = ["together-still", "soft-strength", "a-place-between", "gentle-boundary", "quiet-accord", "space-to-yield"];
const frames = handles.map(s => ({ handle: `ahimsa-${s}`, image_url: `https://media.zyvorah.com/ahimsa/ahimsa-${s}/flat.png`, width: 1536, height: 1024 }));
test("six-design delivery retains the actual first-slide cover and complete source order", () => {
  assert.deepEqual(ahimsaCarouselSources(frames).map(f => f.handle), handles.map(s => `ahimsa-${s}`));
  assert.equal(ahimsaCarouselSources(frames.slice(0, 5)).length, 5);
});
test("rejects a repeated design, substituted asset or changed geometry before composition", () => {
  for (const bad of [{ ...frames[0], image_url: "https://example.com/art.jpg" }, { ...frames[0], height: 1920 }, frames[1]]) {
    assert.throws(() => ahimsaCarouselSources([bad, ...frames.slice(1)]));
  }
  assert.throws(() => ahimsaCarouselSources(frames.slice(0, 4)));
});
