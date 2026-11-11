// The founder's notes must ACT. On 25 Sep 2026 "ask for a variation" stored
// the note and recomposed the identical frame; these tests pin the mapping
// from her actual notes to composition directives. Run:
//   npx tsx --test src/lib/marketing/notes.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { directivesFromNotes } from "./pipeline";

test("her actual note — 'The mural should be central to this view and not cut off' — centres the crop", () => {
  const d = directivesFromNotes(["The mural should be central to this view and not cut off."]);
  assert.equal(d.position, "centre");
  assert.equal(d.hold, undefined);
  assert.equal(d.acted.length, 1);
});

test("her actual note — 'I prefer some other wallpaper selected for this' — holds for her decision", () => {
  const d = directivesFromNotes(["I prefer some other wallpaper selected for this."]);
  assert.ok(d.hold);
  assert.equal(d.position, undefined);
});

test("'show it in the bedroom' selects the bedroom render", () => {
  const d = directivesFromNotes(["Show it in the bedroom instead"]);
  assert.equal(d.scene, "bedroom");
});

test("'go closer, show the detail of the artwork' becomes the detail beat", () => {
  const d = directivesFromNotes(["Go closer, show the detail of the artwork"]);
  assert.equal(d.detail, true);
});

test("a note about the words is carried to the caption writer, never dropped", () => {
  const d = directivesFromNotes(["Mention that this suits a study as well"]);
  assert.equal(d.captionNote, "Mention that this suits a study as well");
  assert.deepEqual(d.acted, ["Mention that this suits a study as well"]);
});

test("no notes means no directives — the plan composes exactly as written", () => {
  const d = directivesFromNotes([]);
  assert.deepEqual(d, { acted: [] });
});
