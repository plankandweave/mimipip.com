// Product feed shared by the Google Merchant Center and Pinterest catalogue
// routes (RSS 2.0 + g: namespace — Pinterest reads Google's format).
//
// Mural wallpaper designs are advertised as representative purchasable variants
// (Google's customised-product guidance) and ready-size designs as their exact
// fixed sizes — all prices GST-inclusive INR, computed by the same pricing
// functions the product page uses, with deep links that open the page on the
// advertised configuration. Custom made-to-order goods carry no GTIN, so
// identifier_exists is "no" per Google's unique-identifier rules.
//
// The two destinations differ only in pictures and samples — see
// ProductFeedOptions. Anything else added here reaches both.
import { supabase } from "@/lib/supabase";
import { SITE_URL, googleSku, stripHtml } from "@/lib/seo";
import {
  madeToMeasureVariants,
  readySizeVariants,
  sampleVariant,
  unitRateLabel,
  canvasSizeVariants,
  borderLengthVariants,
  marketVariant,
  type RepresentativeVariant,
  type VariantMaterial,
} from "@/lib/variants";
import { BORDER_LENGTH_OPTIONS_M, WALLPAPER_CATEGORY } from "@/lib/product-category";
import { fixedSizeStatement } from "@/lib/product-facts";
import { marketFor } from "@/lib/markets";
import { SAMPLE_UNIT_PRICE } from "@/lib/sample-print";

/**
 * How a feed chooses its pictures.
 * - "flat-first": the clean flat artwork leads and room renders ride along as
 *   additional images (Google Merchant Center — the product itself first).
 * - "renders-only": the flat is never sent at all; a design with no room render
 *   is left out of the feed (Pinterest — every picture a shopper sees there is
 *   a wallpaper on a wall, never a swatch; the homepage's rule 9, off-site).
 */
export type FeedImagePolicy = "flat-first" | "renders-only";

export type ProductFeedOptions = {
  images: FeedImagePolicy;
  /** The ₹200 A4 swatch offers. Google carries them; Pinterest does not. */
  includeSamples: boolean;
};

type Row = {
  handle: string;
  flat_verified: boolean | null;
  title: string;
  description: string | null;
  ready_sizes: [number, number][] | null;
  category: string | null;
  price_per_metre: number | null;
  border_height_cm: number | null;
  supply_format: "continuous" | "segmented" | null;
  segment_length_m: number | null;
  product_categories: {
    title: string;
    measurement_type: "area" | "length" | "fixed" | null;
    google_product_category: string | null;
    product_type: string | null;
    web_material_slug: string | null;
  } | null;
  product_images: { url: string; position: number; is_featured: boolean; is_flat: boolean }[];
  product_tags: { tag: string }[];
  product_materials: {
    price_per_sqft: number;
    available: boolean;
    materials: { slug: string; name: string; coming_soon: boolean } | null;
  }[];
};

const WALLPAPER_GOOGLE_CATEGORY = "Home & Garden > Decor > Wallpaper";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// g:color — first recognisable colour among the design's tags.
const COLOURS = [
  "black", "white", "grey", "gray", "beige", "cream", "ivory", "brown", "tan",
  "red", "crimson", "maroon", "pink", "blush", "orange", "terracotta", "rust",
  "yellow", "gold", "ochre", "green", "sage", "teal", "olive", "blue", "navy",
  "indigo", "purple", "lavender", "violet", "multicolour", "multicolor",
];
function colourFromTags(tags: string[]): string | null {
  for (const t of tags) {
    const low = t.toLowerCase();
    const hit = COLOURS.find((c) => low === c || low.includes(c));
    if (hit) return hit[0].toUpperCase() + hit.slice(1);
  }
  return null;
}

function priceBand(p: number): string {
  if (p < 5000) return "under-5k";
  if (p < 10000) return "5k-10k";
  if (p < 20000) return "10k-20k";
  return "20k-plus";
}

