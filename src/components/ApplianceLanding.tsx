import Link from "next/link";
import Image from "@/components/SiteImage";
import { WrapStudio, type StudioVariant } from "@/components/WrapStudio";
import { formatINR } from "@/lib/pricing";
import {
  formatFitLabel,
  formatSizeLabel,
  formatPrice,
  fromWrapPrice,
  type WrapFormat,
} from "@/lib/wraps";
import { APPLIANCES, wrapCollectionPath, type ApplianceKey } from "@/lib/appliances";
import { WrapsSubnav } from "@/components/WrapsSubnav";
import type { WrapCardData } from "@/lib/wrap-queries";
import type { FridgeHeroScene } from "@/app/fridge-wraps/_lib/scenes";

/**
 * The landing page every appliance but the fridge is built from.
 *
 * WHY THE FRIDGE IS NOT ON THIS TEMPLATE. It has three things none of the others
 * has — a fit finder driven by a real model database, a size guide for a fleet
 * whose door sizes genuinely vary, and made-to-measure — and it is the only page
 * of the five that is already a live, indexed URL. Forcing it through a shared
 * shell would mean either a template carrying three features that render on one
 * appliance, or losing those features to symmetry. The other four have the same
 * shape as each other, and that shape is this file.
 *
 * The page is deliberately query-driven end to end: the ladder, the mockups, the
 * fit table and the aesthetic rows all come from wrap_formats,
 * product_appliances and collections. Nothing about a specific appliance is
 * written here, which is what makes a sixth appliance a data change.
 */

export type ApplianceLandingProps = {
  /**
   * The appliance the studio and the mockups are drawn for.
   *
   * NOT necessarily the only appliance the page sells: the washing-machine page
   * fronts both load types and leads with whichever has designs.
   */
  appliance: ApplianceKey;
  /**
   * Every format this PAGE sells, which may span more than one appliance.
   *
   * Deliberately not re-filtered to `appliance` here. It was at first, and the
   * effect was that the washing-machine page silently dropped every front-load
   * format: a customer who owns a front-loader landed on the page the search
   * result promised them and found only top-load panels and a "from" price
   * ₹1,000 above the cheapest thing actually behind the link.
   */
  formats: WrapFormat[];
  /** Designs sold on this appliance, carrying this appliance's authored flats. */
  designs: WrapCardData[];
  /** Aesthetic rows with at least one design on this appliance. */
  rows: { handle: string; title: string; key: string }[];
  /** Art-directed mood images for this appliance. May be empty. */
  heroScenes: FridgeHeroScene[];
  /** The headline. Written per appliance — the argument differs. */
  headline: string;
  /** One paragraph under it. */
  intro: string;
  /** The one sentence that answers "which one do I need?". */
  fitNote: string;
  /**
   * Body styles of the same appliance the studio should let the visitor switch
   * between — the washing machine's front and top load. Omitted everywhere
   * else, where there is only one body to draw.
   */
  studioVariants?: StudioVariant[];
};

