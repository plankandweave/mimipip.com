import test from "node:test";
import assert from "node:assert/strict";
import type { DeskSlot } from "@/app/api/admin/marketing/plan/route";
import { tileImage, awaitingReview, reviewVideo, slotState } from "./desk-lib";

const source = (art: Record<string, unknown>) => ({ status: "idea", art, preview: null, post: null } as unknown as DeskSlot);

test("a saved Library review reference shows its own cover without granting approval", () => {
  const slot = source({ review_library_id: "ad24f4eb-2bd5-4ec5-9a60-0578b309b785", review_video_url: "/api/admin/marketing/library/media?id=ad24f4eb-2bd5-4ec5-9a60-0578b309b785&kind=video" });
  assert.deepEqual(tileImage(slot), { src: "/api/admin/marketing/library/media?id=ad24f4eb-2bd5-4ec5-9a60-0578b309b785&kind=cover", composed: false, video: true });
  assert.equal(awaitingReview(slot), false);
});
test("a delivered Reel remains playable while its release is held", () => {
  const slot = source({ video_url: "https://media.zyvorah.com/marketing-media/master.mp4", production_hold: true, audio_verified: false });
  assert.equal(reviewVideo(slot), slot.art.video_url);
  assert.equal(tileImage(slot).video, true);
  assert.equal(slotState(slot, "2026-10-03"), "held");
  assert.equal(awaitingReview({ ...slot, post: { status: "queued", safety_passed: true } as DeskSlot["post"] }), false);
  assert.equal(slotState({ ...slot, post: { status: "published" } as DeskSlot["post"] }, "2026-10-03"), "posted");
});

test("an exact saved still preview outranks the catalogue fallback and stays uncomposed", () => {
  const slot = { ...source({ review_image_url: "https://media.zyvorah.com/product-images/mayur/scene-bedroom.png" }), preview: "https://media.zyvorah.com/product-images/mayur/scene-playroom.png" };
  assert.equal(tileImage(slot).src, slot.art.review_image_url);
  assert.equal(tileImage(slot).composed, false);
  assert.equal(awaitingReview(slot), false);
});
