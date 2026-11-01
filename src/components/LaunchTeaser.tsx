import { Cormorant_Garamond } from "next/font/google";
import { countdownLabel, launchDateLabel, type CollectionLaunch } from "@/lib/launch";
import { LaunchTeaserPlate } from "./LaunchTeaserPlate";

/**
 * The teaser is set in the collection's own serif, not the store's Jakarta.
 * /mati loads Cormorant for the same reason: the collections that get a teaser
 * are the ones with a printed object behind them, and a band that announces one
 * in the shop's UI font announces it as a product listing. Declaring the font
 * here rather than in the root layout means only the pages that actually import
 * this component pay for it.
 */
const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-teaser",
  display: "swap",
});

/**
 * THE TEASER.
 *
 * A week before a collection lands, this sits directly under the hero. It is
 * deliberately the quietest band on the homepage: a teaser that shouts is
 * indistinguishable from a sale, and this collection is neither scarce nor in
 * a hurry.
 *
 * The band is LIMESTONE, not the dark card it used to be. The dark card was
 * doing the announcing — a black slab under a white hero reads as a promotion
 * whatever is printed on it, and it put the crops behind a vignette that fought
 * the artwork's own paper. Ground, ink and tracking here are the collection
 * page's (/mati, taash.css): #F8F5EF stock, Kaajal ink, Dhool for the small
 * caps, Sindoor for the date. Someone who sees this band and then opens the
 * collection is looking at the same object twice, which is the whole job of a
 * teaser.
 *
 * What it withholds is the point. No prices, no product links, no "notify me"
 * form dressed as a gate — a name, a date, and one plate the reader cannot
 * quite see (LaunchTeaserPlate). A customer who wants it will remember the
 * date; a customer who does not is not chased. Nothing here is legible enough
 * to be shopped: showing the collection a week early spends the launch before
 * it happens.
 */
export function LaunchTeaser({
  launch,
  title,
  kicker,
  blurb,
  images,
  now,
}: {
  launch: CollectionLaunch;
  title: string;
  /** The line above the name — "Zyvorah × Mati", "A collaboration". */
  kicker: string;
  blurb: string;
  images: { image: string; alt: string }[];
  now: Date;
}) {
  if (images.length === 0) return null;

  return (
    <section
      className={`${serif.variable} mx-4 py-16 lg:mx-6`}
      aria-labelledby="launch-teaser-heading"
      style={{ ["--ink" as string]: "#1c1913", ["--dhool" as string]: "#5a4c3a", ["--sindoor" as string]: "#79231a" }}
    >
      {/* Width and margins mirror the hero directly above (mx-4 / lg:mx-6,
          no container-x max-width) so the two bands read as one edge. */}
      <div
        className="overflow-hidden rounded-[20px]"
        // Kaagaz, not near-white: on the homepage's cloud ground the #f8f5ef
        // panel merged into the page and the band lost its edges. The darker
        // card stock is the same surface /mati stands on (Roheena, 5 Sep).
        style={{ backgroundColor: "#ebdcc2", color: "var(--ink)" }}
      >
        <div className="grid gap-0 lg:grid-cols-[1fr_1.1fr]">
          <div className="flex flex-col justify-center p-8 text-center lg:p-14">
            <span
              className="caps text-[0.62rem]"
              style={{ letterSpacing: "0.28em", color: "var(--dhool)" }}
            >
              {kicker}
            </span>

            {/* The name is a wordmark, not a headline: wide tracking, light
                weight, and a hairline under it — the way the book sets it on
                its title page. Tracking this wide only works at display size,
                so the clamp floor stays high. */}
            <h2
              id="launch-teaser-heading"
              className="mt-5 font-light leading-[1.1]"
              style={{
                fontFamily: "var(--font-teaser), Georgia, serif",
                fontSize: "clamp(2.4rem,5vw,3.6rem)",
                letterSpacing: "0.16em",
                // Wide tracking adds a trailing space after the last letter;
                // without this the centred wordmark sits visibly left.
                textIndent: "0.16em",
              }}
            >
              {title}
            </h2>

            <span
              aria-hidden
              className="mx-auto mt-6 block h-px w-16"
              style={{ backgroundColor: "color-mix(in srgb, var(--dhool) 40%, transparent)" }}
            />

            <p
              className="mx-auto mt-6 max-w-md text-[1.15rem] leading-relaxed"
              style={{
                fontFamily: "var(--font-teaser), Georgia, serif",
                color: "color-mix(in srgb, var(--ink) 82%, var(--dhool))",
              }}
            >
              {blurb}
            </p>

            <div className="mt-9 flex items-baseline justify-center gap-3">
              <span
                className="text-[1.5rem]"
                style={{ fontFamily: "var(--font-teaser), Georgia, serif", color: "var(--sindoor)" }}
              >
                {launchDateLabel(launch)}
              </span>
              {/* The countdown is words, never a ticking clock — a clock
                  counting down in seconds belongs to a flash sale. */}
              <span
                className="caps rounded-full px-3 py-1 text-[0.6rem]"
                style={{
                  border: "1px solid color-mix(in srgb, var(--dhool) 35%, transparent)",
                  letterSpacing: "0.22em",
                  color: "var(--dhool)",
                }}
              >
                {countdownLabel(launch, now)}
              </span>
            </div>
          </div>

          {/* One plate under smoke, not three crops in a row.
              Three legible crops were a product row wearing a teaser's
              clothes: between them they handed over the palette, the motif and
              the range a week before the collection could be bought. One
              veiled plate withholds all three and asks a question instead.
              A single image also means the lens never crosses a seam, which
              would read as a rendering fault rather than as glass. */}
          <LaunchTeaserPlate src={images[0].image} alt={images[0].alt} />
        </div>
      </div>
    </section>
  );
}
