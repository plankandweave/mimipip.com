
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "@/components/SiteImage";
import { getWrapFormats } from "@/lib/wrap-queries";
import { fromWrapPrice } from "@/lib/wraps";
import { formatINR } from "@/lib/pricing";
import { APPLIANCE_KEYS, APPLIANCES, type ApplianceKey } from "@/lib/appliances";
import { getFridgeHeroScenes } from "../fridge-wraps/_lib/scenes";

/**
 * The hub at the root of wraps.zyvorah.com (routed there by the host rewrite in
 * src/edge/gate.ts — this path is not linked from the main site).
 *
 * Photograph-led, not type-led. An earlier version set the word "Wraps." on
 * white with the picture below the fold, and it read as an unfinished page
 * rather than a restrained one: the whole argument of this product is visual,
 * so the picture has to arrive first and the type has to sit inside it.
 *
 * No wordmark above the heading. The host is wraps.zyvorah.com and the site
 * header already carries Zyvorah — printing it a third time is throat-clearing.
 *
 * It now has a second job. When the range was fridges alone this was a holding
 * page with one link; it is the entrance to five appliances, so it has to say
 * which they are and what each starts at. The appliance tiles are built from the
 * format ladder rather than written out, so an appliance whose prices are not
 * seeded shows no price instead of a wrong one — and a sixth appliance appears
 * here the day its formats land, with no edit to this file.
 */

export const metadata: Metadata = brandMetadata({
  // The tab title is the one line a visitor keeps while they browse other
  // pages. "Coming soon" told them nothing about what the range IS — that
  // caveat belongs in the body copy below, where it is still said plainly.
  title: "Zyvorah Wraps — printed panels for the fridge, AC, washing machine, dishwasher & dryer",
  description:
    "Printed matte panels for the fridge, air conditioner, washing machine, dishwasher and dryer — cut to the formats sold in India and trimmed to your own edge. Opening soon from Zyvorah.",
  robots: { index: false, follow: false },
});

export const revalidate = 3600;

/** Both washers share a landing page, so the tiles are per PAGE, not per row. */
function applianceTiles(formats: Awaited<ReturnType<typeof getWrapFormats>>) {
  const seen = new Set<string>();
  const tiles: { key: ApplianceKey; title: string; href: string; from: number | null }[] = [];
  for (const key of APPLIANCE_KEYS) {
    const cfg = APPLIANCES[key];
    if (seen.has(cfg.landingPath)) continue;
    seen.add(cfg.landingPath);
    // The washing-machine tile quotes across BOTH load types, because that is
    // what its page sells — a "from" that ignored front-loaders would be higher
    // than the cheapest thing behind the link.
    const group = formats.filter((f) => APPLIANCES[f.appliance]?.landingPath === cfg.landingPath);
    tiles.push({
      key,
      title: cfg.pickerGroupLabel,
      href: cfg.landingPath,
      from: fromWrapPrice(group),
    });
  }
  return tiles;
}

