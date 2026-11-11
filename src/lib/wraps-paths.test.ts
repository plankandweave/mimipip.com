import { test } from "node:test";
import assert from "node:assert/strict";
import { isWrapsPath, WRAPS_HOST } from "./wraps-paths";

test("the range's own pages are wraps paths", () => {
  for (const p of [
    "/wraps",
    "/wraps/designs/rose-garden",
    "/wraps/collections/florals",
    "/fridge-wraps",
    "/fridge-wraps/fit-finder",
    "/ac-wraps",
    "/washing-machine-wraps/see-it-on-mine",
    "/dishwasher-wraps",
    "/dryer-wraps/",
  ]) {
    assert.equal(isWrapsPath(p), true, p);
  }
});

test("the wallpaper shop is not, even where a word overlaps", () => {
  for (const p of ["/", "/rooms", "/collections/wall-art", "/products/wraps-x", "/wrapsheet", "/fridge-wrapsx", "/new"]) {
    assert.equal(isWrapsPath(p), false, p);
  }
});

test("the wraps host is the one the gate rewrites", () => {
  assert.equal(WRAPS_HOST, "wraps.zyvorah.com");
});
