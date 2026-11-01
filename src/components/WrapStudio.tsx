"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "@/components/SiteImage";
import { WrapMockup } from "@/components/WrapMockup";
import { WRAP_COLLECTIONS } from "@/lib/wrap-collections";
import { formatFitLabel, formatSizeLabel, type WrapFormat } from "@/lib/wraps";
import { mockupFrame } from "@/lib/wrap-mockups";
import { APPLIANCES, wrapDesignPath, type ApplianceKey } from "@/lib/appliances";
import { formatINR } from "@/lib/pricing";
import type { WrapCardData } from "@/lib/wrap-queries";
import { MiniExclusiveBadge } from "@/components/MiniExclusiveBadge";

/**
 * The studio: pick your appliance's shape, pick a design, see it immediately.
 *
 * This is the one interaction the line lives or dies on. Someone arriving does
 * not want to read about removable film — they want to click a pattern and
 * watch their appliance change. So the appliance is always on screen, every
 * design is one click away, and nothing here navigates or waits on a network
 * round trip: the artwork is already loaded and the chassis is drawn from
 * geometry.
 *
 * ONE APPLIANCE PER INSTANCE. Each landing page mounts its own — the fridge page
 * shows fridges, the AC page shows air conditioners. An appliance switcher here
 * would compete with the format chips for the same click and turn the one
 * interaction that has to be effortless into two decisions.
 *
 * There is deliberately NO material or finish control. Wraps are printed on one
 * film and the customer never chooses it, so offering the choice would invent a
 * decision and then make them make it. Style, design, format — that is all.
 */

const COLLECTION_OF = new Map(WRAP_COLLECTIONS.map((c) => [c.key, c]));

/**
 * Formats that exist mainly to carry an exclusive row (Mini Fridge Exclusives
 * is {E}). The studio does not OPEN on one: the ladder is ordered by price, so
 * its first rung is the mini/bar fridge — the smallest and rarest thing in the
 * range, and the one format whose exclusive designs are on show. Landing there
 * would misrepresent the range before the customer has touched anything.
 */
const EXCLUSIVE_CODES = new Set(WRAP_COLLECTIONS.flatMap((c) => c.formatCodes ?? []));

/** The aesthetic row a design belongs to, for the readout. */
function collectionLabel(tags: string[] | undefined): string | null {
  for (const t of tags ?? []) {
    const hit = COLLECTION_OF.get(t);
    if (hit) return hit.label;
  }
  return null;
}

/** One selectable body style within a single appliance page. */
export type StudioVariant = {
  appliance: ApplianceKey;
  formats: WrapFormat[];
  designs: WrapCardData[];
};