export default async function WrapsHubPage() {
  // Both are allowed to be empty. Before the first photograph exists the page
  // falls back to type on a warm ground, and before the ladder is seeded it
  // simply doesn't quote a price — neither is an error worth rendering as one.
  const [formats, heroScenes] = await Promise.all([
    getWrapFormats().catch(() => []),
    getFridgeHeroScenes(3).catch(() => []),
  ]);

  const from = fromWrapPrice(formats);
  const tiles = applianceTiles(formats);
  const [hero, ...rest] = heroScenes;

  const headline = (
    <>
      <h1 className="text-[clamp(3rem,9vw,7rem)] font-light leading-[0.95] tracking-tight">Wraps.</h1>
      <p className="mt-6 max-w-[46ch] text-[clamp(1.05rem,1.5vw,1.3rem)] leading-relaxed">
        The largest surfaces in an Indian kitchen are white, and almost nobody chose them. We print
        matte panels for the fridge, the air conditioner, the washing machine, the dishwasher and
        the dryer — cut to the formats actually sold here, trimmed to your own edge, removable, no
        residue.
      </p>
    </>
  );

  const cta = (dark: boolean) => (
    <div className="mt-8 flex flex-wrap items-center gap-3">
      <Link
        href="/fridge-wraps"
        className={dark ? "btn border-surface bg-surface text-charcoal hover:bg-surface/90" : "btn btn-primary"}
      >
        Look around early
      </Link>
      <Link
        href="/fridge-wraps/fit-finder"
        className={
          dark
            ? "btn border-surface/45 bg-transparent text-surface hover:bg-surface hover:text-charcoal"
            : "btn btn-ghost"
        }
      >
        Find my fridge&rsquo;s format
      </Link>
    </div>
  );

  return (
    <div className="bg-surface">
      {hero ? (
        <section className="relative">
          {/* The image keeps its own proportions — no cover crop. The scene's
              argument is that you can see a fridge, a washing machine, a
              dishwasher and the air conditioner all wrapped, and a crop on a
              tall screen would throw half of that away. */}
          <Image
            src={hero.url}
            alt={hero.title}
            width={1672}
            height={941}
            priority
            sizes="(min-width: 1920px) 1920px, 100vw"
            className="h-auto w-full"
          />
          {/* Type sits INSIDE the picture from lg up, where there is room for
              it. Below that it follows in normal flow — overlaying a headline
              on a 16:9 photograph on a phone makes both unreadable. */}
          <div className="pointer-events-none absolute inset-0 hidden bg-gradient-to-r from-charcoal/80 via-charcoal/40 to-transparent lg:block" />
          <div className="container-x relative hidden lg:absolute lg:inset-0 lg:flex lg:flex-col lg:justify-center">
            <div className="pointer-events-auto max-w-2xl text-surface">
              {headline}
              <p className="mt-6 max-w-[42ch] text-sm text-surface/75">
                Opening shortly{from != null ? <>, from {formatINR(from)} a panel</> : null}. The
                previewer and the fit finder are already live if you would like a look before we
                announce it.
              </p>
              {cta(true)}
            </div>
          </div>

          {/* the same content, in flow, for narrow screens */}
          <div className="container-x py-14 text-charcoal lg:hidden">
            {headline}
            <p className="mt-6 text-sm text-mist">
              Opening shortly{from != null ? <>, from {formatINR(from)} a panel</> : null}. The
              previewer and the fit finder are already live.
            </p>
            {cta(false)}
          </div>
        </section>
      ) : (
        // No photograph yet: type on a warm ground, at full confidence.
        <section className="bg-[#F1E9DC]">
          <div className="container-x py-24 text-charcoal lg:py-32">
            {headline}
            {cta(false)}
          </div>
        </section>
      )}

      {/* What the range covers. Plain links rather than illustrated cards: the
          appliance mockups live on each landing page where they can be clicked
          through, and a grid of five static drawings here would be five images
          that answer nothing. */}
      <section className="container-x py-16">
        <p className="caps text-slate">The range</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              // A white card with a hairline edge on a near-white page was very
              // nearly invisible — the five tiles ARE the navigation of this
              // hub, so they are given a filled ground to sit on.
              className="group flex items-baseline justify-between gap-4 rounded-[18px] border border-edge bg-wash px-5 py-5 transition-all hover:border-charcoal hover:bg-surface hover:shadow-sm"
            >
              <span>
                <span className="block text-xl font-semibold text-charcoal">{t.title}</span>
                <span className="mt-1 block text-xs text-mist">
                  {APPLIANCES[t.key].surfaceNoun === "body"
                    ? "Front and both sides"
                    : `The ${APPLIANCES[t.key].surfaceNoun}`}
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold text-slate group-hover:text-charcoal">
                {t.from != null ? `from ${formatINR(t.from)}` : "soon"}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {rest.length > 0 && (
        <section className="container-x pb-16">
          <div className="grid gap-6 sm:grid-cols-2">
            {rest.map((s) => (
              <figure key={s.slug} className="m-0">
                <Image
                  src={s.url}
                  alt={s.title}
                  width={1672}
                  height={941}
                  sizes="(min-width: 640px) 50vw, 100vw"
                  className="h-auto w-full rounded-[18px]"
                />
                <figcaption className="mt-3 text-sm text-mist">{s.title}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <section className="container-x pb-20">
        <p className="text-xs text-mist">
          <Link href="/" className="underline underline-offset-4">
            zyvorah.com
          </Link>{" "}
          — wallpaper, borders and canvas, sized to your wall.
        </p>
      </section>
    </div>
  );
}
