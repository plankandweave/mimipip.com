// A slot must never reach a customer.
//
// The whole point of a story slot is that a collection can be PLANNED in full
// before it is shot. That is only safe while an unshot block renders nothing:
// an empty frame above the grid on launch morning is worse than no block.
import { test } from "node:test";
import assert from "node:assert/strict";
import { storyReady, type CollectionStoryBlock } from "../components/CollectionStory";

const block = (p: Partial<CollectionStoryBlock>): CollectionStoryBlock => ({
  id: "1", kind: "video", title: null, body: null,
  assetUrl: null, posterUrl: null, credit: null, ambient: false, ...p,
});

test("a block with no file is a slot, and slots do not render", () => {
  assert.equal(storyReady(block({ kind: "video", title: "In the studio" })), false);
  assert.equal(storyReady(block({ kind: "image", title: "The press" })), false);
  // A title and body are not enough — those are what a PLANNED slot has.
  assert.equal(storyReady(block({ kind: "video", title: "The book", body: "112pp" })), false);
});

test("a block renders once its file exists", () => {
  assert.equal(storyReady(block({ kind: "video", assetUrl: "https://r2/taash.mp4" })), true);
  assert.equal(storyReady(block({ kind: "image", assetUrl: "https://r2/press.jpg" })), true);
});

test("a quote needs words, not a file", () => {
  assert.equal(storyReady(block({ kind: "quote", body: "A deck that was never cut." })), true);
  assert.equal(storyReady(block({ kind: "quote", body: "   " })), false);
  assert.equal(storyReady(block({ kind: "quote" })), false);
});
