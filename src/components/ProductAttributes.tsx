import type { CleanAttributes } from "@/lib/seo";
import type { ProductFacts } from "@/lib/product-facts";
import { MEDIUM_LABEL, MEDIUM_SUPPLY, supplyLabel } from "@/lib/product-facts";
import { MarketMoney, MarketPricingNote } from "@/components/MarketMoney";
import type { ReactNode } from "react";

/**
 * Visible product attributes — design code, style, mood, colours and rooms
 * (from the collection taxonomy), plus a line or two on what the piece is.
 *
 * The size rows come from the product's family, because the three families
 * answer "how big is it?" in different terms: a mural takes the customer's
 * dimensions, a border has a fixed height and a chosen length, a canvas comes
 * in one of six finished sizes. Only rows with real values render; nothing is
 * invented.
 */
export function ProductAttributes({
  code,
  attributes,
  recommendedMaterial,
  facts,
  sampleable = false,
  readySizes,
  orientation,
}: {
  code: string | null;
  attributes: CleanAttributes;
  recommendedMaterial: string | null;
  /** The product's family and its structured measurements. */
  facts: ProductFacts;
  /** Whether THIS design can be sampled — samples are offered on one
   *  collection today (see SAMPLE_COLLECTION_TAGS), so the category flag alone
   *  would promise a sample the flow refuses. */
  sampleable?: boolean;
  /** Ready-size (peel & stick) ladder — an AREA product sold at fixed sizes.
   *  Distinct from facts.fixedSizes, which is the Canvas Art family's ladder. */
  readySizes?: [number, number][] | null;
  orientation?: "vertical" | "horizontal" | null;
  /** Accepted for callers; not shown — a print limit is the builder's job. */
  maxPrintWidthIn?: number | null;
}) {
  // A value is a node, not a string, because every price in it must follow
  // the visitor's market (India → ₹, elsewhere → country-adjusted USD) — a
  // "₹200" baked into a string here was the one rupee figure a US visitor
  // still saw on a page priced in dollars.
  const rows: { label: string; value: ReactNode }[] = [];
  if (code) rows.push({ label: "Design code", value: code });

  // Plain words only (founder, 12 October 2026: "simplify the Design details
  // section"). The machine-readable facts — product type, how it is measured,
  // commercial use — live in the page's structured data (productJsonLd in
  // src/lib/seo.ts), so agents and search lose nothing when the visible list
  // says less. Production time is in Shipping & installation, not here.
  if (attributes.styles.length) rows.push({ label: "Style", value: attributes.styles.join(", ") });
  if (attributes.moods.length) rows.push({ label: "Mood", value: attributes.moods.join(", ") });
  if (attributes.colours.length) rows.push({ label: "Colours", value: attributes.colours.join(", ") });
  if (attributes.rooms.length) rows.push({ label: "Best for", value: attributes.rooms.join(", ") });

  if (facts.measurementType === "length") {
    if (facts.heightCm) rows.push({ label: "Height", value: `${facts.heightCm} cm` });
    rows.push({ label: "Comes as", value: `5 m sets, ${supplyLabel(5, facts.supplyFormat, facts.segmentLengthM)} each` });
    rows.push({
      label: "Price",
      value: (
        <>
          <MarketMoney inr={facts.fromPrice ?? 0} /> per metre
        </>
      ),
    });
  } else if (facts.measurementType === "fixed") {
    if (facts.media.length) {
      rows.push({ label: "Made on", value: facts.media.map((m) => MEDIUM_LABEL[m]).join(" or ") });
    }
    rows.push({ label: "Sizes", value: facts.fixedSizes.map((s) => s.label).join(" · ") });
    if (orientation) rows.push({ label: "Shape", value: orientation === "vertical" ? "Tall" : "Wide" });
    for (const m of facts.media) {
      rows.push({
        label: facts.media.length > 1 ? `Comes as (${MEDIUM_LABEL[m].toLowerCase()})` : "Comes as",
        value: MEDIUM_SUPPLY[m],
      });
    }
  } else if (readySizes?.length) {
    rows.push({ label: "Sizes", value: readySizes.map(([w, h]) => `${w}″ × ${h}″`).join(" · ") });
    rows.push({ label: "Goes up", value: "Peel and stick, no paste" });
  } else {
    // No "made to your wall" / "made-to-measure" wording on the product page
    // (founder, 8 October 2026: it reads as a warning).
    rows.push({ label: "Type", value: "A mural: one continuous picture across the wall" });
  }

  if (recommendedMaterial) rows.push({ label: "Surface", value: recommendedMaterial });
  // Samples are cut from wallpaper stock and offered on one collection at a
  // time (SAMPLE_COLLECTION_TAGS); India only, so abroad the row says so.
  if (facts.category.supportsSamples && sampleable) {
    rows.push({
      label: "Sample",
      value: (
        <MarketPricingNote
          india="Available for ₹200"
          international="Available within India only"
        />
      ),
    });
  }

  return (
    // Collapsed like the accordions below it (Roheena, 26 Sep 2026): twenty
    // rows of specification pushed Description and Shipping off the screen.
    // A <details> keeps every row in the HTML, so shopping agents and search
    // still read it all.
    <details className="group mt-10 rounded-[18px] bg-wash">
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4">
        <span className="text-sm font-semibold">Design details</span>
        <span className="text-mist transition-transform group-open:rotate-45">+</span>
      </summary>
      <div className="px-5 pb-4">
      <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="flex flex-col">
            <dt className="text-[0.72rem] font-semibold uppercase tracking-wide text-mist">{r.label}</dt>
            <dd className="text-sm text-charcoal">{r.value}</dd>
          </div>
        ))}
      </dl>
      </div>
    </details>
  );
}
