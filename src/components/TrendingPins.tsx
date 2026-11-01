import Link from "next/link";
import Image from "@/components/SiteImage";
import { MarketMoney } from "@/components/MarketMoney";
import { TrendingConfigureLink } from "@/components/TrendingConfigureLink";
import { configureHref, type TrendingCard } from "@/lib/trending-pins";

/**
 * The Trending pins block (src/lib/trending-pins.ts): up to two designs, each
 * a room render in a 4:3 frame beside its name, its Soft Matte rate and ONE
 * primary action — "Configure now" — that opens the wall builder directly.
 *
 * Renders only the block; the caller wraps it in its own section (the
 * homepage's container, a collection page's grid column) and spreads the
 * row stamp (`attrs`) the live verifier reads. Every picture is bottom-
 * anchored so a crop comes off the ceiling, never the floor (homepage rule 8).
 */
export function TrendingPins({
  cards,
  placement,
  attrs,
  heading = "Two designs people keep coming back to",
  kicker = "Trending this week",
}: {
  cards: TrendingCard[];
  /** Where the block is shown: "home" or the collection handle. */
  placement: string;
  /** `rowAttrs(...)` from the homepage, or nothing elsewhere. */
  attrs?: Record<string, string>;
  heading?: string;
  kicker?: string;
}) {
  if (!cards.length) return null;
  return (
    <div>
      <div className="mb-6">
        <p className="caps text-mist">{kicker}</p>
        <h2 className="mt-2 text-2xl lg:text-3xl">{heading}</h2>
        <p className="mt-2 max-w-md text-sm text-slate">
          Measure your wall, see it in place and add it to your cart in one go.
        </p>
      </div>
      <div {...attrs} className={`grid gap-4 ${cards.length > 1 ? "md:grid-cols-2" : ""}`}>
        {cards.map((p) => {
          const href = configureHref(p.handle, p.pinMaterial?.slug ?? null);
          const rate = p.pinMaterial?.rate ?? p.fromPricePerSqft;
          return (
            <article
              key={p.handle}
              data-trending-pin={p.handle}
              className="flex flex-col gap-4 rounded-[22px] bg-wash p-3 sm:flex-row sm:items-center sm:p-4"
            >
              <TrendingConfigureLink
                href={href}
                handle={p.handle}
                placement={placement}
                ariaLabel={`Configure ${p.title}`}
                className="zoomer relative block aspect-[4/3] w-full shrink-0 overflow-hidden rounded-[18px] bg-surface sm:w-[46%]"
              >
                {p.image && (
                  <Image
                    src={p.image}
                    alt={p.imageAlt}
                    fill
                    sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, 30vw"
                    className="object-cover object-bottom"
                  />
                )}
              </TrendingConfigureLink>
              <div className="flex min-w-0 flex-1 flex-col px-1 pb-1 sm:px-0 sm:pb-0">
                <span className="caps self-start rounded-full bg-lavender px-3 py-1 text-[0.62rem] text-charcoal">
                  Trending now
                </span>
                <h3 className="mt-3 font-display text-[1.15rem] font-semibold leading-snug">{p.title}</h3>
                {/* The rate is the design's own for the pinned finish, read from
                    the catalogue; the finish is named so the shopper knows what
                    the one tap chooses for them. */}
                {rate != null && (
                  <p className="mt-1 text-sm text-slate">
                    From <MarketMoney inr={rate} />/sq ft
                    {p.pinMaterial ? <> &middot; {p.pinMaterial.name}</> : null}
                  </p>
                )}
                <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
                  <TrendingConfigureLink
                    href={href}
                    handle={p.handle}
                    placement={placement}
                    className="btn min-h-11 px-6 text-[0.8rem]"
                  >
                    Configure now
                  </TrendingConfigureLink>
                  <Link
                    href={`/products/${p.handle}`}
                    className="text-sm font-semibold text-charcoal underline-offset-4 hover:underline"
                  >
                    View design
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
