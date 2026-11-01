"use client";

// Buy box for the Appliance Wraps family.
//
// Deliberately NOT an extension of ProductConfigurator — that component's
// 1400 lines are wall-measurement, crop-window and canvas-ladder logic that
// doesn't apply here. A wrap has no wall to measure and no area to type in: the
// FLEET supplies the size (wrap_formats, migrations 0087 and 0094), so this buy
// box asks only which appliance the customer owns and which shape it is. Format
// Z (made-to-measure, fridge only) is the one exception, and it needs the
// customer's own numbers — collected on its own page, not this ladder.
//
// THE APPLIANCE STEP APPEARS ONLY WHEN THERE IS A CHOICE. Most designs are sold
// on several appliances and get a picker; a design drawn as a 3:1 AC mural is
// sold on one and gets none, falling back to exactly the two-step buy box the
// fridge-only range shipped with. An appliance selector offering one option is a
// question with one answer, which reads as a mistake rather than as a choice.
//
// NO CART HERE. On the retired fridge-wraps branch this buy box could add a
// line once NEXT_PUBLIC_WRAPS_PURCHASABLE was set. In this app the cart reads
// the store's own catalogue and wrap designs live in the `wraps` schema, so a
// wrap cannot be a cart line at all (see lib/wrap-sales-gate.ts). The quantity
// step, add-to-cart and the ₹200 sample were removed rather than left behind a
// switch that would offer what the API cannot honour. Bring them back with the
// cart's wrap price-pinning, not before.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatINR } from "@/lib/pricing";
import {
  formatFitLabel,
  formatSizeLabel,
  formatPrice,
  formatSizeCm,
  isPlaceholderFormat,
  type WrapFormat,
} from "@/lib/wraps";
import { APPLIANCES, applianceGroups, type ApplianceKey } from "@/lib/appliances";
import { WRAPS_COMING_SOON_MESSAGE } from "@/lib/wrap-sales-gate";
import { RoomVisualizer } from "@/components/RoomVisualizer";
import { WrapMockup } from "@/components/WrapMockup";
import { mockupFrame } from "@/lib/wrap-mockups";

