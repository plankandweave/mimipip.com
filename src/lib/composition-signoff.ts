/**
 * Whether the wall builder asks the customer to sign off the composition
 * ("Yes, print it like this") before Add to cart.
 *
 * Founder's rule (6 October 2026): the sign-off stays whenever the customer
 * has changed anything about the artwork, and for everything that is not a
 * standard wallpaper. A standard wallpaper taken exactly as the studio drew
 * it needs no sign-off — it was the one step a first-time shopper was most
 * likely to stall on, and there is nothing of theirs in it to confirm.
 *
 * "Changed anything" is read off the builder's own state against its
 * defaults: the artwork starts centred (0.5, 0.5), at 100% scale and
 * unflipped. Wall size is NOT a change — every wallpaper is cut to a wall.
 */
export type CompositionState = {
  /** Centre of the crop, 0–1 on each axis; the builder starts at 0.5. */
  offsetX: number;
  offsetY: number;
  /** Scale; the builder starts at 1. */
  zoom: number;
  flipH: boolean;
  flipV: boolean;
  /** The customer's own uploaded image rather than a catalogue design. */
  ownImage: boolean;
  /** Any lettering: a name, or a typed text overlay. */
  lettering: boolean;
  /** A canvas, fixed-size or otherwise non-wallpaper piece. */
  nonWallpaper: boolean;
};

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

/** True when the customer has changed nothing: a standard wallpaper as drawn. */
export function compositionUntouched(s: CompositionState): boolean {
  return (
    !s.nonWallpaper &&
    !s.ownImage &&
    !s.lettering &&
    !s.flipH &&
    !s.flipV &&
    near(s.zoom, 1) &&
    near(s.offsetX, 0.5) &&
    near(s.offsetY, 0.5)
  );
}

/** The sign-off is asked for unless the composition is untouched. */
export function signoffRequired(s: CompositionState): boolean {
  return !compositionUntouched(s);
}
