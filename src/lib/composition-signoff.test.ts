import { test } from "node:test";
import assert from "node:assert/strict";
import { compositionUntouched, signoffRequired, type CompositionState } from "./composition-signoff";

const standard: CompositionState = {
  offsetX: 0.5,
  offsetY: 0.5,
  zoom: 1,
  flipH: false,
  flipV: false,
  ownImage: false,
  lettering: false,
  nonWallpaper: false,
};

test("a standard wallpaper taken as drawn needs no sign-off", () => {
  assert.equal(compositionUntouched(standard), true);
  assert.equal(signoffRequired(standard), false);
  // Floating-point drift from the slider is not a change.
  assert.equal(signoffRequired({ ...standard, zoom: 1.0000000001 }), false);
});

test("any tweak to the artwork brings the sign-off back", () => {
  assert.equal(signoffRequired({ ...standard, offsetX: 0.6 }), true, "dragged sideways");
  assert.equal(signoffRequired({ ...standard, offsetY: 0.3 }), true, "dragged up");
  assert.equal(signoffRequired({ ...standard, zoom: 1.25 }), true, "scaled");
  assert.equal(signoffRequired({ ...standard, flipH: true }), true, "flipped");
  assert.equal(signoffRequired({ ...standard, flipV: true }), true, "flipped vertically");
  assert.equal(signoffRequired({ ...standard, lettering: true }), true, "a name or text added");
  assert.equal(signoffRequired({ ...standard, ownImage: true }), true, "their own image");
});

test("everything that is not a standard wallpaper keeps the sign-off", () => {
  assert.equal(signoffRequired({ ...standard, nonWallpaper: true }), true, "canvas or fixed-size piece");
});