export function WrapConfigurator({
  productHandle,
  productTitle,
  offered,
  flats,
  fallbackImage,
  formats,
  allowedFormatCodes,
  initialAppliance,
}: {
  productHandle: string;
  productTitle: string;
  /** Appliances this design is sold on, in picker order (product_appliances). */
  offered: ApplianceKey[];
  /** The design's authored flat per appliance. A shared design carries one each,
   *  drawn at that appliance's own proportions — a 1:2 fridge composition shown
   *  on a 3:1 AC panel would be a picture of the wrong product. */
  flats: Partial<Record<ApplianceKey, { url: string; alt: string }>>;
  /** The product's canonical flat, for an appliance whose own flat is missing. */
  fallbackImage: { url: string; alt: string } | null;
  /** Every active row of wrap_formats, all appliances, fetched server-side. This
   *  component stays dumb about where the ladder comes from and never hardcodes
   *  a format price; see lib/wraps.ts. */
  formats: WrapFormat[];
  /** Formats this design is sold at. null/undefined = every standard format.
   *  A Mini Fridge Exclusive is composed for one door and must not be
   *  offered — or printed — at any other. */
  allowedFormatCodes?: string[] | null;
  /** Deep-link target, from ?appliance= on an appliance landing page. */
  initialAppliance?: ApplianceKey | null;
}) {
  const groups = useMemo(() => applianceGroups(offered), [offered]);

  const [appliance, setAppliance] = useState<ApplianceKey>(
    initialAppliance && offered.includes(initialAppliance) ? initialAppliance : offered[0],
  );

  const allowed = useMemo(
    () => (allowedFormatCodes?.length ? new Set(allowedFormatCodes) : null),
    [allowedFormatCodes],
  );

  // The chosen appliance's ladder. Formats are global (0094), so filtering by
  // appliance is what keeps a dishwasher's price off a fridge's buy box.
  const applianceFormats = useMemo(
    () => formats.filter((f) => f.appliance === appliance && f.active),
    [formats, appliance],
  );

  // Format Z is never bought from this ladder — it has no stored price and
  // needs measurements the buy box doesn't collect. It still gets a card, but
  // the card links out instead of pricing inline.
  const standard = useMemo(
    () => applianceFormats.filter((f) => !f.isMadeToMeasure && (!allowed || allowed.has(f.code))),
    [applianceFormats, allowed],
  );

  // Made-to-measure is any size at all, which is exactly what a design composed
  // for one door cannot be — so a restricted design does not offer it. Nor does
  // an appliance without it: it exists for fridges alone, because it needs a
  // measuring guide the customer can follow and a desk that can quote from it.
  const madeToMeasure =
    allowed || !APPLIANCES[appliance].supportsMadeToMeasure
      ? null
      : (applianceFormats.find((f) => f.isMadeToMeasure) ?? null);

  // The chosen format is DERIVED, not synchronised. Switching appliance
  // invalidates the code — 'B' is a fridge's double door and means nothing on a
  // dishwasher — and an effect that reset it on every appliance change was both
  // a cascading render and a bug waiting to happen: for one render the price
  // shown belonged to a format the new ladder did not contain. Falling back to
  // the first format of whatever ladder is current cannot get out of step,
  // because there is no second copy of the answer to get out of step with.
  const [code, setCode] = useState<string>("");
  const selected = standard.find((f) => f.code === code) ?? standard[0] ?? null;
  const [visualizerOpen, setVisualizerOpen] = useState(false);
  // The design as authored for THIS appliance, falling back to the canonical
  // flat so a design mid-upload still previews rather than rendering an empty box.
  const image = flats[appliance] ?? fallbackImage;

  const cfg = APPLIANCES[appliance];

  // One canvas per appliance, so the floor line holds still as the format chips
  // are clicked. Computed from this appliance's ladder alone — see mockupFrame.
  const frame = useMemo(() => mockupFrame(applianceFormats), [applianceFormats]);

  // The visualiser needs a physical size to scale the design against the
  // customer's photo. Use whichever format is selected; before a choice is
  // made, the first of the ladder is the honest stand-in.
  const previewSize = formatSizeCm(selected ?? standard[0] ?? applianceFormats[0] ?? formats[0]);

  // Same contract for the gallery's "See it on your fridge" pill. Without this
  // listener the pill renders (the category allows a visualiser) and does
  // nothing when pressed.
  useEffect(() => {
    const open = () => setVisualizerOpen(true);
    window.addEventListener("zyv:open-visualizer", open);
    return () => window.removeEventListener("zyv:open-visualizer", open);
  }, []);

  // Both washers share a picker group, so choosing "Washing machine" leaves a
  // second question: front load or top load. Only that group has one today.
  const chooseAppliance = (next: ApplianceKey) => setAppliance(next);

  const activeGroup = groups.find((g) => g.members.some((m) => m.key === appliance));
  const loadTypes = activeGroup && activeGroup.members.length > 1 ? activeGroup.members : null;

  const showAppliancePicker = groups.length > 1 || !!loadTypes;
  const stepNo = showAppliancePicker ? { format: 2, next: 3 } : { format: 1, next: 2 };

  return (
    <div className="rounded-[22px] bg-wash p-6">
      {/* The design on the appliance and format actually selected, redrawn as
          the choice changes. This is the answer to "what will it look like" —
          the photo visualiser below answers the different question of how it
          sits in their own kitchen, and shouldn't be the only way to see
          anything. */}
      {image && (
        <div className="mb-6">
          <WrapMockup
            designUrl={image.url}
            designAlt={productTitle}
            formats={applianceFormats}
            formatCode={selected?.code ?? madeToMeasure?.code ?? standard[0]?.code}
            frame={frame}
            stageMaxHeight={300}
            className="mx-auto"
          />
          <p className="mt-2 text-center text-xs text-mist">
            {selected ? `Shown on a ${selected.label.toLowerCase()}` : `Shown on a ${cfg.label.toLowerCase()}`} ·
            an illustration, not a photograph
          </p>
          <div className="mt-3 text-center">
            <button onClick={() => setVisualizerOpen(true)} className="text-xs underline underline-offset-4 hover:text-charcoal">
              See it on {cfg.possessiveNoun} instead
            </button>
          </div>
        </div>
      )}

      {showAppliancePicker && (
        <>
          <p className="caps text-slate">1 · What are you wrapping?</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {groups.map((g) => {
              const isSelected = g.members.some((m) => m.key === appliance);
              return (
                <button
                  key={g.group}
                  onClick={() => chooseAppliance(g.members[0].key)}
                  aria-pressed={isSelected}
                  className={`rounded-full border-2 px-4 py-2 text-sm font-semibold transition-all ${
                    isSelected ? "border-charcoal bg-surface shadow-sm" : "border-edge bg-surface hover:border-slate"
                  }`}
                >
                  {g.label}
                </button>
              );
            })}
          </div>

          {/* Front load or top load. A real difference — a top-loader is wrapped
              on three sides and a front-loader on one — so it is asked plainly
              rather than inferred. */}
          {loadTypes && (
            <div className="mt-2 flex flex-wrap gap-2">
              {loadTypes.map((m) => (
                <button
                  key={m.key}
                  onClick={() => chooseAppliance(m.key)}
                  aria-pressed={m.key === appliance}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
                    m.key === appliance
                      ? "border-charcoal bg-charcoal text-surface"
                      : "border-edge bg-surface text-slate hover:border-slate"
                  }`}
                >
                  {m.loadTypeLabel ?? m.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <p className={`caps text-slate ${showAppliancePicker ? "mt-6" : ""}`}>
        {stepNo.format} · Which {cfg.label.toLowerCase()} is this for?
      </p>
      <div className="mt-3 grid gap-2">
        {standard.map((f) => {
          const isSelected = f.code === selected?.code;
          return (
            <button
              key={f.code}
              onClick={() => setCode(f.code)}
              aria-pressed={isSelected}
              className={`flex items-center justify-between gap-3 rounded-[14px] border-2 px-4 py-3.5 text-left transition-all ${
                isSelected ? "border-charcoal bg-surface shadow-sm" : "border-edge bg-surface hover:border-slate"
              }`}
            >
              <span>
                <span className="block font-semibold">{formatFitLabel(f)}</span>
                <span className="block text-xs text-slate">{formatSizeLabel(f)}</span>
              </span>
              {/* A per-piece set price, never ₹/sq ft — the internal cut area
                  informs the ladder but must never reach the customer. */}
              <span className="shrink-0 font-display text-base font-bold">{formatINR(formatPrice(f))}</span>
            </button>
          );
        })}

        {/* Every non-fridge ladder is still carrying pre-sign-off numbers
            (0094). The check existed and nothing called it, so a provisional
            price was being shown as a settled one — say it where the price is,
            not in a footnote. */}
        {selected && isPlaceholderFormat(selected) && (
          <p className="text-xs text-mist">
            This price is provisional until the range opens.
          </p>
        )}

        {madeToMeasure && (
          <Link
            href="/fridge-wraps/made-to-measure"
            className="flex items-center justify-between gap-3 rounded-[14px] border-2 border-dashed border-edge px-4 py-3.5 text-left transition-all hover:border-slate"
          >
            <span>
              <span className="block font-semibold">{madeToMeasure.label}</span>
              <span className="block text-xs text-slate">Priced from your own measurements</span>
            </span>
            <span className="shrink-0 text-xs font-semibold text-slate">Measure my fridge →</span>
          </Link>
        )}
      </div>

      {/* The fit finder is fridge-only: it reads a model database that has rows
          for fridges alone. Offering it for an AC would send the customer to a
          search that can never match. The other appliances go by tonnage or load
          size, which their own landing page asks directly. */}
      {cfg.supportsModelFinder ? (
        <p className="mt-3 text-xs text-slate">
          Not sure which one fits?{" "}
          <Link href="/fridge-wraps/fit-finder" className="font-semibold underline underline-offset-2 hover:text-charcoal">
            Find your fridge
          </Link>
        </p>
      ) : (
        <p className="mt-3 text-xs text-slate">
          Not sure which one fits?{" "}
          <Link href={cfg.landingPath} className="font-semibold underline underline-offset-2 hover:text-charcoal">
            See the size guide
          </Link>
        </p>
      )}

      {/* Pre-launch: the next step is not "how many", it's "not yet". The chosen
          format and its price stay on screen above — the customer leaves
          knowing what their appliance costs — but nothing here adds to a cart. */}
      <div className="mt-6 rounded-[14px] border border-edge bg-surface px-4 py-4">
        <p className="caps text-slate">{stepNo.next} · Coming soon</p>
        <p className="mt-2 text-sm font-semibold text-charcoal">{WRAPS_COMING_SOON_MESSAGE}</p>
        <p className="mt-2 text-xs text-slate">
          The designs and the fit are finished; we&apos;re signing off the adhesive film before the
          first run, and we&apos;d rather not sell a panel we can&apos;t print yet.{" "}
          <Link href="/contact?about=Appliance%20wraps" className="font-semibold underline underline-offset-2 hover:text-charcoal">
            Tell me when it opens
          </Link>
        </p>
      </div>

      {image && (
        <RoomVisualizer
          open={visualizerOpen}
          onClose={() => setVisualizerOpen(false)}
          surface={appliance}
          imageUrl={image.url}
          imageAlt={image.alt}
          productHandle={productHandle}
          wallWidthCm={previewSize.widthCm}
          wallHeightCm={previewSize.heightCm}
          wallLabel={selected ? formatSizeLabel(selected) : cfg.label}
          // No stored crop: the panel shows the whole design, so the visualiser
          // opens on the artwork as printed rather than on a saved framing.
          initial={null}
          // Preview only, deliberately. On a wall, what the customer frames in
          // the visualiser IS what gets printed, so the crop flows back into
          // the order. A wrap panel is the whole design fitted to a fixed
          // format, and nothing downstream reads a panel offset yet — feeding
          // one back would show them a position the print desk has no way to
          // honour. Revisit when the panel print path lands (Phase 2).
          onApply={() => setVisualizerOpen(false)}
        />
      )}
    </div>
  );
}
