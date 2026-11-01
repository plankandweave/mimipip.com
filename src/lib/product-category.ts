import { supabase } from "./supabase";
import { cachedCatalogue } from "./catalogue-cache";

// Product CATEGORIES — the top-level "what kind of product is this?" axis.
//
// Three families, and the only thing a surface needs to know is which one it is
// holding:
//
//   Wallpapers & Murals — AREA. Custom-sized to the customer's wall, ₹/sq ft.
//   Borders & Strips    — LENGTH. ₹/linear metre, supplied in 1 m pieces
//                         (5 × 1 m = a set) or one continuous strip.
//   Canvas Art          — FIXED. A finished piece in one of six sizes.
//
// The category owns the pricing unit, the measurement type, the configuration
// capabilities and the card copy, so every surface asks one question — what
// category is this product in? — instead of sniffing at handles, tags or
// pricing columns. See migrations 0048 and 0050.

/** area = custom-sized · length = per linear metre · fixed = fixed finished size. */
export type MeasurementType = "area" | "length" | "fixed";

export type ProductCategory = {
  slug: string;
  title: string;
  /** The product_tag every product in this category carries. */
  browseTag: string;
  /** The collection handle this family browses at. */
  collectionHandle: string;
  pricingUnit: "sqft" | "metre" | "piece";
  measurementType: MeasurementType;
  /** Fixed supply length in metres; null when not sold by the metre. */
  fixedLengthM: number | null;
  /** Website minimum per cart line, in the category's own pricing unit. */
  minOrderQty: number;
  supportsCustomSize: boolean;
  /** Sells from a fixed size ladder (products.ready_sizes) — Canvas Art. */
  supportsFixedSizes: boolean;
  supportsVisualiser: boolean;
  supportsMaterials: boolean;
  supportsSamples: boolean;
  /** The ONLY medium the storefront may offer or price from, when the category
   *  declares one (Canvas Art -> eco-cotton canvas). Other available media on
   *  such a product exist for CHANNELS only — the self-adhesive row is what
   *  makes a wall-art design Amazon-FBA-able — and must never be shown as a
   *  website choice or used to compute a displayed price. Null = every
   *  available medium is selectable (Wallpapers & Murals). See migration 0065. */
  webMaterialSlug: string | null;
  /** Feed + structured-data identity, so agents aren't told a canvas is wallpaper. */
  googleProductCategory: string | null;
  productType: string | null;
  /** The promise line on a product card. */
  cardLabel: string | null;
  position: number;
};

export const WALLPAPER_CATEGORY = "wallpaper";
export const BORDER_CATEGORY = "border";
export const CANVAS_CATEGORY = "canvas";

// FK-only stock row for per-metre cart lines (cart_items.material_id is NOT
// NULL and cart_add_item resolves a slug). Never shown as a material choice.
export const BORDER_MATERIAL_SLUG = "border";

/** Five 1 m pieces make a set — the only border purchase. */
export const BORDER_SET_METRES = 5;
// The lengths a border sells in: just the set. A loose metre is not sold —
// min_order_qty = 5 (migration 0061) enforces the same floor in the cart RPCs.
// Kept here so the configurator, the copy and the feed cannot disagree about
// what is orderable.
export const BORDER_LENGTH_OPTIONS_M = [BORDER_SET_METRES] as const;

type Row = {
  slug: string;
  title: string;
  browse_tag: string;
  collection_handle: string | null;
  pricing_unit: "sqft" | "metre" | "piece";
  measurement_type: MeasurementType | null;
  fixed_length_m: number | string | null;
  min_order_qty: number;
  supports_custom_size: boolean;
  supports_fixed_sizes: boolean;
  supports_visualiser: boolean;
  supports_materials: boolean;
  supports_samples: boolean;
  web_material_slug: string | null;
  google_product_category: string | null;
  product_type: string | null;
  card_label: string | null;
  position: number;
};

const CATEGORY_SELECT =
  "slug, title, browse_tag, collection_handle, pricing_unit, measurement_type, fixed_length_m, min_order_qty, supports_custom_size, supports_fixed_sizes, supports_visualiser, supports_materials, supports_samples, web_material_slug, google_product_category, product_type, card_label, position";

function toCategory(r: Row): ProductCategory {
  return {
    slug: r.slug,
    title: r.title,
    browseTag: r.browse_tag,
    collectionHandle: r.collection_handle ?? r.slug,
    pricingUnit: r.pricing_unit,
    // Pre-0050 rows carry no measurement_type; derive it from the pricing unit
    // rather than rendering a family-less product.
    measurementType:
      r.measurement_type ?? (r.pricing_unit === "metre" ? "length" : r.pricing_unit === "piece" ? "fixed" : "area"),
    fixedLengthM: r.fixed_length_m != null ? Number(r.fixed_length_m) : null,
    minOrderQty: Math.max(1, Number(r.min_order_qty) || 1),
    supportsCustomSize: r.supports_custom_size,
    supportsFixedSizes: r.supports_fixed_sizes,
    supportsVisualiser: r.supports_visualiser,
    supportsMaterials: r.supports_materials,
    supportsSamples: r.supports_samples,
    webMaterialSlug: r.web_material_slug ?? null,
    googleProductCategory: r.google_product_category,
    productType: r.product_type,
    cardLabel: /custom[- ]made/i.test(r.card_label ?? "") ? "Wallpaper mural" : r.card_label,
    position: Number(r.position) || 0,
  };
}

