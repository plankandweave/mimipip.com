// Representative purchasable variants for Google Shopping / structured data.
//
// A mural wallpaper design has no single price until the wall size and material
// are chosen — Google's customised-product guidance is to advertise stable,
// representative best-selling configurations whose price matches the landing
// page. This module is the single source of those configurations: the Merchant
// feed, the ProductGroup JSON-LD and the product page's deep-link handling all
// derive from here, so an advertised price can never disagree with the page.
import { formatMarketMoney, type CurrencyCode } from "@/lib/markets";
import { billedPriceFor, fixedSizePrice, toCm } from "./pricing";
import { feetLabel, supplyLabel } from "./product-facts";
import { quoteMarketOrder } from "./markets";

/** Representative wall sizes (ft) for made-to-measure designs — typical Indian
 *  feature walls, small to large, both orientations at the popular 80 sq ft. */
export const REPRESENTATIVE_SIZES_FT: [number, number][] = [
  [4, 6],
  [6, 8],
  [8, 10],
  [10, 8],
  [12, 8],
];

/** Short material code used in variant SKUs (never the vendor's own naming). */
export function materialCode(slug: string): string {
  if (slug === "smooth-matt") return "PNW";
  if (slug === "linen-touch") return "ST";
  if (slug === "self-adhesive-vinyl") return "SAV";
  if (slug === "eco-cotton-canvas") return "CNV";
  return slug.replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase();
}

export type VariantMaterial = { slug: string; name: string; pricePerSqFt: number };

export type RepresentativeVariant = {
  sku: string;
  /** Human label, e.g. "10 ft × 8 ft — Premium Non-Woven" or "36 in × 60 in — Peel & Stick". */
  label: string;
  sizeText: string;
  materialSlug: string;
  materialName: string;
  /** GST-inclusive INR total — identical to what the landing page computes. */
  price: number;
  /** Printed area used by the international delivery calculator. */
  areaSqFt: number;
  /** Deep link that opens the product page with this exact configuration selected. */
  url: string;
};

/** A rate reads in whole rupees, and to the cent in a decimal currency. */
function roundRate(rate: number, currency: CurrencyCode): number {
  return currency === "INR" ? Math.round(rate) : Math.round(rate * 100) / 100;
}

/**
 * The rate a made-to-measure price works out to, e.g. "₹200/sq ft".
 *
 * Shopping shows the total — ₹19,200 for a 12 × 8 ft wall — beside rolls that
 * cost ₹6,000 and cover a fraction of it. The rate is the only thing on the
 * card that makes that comparison honest, so it rides in the title.
 */
export function unitRateLabel(
  price: number,
  areaSqFt: number,
  currency: CurrencyCode = "INR",
): string | null {
  if (!Number.isFinite(price) || !Number.isFinite(areaSqFt) || areaSqFt <= 0 || price <= 0) return null;
  // The feed prices each country's items in that country's currency
  // (marketVariant), so the rate riding in the title has to follow — a US
  // listing titled "₹3.50/sq ft" is the converted number under the wrong sign.
  return `${formatMarketMoney(roundRate(price / areaSqFt, currency), currency)}/sq ft`;
}

/** A4 design sample of one design — the ₹200 way in, advertised in its own right. */
export function sampleVariant(
  siteUrl: string,
  handle: string,
  unitPrice: number,
): RepresentativeVariant {
  return {
    sku: `ZYV-${handle.toUpperCase()}-SAMPLE-A4`,
    label: "A4 design sample",
    sizeText: "A4 sample",
    materialSlug: "smooth-matt",
    materialName: "Soft Matte",
    price: unitPrice,
    // Deliberately 0: a sample is not a printed wall area, and letting it into
    // the per-square-foot maths would advertise a ₹200 rate for a whole wall.
    areaSqFt: 0,
    url: `${siteUrl}/products/${handle}?sample=1`,
  };
}

/** Variants for a made-to-measure design: representative sizes × available materials. */
export function madeToMeasureVariants(
  siteUrl: string,
  handle: string,
  materials: VariantMaterial[],
): RepresentativeVariant[] {
  const out: RepresentativeVariant[] = [];
  for (const m of materials) {
    for (const [wFt, hFt] of REPRESENTATIVE_SIZES_FT) {
      out.push({
        sku: `ZYV-${handle.toUpperCase()}-${wFt}X${hFt}FT-${materialCode(m.slug)}`,
        label: `${wFt} ft × ${hFt} ft — ${m.name}`,
        sizeText: `${wFt} ft x ${hFt} ft`,
        materialSlug: m.slug,
        materialName: m.name,
        // billedPriceFor keeps the feed equal to the page even if a size below
        // the small-order minimums is ever added to this ladder.
        price: billedPriceFor(toCm(wFt, "ft"), toCm(hFt, "ft"), m.pricePerSqFt),
        areaSqFt: wFt * hFt,
        url: `${siteUrl}/products/${handle}?w=${wFt}&h=${hFt}&material=${m.slug}`,
      });
    }
  }
  return out;
}