export function ApplianceLanding({
  appliance,
  formats,
  designs,
  rows,
  heroScenes,
  headline,
  intro,
  fitNote,
  studioVariants,
}: ApplianceLandingProps) {
  const cfg = APPLIANCES[appliance];
  // Everything the page sells, across every appliance it fronts.
  const standard = formats.filter((f) => f.active && !f.isMadeToMeasure);
  const from = fromWrapPrice(standard);
  // The studio and the mockups draw ONE appliance — a shared canvas across two
  // would size a front-loader against a 1.9 m three-panel wrap.
  const studioFormats = standard.filter((f) => f.appliance === appliance);
  // Grouped for the fit table, so a page fronting two load types says which rows
  // are which instead of running eight formats together under one heading.
  const groups = [...new Set(standard.map((f) => f.appliance))].map((key) => ({
    key,
    label: APPLIANCES[key].label,
    rows: standard.filter((f) => f.appliance === key),
  }));
  const [hero, ...restScenes] = heroScenes;

  // Every link into the family listing is gated on there being something there:
  // an empty collection page 404s (populated_collection_tags hides unpopulated
  // rows), so a link to one is a link to a dead end.
  const listingLive = designs.length > 0;

  return (
    <div className="bg-surface">
      <WrapsSubnav current={cfg.pickerGroup} />

      {/* ---- hero ---- */}
      {hero ? (
        <section className="relative">
          <Image
            src={hero.url}
            alt={hero.title}
            width={1672}
            height={941}
            priority
            // Capped at the master's own width — see 0100. Bare 100vw asks for a
            // 3840 copy of a 1920 file on a wide screen.
            sizes="(min-width: 1920px) 1920px, 100vw"
            className="h-auto w-full"
          />
          <div className="pointer-events-none absolute inset-0 hidden bg-gradient-to-r from-charcoal/80 via-charcoal/40 to-transparent lg:block" />
          <div className="container-x relative hidden lg:absolute lg:inset-0 lg:flex lg:flex-col lg:justify-center">
            <div className="pointer-events-auto max-w-2xl text-surface">
              <h1 className="text-[clamp(2.4rem,6vw,4.4rem)] font-light leading-[1.02] tracking-tight">
                {headline}
              </h1>
              <p className="mt-5 max-w-[46ch] text-[clamp(1rem,1.4vw,1.2rem)] leading-relaxed text-surface/90">
                {intro}
              </p>
              {from != null && (
                <p className="mt-5 text-sm text-surface/75">From {formatINR(from)}, GST included.</p>
              )}
            </div>
          </div>
          <div className="container-x py-14 text-charcoal lg:hidden">
            <h1 className="text-[clamp(2.2rem,8vw,3rem)] font-light leading-[1.05] tracking-tight">
              {headline}
            </h1>
            <p className="mt-5 text-slate">{intro}</p>
            {from != null && (
              <p className="mt-4 text-sm text-mist">From {formatINR(from)}, GST included.</p>
            )}
          </div>
        </section>
      ) : (
        // No photograph yet. Type on a warm ground at full confidence, with the
        // ladder set as an index list — which is a real answer to "what is this
        // and what does it cost", not a placeholder pretending to be a hero.
        <section className="bg-[#F1E9DC]">
          <div className="container-x py-20 text-charcoal lg:py-28">
            <h1 className="text-[clamp(2.4rem,7vw,4.4rem)] font-light leading-[1.02] tracking-tight">
              {headline}
            </h1>
            <p className="mt-6 max-w-[52ch] text-[clamp(1rem,1.5vw,1.2rem)] leading-relaxed">
              {intro}
            </p>
            {standard.length > 0 && (
              <ol className="mt-9 max-w-md space-y-2 text-sm">
                {standard.map((f) => (
                  <li key={f.code} className="flex items-baseline justify-between gap-4 border-b border-charcoal/10 pb-2">
                    <span>{formatFitLabel(f)}</span>
                    <span className="font-semibold">{formatINR(formatPrice(f))}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      )}

      {/* ---- the studio: the pitch ----
          Straight under the hero, because clicking a design and watching the
          appliance change is the argument. Everything below it is detail for
          someone already interested. */}
      {designs.length > 0 && studioFormats.length > 0 && (
        <WrapStudio
          designs={designs}
          formats={studioFormats}
          appliance={appliance}
          variants={studioVariants}
        />
      )}

      {/* ---- which one fits ----
          A table rather than a wizard. These appliances go by tonnage or load
          size, which the customer already knows without looking anything up —
          only the fridge needed a model database, and only the fridge has one. */}
      {standard.length > 0 && (
        <section className="border-y border-edge bg-wash">
          <div className="container-x py-16">
            <div className="max-w-2xl">
              <span className="caps text-slate">Which one you need</span>
              <h2 className="mt-3 text-[clamp(1.6rem,3vw,2.3rem)] leading-tight">{fitNote}</h2>
              <p className="mt-4 text-sm text-slate">
                Every panel ships deliberately oversize and is trimmed against your own{" "}
                {cfg.surfaceNoun} edge on arrival — so the {cfg.surfaceNoun} itself is the ruler,
                which is far more forgiving than cutting to a measurement.
              </p>
            </div>

            <div className="mt-8 overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-edge text-mist">
                    <th className="py-2 pr-4 font-medium">Fits</th>
                    <th className="py-2 pr-4 font-medium">Panels</th>
                    <th className="py-2 font-medium">Price</th>
                  </tr>
                </thead>
                {groups.map((g) => (
                  <tbody key={g.key}>
                    {/* Only labelled when the page fronts more than one
                        appliance: a heading over the only group would be
                        repeating the page's own title back at the reader. */}
                    {groups.length > 1 && (
                      <tr>
                        <th
                          colSpan={3}
                          className="pt-5 pb-1 text-left text-xs font-semibold uppercase tracking-wide text-slate"
                        >
                          {g.label}
                        </th>
                      </tr>
                    )}
                    {g.rows.map((f) => (
                      <tr key={f.code} className="border-b border-edge/60">
                        <td className="py-3 pr-4 font-semibold text-charcoal">{formatFitLabel(f)}</td>
                        <td className="py-3 pr-4 text-slate">{formatSizeLabel(f)}</td>
                        <td className="py-3 font-semibold text-charcoal">
                          {formatINR(formatPrice(f))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          </div>
        </section>
      )}

      {/* ---- the aesthetic rows ---- */}
      {rows.length > 0 && listingLive && (
        <section className="container-x py-16">
          <span className="caps text-slate">Browse by look</span>
          <div className="mt-5 flex flex-wrap gap-2">
            {/* The look, narrowed to THIS appliance. The row collections span
                the whole range (fridge-florals is every wrap tagged Florals,
                the handle is legacy), so from the AC page "Florals" used to
                open a listing whose designs were mostly for other machines.
                Same look, this appliance's panels. */}
            {rows.map((r) => (
              <Link
                key={r.handle}
                href={wrapCollectionPath(cfg.collectionHandle, r.key)}
                className="rounded-full border border-edge bg-surface px-4 py-2 text-sm transition-colors hover:border-charcoal"
              >
                {r.title}
              </Link>
            ))}
            <Link
              href={wrapCollectionPath(cfg.collectionHandle)}
              className="rounded-full border border-charcoal bg-charcoal px-4 py-2 text-sm text-surface"
            >
              Everything for {cfg.pickerGroupLabel.toLowerCase()}
            </Link>
          </div>
        </section>
      )}

      {/* ---- how it works ---- */}
      <section className="border-t border-edge">
        <div className="container-x py-16">
          <span className="caps text-slate">How it works</span>
          <div className="mt-6 grid gap-8 sm:grid-cols-3">
            <div>
              <p className="font-display text-2xl text-mist">01</p>
              <p className="mt-2 font-semibold text-charcoal">Pick the size</p>
              <p className="mt-2 text-sm text-slate">{fitNote}</p>
            </div>
            <div>
              <p className="font-display text-2xl text-mist">02</p>
              <p className="mt-2 font-semibold text-charcoal">Pick the design</p>
              <p className="mt-2 text-sm text-slate">
                Every design is drawn for {cfg.possessiveNoun} at its own proportions — not a
                wallpaper cropped down to fit.
              </p>
            </div>
            <div>
              <p className="font-display text-2xl text-mist">03</p>
              <p className="mt-2 font-semibold text-charcoal">Put it on</p>
              <p className="mt-2 text-sm text-slate">{cfg.supplyCopy}</p>
            </div>
          </div>
        </div>
      </section>

      {restScenes.length > 0 && (
        <section className="container-x pb-16">
          <div className="grid gap-6 sm:grid-cols-2">
            {restScenes.map((s) => (
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
        <p className="text-sm text-mist">
          <Link href="/wraps" className="underline underline-offset-4">
            The whole wrap range
          </Link>{" "}
          — fridge, air conditioner, washing machine, dishwasher and dryer.
        </p>
      </section>
    </div>
  );
}