function itemXml(opts: {
  v: RepresentativeVariant;
  groupId: string;
  title: string;
  description: string;
  imageLink: string;
  additionalImages: string[];
  colour: string | null;
  productType: string;
  /** Which product family this item belongs to — feeds the custom label Google
   *  segments on, and stops a canvas or a border being bid on as wallpaper. */
  kind: "ready-size" | "made-to-measure" | "canvas" | "border" | "sample";
  /** The family's own Google taxonomy node. */
  googleCategory: string;
  countryCode: string;
}): string {
  const { v, groupId } = opts;
  const market = marketFor(opts.countryCode);
  const material =
    opts.kind === "canvas"
      ? "Canvas"
      : opts.kind === "border"
        ? "Paper"
        : opts.kind === "sample"
          ? "Non-woven"
        : v.materialSlug === "self-adhesive-vinyl"
          ? "Self-adhesive vinyl"
          : "Non-woven";
  return `<item>
<g:id>${esc(googleSku(v.sku))}</g:id>
<g:item_group_id>${esc(groupId)}</g:item_group_id>
<g:title>${esc(opts.title)}</g:title>
<g:description>${esc(opts.description)}</g:description>
<g:link>${esc(v.url)}</g:link>
<g:image_link>${esc(opts.imageLink)}</g:image_link>
${opts.additionalImages.map((u) => `<g:additional_image_link>${esc(u)}</g:additional_image_link>`).join("\n")}
<g:price>${v.price.toFixed(2)} ${market.currency}</g:price>
<g:availability>in_stock</g:availability>
<g:condition>new</g:condition>
<g:brand>Zyvorah</g:brand>
<g:identifier_exists>no</g:identifier_exists>
<g:google_product_category>${esc(opts.googleCategory)}</g:google_product_category>
<g:product_type>${esc(opts.productType)}</g:product_type>
${opts.colour ? `<g:color>${esc(opts.colour)}</g:color>` : ""}
<g:material>${esc(material)}</g:material>
<g:size>${esc(v.sizeText)}</g:size>
<g:shipping><g:country>${market.countryCode}</g:country><g:service>${market.countryCode === "IN" ? "Standard" : "International"}</g:service><g:price>0.00 ${market.currency}</g:price></g:shipping>
<g:min_handling_time>1</g:min_handling_time>
<g:max_handling_time>${opts.kind === "made-to-measure" ? 5 : 3}</g:max_handling_time>
<g:custom_label_0>${opts.kind}</g:custom_label_0>
<g:custom_label_1>${esc(v.materialName)}</g:custom_label_1>
<g:custom_label_2>${esc(v.sizeText)}</g:custom_label_2>
<g:custom_label_3>${priceBand(v.price)}</g:custom_label_3>
</item>`;
}

