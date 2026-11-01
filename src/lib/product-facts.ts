import { CM_PER_INCH, fromReadySizePrice } from "./pricing";
import type { MeasurementType, ProductCategory } from "./product-category";

/**
 * The structured facts that distinguish the three product families — one
 * resolver, so the product page, the cards, the JSON-LD, the Merchant Center
 * feed and the concierge all describe a product identically.
 *
 * The families answer "how big is it?" in genuinely different terms, and
 * flattening that is exactly how a border ends up advertised by the square foot:
 *
 *   area   — no dimensions of its own; the CUSTOMER's wall supplies them
 *   length — a fixed height and a chosen length, supplied continuous or in pieces
 *   fixed  — a finished piece, from a ladder of fixed sizes
 */

export type FixedSize = {
  /** Inches, as stored in products.ready_sizes. */
  widthIn: number;
  heightIn: number;
  /** "2 ft × 2 ft" — the customer-facing label. */
  label: string;
};

export type ProductFacts = {
  category: ProductCategory;
  /** "Wallpapers & Murals" | "Borders & Strips" | "Canvas Art". */
  productType: string;
  measurementType: MeasurementType;
  pricingUnit: "sqft" | "metre" | "piece";
  /** One-line size statement, or null when the customer's wall supplies it. */
  dimensions: string | null;
  /** Fixed height in cm (borders). */
  heightCm: number | null;
  /** Fixed width in cm (none of the families today; kept for symmetry with height). */
  widthCm: number | null;
  /** Length of one supplied piece, in metres (borders). */
  segmentLengthM: number | null;
  supplyFormat: "continuous" | "segmented" | null;
  fixedSizes: FixedSize[];
  fixedSizeAvailable: boolean;
  customSizeAvailable: boolean;
  /** Fixed-size family only: the media this piece is actually sold in. Every
   *  surface that says what it's printed on must read this, never assume. */
  media: WallArtMedium[];
  /** The finished-size sentence, already agreeing with `media`. */
  fixedSizeStatement: string;
  /** Lowest price a shopper can pay, in whole rupees — null when unknown. */
  fromPrice: number | null;
};

/** The source columns a product contributes. */
export type ProductFactsInput = {
  readySizes?: [number, number][] | null;
  borderHeightCm?: number | null;
  supplyFormat?: string | null;
  segmentLengthM?: number | null;
  pricePerMetre?: number | null;
  /** Lowest per-sq-ft rate among available materials. */
  fromPricePerSqft?: number | null;
  /** Slugs of the materials actually on sale — what the media are resolved
   *  from. Omitted means "unknown", which reads as medium-neutral copy. */
  materialSlugs?: readonly string[] | null;
};

/** 24 → "2 ft"; 30 → "2 ft 6 in". Fixed sizes are stored in inches. */
export function feetLabel(inches: number): string {
  const ft = Math.floor(inches / 12);
  const rem = Math.round((inches % 12) * 10) / 10;
  if (!rem) return `${ft} ft`;
  return ft ? `${ft} ft ${rem} in` : `${rem} in`;
}

export function fixedSizeLabel(widthIn: number, heightIn: number): string {
  return `${feetLabel(widthIn)} × ${feetLabel(heightIn)}`;
}

/** A cart or checkout already carries centimetres, while the customer chose a
 * finished artwork size in feet. Keep the noun attached to the dimensions so
 * a mixed basket cannot make a canvas line look like another wall measurement. */
export function artworkSizeLabel(widthCm: number, heightCm: number): string {
  return `${fixedSizeLabel(Math.round(widthCm / CM_PER_INCH), Math.round(heightCm / CM_PER_INCH))} artwork`;
}

/**
 * How a length order arrives. The customer must know whether "5 m" is one strip
 * or five before they buy — "5 × 1 metre strips" and "1 continuous 5 metre
 * strip" are different products in the hand.
 */
export function supplyLabel(
  metres: number,
  supplyFormat: "continuous" | "segmented" | null | undefined,
  segmentLengthM: number | null | undefined,
): string {
  const seg = Number(segmentLengthM) || 0;
  if (supplyFormat === "segmented" && seg > 0) {
    const pieces = Math.max(1, Math.round(metres / seg));
    // A single piece is not "1 × 1 metre strips".
    if (pieces === 1) return `1 × ${seg} metre strip`;
    return `${pieces} × ${seg} metre strips`;
  }
  return `1 continuous ${metres} metre strip`;
}

/**
 * The two media a fixed-size piece can be sold in. ONE place decides what each
 * medium is called and how it is described, because the alternative is what it
 * replaced: a page whose banner promised canvas while the media picker below
 * offered self-adhesive. Never hard-code "canvas" for this family — read the
 * product's own media (facts.media) and let these render it.
 */
export type WallArtMedium = "canvas" | "self-adhesive";

