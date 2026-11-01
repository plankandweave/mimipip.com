/**
 * The finishes a printed A4 sample can actually be produced on today — the ONE
 * list the sample picker renders and the sample-order API validates against, so
 * the two can never disagree about what ₹200 buys.
 *
 * `name` is the material's catalogue name verbatim: it goes into the order note
 * the print desk works from, so it has to name real stock.
 *
 * Adding a finish here makes it sellable as a sample. Only add one the print
 * desk can actually cut, pack and post at the flat ₹200 line price — a sample
 * we can't fulfil takes the customer's money for nothing. Canvas is deliberately
 * absent: it is a fixed-size, rolled-and-tubed good taxed at 12%, not an A4
 * swatch inside this flat-priced, 18% flow. Self-Adhesive is also absent: this
 * sample service uses verified wallpaper artwork offered on Soft Matte — Self-Adhesive is a ready-size-only media
 * and isn't a real option for these designs.
 */
export type SampleFinish = { name: string; label: string; blurb: string };

export const SAMPLE_FINISHES: SampleFinish[] = [
  {
    name: "Soft Matte",
    // Roheena, 12 October 2026: the feel first, then how it goes up.
    label: "Soft Matte",
    blurb: "Smooth to the touch and never glossy, with a beautiful softness. Pasted straight onto the wall.",
  },
];

/** The default tick. One finish, never every finish — pre-ticking them all
 *  silently doubles what the customer is about to pay. */
export const DEFAULT_SAMPLE_FINISH = SAMPLE_FINISHES[0].name;

export const isSampleFinish = (s: string) => SAMPLE_FINISHES.some((f) => f.name === s);