export async function productFeedResponse(request: Request, opts: ProductFeedOptions): Promise<Response> {
  // The default URL remains the existing India source. Merchant Center can
  // fetch country-specific sources with stable local-market offers. Keep the
  // allowlist explicit: an arbitrary query must never manufacture a new feed.
  const requestedCountry = new URL(request.url).searchParams.get("country")?.toUpperCase();
  const countryCode = requestedCountry === "US" || requestedCountry === "AE" ? requestedCountry : "IN";
  // Page through the full active catalogue.
  const rows: Row[] = [];
  const PAGE = 100;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("products")
      .select(
        `handle, flat_verified, title, description, ready_sizes, category, price_per_metre, border_height_cm, supply_format, segment_length_m,
         product_categories ( title, measurement_type, google_product_category, product_type, web_material_slug ),
         product_images ( url, position, is_featured, is_flat ),
         product_tags ( tag ),
         product_materials ( price_per_sqft, available, materials ( slug, name, coming_soon ) )`,
      )
      .eq("status", "active").eq("is_service", false)
      .order("handle")
      .range(from, from + PAGE - 1);
    if (error) return new Response(`feed error: ${error.message}`, { status: 500 });
    const batch = (data ?? []) as unknown as Row[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }

  const items: string[] = [];
  for (const p of rows) {
    const family = p.product_categories?.measurement_type ?? "area";
    const googleCategory = p.product_categories?.google_product_category ?? WALLPAPER_GOOGLE_CATEGORY;
    const familyType = p.product_categories?.product_type ?? "Wallpapers & Murals";

    const allMaterials: VariantMaterial[] = p.product_materials
      .filter((m) => m.available && m.materials && !m.materials.coming_soon)
      .map((m) => ({
        slug: m.materials!.slug,
        name: m.materials!.name,
        pricePerSqFt: Number(m.price_per_sqft),
      }));
    const webMaterialSlug = p.product_categories?.web_material_slug;
    const scopedMaterials = webMaterialSlug
      ? allMaterials.filter((material) => material.slug === webMaterialSlug)
      : allMaterials;
    // Match the storefront's webMedia() fallback: a bad category declaration
    // must not erase a product that still has one genuinely sellable medium.
    const materials = scopedMaterials.length ? scopedMaterials : allMaterials;
    // A border carries no material (it has no finish to choose), so the
    // material check that guards the wallpaper families would drop it entirely.
    if (!materials.length && family !== "length") continue;

    // Google: the clean flat artwork (the product itself) leads; room scenes
    // and alternates ride along as additional images. Pinterest: the flat is
    // dropped before anything is chosen, so it can be neither the main picture
    // nor an additional one, and a design with no render falls out below.
    const pool = opts.images === "renders-only"
      ? p.product_images.filter((i) => !i.is_flat)
      : p.product_images;
    const sorted = [...pool].sort(
      (a, b) => Number(b.is_flat) - Number(a.is_flat) || Number(b.is_featured) - Number(a.is_featured) || a.position - b.position,
    );
    const imageLink = sorted[0]?.url;
    if (!imageLink) continue;
    // Google accepts up to ten additional images, and "Images per offer" on
    // the Merchant Center store-quality scorecard reads as Incomplete when an
    // offer carries fewer than it could. Every room render we hold rides
    // along — the cap of three was leaving most of them out of Shopping.
    const additionalImages = [...new Set(sorted.slice(1).map((i) => i.url))]
      .filter((u) => u !== imageLink)
      .slice(0, 10);

    const tags = p.product_tags.map((t) => t.tag);
    const colour = colourFromTags(tags);
    const styleTag = tags.find((t) => !COLOURS.some((c) => t.toLowerCase().includes(c)) && !/^mood:/i.test(t)) ?? "Murals";
    const description = stripHtml(p.description).slice(0, 4800) ||
      `${p.title} — a Zyvorah wallpaper mural, prepared for your order in India.`;
    const groupId = `ZYV-${p.handle.toUpperCase()}`;

    const readySizes = p.ready_sizes ?? null;

    // Each family is advertised in its own terms. Advertising a border by the
    // square foot or a canvas as "sized to your wall" is not a wording slip — it
    // is an advertised offer the checkout will not honour.
    if (family === "length") {
      const ppm = Number(p.price_per_metre ?? 0);
      if (ppm <= 0) continue;
      const supply = { format: p.supply_format, segmentLengthM: p.segment_length_m };
      const variants = borderLengthVariants(SITE_URL, p.handle, BORDER_LENGTH_OPTIONS_M, ppm, supply);
      for (const base of variants) {
        const v = countryCode === "IN" ? base : marketVariant(base, countryCode);
        items.push(
          itemXml({
            v, groupId,
            title: `${p.title} Wallpaper Border – ${v.label}`,
            // v.label already carries the supply format ("5 m — 5 × 1 metre
            // strips"); the description adds the height and rules out the
            // made-to-measure reading a wallpaper shopper would otherwise make.
            description: `${description} Sold by the linear metre${p.border_height_cm ? `, ${p.border_height_cm} cm tall` : ""} — ${v.label}. Not sized to your wall.`,
            imageLink, additionalImages, colour,
            productType: `${familyType} > ${styleTag}`,
            kind: "border",
            googleCategory,
            countryCode,
          }),
        );
      }
    } else if (family === "fixed") {
      if (!readySizes?.length) continue;
      // Wall art sells in up to two media (canvas and self-adhesive) — each is
      // its own advertised product with its own SKU, price and wording.
      for (const mat of materials) {
        const variants = canvasSizeVariants(SITE_URL, p.handle, readySizes, mat);
        const adhesive = mat.slug === "self-adhesive-vinyl";
        for (const base of variants) {
          const v = countryCode === "IN" ? base : marketVariant(base, countryCode);
          items.push(
            itemXml({
              v, groupId,
              title: `${p.title} ${adhesive ? "Self-Adhesive Wall Art" : "Canvas Art Print"} – ${v.sizeText}`,
              // Each item advertises ONE medium, so it says which — the feed
              // must never sell a self-adhesive SKU as a canvas print.
              description: `${description} ${fixedSizeStatement([adhesive ? "self-adhesive" : "canvas"])}`,
              imageLink, additionalImages, colour,
              productType: `${familyType} > ${styleTag}`,
              kind: "canvas",
              googleCategory,
              countryCode,
            }),
          );
        }
      }
    } else if (readySizes?.length) {
      const variants = readySizeVariants(SITE_URL, p.handle, readySizes, materials[0]);
      for (const base of variants) {
        const v = countryCode === "IN" ? base : marketVariant(base, countryCode);
        items.push(
          itemXml({
            v, groupId,
            title: `${p.title} Peel & Stick Wallpaper – ${v.sizeText}`,
            description, imageLink, additionalImages, colour,
            productType: `Wallpaper > Peel & Stick > ${styleTag}`,
            kind: "ready-size",
            googleCategory,
            countryCode,
          }),
        );
      }
    } else {
      const variants = madeToMeasureVariants(SITE_URL, p.handle, materials);
      for (const base of variants) {
        const v = countryCode === "IN" ? base : marketVariant(base, countryCode);
        // The rate, not just the total. A whole 12 × 8 ft wall at ₹19,200 sits
        // in the carousel beside a ₹6,000 roll that covers a fraction of it;
        // "₹200/sq ft" is what lets a shopper compare like with like.
        const rate = unitRateLabel(v.price, v.areaSqFt, marketFor(countryCode).currency);
        items.push(
          itemXml({
            v, groupId,
            title: `${p.title} Wallpaper Mural – ${v.sizeText}${rate ? ` (${rate})` : ""} – ${v.materialName}`,
            description, imageLink, additionalImages, colour,
            productType: `Wallpaper > Mural Designs > ${styleTag}`,
            kind: "made-to-measure",
            googleCategory,
            countryCode,
          }),
        );
      }
    }

    // The ₹200 way in. Every other item on this feed asks for ₹19,000+ before
    // a customer has touched the paper; a sample is the one purchase a first
    // visitor will actually make, and it is what gives Smart Bidding a
    // conversion to learn from. India only — a swatch is not worth posting
    // abroad. Mirrors isSampleableHandle() in queries.ts.
    const sampleable =
      opts.includeSamples &&
      countryCode === "IN" &&
      p.product_categories?.measurement_type !== "length" &&
      p.category === WALLPAPER_CATEGORY &&
      p.flat_verified === true &&
      p.product_materials.some((m) => m.available && m.materials?.slug === "smooth-matt");
    if (sampleable) {
      const v = sampleVariant(SITE_URL, p.handle, SAMPLE_UNIT_PRICE);
      items.push(
        itemXml({
          v, groupId,
          title: `${p.title} Wallpaper Sample – A4 design sample`,
          // Says plainly what ₹200 buys. A shopper who thinks this is the
          // mural is a refund, not a sale.
          description: `A single A4 design sample of ${p.title}, posted to you so you can see the print and feel the material before ordering a wall. This is a sample, not the mural itself. ₹${SAMPLE_UNIT_PRICE} including GST, delivered free across India.`,
          imageLink, additionalImages, colour,
          productType: `Wallpaper > Samples > ${styleTag}`,
          kind: "sample",
          googleCategory,
          countryCode,
        }),
      );
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
<title>Zyvorah — Mural Wallpaper Designs &amp; Murals</title>
<link>${SITE_URL}</link>
<description>${countryCode === "IN"
  ? "Zyvorah wallpaper murals, prepared for your order in India. Prices GST-inclusive, free shipping across India."
  : `Zyvorah wallpaper murals, designed and prepared for your order in India for delivery to ${marketFor(countryCode).countryName}. USD prices include international delivery; local duties and taxes are excluded.`}</description>
${items.join("\n")}
</channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
