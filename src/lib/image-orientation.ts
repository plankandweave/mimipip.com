import type { ProductCardData } from "@/lib/types";

/**
 * WHICH ARTWORK MAY ENTER WHICH FRAME.
 *
 * On 4 September 2026 the homepage hero showed "Vakratunda" — a 1792×2688
 * Ganesha mural, a single composed figure — inside the full-bleed hero band.
 * `object-cover` on a ~2:1 frame scales a 0.67 image to the frame's WIDTH,
 * which makes it 2.9× the frame's height: only the top third survived. The
 * shop window led with a crown and a pair of ears, and the deity the artwork
 * is entirely about — seated, four arms, lotus — was below the fold of its own
 * picture. Nobody typo'd anything; the rotation simply had no idea the image
 * was vertical.
 *
 * So it is told, here, once, and every landscape frame asks before it crops.
 * The arithmetic is not a heuristic — it is exactly what `object-cover` does:
 * the image is scaled until it covers, one axis fits exactly, and the other
 * overflows by the ratio between the two aspects.
 */

/** How much of an image survives `object-cover` inside a frame, 0–1.
 *  One axis always fits exactly; the other keeps `min/max` of itself. */
export function coverVisibleFraction(imageAspect: number, frameAspect: number): number {
  if (!(imageAspect > 0) || !(frameAspect > 0)) return 0;
  return Math.min(imageAspect, frameAspect) / Math.max(imageAspect, frameAspect);
}

/**
 * The least of an image a frame may keep. Below this the frame is no longer
 * showing the artwork, it is showing a detail of it — and a detail nobody
 * chose, since the crop is decided by arithmetic rather than by an eye.
 *
 * 0.55 rather than 0.5 because half is exactly the square-in-a-2:1 case, and a
 * rule that sits precisely on its worst permitted example has no margin at all.
 */
export const MIN_VISIBLE_FRACTION = 0.55;

/**
 * The hero band's shape on the desktop viewports that see it widest:
 * `w-full` less the 24px page gutters, by `h-[80vh]`. 1440×900 gives 1.93,
 * 1920×1080 gives 2.17, a 27" gives 2.18 — 2 is the honest middle, and the
 * rule it produces (an image at least 1.1× as wide as it is tall) holds at
 * every one of them. Mobile flips the frame portrait; see `heroSafe`.
 */
export const HERO_FRAME_ASPECT = 2;

/** The made-to-measure band's frame: `aspect-[4/3]`. */
export const BAND_FRAME_ASPECT = 4 / 3;

/** The image's true shape, from the pixels actually stored for it (migration
 *  0060 records these on write). Null when unmeasured — which is a "no", not
 *  a "probably fine": see `fitsFrame`. */
export function imageAspectOf(card: ProductCardData): number | null {
  const w = card.imageWidth;
  const h = card.imageHeight;
  return w && h && w > 0 && h > 0 ? w / h : null;
}

/**
 * May this design's card image fill a frame of this shape?
 *
 * Two independent clauses, because there are two ways to know a piece is
 * vertical and only one of them is always populated:
 *
 *  1. `products.orientation` — the studio's own declaration that the artwork
 *     is a COMPOSED piece drawn for a wall of a given shape, not a repeat.
 *     A composed vertical piece is never cropped into a landscape band at any
 *     ratio: the crop then sells a different object than the one that arrives.
 *  2. The measured pixels, against the frame. This catches everything the
 *     studio never declared — the far larger case.
 *
 * Unmeasured fails closed. An unknown size is precisely the state that
 * produced the Ganesha hero, and there is one such row in the catalogue
 * against 4,254 measured: refusing it costs nothing and guessing costs the
 * shop window.
 */
export function fitsFrame(card: ProductCardData, frameAspect: number): boolean {
  if (frameAspect >= 1 && card.orientation === "vertical") return false;
  const aspect = imageAspectOf(card);
  if (aspect === null) return false;
  return coverVisibleFraction(aspect, frameAspect) >= MIN_VISIBLE_FRACTION;
}

/**
 * May this design lead the hero?
 *
 * Judged against the DESKTOP frame only, deliberately. The hero band is
 * responsive — on a phone it is taller than it is wide, and there a landscape
 * image is the one being cropped. That asymmetry is fine and not the same
 * defect: narrowing a wide artwork still shows the artwork, because a wall
 * covering is made to be cut to a wall. Flattening a composed figure into a
 * band shows a slice of a face. Only one of those is a lie about what the
 * customer receives, so only one is barred.
 */
export function heroSafe(card: ProductCardData): boolean {
  return fitsFrame(card, HERO_FRAME_ASPECT);
}
