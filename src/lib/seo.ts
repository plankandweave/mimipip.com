import { brand } from "../brand/current";
// SEO helpers: canonical/OG metadata + JSON-LD structured data builders.
// Single source of the site's public origin.
import { sellerGstConfig } from "./gst";
import { readySizePrices, MIN_WALLPAPER_SQFT } from "./pricing";
import type { RepresentativeVariant } from "./variants";
import type { ProductFacts } from "./product-facts";
import { internationalTransitWorkingDays, marketFor } from "./markets";

export const SITE_URL = brand.origin;
// Keep the official spelling and the observed search spelling tied to the
// same organization and website, rather than creating competing brand pages.
const BRAND_ALTERNATE_NAMES = brand.alternateNames;

// The one place these live — organizationJsonLd, the footer and the press
// room all read from here, so a handle change never has to be hunted down.
export const INSTAGRAM_URL = brand.socialLinks.instagram || "";
export const PINTEREST_URL = brand.socialLinks.pinterest || "";
export const YOUTUBE_URL = brand.socialLinks.youtube || "";

export function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
}

export function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).replace(/\s+\S*$/, "").trim() + "…";
}

// ---- sitewide ----

export function organizationJsonLd() {
  // OnlineStore (an Organization subtype Google reads for merchant-level data):
  // legal identity comes from the same SELLER_* env config the GST invoices
  // use — never hardcoded, and omitted gracefully when unset (e.g. local dev).
  const seller = sellerGstConfig();
  return {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    "@id": `${SITE_URL}/#organization`,
    name: brand.name,
    alternateName: BRAND_ALTERNATE_NAMES,
    ...(seller ? { legalName: seller.legalName, taxID: seller.gstin } : {}),
    url: SITE_URL,
    ...(brand.logo ? { logo: new URL(brand.logo, SITE_URL).href } : {}),
    email: brand.contactEmail || undefined,
    description: brand.description,
    ...(seller
      ? {
          address: {
            "@type": "PostalAddress",
            streetAddress: seller.address.replace(/\n/g, ", "),
            addressRegion: seller.stateName || undefined,
            addressCountry: "IN",
          },
        }
      : {}),
    contactPoint: {
      "@type": "ContactPoint",
      email: brand.contactEmail || undefined,
      contactType: "customer support",
      areaServed: "Worldwide",
      availableLanguage: ["English", "Hindi"],
    },
    areaServed: "Worldwide",
    // Merchant-level policies (Google reads these from the OnlineStore node).
    hasMerchantReturnPolicy: { ...RETURN_POLICY, applicableCountry: FEED_COUNTRIES },
    sameAs: [INSTAGRAM_URL, PINTEREST_URL, YOUTUBE_URL].filter(Boolean),
  };
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: brand.name,
    // Observed search spellings help identify the brand; they do not guarantee
    // that Google will display a particular site name or search ranking.
    alternateName: BRAND_ALTERNATE_NAMES,
    url: SITE_URL,
    publisher: { "@id": `${SITE_URL}/#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/search?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

// ---- product ----

// Shared shipping + returns blocks (free India delivery; made-to-order not returnable for change of mind).
const SHIPPING_DETAILS = {
  "@type": "OfferShippingDetails",
  shippingRate: { "@type": "MonetaryAmount", value: 0, currency: "INR" },
  shippingDestination: { "@type": "DefinedRegion", addressCountry: "IN" },
  deliveryTime: {
    "@type": "ShippingDeliveryTime",
    handlingTime: { "@type": "QuantitativeValue", minValue: 1, maxValue: 5, unitCode: "DAY" },
    transitTime: { "@type": "QuantitativeValue", minValue: 2, maxValue: 4, unitCode: "DAY" },
  },
};

const RETURN_POLICY = {
  "@type": "MerchantReturnPolicy",
  applicableCountry: "IN",
  // Where a return would be sent — Bengaluru, for every market.
  returnPolicyCountry: "IN",
  returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted",
  merchantReturnLink: `${SITE_URL}/refund-policy`,
};

// Every country a Merchant Center feed source serves (feeds/google-merchant.xml
// ?country=). The org-level policy must name each of them: Googlebot crawls
// from the U.S., so a product page's per-market policy is only ever read for
// one country, and the UAE scorecard showed "Return window: Incomplete" with
// the org node naming India alone.
const FEED_COUNTRIES = ["IN", "US", "AE"];

function shippingDetailsFor(countryCode: string) {
  const market = marketFor(countryCode);
  if (market.countryCode === "IN") return SHIPPING_DETAILS;
  const transit = internationalTransitWorkingDays(market.countryCode);
  return {
    "@type": "OfferShippingDetails",
    // International delivery is already part of the displayed offer price.
    shippingRate: { "@type": "MonetaryAmount", value: 0, currency: "USD" },
    shippingDestination: { "@type": "DefinedRegion", addressCountry: market.countryCode },
    deliveryTime: {
      "@type": "ShippingDeliveryTime",
      handlingTime: { "@type": "QuantitativeValue", minValue: 1, maxValue: 5, unitCode: "DAY" },
      transitTime: { "@type": "QuantitativeValue", minValue: transit.min, maxValue: transit.max, unitCode: "DAY" },
    },
  };
}

function returnPolicyFor(countryCode: string) {
  const market = marketFor(countryCode);
  return { ...RETURN_POLICY, applicableCountry: market.countryCode };
}

// Clean the raw product_attributes RPC output for display + structured data.
const stripWp = (s: string) => s.replace(/\s*wallpapers?$/i, "").replace(/['’]\s*$/, "").trim();
const COMMERCIAL_RE = /hotel|lobby|reception|caf|restaurant|office|retail|showroom|commercial|hospitality|spa/i;
const CHILD_RE = /kid|child|nursery|baby|teen/i;

export type RawAttributes = { rooms?: string[]; colours?: string[]; styles?: string[]; moods?: string[]; subjects?: string[] };
export type CleanAttributes = {
  rooms: string[]; colours: string[]; styles: string[]; moods: string[]; subjects: string[];
  childRooms: boolean; commercial: boolean;
};

/** Factual subject context assembled only from reviewed catalogue attributes. */
export function designDiscoveryLine(attributes: CleanAttributes | null | undefined): string | null {
  if (!attributes) return null;
  const parts: string[] = [];
  if (attributes.subjects.length) parts.push(`Depicts ${attributes.subjects.slice(0, 3).join(", ")}`);
  if (attributes.styles.length) parts.push(`${attributes.styles.slice(0, 2).join(" and ")} style`);
  if (attributes.rooms.length) parts.push(`suited to ${attributes.rooms.slice(0, 2).join(" and ")}`);
  return parts.length ? `${parts.join(" · ")}.` : null;
}

/** Descriptive fallback for catalogue images whose stored alt predates the
 * subject taxonomy. Existing editorial alt text always wins at the call site. */
export function productImageAlt(
  title: string,
  image: { is_flat?: boolean | null; scene_key?: string | null },
  attributes: CleanAttributes | null | undefined,
): string {
  const subject = attributes?.subjects.slice(0, 2).join(" and ");
  const scene = image.scene_key
    ?.replace(/[-_]+/g, " ")
    .replace(/\bprimary (bed)?room\b/gi, "master bedroom")
    .trim();
  const setting = image.is_flat ? "flat wallpaper artwork" : scene ? `wallpaper mural in a ${scene}` : "wallpaper mural in a room setting";
  return `${title} — ${setting}${subject ? ` depicting ${subject}` : ""}`;
}

export function cleanProductAttributes(raw: RawAttributes | null | undefined): CleanAttributes {
  const rooms = (raw?.rooms ?? []).map(stripWp).filter(Boolean);
  const colours = (raw?.colours ?? []).map(stripWp).filter(Boolean);
  const styles = (raw?.styles ?? []).map(stripWp).filter((s) => s && s.toLowerCase() !== "wall art");
  const moods = (raw?.moods ?? []).filter(Boolean);
  // Subjects are already de-classified (no room/colour/style/mood/system tag
  // makes it through the product_attributes RPC) — just present them cleanly,
  // and drop "Murals" here since every design's mural-ness is stated once,
  // as a universal fact, in the product page's own attributes list.
  const rawSubjects = raw?.subjects ?? [];
  const subjects = rawSubjects
    .filter((t) => !/^murals?$/i.test(t) && !/^piano finish:/i.test(t))
    .map((t) => t.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim())
    .filter(Boolean);
  const childRooms = rawSubjects.some((t) => CHILD_RE.test(t)) || rooms.some((r) => CHILD_RE.test(r));
  const commercial = rooms.some((r) => COMMERCIAL_RE.test(r));
  return { rooms, colours, styles, moods, subjects, childRooms, commercial };
}

/**
 * A SKU Google's Merchant listings parser accepts: no whitespace, plain ASCII,
 * at most 50 characters. 112 designs carry studio codes like "BD 0001", and the
 * space alone made Search Console report "Invalid value in field sku"
 * (5 October 2026). Spaces become hyphens, so "BD 0001" reads "BD-0001".
 */
export function structuredSku(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9._-]/g, "")
    .slice(0, 50);
}

/**
 * A variant SKU (or group id) as Google sees it: at most 50 characters and
 * still UNIQUE. Variant SKUs are `ZYV-<HANDLE>-<SIZE>-<MATERIAL>`, so a long
 * handle pushes them past 50 — Search Console, 6 October 2026: "Invalid string
 * length in field sku" on every size of Wabi-Sabi Mountains
 * (`ZYV-JAPANESE-INSPIRED-HOME-LIVING-DINING-10X8FT-PNW`, 51). Truncating alone
 * would cut the size and material off and give every variant the SAME sku, so
 * an over-long one keeps its first 42 characters and ends in a 7-character
 * hash of the whole. A SKU that already fits is returned as-is, so nothing
 * Google has accepted changes. Only what Google reads goes through this —
 * internal codes (orders, marketplace exports) keep the full string.
 */
export function googleSku(raw: string): string {
  const clean = structuredSkuChars(raw);
  if (clean.length <= 50) return clean;
  return `${clean.slice(0, 42)}-${fnv1a36(clean)}`;
}

function structuredSkuChars(raw: string): string {
  return raw.trim().replace(/\s+/g, "-").replace(/[^A-Za-z0-9._-]/g, "");
}

/** FNV-1a 32-bit, base 36, padded to 7 characters (2^32 < 36^7). */
function fnv1a36(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).toUpperCase().padStart(7, "0");
}

export function productJsonLd(input: {
  handle: string;
  title: string;
  code: string | null;
  description: string;
  images: string[];
  materials: { name: string; pricePerSqFt: number }[];
  rating?: { count: number; average: number } | null;
  attributes?: CleanAttributes | null;
  /** Fixed [widthIn, heightIn] options for ready-size (peel & stick) designs. */
  readySizes?: [number, number][] | null;
  /** Canvas Wall Art — sold only at fixed sizes; the per-sq-ft rate must never
   *  appear in the markup. Offer is priced from the fixed-size ladder instead. */
  isCanvas?: boolean;
  /** Per-metre pricing (Borders) — replaces the per-sq-ft offer entirely. */
  perMetre?: { price: number; minMetres: number } | null;
  /** The product's family and its structured measurements. Emitted verbatim so
   *  Google, Gemini and shopping agents can separate the three product lines
   *  without parsing marketing copy. */
  facts?: ProductFacts | null;
  /** The configuration a deep link (e.g. a Google Shopping ad) selected — when
   *  present the primary Offer carries that exact visible price, so the
   *  advertised price and the landing-page markup always agree. */
  selected?: RepresentativeVariant | null;
  /** Market selected by a stable country-specific landing URL. */
  marketCountryCode?: string;
  /** Country-priced variants for a market landing without one exact selection. */
  marketVariants?: RepresentativeVariant[];
}) {
  const market = marketFor(input.marketCountryCode ?? "IN");
  const shippingDetails = shippingDetailsFor(market.countryCode);
  const returnPolicy = returnPolicyFor(market.countryCode);
  const attrProps: { "@type": "PropertyValue"; name: string; value: string }[] = [];
  const a = input.attributes;
  if (a) {
    if (a.colours.length) attrProps.push({ "@type": "PropertyValue", name: "Dominant colours", value: a.colours.join(", ") });
    if (a.styles.length) attrProps.push({ "@type": "PropertyValue", name: "Style", value: a.styles.join(", ") });
    if (a.moods.length) attrProps.push({ "@type": "PropertyValue", name: "Mood", value: a.moods.join(", ") });
    if (a.subjects.length) attrProps.push({ "@type": "PropertyValue", name: "Subject", value: a.subjects.join(", ") });
    if (a.rooms.length) attrProps.push({ "@type": "PropertyValue", name: "Suitable rooms", value: a.rooms.join(", ") });
    if (a.commercial) attrProps.push({ "@type": "PropertyValue", name: "Commercial suitability", value: "Suitable for commercial interiors" });
    if (a.childRooms) attrProps.push({ "@type": "PropertyValue", name: "Children's rooms", value: "Suitable for children's rooms" });
  }
  // The family, in machine-readable terms. This block is what stops an agent
  // reading a border or a canvas as mural wallpaper: it states the
  // product type, how the thing is measured, whether a custom size is even
  // possible, and — for the length family — how it physically arrives.
  const f = input.facts;
  if (f) {
    attrProps.push({ "@type": "PropertyValue", name: "Product type", value: f.productType });
    attrProps.push({
      "@type": "PropertyValue",
      name: "Measurement type",
      value: f.measurementType === "area" ? "Area (sq ft)" : f.measurementType === "length" ? "Length (linear metre)" : "Fixed size",
    });
    attrProps.push({ "@type": "PropertyValue", name: "Custom size available", value: f.customSizeAvailable ? "Yes" : "No" });
    attrProps.push({ "@type": "PropertyValue", name: "Fixed size available", value: f.fixedSizeAvailable ? "Yes" : "No" });
    if (f.dimensions) attrProps.push({ "@type": "PropertyValue", name: "Dimensions", value: f.dimensions });
    if (f.heightCm) attrProps.push({ "@type": "PropertyValue", name: "Height", value: `${f.heightCm} cm` });
    if (f.measurementType === "length") {
      attrProps.push({ "@type": "PropertyValue", name: "Length options", value: "1 m, 5 m" });
      attrProps.push({
        "@type": "PropertyValue",
        name: "Supply format",
        value:
          f.supplyFormat === "segmented" && f.segmentLengthM
            ? `Segmented — ${f.segmentLengthM} m strips`
            : "Continuous — one unbroken strip",
      });
    }
    if (f.fixedSizes.length) {
      attrProps.push({ "@type": "PropertyValue", name: "Fixed sizes", value: f.fixedSizes.map((s) => s.label).join(", ") });
    }
  }
  // Universal business facts (not derived from per-product tagging, which is
  // sparse): a design is either a mural wallpaper design or, when readySizes is
  // set, a fixed-size peel & stick artwork panel.
  if (input.perMetre) {
    attrProps.push({
      "@type": "PropertyValue",
      name: "Pattern & mural type",
      value: `Wallpaper border — a fixed design ${
        f?.supplyFormat === "segmented" && f.segmentLengthM
          ? `supplied in ${f.segmentLengthM} m strips`
          : "supplied as a continuous strip"
      }, never cut to a custom size`,
    });
    attrProps.push({ "@type": "PropertyValue", name: "Minimum order", value: `${input.perMetre.minMetres} m` });
  } else if (input.isCanvas || f?.measurementType === "fixed") {
    attrProps.push({
      "@type": "PropertyValue",
      name: "Pattern & mural type",
      value: "Canvas artwork — printed at a fixed finished size, not sized to your wall",
    });
  } else if (input.readySizes?.length) {
    attrProps.push({ "@type": "PropertyValue", name: "Pattern & mural type", value: "Complete artwork panel — printed edge to edge at a fixed ready size" });
    attrProps.push({ "@type": "PropertyValue", name: "Sizes", value: input.readySizes.map(([w, h]) => `${w} x ${h} in`).join(", ") });
    attrProps.push({ "@type": "PropertyValue", name: "Application", value: "Peel & stick — self-adhesive, no paste" });
  } else {
    attrProps.push({ "@type": "PropertyValue", name: "Pattern & mural type", value: "Mural wallpaper design — a single continuous scene sized to your wall, never a small repeating tile" });
  }
  attrProps.push({ "@type": "PropertyValue", name: "Production time", value: "Made to order · delivered within 10 working days (Standard) or 4 working days (Express)" });
  // Canvas Wall Art is sold ONLY at fixed sizes — its per-sq-ft make rate is
  // internal and must never surface. Price the offer from the finished size
  // ladder (min/max whole rupees) with no per-unit price spec; and if for any
  // reason those can't be computed, still emit no per-sq-ft price rather than leak it.
  const perSqftRates = input.materials.map((m) => m.pricePerSqFt).filter((n) => n > 0);
  const canvasFixedPrices =
    input.isCanvas && input.readySizes?.length && perSqftRates.length
      ? readySizePrices(input.readySizes, Math.min(...perSqftRates))
      : null;
  const prices = input.perMetre
    ? [input.perMetre.price]
    : canvasFixedPrices?.length
      ? canvasFixedPrices
      : input.isCanvas
        ? []
        : perSqftRates;
  const low = prices.length ? Math.min(...prices) : 200;
  const high = prices.length ? Math.max(...prices) : low;
  const unitText = input.perMetre ? "metre" : "square foot";
  // AggregateOffer.lowPrice must be a price someone can actually pay. For a
  // mural wallpaper design the ₹/sq ft rate is NOT that: the smallest possible
  // order is the 20 sq ft minimum billing, so advertising ₹200 would undercut
  // every real total on the landing page. The genuine per-unit rate still goes
  // out below as UnitPriceSpecification, which is what it's for.
  const madeToMeasure = !input.perMetre && !input.isCanvas && !input.readySizes?.length;
  const marketPrices = market.currency === "USD"
    ? (input.marketVariants ?? []).map((variant) => variant.price).filter((price) => price > 0)
    : [];
  const offerLow = marketPrices.length
    ? Math.min(...marketPrices)
    : madeToMeasure ? low * MIN_WALLPAPER_SQFT : low;
  const offerHigh = marketPrices.length
    ? Math.max(...marketPrices)
    : madeToMeasure ? Math.max(high * MIN_WALLPAPER_SQFT, offerLow) : high;

  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: input.title,
    image: input.images,
    description: input.description,
    sku: structuredSku(input.code || input.handle),
    brand: { "@type": "Brand", name: brand.name },
    // The family's own Google product category — a canvas print is artwork, not
    // wallpaper, and telling Google otherwise miscategorises the whole line.
    ...(f?.category.googleProductCategory ? { category: f.category.googleProductCategory } : {}),
    // Machine-readable size, so an agent can compare like with like: the fixed
    // ladder for a canvas, the fixed height for a border, nothing for a mural
    // (whose size is whatever the customer's wall is).
    ...(f?.fixedSizes.length ? { size: f.fixedSizes.map((s) => s.label) } : {}),
    ...(f?.heightCm
      ? { height: { "@type": "QuantitativeValue", value: f.heightCm, unitCode: "CMT" } }
      : {}),
    // Material variants + derived design attributes (colours, style, rooms…).
    // Canvas states the material by name only — its per-sq-ft make rate is
    // internal and must never appear (canvas is sold at fixed finished prices).
    additionalProperty: [
      ...input.materials.map((m) => ({
        "@type": "PropertyValue" as const,
        name: "Material",
        value: input.isCanvas || market.currency !== "INR" ? m.name : `${m.name} — ₹${m.pricePerSqFt}/sq ft`,
      })),
      ...attrProps,
    ],
    offers: input.selected
      ? {
          // Deep-linked configuration (Shopping ad landing): one firm price,
          // exactly what the configurator shows for this size + material.
          "@type": "Offer",
          sku: googleSku(input.selected.sku),
          name: `${input.title} — ${input.selected.label}`,
          price: input.selected.price,
          priceCurrency: market.currency,
          availability: "https://schema.org/InStock",
          itemCondition: "https://schema.org/NewCondition",
          url: input.selected.url,
          shippingDetails,
          hasMerchantReturnPolicy: returnPolicy,
        }
      : {
          "@type": "AggregateOffer",
          priceCurrency: market.currency,
          lowPrice: offerLow,
          highPrice: offerHigh,
          offerCount: marketPrices.length || canvasFixedPrices?.length || input.materials.length || 1,
          availability: "https://schema.org/MadeToOrder",
          url: `${SITE_URL}/products/${input.handle}`,
          // Fixed-size canvas has no per-unit rate to advertise — every other
          // design carries a genuine ₹/sq ft (or ₹/m) unit price.
          ...(input.isCanvas || market.currency !== "INR"
            ? {}
            : {
                priceSpecification: {
                  "@type": "UnitPriceSpecification",
                  price: low,
                  priceCurrency: "INR",
                  unitText,
                  referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitText },
                },
              }),
          shippingDetails,
          hasMerchantReturnPolicy: returnPolicy,
        },
  };
  // No price anyone can pay (a canvas piece with no priced material yet): say
  // nothing rather than advertise the ₹200 placeholder `low` falls back to —
  // an offer Google finds contradicted on the page costs the rich result.
  if (!input.selected && !prices.length && !marketPrices.length) delete data.offers;

  if (input.rating && input.rating.count > 0) {
    data.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: Number(input.rating.average.toFixed(1)),
      reviewCount: input.rating.count,
      bestRating: 5,
      worstRating: 1,
    };
  }
  return data;
}

/**
 * ProductGroup with the design's representative purchasable variants — the
 * same size/material/price set the Merchant Center feed advertises, each with
 * its deep-link URL, so Google can reconcile every feed item against the page.
 */
export function productGroupJsonLd(input: {
  handle: string;
  title: string;
  description: string;
  image: string | null;
  variants: RepresentativeVariant[];
  marketCountryCode?: string;
}) {
  const market = marketFor(input.marketCountryCode ?? "IN");
  const shippingDetails = shippingDetailsFor(market.countryCode);
  const returnPolicy = returnPolicyFor(market.countryCode);
  return {
    "@context": "https://schema.org",
    "@type": "ProductGroup",
    "@id": `${SITE_URL}/products/${input.handle}#group`,
    productGroupID: `ZYV-${input.handle.toUpperCase()}`,
    name: input.title,
    description: input.description,
    url: `${SITE_URL}/products/${input.handle}`,
    ...(input.image ? { image: input.image } : {}),
    brand: { "@type": "Brand", name: brand.name },
    variesBy: ["https://schema.org/size", "https://schema.org/material"],
    hasVariant: input.variants.map((v) => ({
      "@type": "Product",
      sku: googleSku(v.sku),
      name: `${input.title} — ${v.label}`,
      // Each Product variant is validated independently by Google's Merchant
      // listings parser. Inheriting this only from ProductGroup leaves every
      // variant with a "Missing field description" warning.
      description: input.description,
      size: v.sizeText,
      material: v.materialName,
      ...(input.image ? { image: input.image } : {}),
      offers: {
        "@type": "Offer",
        price: v.price,
        priceCurrency: market.currency,
        availability: "https://schema.org/InStock",
        itemCondition: "https://schema.org/NewCondition",
        url: v.url,
        shippingDetails,
        hasMerchantReturnPolicy: returnPolicy,
      },
    })),
  };
}

