import { test } from "node:test";
import assert from "node:assert/strict";
import { frameTextProblem, slotFrameTextProblem } from "./frame-text";
import { ideaReadyArt, type PlanSlot } from "./plan";
import { awaitingReview, composableIdea } from "../../components/admin/marketing/desk-lib";
import type { DeskSlot } from "../../app/api/admin/marketing/plan/route";

// 3 October 2026: the review board's working title was printed across an
// Ahimsa reel in display type. The caption gate never read it.
const NOTE = "AHIMSA · October 2 Reel — publication verification required";

test("a working note is refused as a headline", () => {
  for (const t of [NOTE, "Oct 7th reel", "2 October post", "Awaiting owner artwork", "Draft — approval pending", "Do not post", "Collection awaiting owner"]) {
    assert.ok(frameTextProblem(t), t);
  }
});

test("real headlines and collection names pass", () => {
  for (const t of ["Many, Held Together", "AHIMSA — Strength, Softly Woven", "Taash, in three moves", "The Puja Room", "Mayur", "October Light", "Hold the Light", "made to measure", "Price your exact wall, approve the crop, order.", null, ""]) {
    assert.equal(frameTextProblem(t), null, String(t));
  }
});

const slot: PlanSlot = {
  id: "s1", plan_key: "ahimsa-2026", day_key: "2026-10-07", seq: 2, channel: "instagram", kind: "reel", beat: "wall",
  collection: "AHIMSA — Strength, Softly Woven", handle: "ahimsa-many-held-together", title: NOTE, devanagari: null, meaning: null,
  price: null, hook: null, caption: "On 2nd October, we returned to Ahimsa as a way of living now.", visual_brief: null, cta: null,
  art: {}, status: "idea", comments: [], removed_at: null, removed_by: null, created_at: "", updated_at: "",
};

test("an idea titled with a working note does not compose, from the desk or the server", () => {
  const r = ideaReadyArt(slot);
  assert.ok("reason" in r && /working note/.test(r.reason));
  const desk = { ...slot, slot_key: "2026-10-07#2", post: null, preview: null, flat: null } as DeskSlot;
  assert.equal(composableIdea(desk), false);
  assert.ok("art" in ideaReadyArt({ ...slot, title: "Many, Held Together" }));
});

test("a frame already rendered with the note is never offered for approval", () => {
  const post = { id: "p1", status: "queued", safety_passed: true, approved_at: null, regenerate_requested_at: null, format: "reel", media_urls: ["https://x/r.mp4"] };
  const desk = { ...slot, status: "planned", slot_key: "2026-10-07#2", post, preview: null, flat: null } as unknown as DeskSlot;
  assert.equal(awaitingReview(desk), false);
  assert.equal(slotFrameTextProblem({ ...desk, title: "Many, Held Together" }), null);
  assert.equal(awaitingReview({ ...desk, title: "Many, Held Together" } as DeskSlot), false, "fixing the words alone cannot waive the measured-layout requirement");
  assert.ok(slotFrameTextProblem(desk));
});
