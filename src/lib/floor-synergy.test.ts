// The floor-wise synergy review (Roheena, 6 October 2026): after the last
// wall composes, the pipeline looks at the whole floor in clockwise order —
// palette harmony, floor-line continuity, odd wall out — and parks what it
// finds in the batch warnings the reviewer reads. Pinned here so a compose
// refactor cannot drop the step, and the silent-update contract holds: a
// recompose of an already-proposed revision returns the batch to 'proposed'
// without a second email.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SYNERGY_PREFIX, withoutSynergyNotes } from "./band-geometry";

test("a new cycle replaces the old cycle's synergy notes and keeps everything else", () => {
  assert.deepEqual(
    withoutSynergyNotes([`${SYNERGY_PREFIX}Wall 3 breaks the palette`, "Wall 2: re-measure"]),
    ["Wall 2: re-measure"],
  );
  assert.deepEqual(withoutSynergyNotes(null), []);
});

test("the compose route runs the synergy review and fails open", () => {
  const src = readFileSync(new URL("../app/api/corporate/site-batch/[id]/compose/route.ts", import.meta.url), "utf8");
  assert.ok(src.includes("reviewFloorSynergy"), "compose runs the floor-wise synergy review when the batch finishes");
  assert.ok(src.includes("recordSynergy"), "its verdict lands in the batch warnings");
});

test("a silent recompose returns an already-proposed revision to 'proposed' — no second email", () => {
  const src = readFileSync(new URL("../app/api/corporate/site-batch/[id]/compose/route.ts", import.meta.url), "utf8");
  assert.ok(src.includes("alreadyProposedThisRevision"), "compose restores 'proposed' when this revision was already sent");
});

test("the synergy review sends pieces as bytes, never URLs (robots.txt blocks /api)", () => {
  const src = readFileSync(new URL("./floor-synergy.ts", import.meta.url), "utf8");
  assert.ok(src.includes('type: "base64"'), "images attach as base64");
  assert.ok(!src.includes('type: "url"'), "no URL image sources");
});

test("design geometry sends artwork as bytes too, and only a seen design counts as measured", () => {
  const src = readFileSync(new URL("./design-geometry.ts", import.meta.url), "utf8");
  assert.ok(src.includes('type: "base64"'), "artwork attaches as base64");
  assert.ok(!src.includes('type: "url"'), "no URL image sources");
  assert.ok(src.includes("sawArtwork"), "a failed fetch is retried next composition, not stamped measured");
});