// ---- collection / room ----

const KIND_CRUMB: Record<string, string> = {
  room: "Shop by Room",
  category: "Shop by Style",
  color: "Shop by Colour",
  curated: "Collections",
  other: "Wallpaper",
};

export function collectionJsonLd(input: {
  handle: string;
  title: string;
  kind: string;
  products: { handle: string; title: string; image: string | null }[];
}) {
  const url = `${SITE_URL}/collections/${input.handle}`;
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: KIND_CRUMB[input.kind] ?? "Wallpaper", item: `${SITE_URL}/collections/wall-art` },
      { "@type": "ListItem", position: 3, name: input.title, item: url },
    ],
  };
  const page = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: input.title,
    url,
    isPartOf: { "@id": `${SITE_URL}/#website` },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: input.products.length,
      itemListElement: input.products.slice(0, 60).map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${SITE_URL}/products/${p.handle}`,
        name: p.title,
        ...(p.image ? { image: p.image } : {}),
      })),
    },
  };
  return [breadcrumb, page];
}

// ---- editorial / informational pages ----

/** FAQ markup mirrors the visible answers; search engines decide how to use it. */
export function faqJsonLd(
  faqs: { heading: string; body: string }[],
  url: string,
) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${url}#faq`,
    url,
    isPartOf: { "@id": `${SITE_URL}/#website` },
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.heading,
      acceptedAnswer: { "@type": "Answer", text: stripHtml(f.body) },
    })),
  };
}