export function WrapStudio({
  designs,
  formats,
  appliance,
  heading,
  variants,
}: {
  designs: WrapCardData[];
  /** wrap_formats for THIS appliance, already filtered to the active ones. */
  formats: WrapFormat[];
  appliance: ApplianceKey;
  heading?: string;
  /**
   * Body styles of the SAME appliance, when a page fronts more than one.
   *
   * This is not the appliance switcher the comment above rules out — it stays
   * within one machine. The washing-machine page needs it: it leads with the
   * top-loader, so a front-loader owner arrived at a page promising "from
   * ₹1,000", found only the ₹2,000 and ₹2,500 three-side wraps in the studio,
   * and could reach their own ₹1,000 panel nowhere but a static table further
   * down.
   */
  variants?: StudioVariant[];
}) {
  const options: StudioVariant[] =
    variants && variants.length > 1 ? variants : [{ appliance, formats, designs }];
  const [activeKey, setActiveKey] = useState<ApplianceKey>(options[0].appliance);
  const active = options.find((v) => v.appliance === activeKey) ?? options[0];

  const cfg = APPLIANCES[active.appliance];
  const usable = active.designs.filter((d) => d.image);
  // Standard formats only: made-to-measure has no fixed shape to draw, and
  // offering it here would ask for measurements before showing anything. Scoped
  // to this appliance, because format codes are global (0094) — without the
  // filter a fridge studio would offer dishwasher panels.
  const allStandard = active.formats.filter(
    (f) => f.appliance === active.appliance && !f.isMadeToMeasure && f.active,
  );

  const [handle, setHandle] = useState<string | null>(null);
  // Open on the format most people actually own, which is not the one that
  // heads the ladder. The fridge ladder reads largest first (0099), so opening
  // on its first rung would make the ₹3,300 side-by-side the first price a
  // visitor sees. The appliance names its own opener; failing that, the first
  // format not reserved for an exclusive row — never the mini, whose exclusive
  // designs would otherwise be on show before anything was touched.
  const [code, setCode] = useState(
    (allStandard.find((f) => f.code === cfg.openingFormatCode) ??
      allStandard.find((f) => !EXCLUSIVE_CODES.has(f.code)) ??
      allStandard[0])?.code ?? "",
  );

  if (!usable.length || !allStandard.length) return null;
  // One canvas for this appliance's ladder, so the floor line holds still as the
  // chips are clicked and a mini fridge stays visibly smaller than a
  // side-by-side. Per appliance, deliberately — see mockupFrame().
  const frame = mockupFrame(allStandard);
  // THE FORMAT LEADS, and the design line follows it.
  //
  // A design sold at one format only (Mini Fridge Exclusives) must not be
  // offered against any other — showing a mini-only comic design while the
  // customer has "double door" selected advertises a panel we will refuse to
  // sell them. So the fridge choice narrows the designs, never the reverse: an
  // earlier version had it backwards and filtered the format pills by the
  // selected design, which left every mini design visible on every fridge.
  const format = allStandard.find((f) => f.code === code) ?? allStandard[0];
  const sellsAt = (d: WrapCardData) =>
    !d.wrapFormatCodes?.length || d.wrapFormatCodes.includes(format.code);
  const shown = usable.filter(sellsAt);
  // The selection survives a format change only if it is still sold there;
  // otherwise fall back rather than leave a chip highlighted that has just
  // vanished from the grid.
  const design = shown.find((d) => d.handle === handle) ?? shown[0] ?? usable[0];
  const collection = collectionLabel(design.tags);
  const exclusive = !!design.wrapFormatCodes?.length;
  const gridCols =
    cfg.flatAspect >= 1.8
      ? "grid-cols-1 sm:grid-cols-2"
      : cfg.flatAspect >= 0.9
        ? "grid-cols-2 sm:grid-cols-3"
        : "grid-cols-3 sm:grid-cols-4 xl:grid-cols-5";

  return (
    <section className="container-x py-16">
      <div className="mx-auto max-w-2xl text-center">
        <span className="caps text-slate">The studio</span>
        <h2 className="mt-3 text-[clamp(1.8rem,3.4vw,2.6rem)] leading-tight">
          {heading ?? `Pick your ${cfg.altNoun}. Pick a design. That is the whole thing.`}
        </h2>
      </div>

      <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:items-start">
        {/* the appliance — sticky on desktop so the chips scroll against it */}
        <div className="lg:sticky lg:top-24">
          <div className="rounded-[26px] bg-wash p-8">
            <WrapMockup
              key={`${design.handle}-${format.code}`}
              designUrl={design.image!}
              designAlt={design.title}
              formats={allStandard}
              formatCode={format.code}
              frame={frame}
              // The stage takes the appliance's own proportions and caps its
              // height, so a wide air conditioner gets a wide shallow stage
              // instead of floating in a tall one — and a tall fridge stops
              // before it pushes the design grid off the screen. Every format of
              // one appliance shares a canvas, so they still scale by the same
              // factor: the floor line holds and a mini fridge stays visibly
              // smaller than a side-by-side.
              stageMaxHeight={460}
              className="mx-auto"
            />
          </div>
          <div className="mt-5 text-center">
            <p className="text-xl font-semibold text-charcoal">{design.title}</p>
            {exclusive && (
              <p className="mt-2 flex justify-center">
                <MiniExclusiveBadge withLabel />
              </p>
            )}
            <p className="mt-1 text-sm text-slate">
              {collection ? `${collection} · ` : ""}
              {formatFitLabel(format)} · {formatSizeLabel(format)}
            </p>
            <p className="mt-3 text-2xl font-semibold text-charcoal">
              {format.priceInr != null ? formatINR(format.priceInr) : "Quoted on measurement"}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {/* The appliance travels with the click. Without it the product
                  page opens on its default — the fridge — and an AC shopper who
                  picked a tonnage here has to pick an appliance again. */}
              <Link
                href={wrapDesignPath(design.handle, active.appliance)}
                className="btn btn-primary"
              >
                Order this design
              </Link>
              <Link href={cfg.visualizerPath} className="btn btn-ghost">
                See it on {cfg.possessiveNoun}
              </Link>
            </div>
            <p className="mt-3 text-xs text-mist">
              An illustration drawn to the format&rsquo;s real proportions — not a photograph.
            </p>
          </div>
        </div>

        {/* the controls */}
        <div>
          {/* Load type first, because it changes what the format chips below
              even are: a top-loader is wrapped on three sides and a
              front-loader on one. */}
          {options.length > 1 && (
            <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Body style">
              {options.map((v) => {
                const vcfg = APPLIANCES[v.appliance];
                const on = v.appliance === active.appliance;
                const empty = !v.designs.some((d) => d.image) || !v.formats.length;
                return (
                  <button
                    key={v.appliance}
                    type="button"
                    aria-pressed={on}
                    disabled={empty}
                    title={empty ? "Designs for this one are still in the studio" : undefined}
                    onClick={() => {
                      setActiveKey(v.appliance);
                      // Re-open on the new body style's own default rather than
                      // keeping a code that belongs to the other one.
                      const next = v.formats.filter((f) => !f.isMadeToMeasure && f.active);
                      setCode(
                        (next.find((f) => f.code === vcfg.openingFormatCode) ??
                          next.find((f) => !EXCLUSIVE_CODES.has(f.code)) ??
                          next[0])?.code ?? "",
                      );
                      setHandle(null);
                    }}
                    className={`rounded-full border-2 px-4 py-2 text-sm font-semibold transition-colors ${
                      empty
                        ? "cursor-not-allowed border-edge bg-surface text-mist"
                        : on
                          ? "border-charcoal bg-charcoal text-surface"
                          : "border-edge bg-surface text-charcoal hover:border-charcoal"
                    }`}
                  >
                    {vcfg.loadTypeLabel ?? vcfg.label}
                  </button>
                );
              })}
            </div>
          )}
          <p className="caps text-slate">Your {cfg.label.toLowerCase()}</p>
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={`${cfg.label} format`}>
            {allStandard.map((f) => {
              const on = f.code === format.code;
              return (
                <button
                  key={f.code}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setCode(f.code)}
                  className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                    on
                      ? "border-charcoal bg-charcoal text-surface"
                      : "border-edge bg-surface text-charcoal hover:border-charcoal"
                  }`}
                >
                  {formatFitLabel(f)}
                  {f.priceInr != null && (
                    <span className={`ml-2 text-xs ${on ? "text-surface/70" : "text-mist"}`}>
                      {formatINR(f.priceInr)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {/* Fridge only: the fit finder reads a model database with rows for
              fridges alone. The other appliances go by tonnage or load size,
              asked directly on their own landing page. */}
          {cfg.supportsModelFinder && (
            <p className="mt-2 text-xs text-mist">
              Not sure which you have?{" "}
              <Link href="/fridge-wraps/fit-finder" className="underline underline-offset-4">
                Find it from your model number
              </Link>
              .
            </p>
          )}

          <p className="caps mt-10 text-slate">
            Your design — {shown.length} to try
          </p>
          {/* Column count follows the ARTWORK's shape, not a fixed grid.
              Five columns of a 2.7:1 AC panel are 41px tall at this width —
              legible as a colour and useless as a design, which is what the AC
              studio shipped looking like. A wide flat gets two columns and
              enough height to read the pattern; a 1:2 fridge door gets the
              dense grid it always had. */}
          <div className={`mt-3 grid gap-3 ${gridCols}`}>
            {shown.map((d) => {
              const on = d.handle === design.handle;
              return (
                <button
                  key={d.handle}
                  type="button"
                  aria-pressed={on}
                  title={d.title}
                  onClick={() => setHandle(d.handle)}
                  className={`group overflow-hidden rounded-[14px] border-2 text-left transition-transform hover:-translate-y-0.5 ${
                    on ? "border-charcoal" : "border-transparent"
                  }`}
                >
                  {/* The thumbnail is shown at the appliance's own authoring
                      aspect, so a 3:1 AC mural is not letterboxed into a
                      fridge-shaped tile. */}
                  <span
                    className="relative block w-full bg-wash"
                    style={{ aspectRatio: String(cfg.flatAspect) }}
                  >
                    <Image
                      src={d.image!}
                      alt={d.title}
                      fill
                      sizes="160px"
                      className="object-cover"
                    />
                    {/* Marked even here, where the grid is already filtered to
                        this format: it tells the customer WHY this design
                        disappears the moment they pick a bigger fridge. */}
                    {!!d.wrapFormatCodes?.length && <MiniExclusiveBadge />}
                  </span>
                  <span className="block truncate px-2 py-1.5 text-[0.72rem] font-medium text-charcoal">
                    {d.title}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
