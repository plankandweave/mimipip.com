// A Story drawn in a retired frame is never offered for review again.
import { test } from "node:test";
import assert from "node:assert/strict";
import { STORY_FRAME, isRetiredStoryFrame, storyFramePath } from "./story-frame";

const base = "https://zyvorah.com/media/marketing-media/";

test("a composed Story from before the frame version is retired", () => {
  // The frame Roheena sent back on 30 Sep 2026 — unversioned path.
  assert.equal(isRetiredStoryFrame({ format: "story", media_urls: [`${base}stories/tulip-heritage/2026-10-13_52_ab12.jpg`] }), true);
  assert.equal(isRetiredStoryFrame({ format: "story", media_urls: [`${base}stories/house-v2/x.jpg`] }), true);
  assert.equal(isRetiredStoryFrame({ format: "story", media_urls: [`${base}stories/house-v4/x.jpg`] }), true);
});

test("a Story drawn now is current", () => {
  assert.equal(isRetiredStoryFrame({ format: "story", media_urls: [`${base}${storyFramePath("tulip-heritage/x.jpg")}`] }), false);
  assert.ok(storyFramePath("a.jpg").startsWith(`stories/${STORY_FRAME}/`));
});

test("every frame is checked, so a current first frame cannot hide a legacy second one", () => {
  assert.equal(isRetiredStoryFrame({ format: "story", media_urls: [
    `${base}${storyFramePath("current.jpg")}`, `${base}stories/corrected/old.jpg`,
  ] }), true);
});

test("old corrections and supplied images/videos require a fresh visual review", () => {
  assert.equal(isRetiredStoryFrame({ format: "story", media_urls: [`${base}stories/corrected/id-abc.jpg`] }), true);
  assert.equal(isRetiredStoryFrame({ format: "story", media_urls: ["https://zyvorah.com/media/plan/finished.jpg"] }), true);
  assert.equal(isRetiredStoryFrame({ format: "story", media_urls: ["https://zyvorah.com/media/plan/finished.mp4"] }), true);
  assert.equal(isRetiredStoryFrame({ format: "story", media_urls: [`${base}${storyFramePath("corrected/id-abc.jpg")}`] }), false);
  assert.equal(isRetiredStoryFrame({ format: "story", media_urls: [] }), false);
  assert.equal(isRetiredStoryFrame({ format: "feed", media_urls: [`${base}stories/old/x.jpg`] }), false);
});
