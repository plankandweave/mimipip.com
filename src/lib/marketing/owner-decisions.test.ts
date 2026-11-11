import test from "node:test";
import assert from "node:assert/strict";
import { blockersAfterAnswer, decisionFor, redrawsAfterAnswer } from "./owner-decisions";

// The holds as they stand on the Diwali plan, 10 October 2026.
const LIBRARY = "Native JPEG export is in the owner Library handoff; production import blocked by missing existing upload configuration";
const DESIGN = "One source frame exported; complete carousel and final format require direct owner design review";
const CONCEPT = "Concept creative: exact collection and product destination need owner confirmation";
const FILM = ["Confirm video, caption and catalogue match in owner review", "Verify actual off-grid placement before publication", "Private saved Library preview requires staff sign-in; current browser playback not verified"];
const FOOTER = "Final house-v5 footer frame not yet exported";
const SEASONAL = "Owner review required for revised seasonal copy and destination";
const AWAITING = "Awaiting owner artwork, collection and destination";
const PREVIEW = "Catalogue source preview: final publishable creative not exported";
const STICKER = "Actual native Link sticker to the exact product required; automatic Story publishing remains held";
const VIDEO = "Repeat colour story moved off grid; no existing matching video found, finished video required";

test("each Diwali hold becomes one plain decision for the founder", () => {
  assert.equal(decisionFor({ format: "carousel", blockers: [LIBRARY, DESIGN] }).kind, "approve-design");
  assert.equal(decisionFor({ format: "feed", blockers: [CONCEPT, LIBRARY] }).kind, "choose-product");
  assert.equal(decisionFor({ format: "reel", blockers: FILM }).kind, "confirm-film");
  assert.equal(decisionFor({ format: "feed", blockers: [LIBRARY] }).kind, "approve-design");
  assert.equal(decisionFor({ format: "reel", blockers: [] }).kind, "redraw");
});

test("production's holds are never put to her", () => {
  const d = decisionFor({ format: "reel", blockers: [VIDEO] });
  assert.equal(d.kind, "production");
  assert.deepEqual(d.production, [VIDEO]);
  assert.equal(decisionFor({ format: "feed", blockers: [VIDEO] }).kind, "production");
});

test("her answer clears her holds and only hers; a cleared post is drawn again", () => {
  assert.deepEqual(blockersAfterAnswer([LIBRARY, DESIGN]), []);
  assert.equal(redrawsAfterAnswer([CONCEPT, LIBRARY]), true);
  assert.deepEqual(blockersAfterAnswer([DESIGN, VIDEO]), [VIDEO]);
  assert.equal(redrawsAfterAnswer([DESIGN, VIDEO]), false);
});

test("every hold worded for the owner reaches her, and a Story's frame and sticker never keep it from her", () => {
  assert.equal(decisionFor({ format: "feed", blockers: [PREVIEW, SEASONAL] }).kind, "choose-product");
  assert.equal(decisionFor({ format: "feed", blockers: [AWAITING] }).kind, "choose-product");
  const story = decisionFor({ format: "story", blockers: [STICKER, FOOTER, CONCEPT] });
  assert.equal(story.kind, "choose-product");
  assert.deepEqual(story.production, []);
  assert.equal(decisionFor({ format: "story", blockers: [STICKER, FOOTER, PREVIEW] }).kind, "approve-design");
  assert.equal(redrawsAfterAnswer([STICKER, FOOTER, CONCEPT]), true);
});