const MEDIUM_BY_SLUG: Record<string, WallArtMedium> = {
  "eco-cotton-canvas": "canvas",
  "self-adhesive-vinyl": "self-adhesive",
};

const MEDIA_ORDER: WallArtMedium[] = ["canvas", "self-adhesive"];

export const MEDIUM_LABEL: Record<WallArtMedium, string> = {
  canvas: "Eco-cotton canvas",
  "self-adhesive": "Self-adhesive",
};

/** How the piece arrives — the other half of the same truth. */
export const MEDIUM_SUPPLY: Record<WallArtMedium, string> = {
  canvas: "Unframed — shipped rolled in a protective tube, ready to frame or stretch to your preference",
  "self-adhesive": "Shipped rolled — peels straight onto the wall, no frame, paste or fitter",
};

const MEDIUM_PHRASE: Record<WallArtMedium, string> = {
  canvas: " on eco-cotton canvas",
  "self-adhesive": " on smooth self-adhesive media",
};

/** The media a product is really sold in, from its material slugs. */
export function wallArtMedia(materialSlugs: readonly string[]): WallArtMedium[] {
  const found = materialSlugs.map((s) => MEDIUM_BY_SLUG[s]).filter(Boolean) as WallArtMedium[];
  return MEDIA_ORDER.filter((m) => found.includes(m));
}

/** The finished-size statement Canvas Art must always carry. Names a medium
 *  only when the product is sold in exactly that one; sold in both — or media
 *  unknown — it stays medium-neutral rather than picking a side and being
 *  wrong half the time. */
export function fixedSizeStatement(media?: readonly WallArtMedium[] | null): string {
  const how = media?.length === 1 ? MEDIUM_PHRASE[media[0]] : media?.length ? " on canvas or self-adhesive media" : "";
  return `Made${how} in a fixed finished size. Choose from the available artwork sizes.`;
}

/** The medium-neutral wording, for surfaces with no product in hand (a
 *  collection header, a family blurb). Always true of every piece. */
export const CANVAS_FIXED_SIZE_STATEMENT = fixedSizeStatement();

function toFixedSizes(readySizes: [number, number][] | null | undefined): FixedSize[] {
  return (readySizes ?? []).map(([widthIn, heightIn]) => ({
    widthIn,
    heightIn,
    label: fixedSizeLabel(widthIn, heightIn),
  }));
}

export function productFacts(category: ProductCategory, input: ProductFactsInput): ProductFacts {
  const fixedSizes = category.supportsFixedSizes ? toFixedSizes(input.readySizes) : [];
  const heightCm = category.measurementType === "length" ? (input.borderHeightCm ?? null) : null;
  const supplyFormat =
    category.measurementType === "length"
      ? ((input.supplyFormat as "continuous" | "segmented" | null) ?? null)
      : null;
  const segmentLengthM = category.measurementType === "length" ? (input.segmentLengthM ?? null) : null;

  let dimensions: string | null = null;
  if (category.measurementType === "length") {
    const parts: string[] = [];
    if (heightCm) parts.push(`${heightCm} cm tall`);
    if (supplyFormat === "segmented" && segmentLengthM) parts.push(`supplied in ${segmentLengthM} m pieces`);
    else if (supplyFormat === "continuous") parts.push("supplied as one continuous strip");
    dimensions = parts.length ? parts.join(" · ") : null;
  } else if (category.measurementType === "fixed" && fixedSizes.length) {
    dimensions = fixedSizes.map((s) => s.label).join(" · ");
  }

  // The smallest thing a shopper can actually pay for: a metre of border, the
  // smallest canvas, or a square foot of wallpaper.
  let fromPrice: number | null = null;
  if (category.measurementType === "length") {
    fromPrice = input.pricePerMetre != null ? Math.round(Number(input.pricePerMetre)) : null;
  } else if (category.measurementType === "fixed") {
    // The finished price of the smallest size — the internal per-sq-ft make
    // rate is never shown for a fixed-size piece. Uses the same function the
    // configurator prices each size with, so the two can't disagree by a rupee.
    const rate = input.fromPricePerSqft;
    fromPrice = rate && input.readySizes?.length ? fromReadySizePrice(input.readySizes, rate) : null;
  } else {
    fromPrice = input.fromPricePerSqft != null ? Math.round(input.fromPricePerSqft) : null;
  }

  const media = category.measurementType === "fixed" ? wallArtMedia(input.materialSlugs ?? []) : [];

  return {
    category,
    productType: category.productType ?? category.title,
    measurementType: category.measurementType,
    pricingUnit: category.pricingUnit,
    dimensions,
    heightCm,
    widthCm: null,
    segmentLengthM,
    supplyFormat,
    fixedSizes,
    fixedSizeAvailable: fixedSizes.length > 0,
    customSizeAvailable: category.supportsCustomSize,
    media,
    fixedSizeStatement: fixedSizeStatement(media),
    fromPrice,
  };
}
