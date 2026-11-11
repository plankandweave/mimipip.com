// The shop window must never again lead with a third of a picture.
//
// On 4 September 2026 the homepage hero was "Vakratunda" (`ganesha-s-grace`),
// a 1792×2688 Ganesha mural, inside the full-bleed ~2:1 hero band. The numbers
// below are that exact artwork and that exact frame, pinned. If a change makes
// this file fail, the change puts a vertical mural back in a horizontal band.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ProductCardData } from "./types";
import {
  coverVisibleFraction, fitsFrame, heroSafe, imageAspectOf,
  HERO_FRAME_ASPECT, BAND_FRAME_ASPECT, MIN_VISIBLE_FRACTION,
} from "./image-orientation";

const card = (over: Partial<ProductCardData>): ProductCardData => ({
  handle: "x", title: "X", image: "https://example.test/x.png", imageAlt: "X",
  fromPricePerSqft: 300, ...over,
});

/** The design that caused this file to exist. */
const VAKRATUNDA = card({
  handle: "ganesha-s-grace",
  title: "Vakratunda (वक्रतुंड)",
  imageWidth: 1792, imageHeight: 2688,
  orientation: "vertical",
});

test("object-cover keeps min/max of the two aspects — nothing more", () => {
  // A 2:3 mural scaled to cover a 2:1 band is 3× too tall: a third survives.
  assert.equal(Math.round(coverVisibleFraction(2 / 3, 2) * 100), 33);
  // Symmetric: the same pair the other way round crops the other axis.
  assert.equal(coverVisibleFraction(2, 2 / 3), coverVisibleFraction(2 / 3, 2));
  // A frame the image's own shape crops nothing at all.
  assert.equal(coverVisibleFraction(1.5, 1.5), 1);
  // Nonsense in, zero out — never a fraction that would read as "fine".
  assert.equal(coverVisibleFraction(0, 2), 0);
  assert.equal(coverVisibleFraction(1.5, Number.NaN), 0);
});

test("the Ganesha mural is barred from the hero band", () => {
  assert.equal(imageAspectOf(VAKRATUNDA), 1792 / 2688);
  assert.ok(coverVisibleFraction(imageAspectOf(VAKRATUNDA)!, HERO_FRAME_ASPECT) < 0.34);
  assert.equal(heroSafe(VAKRATUNDA), false);
  // ...and from the made-to-measure band, which is landscape too.
  assert.equal(fitsFrame(VAKRATUNDA, BAND_FRAME_ASPECT), false);
});

test("a declared-vertical piece is barred from a landscape frame at ANY ratio", () => {
  // Pixels alone would pass this one (0.98 in a 1:1 frame keeps 98%). The
  // studio's declaration is what stops it: a composed vertical piece cropped
  // to a band sells a different object than the one that arrives.
  const composed = card({ imageWidth: 980, imageHeight: 1000, orientation: "vertical" });
  assert.equal(fitsFrame(composed, 1), false);
  // A portrait FRAME may still hold it — the bar is on the frame, not the art.
  assert.equal(fitsFrame(composed, 3 / 4), true);
});

test("a landscape room render leads the hero", () => {
  assert.equal(heroSafe(card({ imageWidth: 1536, imageHeight: 1024 })), true); // 3:2
  assert.equal(heroSafe(card({ imageWidth: 2688, imageHeight: 1792 })), true);
});

test("the threshold sits where it is meant to, with margin", () => {
  // 0.55 of a 2:1 frame is an image at least 1.1× as wide as it is tall.
  assert.equal(MIN_VISIBLE_FRACTION, 0.55);
  assert.equal(heroSafe(card({ imageWidth: 1100, imageHeight: 1000 })), true);
  assert.equal(heroSafe(card({ imageWidth: 1099, imageHeight: 1000 })), false);
  // A square is NOT good enough for a 2:1 band: half a picture is half a
  // picture, and the rule must not sit exactly on its worst permitted case.
  assert.equal(heroSafe(card({ imageWidth: 1024, imageHeight: 1024 })), false);
});

test("an unmeasured image fails closed", () => {
  // Unknown size is the exact state that produced the Ganesha hero. One row in
  // 4,255 is unmeasured, so refusing it costs a design and guessing costs the
  // shop window.
  assert.equal(heroSafe(card({})), false);
  assert.equal(heroSafe(card({ imageWidth: 1600, imageHeight: null })), false);
  assert.equal(heroSafe(card({ imageWidth: 0, imageHeight: 0 })), false);
});
