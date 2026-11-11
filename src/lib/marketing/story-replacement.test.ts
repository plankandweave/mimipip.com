import { test } from "node:test";
import assert from "node:assert/strict";
import { STORY_LINK_HOLD } from "./story-link";
import { canReplaceStory, guardStoryReplacement, PRESERVED_STORY_LINK_HOLD, storyReplacementReviewState, type StoryReplacementRow } from "./story-replacement";

const draft: StoryReplacementRow = {
  id: "jodi", status: "queued", format: "story", channel: "instagram", product_handle: "taash-jodi", media_urls: ["https://media.zyvorah.com/old.jpg"],
  published_at: null, external_id: null, error: null, caption: "Jodi",
  approved_at: null, approved_by: null, approved_digest: null,
  regenerate_requested_at: null, regenerate_requested_by: null, regenerate_reason: null,
};

test("queued and approved unpublished Stories can change pixels and lose stale approval", () => {
  for (const status of ["queued", "approved"]) {
    const row = { ...draft, status, approved_at: "2026-09-27", approved_by: "reviewer", approved_digest: "old-pixels" };
    assert.equal(canReplaceStory(row), true);
    assert.deepEqual(storyReplacementReviewState(row), { status: "queued", error: null, approved_at: null, approved_by: null, approved_digest: null });
  }
});

test("replacing a Story clears either retired sticker-only hold and requires fresh approval", () => {
  for (const error of [STORY_LINK_HOLD, PRESERVED_STORY_LINK_HOLD]) {
    const row = { ...draft, status: "skipped", error, approved_at: "2026-09-27", approved_by: "reviewer", approved_digest: "old" };
    assert.equal(canReplaceStory(row), true);
    assert.deepEqual(storyReplacementReviewState(row), { status: "queued", error: null, approved_at: null, approved_by: null, approved_digest: null });
  }
  assert.equal(storyReplacementReviewState({ ...draft, error: STORY_LINK_HOLD }).error, null);
});

test("missing, generic skipped, cancelled, published and wrong-format rows stay protected", () => {
  assert.equal(canReplaceStory(null), false);
  for (const error of [null, "Excess cadence Story rejected", `${STORY_LINK_HOLD} other reason`, "clickable Link sticker"]) {
    assert.equal(canReplaceStory({ ...draft, status: "skipped", error }), false);
  }
  for (const status of ["cancelled", "superseded", "published", "failed"]) {
    assert.equal(canReplaceStory({ ...draft, status, error: STORY_LINK_HOLD }), false);
  }
  assert.equal(canReplaceStory({ ...draft, format: "post" }), false);
  assert.equal(canReplaceStory({ ...draft, status: "skipped", error: STORY_LINK_HOLD, channel: "linkedin" }), false);
  assert.equal(canReplaceStory({ ...draft, status: "skipped", error: STORY_LINK_HOLD, product_handle: null }), false);
  for (const status of ["queued", "approved", "skipped"]) {
    const row = { ...draft, status, error: STORY_LINK_HOLD };
    assert.equal(canReplaceStory({ ...row, published_at: "2026-10-02" }), false);
    assert.equal(canReplaceStory({ ...row, external_id: "instagram-media-id" }), false);
  }
});

class Snapshot {
  predicates: Array<[string, string | null]> = [];
  eq(column: string, value: string) { this.predicates.push([column, value]); return this; }
  is(column: string, value: null) { this.predicates.push([column, value]); return this; }
  matches(row: StoryReplacementRow) {
    return this.predicates.every(([column, value]) => column === "media_urls"
      ? value === `{${row.media_urls.map((url) => JSON.stringify(url)).join(",")}}`
      : row[column as keyof StoryReplacementRow] === value);
  }
}

test("atomic replacement protects every observed publication, hold, artwork and review field from races", () => {
  const row = { ...draft, status: "skipped", error: PRESERVED_STORY_LINK_HOLD, approved_at: "2026-09-27" };
  const query = guardStoryReplacement(new Snapshot(), row);
  assert.equal(query.matches(row), true);
  for (const change of [
    { status: "published" }, { status: "cancelled" }, { status: "queued" },
    { published_at: "2026-10-02" }, { external_id: "live-id" },
    { format: "post" }, { channel: "linkedin" }, { product_handle: "taash-dhalai" }, { error: "Owner removed this Story" },
    { media_urls: ["https://media.zyvorah.com/new.jpg"] }, { caption: "New owner copy" },
    { approved_at: "2026-10-02" }, { approved_by: "new-reviewer" }, { approved_digest: "new-pixels" },
    { regenerate_requested_at: "2026-10-02" }, { regenerate_requested_by: "owner" }, { regenerate_reason: "Different scene" },
  ]) assert.equal(query.matches({ ...row, ...change }), false, JSON.stringify(change));
});

test("a corrected Story's receipt is the frame the container measured, never typed coordinates", async () => {
  const { readFileSync } = await import("node:fs");
  const { measurePortrait } = await import("./media/layout-measure");
  const { layoutHold, LAYOUT_VERSION } = await import("./layout-check");
  const { storyLayoutReceipt, storyFrameRefusal, storyReplacementKicker } = await import("./story-replacement");
  assert.equal(storyReplacementKicker("https://zyvorah.com/media/product-images/taash/jodi.jpg"), "Zyvorah · Taash");
  assert.equal(storyReplacementKicker("https://zyvorah.com/media/product-images/x/room.jpg"), "Zyvorah");
  // The same measurement /measured-story returns with the image.
  const frame = await measurePortrait("Jodi", "made to measure", "Zyvorah · Taash");
  assert.equal(storyFrameRefusal(frame), null);
  const url = "https://media.zyvorah.com/marketing/stories/house-v5/corrected/jodi.jpg";
  const receipt = storyLayoutReceipt(url, "b".repeat(64), frame);
  assert.deepEqual(receipt, { version: LAYOUT_VERSION, assets: [{ url, sha256: "b".repeat(64), frames: [frame] }] });
  assert.equal(layoutHold({ brand_layout: LAYOUT_VERSION, layout_receipt: receipt }, [url], null, true), null);
  // The editorial-story footer ran to y≈1840: such a frame is refused, never stored.
  const editorial = { ...frame, text: { ...frame.text, y: 1600, height: 240 }, titleFoot: 1840 };
  assert.match(storyFrameRefusal(editorial)!, /Layout check failed/);
  assert.throws(() => storyLayoutReceipt(url, "b".repeat(64), editorial), /Layout check failed/);
  assert.match(storyFrameRefusal({ ...frame, surface: "feed" })!, /portrait/);
  assert.match(storyFrameRefusal(null)!, /portrait/);
  // The route builds its receipt from the measurement; no coordinates live in it.
  const route = readFileSync(new URL("../../app/api/admin/marketing/story/replace/route.ts", import.meta.url), "utf8");
  assert.match(route, /composeMeasuredStoryRemote/);
  assert.match(route, /storyLayoutReceipt\(url, sha256, frame\)/);
  assert.doesNotMatch(route, /editorial-story|composeStillRemote/);
  assert.doesNotMatch(route, /\b(?:x|y|width|height|titleFoot|textLeft)\s*:\s*\d/);
});