/** A trail of {name, path} from Home to the current page. */
export function breadcrumbJsonLd(trail: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      ...trail.map((t, i) => ({
        "@type": "ListItem",
        position: i + 2,
        name: t.name,
        item: `${SITE_URL}${t.path}`,
      })),
    ],
  };
}

// ---- case studies ----

/**
 * A case-study book, as structured data. These pages are the site's evidence
 * that the work is real, and they are what an answer engine reaches for when
 * someone asks whether we have done a hotel, a hospital or a campus before.
 *
 * The concept/commissioned distinction is carried into the markup rather than
 * left to the prose. A concept study is speculative work for an invented
 * client, and letting a machine restate it as a delivered commission would be
 * a lie told on our behalf — so a concept study names no client organisation
 * and says what it is in a field a reader of the data cannot miss.
 */
export function projectJsonLd(input: {
  slug: string;
  title: string;
  client: string;
  standfirst: string;
  kind: "concept" | "commissioned";
  cover: string | null;
  facts: { label: string; value: string }[];
}) {
  const url = `${SITE_URL}/projects/${input.slug}`;
  const commissioned = input.kind === "commissioned";
  const work = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    "@id": `${url}#project`,
    name: input.title,
    headline: input.title,
    abstract: input.standfirst,
    description: input.standfirst,
    url,
    ...(input.cover ? { image: input.cover } : {}),
    isPartOf: { "@id": `${SITE_URL}/#website` },
    creator: { "@id": `${SITE_URL}/#organization` },
    // Only a real commission gets a real client.
    ...(commissioned ? { sourceOrganization: { "@type": "Organization", name: input.client } } : {}),
    additionalProperty: [
      {
        "@type": "PropertyValue",
        name: "Project type",
        value: commissioned
          ? "Commissioned project — designed and produced for a real client"
          : "Concept study — speculative work for an invented client, not a delivered commission",
      },
      ...input.facts.map((f) => ({ "@type": "PropertyValue" as const, name: f.label, value: f.value })),
    ],
  };
  const breadcrumb = breadcrumbJsonLd([
    { name: "Projects", path: "/projects" },
    { name: input.title, path: `/projects/${input.slug}` },
  ]);
  return [work, breadcrumb];
}
