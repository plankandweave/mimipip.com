import { test } from "node:test";
import assert from "node:assert/strict";
import { newWallpaperRate, requestedFinish } from "./wallpaper-finish";

test("an upload asks for exactly one of the two wallpaper finishes", () => {
  assert.equal(requestedFinish("linen-touch"), "linen-touch");
  assert.equal(requestedFinish("smooth-matt"), "smooth-matt");
  for (const v of [undefined, null, "", "linen", "eco-cotton-canvas", ["linen-touch"]]) {
    assert.equal(requestedFinish(v), "smooth-matt");
  }
});

test("new wallpaper pricing follows collection membership and preserves Signature rates", () => {
  const base = { tags: [], collections: [{ tags: ["Bagh"], signature: false }, { tags: ["Calm"], signature: true }], signature: false, existingRate: 230 };
  assert.equal(newWallpaperRate(base), 200);
  assert.equal(newWallpaperRate({ ...base, tags: ["Bagh"] }), 300);
  assert.equal(newWallpaperRate({ ...base, tags: ["Calm"] }), 230);
  assert.equal(newWallpaperRate({ ...base, tags: ["Bagh"], signature: true, existingRate: 400 }), 400);
});