export const WALLPAPER_FALLBACK: ProductCategory = {
  slug: WALLPAPER_CATEGORY,
  title: "Wallpapers & Murals",
  browseTag: "Wallpapers",
  collectionHandle: "wall-art",
  pricingUnit: "sqft",
  measurementType: "area",
  fixedLengthM: null,
  minOrderQty: 1,
  supportsCustomSize: true,
  supportsFixedSizes: false,
  supportsVisualiser: true,
  supportsMaterials: true,
  supportsSamples: true,
  webMaterialSlug: null,
  googleProductCategory: "Home & Garden > Decor > Wallpaper",
  productType: "Wallpapers & Murals",
  cardLabel: "Wallpaper mural",
  position: 0,
};

/** Every category, in display order. Cached across requests (catalogue-cache). */
export const getProductCategories = cachedCatalogue("product-categories", async (): Promise<ProductCategory[]> => {
  const { data, error } = await supabase
    .from("product_categories")
    .select(CATEGORY_SELECT)
    .order("position");
  if (error) throw error;
  return ((data as Row[]) ?? []).map(toCategory);
});

/**
 * One product's category. Falls back to Wallpapers — the default every existing
 * product carries — so a surface never renders capability-less.
 */
export async function getProductCategory(slug: string | null | undefined): Promise<ProductCategory> {
  const all = await getProductCategories();
  return all.find((c) => c.slug === slug) ?? all.find((c) => c.slug === WALLPAPER_CATEGORY) ?? WALLPAPER_FALLBACK;
}

/** Categories that browse on their own listing rather than inside Wallpapers. */
export async function getNonWallpaperCategories(): Promise<ProductCategory[]> {
  return (await getProductCategories()).filter((c) => c.slug !== WALLPAPER_CATEGORY);
}

/** The collection handle a category browses at. */
export function categoryHref(c: Pick<ProductCategory, "collectionHandle">): string {
  return `/collections/${c.collectionHandle}`;
}

/**
 * The family whose listing (or sub-listing) lives at this collection handle, so
 * a shared collection page can describe itself truthfully instead of calling
 * everything mural wallpaper. Null on every wallpaper browse page.
 */
export async function categoryForCollection(
  handle: string,
  categoryScope: string | null | undefined,
): Promise<ProductCategory | null> {
  if (!categoryScope) {
    // Pre-0050 rows have no scope; fall back to matching the family's own handle.
    const byHandle = (await getNonWallpaperCategories()).find((c) => c.collectionHandle === handle);
    return byHandle ?? null;
  }
  if (categoryScope === WALLPAPER_CATEGORY) return null;
  return (await getProductCategories()).find((c) => c.slug === categoryScope) ?? null;
}

// ---------------------------------------------------------------------------
// The shop architecture.
//
// Three product families plus two destinations that are not product categories
// at all: Samples (cut from wallpaper stock, ordered against a design) and Gift
// Cards (a payment instrument). They belong in the shop nav all the same — a
// shopper looking for either does not care that the catalogue models them
// differently — so the nav is assembled here rather than hardcoded per surface.
// ---------------------------------------------------------------------------

export type ShopDestination = {
  label: string;
  href: string;
  /** Set when this destination is a real product family. */
  category: ProductCategory | null;
};

export const SAMPLES_DESTINATION: ShopDestination = { label: "Samples", href: "/samples", category: null };
export const GIFT_CARD_DESTINATION: ShopDestination = { label: "Gift Cards", href: "/gift-card", category: null };

/**
 * The shop's top level, in order: the non-wallpaper families (Wallpapers has
 * its own mega-menu), then Samples and Gift Cards.
 */
export async function getShopDestinations(): Promise<ShopDestination[]> {
  const families = await getNonWallpaperCategories();
  return [
    ...families.map((c) => ({
      label: c.title,
      href: c.slug === "book" ? "/mati#book" : categoryHref(c),
      category: c,
    })),
    SAMPLES_DESTINATION,
    GIFT_CARD_DESTINATION,
  ];
}

/**
 * The media a CUSTOMER may choose from on the website.
 *
 * A category may declare a single web medium (Canvas Art -> eco-cotton canvas).
 * Any other available medium on such a product belongs to a sales channel, not
 * the storefront: the self-adhesive row on a wall-art design is what the Amazon
 * FBA desk mints and exports. Showing it on site would offer a peel & stick
 * good on a page that promises an unframed canvas — and, because it is the
 * cheaper rate, would advertise a "from" price the website cannot sell.
 *
 * Every storefront surface that reads a product's media must go through here.
 */
export function webMedia<T extends { slug: string }>(
  media: T[],
  category: Pick<ProductCategory, "webMaterialSlug">,
): T[] {
  if (!category.webMaterialSlug) return media;
  const only = media.filter((m) => m.slug === category.webMaterialSlug);
  // Never return an empty picker: a product whose declared medium is missing
  // still has to render, so fall back to whatever it does carry.
  return only.length ? only : media;
}