/** Variants for a ready-size design: its fixed [widthIn, heightIn] ladder on its material. */
export function readySizeVariants(
  siteUrl: string,
  handle: string,
  readySizes: [number, number][],
  material: VariantMaterial,
): RepresentativeVariant[] {
  return readySizes.map(([wIn, hIn]) => ({
    sku: `ZYV-${handle.toUpperCase()}-${wIn}X${hIn}IN-${materialCode(material.slug)}`,
    label: `${wIn} in × ${hIn} in — ${material.name}`,
    sizeText: `${wIn} in x ${hIn} in`,
    materialSlug: material.slug,
    materialName: material.name,
    price: fixedSizePrice(toCm(wIn, "in"), toCm(hIn, "in"), material.pricePerSqFt),
    areaSqFt: (wIn * hIn) / 144,
    url: `${siteUrl}/products/${handle}?size=${wIn}x${hIn}`,
  }));
}

/**
 * Variants for a Canvas Art piece: its fixed finished sizes, labelled in feet
 * the way the customer chooses them ("3 ft × 4 ft"), priced per finished piece.
 * The per-sq-ft make rate never appears — it is an internal cost.
 */
export function canvasSizeVariants(
  siteUrl: string,
  handle: string,
  readySizes: [number, number][],
  material: VariantMaterial,
): RepresentativeVariant[] {
  return readySizes.map(([wIn, hIn]) => ({
    // Suffix is the MEDIA's code (CNV canvas, SAV self-adhesive): the same
    // artwork in the same size on two media is two different physical products.
    sku: `ZYV-${handle.toUpperCase()}-${wIn}X${hIn}IN-${materialCode(material.slug)}`,
    label: `${feetLabel(wIn)} × ${feetLabel(hIn)} — ${material.name}`,
    sizeText: `${feetLabel(wIn)} x ${feetLabel(hIn)}`,
    materialSlug: material.slug,
    materialName: material.name,
    price: fixedSizePrice(toCm(wIn, "in"), toCm(hIn, "in"), material.pricePerSqFt),
    areaSqFt: (wIn * hIn) / 144,
    url: `${siteUrl}/products/${handle}?size=${wIn}x${hIn}&material=${material.slug}`,
  }));
}

/**
 * Variants for a border: the lengths it is actually supplied in, priced by the
 * linear metre. The label carries the supply format, because "5 m" alone does
 * not tell a shopper whether five pieces or one strip turns up.
 */
export function borderLengthVariants(
  siteUrl: string,
  handle: string,
  lengthsM: readonly number[],
  pricePerMetre: number,
  supply: { format: "continuous" | "segmented" | null; segmentLengthM: number | null },
): RepresentativeVariant[] {
  return lengthsM.map((m) => ({
    sku: `ZYV-${handle.toUpperCase()}-${m}M`,
    label: `${m} m — ${supplyLabel(m, supply.format, supply.segmentLengthM)}`,
    sizeText: `${m} m`,
    materialSlug: "border",
    materialName: "Printed border",
    price: Math.round(m * pricePerMetre),
    areaSqFt: 0,
    url: `${siteUrl}/products/${handle}?length=${m}`,
  }));
}

/** Convert an INR catalogue variant into the exact country-presented offer. */
export function marketVariant(v: RepresentativeVariant, countryCode: string): RepresentativeVariant {
  const quote = quoteMarketOrder({ amountInr: v.price, countryCode, areaSqFt: v.areaSqFt });
  const url = new URL(v.url);
  url.searchParams.set("market", quote.countryCode);
  return { ...v, price: quote.total, url: url.toString() };
}

/** Parse and validate a ?size=36x60 param against a design's ready-size ladder. */
export function parseReadySizeParam(
  size: string | undefined,
  readySizes: [number, number][] | null | undefined,
): [number, number] | null {
  if (!size || !readySizes?.length) return null;
  const m = size.match(/^(\d{1,3})x(\d{1,3})$/i);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  return readySizes.some(([rw, rh]) => rw === w && rh === h) ? [w, h] : null;
}
