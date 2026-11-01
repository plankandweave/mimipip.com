// What a half-typed number box means.
//
// The wall builder's size boxes are controlled inputs whose value is DERIVED:
// the millimetre box shows the feet-and-inches size converted back, rounded to
// half an inch. Re-rendering that derived value after every keystroke rewrote
// the box under the shopper's finger — typing 3048 into millimetres ended on
// "13", and a cleared feet box came back as "0" so 10 read "010" (9 Oct 2026:
// a size could not be entered on an iPhone, on a design and in the Custom
// Print Studio alike). So a box keeps the shopper's own text while it has
// focus and only reports the number it means; the tidy value returns on blur.

/** The number a shopper's partial entry stands for. Empty, "." or "-" mean
 *  nothing yet (0); a comma is a decimal point (some phone keypads offer only
 *  a comma); anything unreadable is 0, never NaN. */
export function draftNumber(text: string): number {
  const t = text.trim().replace(",", ".");
  if (!t || t === "." || t === "-") return 0;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}
