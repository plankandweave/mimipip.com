import { test } from "node:test";
import assert from "node:assert/strict";
import { statSync } from "node:fs";
import { NAFAS_DESIGNS } from "./nafas";

import { canFollowArtwork, visibleArtworkScore, NAFAS_GUIDE } from "./nafas-guide";
test("guide never begins without opt-in or while paused, disabled, or another clip plays", () => {
  const heard = new Set<string>();
  assert.equal(canFollowArtwork(false, true, false, false, "pencil", heard), false);
  assert.equal(canFollowArtwork(true, false, false, false, "pencil", heard), false);
  assert.equal(canFollowArtwork(true, true, true, false, "pencil", heard), false);
  assert.equal(canFollowArtwork(true, true, false, true, "pencil", heard), false);
  assert.equal(canFollowArtwork(true, true, false, false, "pencil", heard), true);
  heard.add("pencil");
  assert.equal(canFollowArtwork(true, true, false, false, "pencil", heard), false);
});
test("offscreen artwork cannot trigger a narration", () => {
  assert.equal(visibleArtworkScore(-500, 0, 900), -Infinity);
  assert.equal(visibleArtworkScore(901, 1600, 900), -Infinity);
  assert.ok(visibleArtworkScore(200, 700, 900) > visibleArtworkScore(780, 1400, 900));
});
test("every published guide track has a local audio asset and readable script", () => {
  for (const id of Object.keys(NAFAS_GUIDE)) {
    assert.ok(NAFAS_GUIDE[id]?.text.length > 30, id);
    assert.ok(NAFAS_GUIDE[id].src.startsWith("/nafas/audio/"));
    assert.ok(statSync(`public${NAFAS_GUIDE[id].src}`).size > 1000, id);
  }
});

test("existing narrated designs retain their tracks; Daisy Snap awaits narration", () => {
  for (const design of NAFAS_DESIGNS) {
    if (design.handle === "nafas-daisy-snap") continue;
    assert.ok(NAFAS_GUIDE[design.handle], design.handle);
  }
});
