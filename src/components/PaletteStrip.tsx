import { presentablePalette, type PaletteSwatch } from "@/lib/curated-doc";

/**
 * The one way a palette is shown to anyone who is not us.
 *
 * The rule this component exists to make mechanical (hers, 2026-09-06): a
 * client-facing surface shows the COLOUR and the name she gave it, and
 * nothing else. Hexes-as-text, percentages and roles are recipe, not
 * presentation — a competitor reading a deck or a case study should learn
 * nothing they could mix from.
 *
 * The share is not thrown away, it changes medium: it becomes the WIDTH of
 * each band. A palette that is 85% ivory LOOKS 85% ivory, so the reader takes
 * in the balance directly instead of reading "80-85%" and doing the
 * arithmetic — and the figure never appears as text anyone could lift. Where
 * a palette carries no shares at all, `presentablePalette` gives every band an
 * equal width, which is the honest rendering of "we have not said".
 *
 * The safety property is structural rather than instructional: this component
 * is handed `name` + `hex` + `weight` by `presentablePalette` and CANNOT print
 * what it never received. Anything that renders a palette should come through
 * here rather than mapping over swatches itself — a hand-rolled strip is one
 * `{c.hex}` away from putting the recipe back on the page, which is exactly
 * how the case-study book carried its hexes in public until now.
 */

/** A swatch plus, optionally, the sentence that says what the colour is FOR.
 *  Caption is prose the studio wrote to be read — the case-study argument —
 *  not the terse internal `role` token, which is never rendered. */
export type PaletteStripSwatch = PaletteSwatch & { caption?: string | null };

type Props = {
  swatches: PaletteStripSwatch[];
  /**
   * `compact` is the working strip: 4rem bands, names in a hairline track
   * beneath, drawn in the admin's own tokens. `editorial` is the published
   * one: tall bands, display type, captions, and book tokens.
   */
  tone?: "compact" | "editorial";
  className?: string;
};

/** A swatch with no usable hex is a neutral labelled chip, never a colour
 *  someone guessed. */
const NO_COLOUR = "#EFE8DF";

export function PaletteStrip({ swatches, tone = "compact", className }: Props) {
  const bands = presentablePalette(swatches);
  if (bands.length === 0) return null;

  const editorial = tone === "editorial";
  const captions = swatches.map((s) => s.caption ?? null);

  // Both tracks read from the SAME weights, so a name always sits under its
  // own colour however the shares fall.
  const grow = (i: number) => ({ flexGrow: bands[i].weight, flexBasis: 0, minWidth: 0 });

  /**
   * Setting the prose in columns that match the bands is the nicer reading —
   * the alignment does the labelling, no legend needed. It only survives while
   * the bands are of comparable width, though: a colour that is 2% of the
   * scheme gets a 27px column, and its sentence sets one word per line for
   * thirty lines. That is not a hypothetical. It is what the section did the
   * first time a real set of shares was put through it.
   *
   * So the aligned track is earned, not assumed: every band has to be at least
   * 60% of an equal share. A palette with no shares is perfectly equal and
   * always qualifies (which is why the nine existing studies look untouched);
   * a lopsided one drops to the legend, where the colour dot does the mapping
   * the alignment can no longer do.
   */
  const evenEnough = bands.every((b) => b.weight * bands.length >= 60);
  const alignCaptions = editorial && evenEnough;

  return (
    <div className={className}>
      {/* The band row is addressable (`data-palette-strip="bands"`) so a host
          surface can restate its height for a medium the component knows
          nothing about — the book shrinks it for print. Height is a class
          rather than an inline style precisely so such a rule can win. */}
      <div
        data-palette-strip="bands"
        className={
          editorial
            ? "flex h-[clamp(150px,16vw,230px)] w-full overflow-hidden rounded-[10px]"
            : "flex h-16 w-full overflow-hidden rounded-[8px] border border-edge"
        }
      >
        {bands.map((b, i) => (
          <div
            key={`${b.name}-${i}`}
            style={{ ...grow(i), background: b.hex ?? NO_COLOUR }}
            title={b.name}
          />
        ))}
      </div>

      {/* The working strip's name track: hers, unchanged from the studio — a
          band too narrow for its name shows it on hover rather than wrapping. */}
      {!editorial && (
        <div className="mt-1 flex w-full gap-1">
          {bands.map((b, i) => (
            <span
              key={`${b.name}-${i}`}
              style={grow(i)}
              className="overflow-hidden text-ellipsis whitespace-nowrap text-[0.6rem] leading-tight text-slate"
              title={b.name}
            >
              {b.name}
            </span>
          ))}
        </div>
      )}

      {/* Names and purposes aligned to their bands. Never on a phone: six bands
          across 390px are slivers, and a name ellipsed to two characters labels
          nothing — the legend carries the text there. */}
      {alignCaptions && (
        <div className="mt-3 hidden w-full gap-3 sm:flex">
          {bands.map((b, i) => (
            <div key={`${b.name}-${i}`} style={grow(i)}>
              <p
                className="overflow-hidden text-ellipsis whitespace-nowrap text-[0.95rem] font-semibold tracking-[-0.01em]"
                style={{ fontFamily: "var(--book-display)" }}
                title={b.name}
              >
                {b.name}
              </p>
              {captions[i] && (
                <p className="mt-1.5 text-[0.84rem] leading-[1.55]" style={{ color: "var(--book-muted)" }}>
                  {captions[i]}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* The legend. On a phone always; at every width once the shares are too
          lopsided to set prose in. The ribbon above still carries the
          proportion — this carries the words, and the dot carries the join
          between the two. */}
      {editorial && (
        <ul
          className={
            alignCaptions
              ? "mt-5 grid list-none gap-3 p-0 sm:hidden"
              : "mt-5 grid list-none gap-x-8 gap-y-4 p-0 sm:grid-cols-2 lg:grid-cols-3"
          }
        >
          {bands.map((b, i) => (
            <li key={`${b.name}-${i}`} className="flex gap-3">
              <span
                aria-hidden
                className="mt-[5px] h-3.5 w-3.5 shrink-0 rounded-full"
                style={{ background: b.hex ?? NO_COLOUR }}
              />
              <div>
                <p className="text-[0.95rem] font-semibold" style={{ fontFamily: "var(--book-display)" }}>
                  {b.name}
                </p>
                {captions[i] && (
                  <p className="mt-0.5 text-[0.84rem] leading-[1.5]" style={{ color: "var(--book-muted)" }}>
                    {captions[i]}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
