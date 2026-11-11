import {find as mimiDesign} from "@/brand/review/data";
import { sellableAnywhere } from "../brand/commerce/sale";
import { cache } from "react";
import { supabase, religionCatalogue } from "./supabase";
import { cachedCatalogue, CATALOGUE_REVALIDATE } from "./catalogue-cache";
import { isCanvasProduct, fromReadySizePrice, isAutographTier, isExclusiveTier, PRICE_TIER_TAGS } from "./pricing";
import { WALLPAPER_CATEGORY, BORDER_CATEGORY, CANVAS_CATEGORY } from "./product-category";
import { logicalDayIndex, turnWindow } from "./dailyRotation";
import { roomKeyForQuery, roomAltPhrase, roomQueryVocabulary } from "./rooms";
import { buildLexicon, correctSearchQuery, type Lexicon, type LexiconEntry } from "./search-spelling";
import { heldOutOfRoom } from "./room-suitability";
import { ilikeLiteral, nameCandidates } from "./design-name";
import { SCENE_ROOM_TAGS } from "./studio-scenes";
import { eligibleShortlist } from "./partner-shortlist";
import { namedCollection, roomPicturesFirst, type NamedCollection, type NamedCollectionRow } from "./search-intent";
import type { Product, Collection, ProductCardData, ProductImage, ShowcaseEntry } from "./types";
import type { TrendingCard } from "./trending-pins";

// Full select — only for the single-product page, which renders the
// description and tags.
const PRODUCT_SELECT = `
  id, handle, code, title, description, status, vendor, flat_verified, is_service, created_at, is_signature, is_new, is_showroom_favourite, is_limited, is_founders_favourite, founders_note, price_tier, ready_sizes, orientation, category, price_per_metre, border_height_cm, supply_format, segment_length_m, is_seamless, repeat_width_cm, edition_limit,
  product_images ( url, alt, position, is_featured, is_flat, scene_key, width, height ),
  product_materials ( price_per_sqft, available, materials ( slug, name, description, default_price_per_sqft, coming_soon, swatch_url, texture_url, roll_width_mm ) )
`;

// Slim select for card grids: no description/before_url (never shown on a
// card, and the collection pages pull up to 500 rows — fetching large
// description HTML for all of them is pure waste).
const CARD_SELECT = `
  handle, title, flat_verified, is_service, created_at, is_signature, is_new, is_showroom_favourite, is_limited, is_founders_favourite, price_tier, ready_sizes, orientation, category, price_per_metre, border_height_cm, supply_format, segment_length_m,
  product_images ( url, alt, position, is_featured, is_flat, scene_key, width, height ),
  product_materials ( price_per_sqft, available, materials ( slug ) ),
  product_categories ( pricing_unit, measurement_type, card_label, web_material_slug )
`;

/** How much of a signature collection the spotlight considers. Hero collections
 *  are curated and small (today the largest is 20 designs); this only has to be
 *  comfortably above that so the daily window sees the whole collection rather
 *  than a truncated page of it. */
const SIGNATURE_POOL_MAX = 60;

/**
 * The order a design's pictures are shown in: renders first (featured, then
 * by position), the flat pattern LAST. A card, a gallery or a share image
 * leads with the wallpaper on a wall, never with the bare swatch — the flat
 * exists for the Room Visualizer and the print pipeline, which ask for it by
 * name (pickFlatImage), not by being first. This used to sort on featured and
 * position alone, which let a seeding that marked its flat `is_featured` put
 * twelve swatches across "Just in" on 14 September 2026.
 */
export function sortImages(images: ProductImage[] = []): ProductImage[] {
  return [...images].sort(
    (a, b) =>
      Number(a.is_flat) - Number(b.is_flat) ||
      Number(b.is_featured) - Number(a.is_featured) ||
      a.position - b.position,
  );
}

/**
 * The clean flat (no-furniture) pattern image — used by the Room Visualizer and,
 * later, the print pipeline. Every active product must have exactly one (enforced
 * by a DB trigger); falls back to the featured/first image just in case.
 */
export function pickFlatImage(images: ProductImage[] = []): ProductImage | null {
  return images.find((i) => i.is_flat) ?? sortImages(images)[0] ?? null;
}

/**
 * Flat (clean, no-furniture) image URL per handle. The Room Visualizer ("See it
 * on your wall") must place the FLAT design, never a styled/lifestyle shot —
 * card grids use the featured (often styled) image, so anything feeding the
 * visualizer resolves the flat image through here instead.
 */
export const getFlatImageMap = cachedCatalogue("flat-image-map", async (handles: string[]): Promise<Record<string, string | null>> => {
  if (!handles.length) return {};
  const { data, error } = await supabase
    .from("products")
    .select("handle, product_images ( url, alt, position, is_featured, is_flat, scene_key )")
    .in("handle", handles)
    .eq("status", "active").eq("is_service", false);
  if (error) throw error;
  const map: Record<string, string | null> = {};
  for (const row of (data as { handle: string; product_images: ProductImage[] }[]) ?? []) {
    map[row.handle] = pickFlatImage(row.product_images ?? [])?.url ?? null;
  }
  return map;
});

/** Which picture a grid shows for every one of its cards. `flat` is an explicit
 *  product-shape choice for border strips; ordinary customer-facing cards do
 *  not silently fall back to artwork swatches. */
export type CardImageMode = "scene" | "flat" | "scene-preferred" | "room-then-any-scene";

function toCard(p: Product, roomKey?: string, mode?: CardImageMode): ProductCardData {
  const imgs = sortImages(p.product_images ?? []);
  const flat = (p.product_images ?? []).find((i) => i.is_flat);
  // Ordinary cards begin with a room render. The flat is selected only by the
  // explicit `flat` mode used for border strips and by pickFlatImage callers
  // such as the visualiser and print pipeline.
  let card = imgs.find((i) => !i.is_flat);
  if (roomKey) {
    const roomImg = (p.product_images ?? []).find((i) => i.scene_key === roomKey);
    // Search can use another room render when the requested room has not been
    // rendered. A room collection cannot; collection_page_v2 removes that
    // design before paging instead.
    card =
      roomImg ??
      (mode === "room-then-any-scene" ? imgs.find((i) => !i.is_flat) : undefined) ??
      undefined;
  }
  if (mode === "flat") card = flat ?? imgs[0];
  else if (mode === "scene" && !roomKey) card = imgs.find((i) => !i.is_flat);
  // Only the media the WEBSITE sells may set a card price. A Canvas Art design
  // also carries the self-adhesive row for Amazon FBA at the cheaper ₹200/sq ft
  // rate; letting that through advertised a "from" price the site cannot sell
  // (choosing canvas prices at ₹400). The category declares its web medium —
  // see webMedia() and migration 0065.
  const webSlug = p.product_categories?.web_material_slug ?? null;
  const availAll = (p.product_materials ?? []).filter((m) => m.available);
  const availWeb = webSlug ? availAll.filter((m) => m.materials?.slug === webSlug) : availAll;
  const availMaterials = availWeb.length ? availWeb : availAll;
  const prices = availMaterials.map((m) => Number(m.price_per_sqft)).filter((n) => n > 0);
  const fromPricePerSqft = prices.length ? Math.min(...prices) : null;
  const tags = (p.product_tags ?? []).map((t) => t.tag);
  // Canvas Wall Art is sold only at fixed sizes — surface a finished "from ₹X"
  // price (min over the size ladder), NEVER the internal per-sq-ft make rate.
  const materialSlugs = availMaterials
    .map((m) => m.materials?.slug)
    .filter((s): s is string => !!s);
  const isCanvas = isCanvasProduct(materialSlugs, tags);
  const readySizes = (p.ready_sizes ?? null) as [number, number][] | null;
  const fromPrice =
    isCanvas && readySizes?.length && fromPricePerSqft != null
      ? fromReadySizePrice(readySizes, fromPricePerSqft)
      : null;
  // Which product FAMILY this card belongs to — the one fact its copy turns on.
  // The category is authoritative; the canvas heuristic above only covers a
  // product whose category row hasn't been resolved (an older card query, or a
  // canvas still sitting in the wallpaper category before 0050's backfill).
  const measurementType =
    p.product_categories?.measurement_type ??
    (p.product_categories?.pricing_unit === "metre" ? "length" : isCanvas ? "fixed" : "area");
  // Alt text names the product and, when the picture IS a room render, the
  // room it shows ("Lotus Pond wallpaper in a pooja room"). Read off the image
  // actually chosen, so a card that fell back to its flat never claims a room.
  // The Studio's stored alts ("<title> — room 3") said neither.
  const noun = measurementType === "fixed" ? "canvas wall art" : measurementType === "length" ? "wallpaper border" : "wallpaper";
  const named = new RegExp(measurementType === "fixed" ? "canvas|painting" : measurementType === "length" ? "border|strip" : "wallpaper|mural", "i").test(p.title)
    ? p.title
    : `${p.title} ${noun}`;
  const room = card && !card.is_flat ? roomAltPhrase(card.scene_key) : undefined;
  const imageAlt = room ? `${named} in ${room}` : named;
  return {
    flatHoverImage: flat?.url ?? null,
    sampleable: p.category === WALLPAPER_CATEGORY && p.flat_verified === true && p.is_service === false && p.product_materials.some(m => m.available && m.materials?.slug === "self-adhesive-vinyl"),
    handle: p.handle,
    title: p.title,
    image: card?.url ?? mimiDesign(p.handle)?.image ?? flat?.url ?? null,
    imageAlt,
    imageIsFlat: card?.is_flat === true,
    imageScene: card && !card.is_flat ? card.scene_key ?? null : null,
    fromPricePerSqft,
    isCanvas,
    fromPrice,
    tags,
    createdAt: p.created_at ?? null,
    isSignature: p.is_signature ?? false,
    isNew: p.is_new ?? false,
    isShowroom: p.is_showroom_favourite ?? false,
    isLimited: p.is_limited ?? false,
    isFounders: p.is_founders_favourite ?? false,
    isAutograph: isAutographTier(p.price_tier),
    isExclusive: isExclusiveTier(p.price_tier),
    isReadySize: !!(p.ready_sizes && p.ready_sizes.length),
    category: p.category ?? null,
    pricingUnit: p.product_categories?.pricing_unit ?? null,
    measurementType,
    cardLabel: /custom[- ]made/i.test(p.product_categories?.card_label ?? "")
      ? "Wallpaper mural"
      : p.product_categories?.card_label ?? null,
    pricePerMetre: p.price_per_metre != null ? Number(p.price_per_metre) : null,
    // A design sold AS a shape must not be cropped square on a card, because
    // the crop then sells a different object than the one that arrives. Two
    // families qualify, for the same reason by different routes:
    //
    //  - fixed sizes (canvas): the ladder IS the shape, and every rung shares
    //    one ratio, so the first rung describes the whole design.
    //  - a wallpaper with a declared `orientation`: the artwork is a composed
    //    piece rather than a repeat. A phone-booth panel is an arch, or one
    //    reed, drawn for a 1:2.5 wall — square-cropping it throws the
    //    composition away and shows a detail nobody is buying. A repeating
    //    pattern has no orientation set and still crops freely, which is right:
    //    there the customer's wall supplies the shape.
    //
    // Taken from the image ACTUALLY SHOWN, not from the flat, so a landscape
    // room render on the same card gets its own ratio instead of being squeezed
    // into the artwork's.
    aspectRatio:
      measurementType === "fixed" && readySizes?.length && readySizes[0][1] > 0
        ? readySizes[0][0] / readySizes[0][1]
        : p.orientation && card?.width && card?.height
          ? card.width / card.height
          : null,
    // A border card tiles the repeat as a running strip — only the clean flat
    // pattern can do that (no pickFlatImage fallback: a tiled lifestyle shot
    // would repeat its furniture; the card falls back to a plain image instead).
    flatImage:
      measurementType === "length"
        ? ((p.product_images ?? []).find((i) => i.is_flat)?.url ?? null)
        : null,
    borderHeightCm:
      measurementType === "length" && p.border_height_cm != null ? Number(p.border_height_cm) : null,
    // Carried on every card, from the image chosen above rather than the flat,
    // so a frame can ask what shape it is about to crop before it crops it.
    // See src/lib/image-orientation.ts.
    imageWidth: card?.width ?? null,
    imageHeight: card?.height ?? null,
    orientation: p.orientation ?? null,
  };
}

/**
 * Every design carrying any of `tags`, in ONE query, keyed by tag. The hero
 * rotation (src/lib/heroRotation.ts) has to see the WHOLE candidate field at
 * once — its promise is that no hero image repeats, which it can only keep by
 * laying every candidate out in a single cycle. Thirty separate
 * getProductsByTag calls would say the same thing far more expensively.
 *
 * `roomKeyFor` supplies the room render per tag, exactly as getProductsByTag's
 * `roomKey` does for a room collection.
 */
// One collection's whole list of cards, as the shop window needs it. Sharded
// per tag on purpose: the old single `IN (every tag)` query returned 2.6 MB of
// rows per homepage request — too big to cache (the data cache caps entries at
// 2 MB) and, at the tail, over Supabase's statement timeout. Per tag each entry
// is a few hundred KB and the query is cheap; a cold miss fans out in parallel.
const getCardsByTag = cachedCatalogue("cards-by-tag", async (
  tag: string,
  roomKey?: string,
): Promise<ProductCardData[]> => {
  const { data, error } = await supabase
    .from("products")
    .select(`${CARD_SELECT}, product_tags ( tag ), member:product_tags!inner ( tag )`)
    .eq("status", "active").eq("is_service", false)
    .eq("member.tag", tag)
    .order("aesthetic_rank", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return ((data as unknown as Product[]) ?? []).map((p) => toCard(p, roomKey));
});

export async function getProductsByTags(
  tags: string[],
  roomKeyFor: (tag: string) => string | undefined = () => undefined,
): Promise<Record<string, ProductCardData[]>> {
  const out: Record<string, ProductCardData[]> = {};
  if (!tags.length) return out;
  const unique = [...new Set(tags)];
  // A design carrying several of these tags belongs to each of their lists —
  // rendered for whichever room that list is about.
  const lists = await Promise.all(unique.map((tag) => getCardsByTag(tag, roomKeyFor(tag))));
  unique.forEach((tag, i) => { out[tag] = lists[i]; });
  return out;
}

/**
 * Collections with enough active, imaged products to headline a homepage tile
 * (>= 8 by default) — the pool the daily rotation picks from, so a thin
 * collection never gets showcased looking sparse.
 */
export const getShowcasePool = cachedCatalogue("showcase-pool", async (minCount = 8): Promise<ShowcaseEntry[]> => {
  const { data, error } = await supabase.rpc("showcase_pool", { p_min_count: minCount });
  if (error) throw error;
  return (data as ShowcaseEntry[]) ?? [];
});

export const getProductsByTag = cachedCatalogue("products-by-tag", async (
  tag: string,
  limit = 48,
  roomKey?: string,
  category?: string,
):  Promise<ProductCardData[]> => {
  // `member` inner-joins to filter products to the collection's tag; the
  // separate `product_tags` embed returns ALL of each product's tags so the
  // collection page can offer real facet filters. `roomKey` (room collections)
  // makes each card show that product's render for the room.
  let query = supabase
    .from("products")
    .select(`${CARD_SELECT}, product_tags ( tag ), member:product_tags!inner ( tag )`)
    .eq("status", "active").eq("is_service", false)
    .eq("member.tag", tag);
  if (category) query = query.eq("category", category);
  const { data, error } = await query
    .order("aesthetic_rank", { ascending: true, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return ((data as unknown as Product[]) ?? []).map((p) => toCard(p, roomKey));
});

/**
 * A material the site prints on, priced the way that family is actually sold.
 *
 * This is the FINISH RANGE, not a stock list: a finish belongs here because we
 * print on it, even if it is reached through one collection rather than the
 * whole catalogue (see `restricted`).
 * What it must never do is quote a rate for something we do not print at all,
 * so an inactive material is still excluded.
 *
 * The two families price DIFFERENTLY and must never be shown the same way:
 *  - wallpaper is cut to measure, so its rate (`pricePerSqft`) is the price.
 *  - Wall Art is sold at FIXED sizes only, and its per-sq-ft rate is internal —
 *    the customer sees a finished per-size price and NEVER the multiple (see
 *    the canvas model note). So wall-art media carry `fromPrice` (the smallest
 *    size's finished price) and `pricePerSqft: null`.
 */
export type MaterialOffer = {
  slug: string;
  name: string;
  family: "wallpaper" | "wall-art";
  pricePerSqft: number | null;
  fromPrice: number | null;
  /** True when the finish is not selectable design-by-design — it comes with a
   *  particular range instead. The card must then send the reader to that
   *  range rather than to a configurator that will refuse the finish. */
  restricted: boolean;
  /** The lowest Autograph-tier rate for this finish, or null when no Autograph
   *  design prints on it. A surface that fronts a finish AS the Autograph
   *  finish quotes this; everything else quotes `pricePerSqft`, which is what
   *  the finish actually costs across the catalogue. */
  autographRate: number | null;
};

type MaterialOfferRow = {
  price_per_sqft: number | string | null;
  materials: { slug: string; name: string; coming_soon: boolean } | null;
  products: {
    category: string | null;
    ready_sizes: [number, number][] | null;
    price_tier: string | null;
  } | null;
};

/** Every material we print on, wallpaper finishes first, cheapest first. */
// The key carries the SHAPE's version: a cached entry outlives a deploy, so a
// new field (autographRate) read from an old entry is silently undefined for
// up to CATALOGUE_REVALIDATE. Bump the suffix whenever MaterialOffer changes —
// or, as for v3, whenever a cached value is known to be WRONG and must not
// outlive the deploy that fixes it.
export const getMaterialOffers = cachedCatalogue("material-offers:v3", async ():  Promise<MaterialOffer[]> => {
  // Supabase caps a response at 1,000 rows, and this read is one row per
  // (design, finish): 1,271 on 7 October 2026. Unpaged, it silently saw an
  // arbitrary 1,000 of them and the materials page quoted Linen Textured
  // "from ₹230" while 36 live designs sold it at ₹200 — the "from" price is a
  // minimum, and a minimum over a sample is not a minimum. Page the whole
  // table, the way the sitemap does, and throw on an outage rather than
  // quote from a partial read.
  const rows: MaterialOfferRow[] = [];
  const batchSize = 500;
  for (let from = 0; ; from += batchSize) {
    const { data, error } = await supabase
      .from("product_materials")
      .select("price_per_sqft, available, materials!inner ( slug, name, active, coming_soon ), products!inner ( status, is_service, category, ready_sizes, price_tier )")
      .eq("available", true)
      .eq("materials.active", true)
      .eq("products.status", "active")
      .eq("products.is_service", false)
      .order("product_id").order("material_id")
      .range(from, from + batchSize - 1);
    if (error) throw error;
    rows.push(...((data as unknown as MaterialOfferRow[]) ?? []));
    if (!data || data.length < batchSize) break;
  }
  return reduceMaterialOffers(rows);
});

/**
 * The pure half of getMaterialOffers: every (design, finish) rate row in the
 * live catalogue in, one offer per finish out. Exported for its test; the
 * reader above is the only production caller.
 */
export function reduceMaterialOffers(rows: MaterialOfferRow[]): MaterialOffer[] {
  const byslug = new Map<string, MaterialOffer>();
  for (const r of rows) {
    const m = r.materials, p = r.products;
    // 'border' is a supply format priced per metre, not a finish — it has no
    // per-sq-ft rate to compare and belongs to the borders row, not here.
    if (!m || !p || m.slug === "border") continue;
    // PRICE A RESTRICTED FINISH FROM WHERE IT IS ACTUALLY BUYABLE. A
    // `coming_soon` finish is blocked on an ordinary design however its rate
    // row reads, and only a price tier makes it sellable — so a standard-tier
    // row for it is a rate nobody can pay. Cheapest-across-everything is the
    // right rule for a finish anyone can pick, and the wrong one here.
    //
    // `coming_soon` is the ONLY test. Linen Textured is the Autograph finish,
    // but it is not Autograph-exclusive: since 0147 it is the single finish of
    // ~120 standard designs (Office and Dwadasha among them, at ₹230–300).
    // Restricting it by slug quoted every office estimator ₹400 "with the
    // Autograph range" for panels that cost ₹230 (30 Sep 2026). Whether linen
    // SHOULD be Autograph-only is a pricing decision made in the catalogue,
    // never in this query; the homepage's Autograph framing reads
    // `autographRate` instead.
    const restrictedFinish = !!m.coming_soon;
    if (restrictedFinish && (p.price_tier ?? "standard") === "standard") continue;
    const rate = Number(r.price_per_sqft);
    if (!(rate > 0)) continue;
    const isWallArt = p.category === CANVAS_CATEGORY;
    const autograph = !isWallArt && isAutographTier(p.price_tier);
    const from = isWallArt && p.ready_sizes?.length ? fromReadySizePrice(p.ready_sizes, rate) : null;
    const prev = byslug.get(m.slug);
    if (!prev) {
      byslug.set(m.slug, {
        slug: m.slug,
        name: m.name,
        family: isWallArt ? "wall-art" : "wallpaper",
        pricePerSqft: isWallArt ? null : rate,
        fromPrice: from,
        // `coming_soon` is what stops the configurator selling this finish on
        // an ordinary design. That is exactly the "comes with a range, not
        // per-design" case, so it decides the CTA rather than hiding the card.
        restricted: restrictedFinish,
        autographRate: autograph ? rate : null,
      });
      continue;
    }
    if (autograph) prev.autographRate = Math.min(prev.autographRate ?? rate, rate);
    // Same material on several products — show the lowest of each figure, so
    // "from" is honest across the whole family.
    if (!isWallArt) prev.pricePerSqft = Math.min(prev.pricePerSqft ?? rate, rate);
    if (from != null) prev.fromPrice = Math.min(prev.fromPrice ?? from, from);
  }
  return [...byslug.values()].sort(
    (a, b) =>
      (a.family === b.family ? 0 : a.family === "wallpaper" ? -1 : 1) ||
      (a.pricePerSqft ?? a.fromPrice ?? 0) - (b.pricePerSqft ?? b.fromPrice ?? 0),
  );
}

export type Sort = "featured" | "newest";
export type FacetOption = { tag: string; label: string };

const facetLabel = (title: string) => title.replace(/\s*wallpapers?$/i, "").replace(/['’]\s*$/, "").trim() || title;

/**
 * The filter vocabulary for collection pages, derived honestly from the
 * collections taxonomy: colour facets are the `color` collections, styles the
 * `category` collections, rooms the `room` collections. Each option's `tag` is
 * the collection's rule_tag (a real product tag).
 */
// Category collections that are depictive SUBJECTS rather than styles/mediums.
const SUBJECT_TITLES = new Set(["Animal", "Birds", "Botanical Wallpaper", "Floral Wallpaper", "Landscape Wallpapers"]);

// Fixed mood vocabulary — AI-classified onto products as "Mood: X" tags.
export const MOODS = ["Serene", "Dramatic", "Playful", "Romantic", "Earthy", "Regal", "Fresh"] as const;

export const getFacetVocab = cachedCatalogue("facet-vocab", async ():  Promise<{ colour: FacetOption[]; style: FacetOption[]; subject: FacetOption[]; room: FacetOption[]; mood: FacetOption[] }> => {
  const { data, error } = await supabase
    .from("collections")
    .select("title, kind, rule_tag, position")
    .in("kind", ["color", "category", "room"])
    .not("rule_tag", "is", null)
    .order("position", { ascending: true, nullsFirst: false });
  if (error) throw error;
  const groups: { colour: FacetOption[]; style: FacetOption[]; subject: FacetOption[]; room: FacetOption[]; mood: FacetOption[] } = {
    colour: [], style: [], subject: [], room: [],
    // Mood options are a fixed vocabulary (tags carry the "Mood: " prefix so
    // they can never collide with catalogue tags like "Casual").
    mood: MOODS.map((m) => ({ tag: `Mood: ${m}`, label: m })),
  };
  for (const c of (data ?? []) as { title: string; kind: string; rule_tag: string }[]) {
    const opt: FacetOption = { tag: c.rule_tag, label: facetLabel(c.title) };
    if (c.kind === "color") groups.colour.push(opt);
    else if (c.kind === "room") groups.room.push(opt);
    else if (c.kind === "category") (SUBJECT_TITLES.has(c.title) ? groups.subject : groups.style).push(opt);
  }
  return groups;
});

/**
 * What a collection actually selects. A wallpaper collection is one tag over the
 * whole catalogue; a product-family listing is a whole family; a family
 * sub-collection is a tag (or two) WITHIN one family — 'Abstract' means abstract
 * canvases there, never the abstract wallpapers carrying the same tag.
 */
export type CollectionScope = { tags: string[] | null; category: string | null };

export function collectionScope(c: Pick<Collection, "rule_tag" | "rule_tags" | "category_scope" | "kind">): CollectionScope {
  const tags = c.rule_tags?.length ? c.rule_tags : c.rule_tag ? [c.rule_tag] : null;
  // Style and mood hubs explicitly promise wallpaper. Their tags also occur
  // on canvases and borders, so a tag alone makes their titles, prices and
  // landing-page copy misleading. Family-specific subcollections keep their
  // declared category_scope; curated collections remain cross-category.
  const category = c.category_scope ?? (["category", "mood"].includes(c.kind) ? "wallpaper" : null);
  return { tags, category };
}

// The rows, not the Map: the cache round-trips through JSON, which turns a Map
// into {}. Callers still get a Map — it is rebuilt below, on this side of it.
const getCollectionFacetRows = cachedCatalogue("collection-facets", async (
  scope: CollectionScope,
): Promise<{ tag: string; cnt: number }[]> => {
  const { data, error } = await supabase.rpc("collection_facets_v2", {
    p_base_tags: scope.tags,
    p_category: scope.category,
  });
  if (error) throw error;
  return (data as { tag: string; cnt: number }[]) ?? [];
});

/** Which tags actually occur among a collection's active products (→ tag: count). */
export async function getCollectionFacetCounts(scope: CollectionScope): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  for (const r of await getCollectionFacetRows(scope)) m.set(r.tag, Number(r.cnt));
  return m;
}

/** Counts of signature / new / child-safe products within a collection (to hide empty toggles). */
export const getCollectionFlagCounts = cachedCatalogue("collection-flag-counts", async (scope: CollectionScope): Promise<{ signature: number; new: number; child: number }> => {
  const { data, error } = await supabase.rpc("collection_flag_counts_v2", {
    p_base_tags: scope.tags,
    p_category: scope.category,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as { signature: number; new: number; child: number } | null;
  return { signature: Number(row?.signature ?? 0), new: Number(row?.new ?? 0), child: Number(row?.child ?? 0) };
});

/** One filtered, sorted, paginated page — returns ordered handles + total count.
 *  `roomKey` (room collections only) ranks designs that have a render for that
 *  room ahead of designs that don't — see collection_page_v2's p_room_key. */
export const getCollectionPageHandles = cachedCatalogue("collection-page", async (
  scope: CollectionScope,
  opts: { page?: number; pageSize?: number; sort?: Sort; filterTags?: string[]; signature?: boolean; newOnly?: boolean; roomKey?: string; renderedOnly?: boolean },
): Promise<{ handles: string[]; total: number }> => {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = opts.pageSize ?? 24;
  const { data, error } = await supabase.rpc("collection_page_v2", {
    p_base_tags: scope.tags,
    p_category: scope.category,
    p_filter_tags: opts.filterTags && opts.filterTags.length ? opts.filterTags : null,
    p_signature: opts.signature ?? false,
    p_new: opts.newOnly ?? false,
    p_sort: opts.sort ?? "newest",
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
    p_room_key: opts.roomKey ?? null,
    p_rendered_only: opts.renderedOnly ?? false,
  });
  if (error) throw error;
  const rows = (data as { handle: string; total: number }[]) ?? [];
  return { handles: rows.map((r) => r.handle), total: rows.length ? Number(rows[0].total) : 0 };
});

/** Preserve a coherent image language for internal editorial grids. Public
 *  collection listings always pass an explicit render-only mode. */
function uniformCardMode(products: Product[], roomKey?: string): CardImageMode {
  if (!products.length) return "scene";
  const hasScene = (p: Product) => roomKey
    ? (p.product_images ?? []).some((i) => i.scene_key === roomKey)
    : (p.product_images ?? []).some((i) => !i.is_flat);
  return products.every(hasScene) ? "scene" : "scene-preferred";
}

export const getCollectionCards = cachedCatalogue("collection-cards", async (handles: string[], roomKey?: string, forced?: CardImageMode, religionBrowse = false): Promise<ProductCardData[]> => {
  if (!handles.length) return [];
  const { data, error } = await (religionBrowse ? religionCatalogue() : supabase)
    .from("products")
    .select(`${CARD_SELECT}, product_tags ( tag )`)
    .in("handle", handles)
    .eq("status", "active").eq("is_service", false);
  if (error) throw error;
  const products = ((data as unknown as Product[]) ?? []);
  // Collection listings pass a render-only mode after collection_page_v2 has
  // removed incomplete designs. Other small grids simply lead with the first
  // room render because sortImages always keeps the flat last.
  const mode = forced ?? uniformCardMode(products, roomKey);
  const cards = products.map((p) => toCard(p, roomKey, mode));
  const order = new Map(handles.map((h, i) => [h, i]));
  return cards.sort((a, b) => (order.get(a.handle) ?? 0) - (order.get(b.handle) ?? 0));
});

/**
 * Card data for the Trending pins (src/lib/trending-pins.ts), in pin order,
 * each with the pinned finish's own rate on that design when the design
 * offers it live. Draws through `toCard` like every other card, so the
 * picture is a room render first (and, on a room page, THAT room's render or
 * the flat, which the caller then refuses). The second `product_materials`
 * embed is aliased, the way the sample finder already does, because
 * CARD_SELECT's own embed carries only the slug.
 *
 * Fails SOFT: the pins are a promotion on top of the shop window, and a read
 * error here must drop the row, never the homepage.
 */
export const getTrendingCards = cachedCatalogue("trending-cards", async (
  handles: string[],
  materialSlug: string,
  roomKey?: string,
): Promise<TrendingCard[]> => {
  if (!handles.length) return [];
  type PinMaterial = { price_per_sqft: number | string | null; available: boolean | null; materials: { slug: string; name: string; coming_soon: boolean | null } | null };
  type Row = Product & { pin_materials?: PinMaterial[] | null };
  let rows: Row[];
  try {
    const { data, error } = await supabase
      .from("products")
      .select(`${CARD_SELECT}, product_tags ( tag ), pin_materials:product_materials ( price_per_sqft, available, materials ( slug, name, coming_soon ) )`)
      .in("handle", handles)
      .eq("status", "active").eq("is_service", false);
    if (error) throw error;
    rows = (data as unknown as Row[]) ?? [];
  } catch (err) {
    console.error("[trending-pins] card read failed:", err instanceof Error ? err.message : err);
    return [];
  }
  const order = new Map(handles.map((h, i) => [h, i]));
  return rows
    .map((p) => {
      const offer = (p.pin_materials ?? []).find(
        (m) => m.available && m.materials?.slug === materialSlug && !m.materials?.coming_soon,
      );
      const rate = offer ? Number(offer.price_per_sqft) : 0;
      return {
        ...toCard(p, roomKey, roomKey ? "scene-preferred" : "scene"),
        pinMaterial: offer && rate > 0 ? { slug: materialSlug, name: offer.materials!.name, rate } : null,
      };
    })
    .sort((a, b) => (order.get(a.handle) ?? 0) - (order.get(b.handle) ?? 0));
});

// Generic tags carry no "goes-with-this" signal — a bull mural and a nursery
// scene both being "Murals"/"Wall Art" doesn't make them a pair. Excluded from
// related-match scoring so overlap reflects real affinity (room, subject, style).
const GENERIC_RELATED_TAGS = new Set([
  "Wall Art", "Murals", "Mural", "New", "Signature", "Bestseller", "Child-Safe",
]);

/**
 * "More like this" — designs that actually LOOK like this one.
 *
 * This used to rank by shared tags, which answers a different question:
 * Palazzo Sketch (a fine line drawing of a palace) surfaced Leopard Reverie and
 * Peacock Pavilion, because all three carry Vintage and Regal. True of the
 * words, useless to the eye. The CLIP image embedding compares the ARTWORK, so
 * the same design now leads with Arcadian Sketch (0.86), Watercolour Harbour
 * and Riverside Citadel — the rest of its visual family.
 *
 * Tag overlap stays as the filler, because ~180 designs are still waiting on an
 * embedding (see the re-tag queue) and a design without one must still show a
 * row rather than nothing.
 */
export const getRelatedProductCards = cachedCatalogue("related-cards", async (
  handle: string,
  tags: string[],
  limit = 4,
): Promise<ProductCardData[]> => {
  const skip = new Set([handle, "custom-wallpaper", "bespoke-customisation"]);
  const ranked: string[] = [];

  // 1. What the artwork looks like. Overfetched, since some neighbours may be
  //    inactive or excluded by the time cards are loaded.
  const { data: similar, error: simErr } = await supabase.rpc("related_products_by_embedding", {
    product_handle: handle,
    match_count: Math.min(limit * 3, 12),
  });
  if (simErr) {
    // Similarity is the point of this row, but never worth a 500 on the product
    // page — fall through to tags.
    console.error("embedding related lookup failed:", simErr.message);
  } else {
    for (const r of ((similar ?? []) as { handle: string }[])) {
      if (ranked.length >= limit) break;
      if (skip.has(r.handle) || ranked.includes(r.handle)) continue;
      ranked.push(r.handle);
    }
  }

  // 2. Tag overlap fills whatever is left — for a design with no embedding yet,
  //    that is the whole row. Ranked by how many MEANINGFUL tags are shared
  //    (room + subject + style + colour + mood), never one arbitrary tag, so a
  //    nursery watercolour pairs with calm nursery designs rather than with an
  //    unrelated mural that merely shares "Murals".
  if (ranked.length < limit) {
    const match = [...new Set(tags)].filter((t) => t && !GENERIC_RELATED_TAGS.has(t));
    if (match.length) {
      const { data, error } = await supabase
        .from("product_tags")
        .select("tag, products!inner ( handle, status )")
        .in("tag", match)
        .eq("products.status", "active")
        .limit(4000);
      if (error) throw error;
      const overlap = new Map<string, number>();
      for (const row of (data as unknown as { products: { handle: string } }[]) ?? []) {
        const h = row.products?.handle;
        if (!h || skip.has(h) || ranked.includes(h)) continue;
        overlap.set(h, (overlap.get(h) ?? 0) + 1);
      }
      // Two shared tags minimum — one is too weak to call a match.
      const byOverlap = [...overlap.entries()]
        .filter(([, n]) => n >= 2)
        .sort((a, b) => b[1] - a[1])
        .map(([h]) => h);
      for (const h of byOverlap) {
        if (ranked.length >= limit) break;
        ranked.push(h);
      }
    }
  }

  if (!ranked.length) return [];
  const cards = await getCollectionCards(ranked);
  const order = new Map(ranked.map((h, i) => [h, i]));
  return cards.sort((a, b) => (order.get(a.handle) ?? 0) - (order.get(b.handle) ?? 0));
});

export const getProductByHandle = cachedCatalogue("product-by-handle", async (handle: string, deliberateProductView = false): Promise<Product | null> => {
  const { data, error } = await (deliberateProductView ? religionCatalogue() : supabase)
    .from("products")
    .select(`${PRODUCT_SELECT}, product_tags ( tag )`)
    .eq("handle", handle)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as Product) ?? null;
});

export const getCollectionByHandle = cachedCatalogue("collection-by-handle", async (
  handle: string,
): Promise<Collection | null> => {
  const { data, error } = await supabase
    .from("collections")
    .select(
      "handle, title, description, kind, rule_tag, rule_tags, category_scope, parent_handle, is_signature, card_mode",
    )
    .eq("handle", handle)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as Collection) ?? null;
});

/**
 * The sub-collections of a product family (Borders & Strips → Decorative
 * Borders, Kids' Borders, …).
 *
 * By default the empty ones are dropped, and "empty" is counted INSIDE the
 * family: 89 wallpapers carry 'Abstract', which would otherwise make an empty
 * Canvas Art → Abstract look populated and link the nav to a blank grid.
 *
 * `includeEmpty` keeps them anyway. The Shop menu uses it deliberately: the
 * family structure is the shop's declared architecture, and a family that
 * silently loses its children the moment it has no stock reads as broken rather
 * than as empty. Those pages already say "No products in this collection yet."
 */
export const getSubCollections = cachedCatalogue("sub-collections", async (
  parentHandle: string,
  categorySlug: string,
  opts: { includeEmpty?: boolean } = {},
):  Promise<{ handle: string; title: string }[]> => {
  const [{ data, error }, { data: counts, error: countError }] = await Promise.all([
    supabase
      .from("collections")
      .select("handle, title, rule_tag, rule_tags, position")
      .eq("parent_handle", parentHandle)
      .order("position", { ascending: true, nullsFirst: false }),
    opts.includeEmpty
      ? Promise.resolve({ data: null, error: null })
      : supabase.rpc("category_tag_counts", { p_category: categorySlug }),
  ]);
  if (error) throw error;
  if (countError) throw countError;
  const rows = (data as { handle: string; title: string; rule_tag: string | null; rule_tags: string[] | null }[]) ?? [];
  if (opts.includeEmpty) return rows.map(({ handle, title }) => ({ handle, title }));
  const populated = new Set(((counts as { tag: string }[]) ?? []).map((r) => r.tag));
  return rows
    .filter((c) => (c.rule_tags?.length ? c.rule_tags : c.rule_tag ? [c.rule_tag] : []).some((t) => populated.has(t)))
    .map(({ handle, title }) => ({ handle, title }));
});

/**
 * Studio "Signature" designs — the editorially-chosen marquee pieces (the top
 * of the hero collections). Powers the homepage Signature row and is honest
 * merchandising: an editorial pick, never a sales or review claim.
 *
 * Scoped to the signature COLLECTIONS on purpose (see {@link getSignatureRow}):
 * a product's own `is_signature` flag only ranks it WITHIN a signature
 * collection — it can never put a design from anywhere else into the row.
 *
 * ROTATES ACROSS THE COLLECTION'S SPOTLIGHT TURNS. Ordering alone would freeze the row:
 * a hero collection's top `limit` designs by (is_signature, aesthetic_rank)
 * never change, so Katha's spotlight day showed the same four designs every
 * time it came round, forever, while the other ten were never in it. The row
 * now takes a WINDOW over the collection's studio picks, advancing once per
 * turn it spends on stage (`turn`, counted by {@link getSignatureRow} — NOT
 * the calendar day; see {@link turnWindow} for why that distinction is the
 * whole ballgame) — same editorial rule (only `is_signature` designs lead),
 * but the line cycles through all of them instead of stopping at the first
 * four. Widening WHICH
 * designs are eligible is still a data decision: flag more of the collection
 * `is_signature` and they join the cycle on their own.
 *
 * The picks are only relaxed when there aren't `limit` of them — then the
 * collection's best-ranked designs fill the line in rank order, exactly as
 * before, so the row is never short.
 */
export async function getSignatureProducts(
  collection: SignatureCollection,
  limit = 4,
  now: Date = new Date(),
  turn: number = logicalDayIndex(now),
  renderedOnly = false,
): Promise<ProductCardData[]> {
  if (!collection.tags.length) return [];
  return getSignatureProductsFor(collection.tags, limit, turn, renderedOnly);
}

// Keyed by the collection's tags and the turn, never the Date: a Date in the
// key would be a fresh key on every request and cache nothing.
const getSignatureProductsFor = cachedCatalogue("signature-products", async (
  tags: string[],
  limit: number,
  turn: number,
  // The homepage asks for room renders only (AGENTS.md homepage rule 9):
  // this row used to drop only IMAGELESS cards, so a design whose one picture
  // was its flat pattern fronted the Signature spotlight as a swatch.
  renderedOnly = false,
): Promise<ProductCardData[]> => {
  const { data, error } = await supabase
    .from("products")
    .select(`${CARD_SELECT}, member:product_tags!inner ( tag )`)
    .eq("status", "active").eq("is_service", false)
    .in("member.tag", tags)
    // The whole collection, picks first — the day's window is taken below, so
    // this must not stop at the first `limit` rows the way it used to.
    .order("is_signature", { ascending: false })
    .order("aesthetic_rank", { ascending: true, nullsFirst: false })
    .limit(SIGNATURE_POOL_MAX);
  if (error) throw error;
  // A design carrying two of the collection's tags comes back twice.
  const seen = new Set<string>();
  const picks: ProductCardData[] = [];
  const rest: ProductCardData[] = [];
  for (const p of (data as unknown as Product[]) ?? []) {
    if (seen.has(p.handle)) continue;
    seen.add(p.handle);
    const card = toCard(p);
    if (!card.image) continue; // the row is a picture row — never a blank card
    if (renderedOnly && card.imageIsFlat) continue;
    (p.is_signature ? picks : rest).push(card);
  }
  if (picks.length >= limit) return turnWindow(picks, limit, turn);
  // Too few studio picks to fill the line on their own: lead with them and
  // top up from the collection's best-ranked designs, in rank order.
  return [...picks, ...rest].slice(0, limit);
});

/**
 * Signature designs across ALL the signature collections, interleaved — for
 * surfaces that want a flat pick (press kit, founder's note, newsletter)
 * rather than the homepage's one-collection line. Rule 1 above still holds:
 * nothing outside a signature collection can appear.
 */
export async function getSignatureDesigns(limit = 8, now: Date = new Date()): Promise<ProductCardData[]> {
  const collections = await getSignatureCollections();
  const lists = await Promise.all(collections.map((c) => getSignatureProducts(c, limit, now)));
  const out: ProductCardData[] = [];
  const seen = new Set<string>();
  for (let i = 0; out.length < limit && lists.some((l) => i < l.length); i++) {
    for (const list of lists) {
      const p = list[i];
      if (!p || seen.has(p.handle)) continue;
      seen.add(p.handle);
      out.push(p);
      if (out.length === limit) break;
    }
  }
  return out;
}

/**
 * The homepage Signature row — ONE line, drawn entirely from ONE signature
 * collection (today: Stallion Spirit or Katha). Two rules are baked in here
 * and must stay that way:
 *
 *  1. The row can only ever show designs from a collection flagged
 *     `collections.is_signature`. Flagging a PRODUCT `is_signature` outside
 *     one of those collections does not get it in — the row is the studio's
 *     hero collections, not a loose "favourites" bucket. New hero collection?
 *     Flag the collection `is_signature`; it joins the rotation on its own.
 *  2. It is a single line, never mixed: one collection per day, rotating in
 *     `position` order (5 AM IST, same clock as the rest of the homepage), so
 *     each hero collection gets the spotlight to itself.
 *
 * A collection that cannot fill the full line is skipped in favour of one that
 * can — a half-empty signature row reads worse than showing the other hero.
 */
export async function getSignatureRow(
  limit = 4,
  now: Date = new Date(),
  renderedOnly = false,
): Promise<{ collection: SignatureCollection; products: ProductCardData[] } | null> {
  const collections = await getSignatureCollections();
  if (!collections.length) return null;
  const day = logicalDayIndex(now);
  const start = day % collections.length;
  // The collection's OWN turn count, not the day: it is only on stage every
  // `collections.length`th day, so driving its inner window by the day index
  // confines that window to one residue class and freezes it. See turnWindow.
  const turn = Math.floor(day / collections.length);
  let best: { collection: SignatureCollection; products: ProductCardData[] } | null = null;
  for (let i = 0; i < collections.length; i++) {
    const collection = collections[(start + i) % collections.length];
    const products = await getSignatureProducts(collection, limit, now, turn, renderedOnly);
    if (products.length >= limit) return { collection, products };
    if (products.length > (best?.products.length ?? 0)) best = { collection, products };
  }
  return best;
}

/**
 * Just In — the most recently published WALLPAPER batch, newest first.
 * `new_until` is set once per product by the flag_new_on_publish trigger
 * (go-live + 30 days) and never changes again, so it doubles as a permanent
 * "went live" ordering key — unlike the `is_new` badge boolean, which a daily
 * cron clears after 30 days. Deliberately NOT gated by that window: batches
 * publish regularly, so this always surfaces the latest one instead of the
 * section going empty between uploads. Products that have never been through
 * publish (no new_until) are excluded — never shown as "new" just because
 * they sort last.
 *
 * Scoped to `category = wallpaper` on purpose: this feed is surfaced on the
 * site as "New Wallpapers" (see MobileNav), and `new_until` is set by the
 * publish trigger for EVERY family — Canvas Wall Art, Borders, all of it.
 * Without the category filter, a freshly-published canvas or border product
 * leaks into the wallpaper "new arrivals" row. Wall art and borders each get
 * their own row ({@link getJustInCanvas}, {@link getBorders}) — never fold
 * another family's arrivals into this one.
 */
export const getJustIn = cachedCatalogue("just-in-renders-only", async (limit = 4):  Promise<ProductCardData[]> => {
  const { data, error } = await supabase
    .from("products")
    // Filter before LIMIT: a flat-only arrival must not crowd out a rendered
    // design from the homepage row. Keep the full image embed for toCard.
    .select(`${CARD_SELECT}, room_render:product_images!inner(is_flat)`)
    .eq("status", "active").eq("is_service", false)
    .eq("category", WALLPAPER_CATEGORY)
    .not("new_until", "is", null)
    .eq("room_render.is_flat", false)
    .order("new_until", { ascending: false })
    .order("handle", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return ((data as unknown as Product[]) ?? []).map((p) => toCard(p));
});

/**
 * Paginated Just In — same ordering and wallpaper-only scope as
 * {@link getJustIn}, plus a stable `handle` tie-breaker (so page boundaries
 * never shuffle) and an exact total count, for the /new infinite-scroll feed.
 */
export const getJustInPage = cachedCatalogue("just-in-page-renders-only", async (page = 1, pageSize = 24): Promise<{ cards: ProductCardData[]; total: number }> => {
  const from = (Math.max(1, page) - 1) * pageSize;
  const { data, error, count } = await supabase
    .from("products")
    // The New wallpapers feed is paginated, so filter in the database before
    // counting and slicing. Filtering cards after range() would leave gaps and
    // make later pages disagree with the displayed total.
    .select(`${CARD_SELECT}, room_render:product_images!inner(is_flat)`, { count: "exact" })
    .eq("status", "active").eq("is_service", false)
    .eq("category", WALLPAPER_CATEGORY)
    .not("new_until", "is", null)
    .eq("room_render.is_flat", false)
    .order("new_until", { ascending: false })
    .order("handle", { ascending: true })
    .range(from, from + pageSize - 1);
  if (error) throw error;
  return { cards: ((data as unknown as Product[]) ?? []).map((p) => toCard(p)), total: count ?? 0 };
});

/**
 * New Wall Art — the most recently published CANVAS batch, newest first.
 * Mirrors {@link getJustIn} but scoped to `category = canvas` instead of
 * wallpaper, so a canvas product's "new" moment shows up in its own row
 * rather than bleeding into New Wallpapers.
 */
export const getJustInCanvas = cachedCatalogue("just-in-canvas", async (limit = 4):  Promise<ProductCardData[]> => {
  const { data, error } = await supabase
    .from("products")
    .select(CARD_SELECT)
    .eq("status", "active").eq("is_service", false)
    .eq("category", CANVAS_CATEGORY)
    .not("new_until", "is", null)
    .order("new_until", { ascending: false })
    .order("handle", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return ((data as unknown as Product[]) ?? []).map((p) => toCard(p));
});

/**
 * Borders — the LENGTH family's own row. Deliberately NOT gated by
 * `new_until` (borders publish rarely; a "new borders" row would sit empty
 * most of the time) — this is the family's full assortment, aesthetic-rank
 * ordered, same as the general Wall Art row. Never merge borders into the
 * wallpaper or canvas "new arrivals" rows — {@link getJustIn} and
 * {@link getJustInCanvas} both exclude them by category already.
 */
export const getBorders = cachedCatalogue("borders", async (limit = 4):  Promise<ProductCardData[]> => {
  const { data, error } = await supabase
    .from("products")
    .select(CARD_SELECT)
    .eq("status", "active").eq("is_service", false)
    .eq("category", BORDER_CATEGORY)
    .order("aesthetic_rank", { ascending: true, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return ((data as unknown as Product[]) ?? []).map((p) => toCard(p));
});

/**
 * What the shop is actually responding to, from behaviour — orders first, then
 * intent (cart, visualise, save), then views. See popular_designs in migration
 * 0131.
 *
 * The homepage's "Best sellers" row was never a query: it was the leftovers of
 * the other rows, so it could only show designs from the four or five
 * collections fronted that day and a design outside them could never appear
 * however well it sold. `fromSales` reports whether real orders carried the
 * result, so the row can be titled honestly while sales volume is still thin.
 */
export const getPopularCards = cachedCatalogue("popular-cards", async (limit = 8, days = 90):  Promise<{ cards: ProductCardData[]; fromSales: boolean }> => {
  const { data, error } = await supabase.rpc("popular_designs", { p_days: days, p_limit: limit });
  if (error) throw error;
  const rows = (data ?? []) as { handle: string; from_sales: boolean }[];
  if (!rows.length) return { cards: [], fromSales: false };
  const { data: products, error: pErr } = await supabase
    .from("products")
    .select(CARD_SELECT)
    .in("handle", rows.map((r) => r.handle));
  if (pErr) throw pErr;
  // Restore the popularity order the RPC returned — `in` does not preserve it.
  const order = new Map(rows.map((r, i) => [r.handle, i]));
  const cards = ((products as unknown as Product[]) ?? [])
    .map((p) => toCard(p))
    .sort((a, b) => (order.get(a.handle) ?? 0) - (order.get(b.handle) ?? 0));
  // Only claim "best sellers" when orders — not views — put at least half the
  // row there. Otherwise the page says what it can actually stand behind.
  const sold = rows.filter((r) => r.from_sales).length;
  return { cards, fromSales: sold * 2 >= rows.length };
}, CATALOGUE_REVALIDATE, {
  // popular_designs() ranks from site behaviour and runs close to the 3 s
  // statement timeout: on 9 Oct 2026 it timed out on 11 of the day's hourly
  // refreshes, and because the homepage awaits this row with everything else,
  // each one sent that visitor to the error page. Keep yesterday's answer and
  // serve it when a refresh fails — a day-old best-seller row is still true,
  // an error page is not. The page itself falls back to its leftover fill when
  // there is no copy at all yet (see app/page.tsx).
  staleFallbackTtl: 86_400,
});

/** A hero collection the studio leads with, and the product tags it selects.
 *  `collections.is_signature` is the ONE switch that decides this — see
 *  {@link getSignatureRow}. */
export type SignatureCollection = { handle: string; title: string; tags: string[] };

/** Curated collections — the merchandised sets a customer perceives as "a
 *  collection" (Stallion Spirit, Katha, …), as opposed to facet collections
 *  (colour/room/style), which taxonomically ARE collections but read as
 *  filters. The homepage variety rule (AGENTS.md) excludes only THESE from
 *  re-featuring: an average design carries ~6 collection tags, so excluding
 *  at facet level would exhaust the catalogue by the second row. Keyed by
 *  handle — seven rule_tags are shared across two collections. */
export const getCuratedCollections = cachedCatalogue("curated-collections", async (): Promise<{ handle: string; tags: string[] }[]> => {
  const { data, error } = await supabase
    .from("collections")
    .select("handle, rule_tag, rule_tags")
    .eq("kind", "curated");
  if (error) throw error;
  return ((data as { handle: string; rule_tag: string | null; rule_tags: string[] | null }[]) ?? [])
    .map((c) => ({ handle: c.handle, tags: c.rule_tags?.length ? c.rule_tags : c.rule_tag ? [c.rule_tag] : [] }));
});

/** Signature collections — the hero collections the studio leads with, in
 *  rotation order. An empty one is dropped: the homepage must never lead with
 *  a link to a blank grid. */
export const getSignatureCollections = cachedCatalogue("signature-collections", async ():  Promise<SignatureCollection[]> => {
  const [{ data, error }, populated] = await Promise.all([
    supabase
      .from("collections")
      .select("handle, title, position, rule_tag, rule_tags")
      .eq("is_signature", true)
      .order("position", { ascending: true, nullsFirst: false }),
    getPopulatedTags(),
  ]);
  if (error) throw error;
  return ((data as { handle: string; title: string; rule_tag: string | null; rule_tags: string[] | null }[]) ?? [])
    .map((c) => ({ handle: c.handle, title: c.title, tags: c.rule_tags?.length ? c.rule_tags : c.rule_tag ? [c.rule_tag] : [] }))
    .filter((c) => c.tags.some((t) => populated.has(t)));
});

/**
 * The rule_tags at least one active product carries — i.e. the collections that
 * actually have designs to show. Collections are routinely created ahead of
 * their products, and an unpopulated one renders a blank grid rather than a
 * 404, so navigation must never link to it. A collection reappears on its own
 * the moment a product carrying its rule_tag goes active.
 *
 * Memoised per request: the Header renders on every page and asks for four
 * kinds at once, but only needs this counted once.
 */
const getPopulatedTagList = cachedCatalogue("populated-tags", async (): Promise<string[]> => {
  const { data, error } = await supabase.rpc("populated_collection_tags");
  if (error) throw error;
  return ((data as { tag: string }[]) ?? []).map((r) => r.tag);
});
const getPopulatedTags = cache(async (): Promise<Set<string>> => new Set(await getPopulatedTagList()));

/** The rule_tags with at least one active product — the single source of truth
 *  for "does this collection have anything to show?". Exported for the sitemap,
 *  which must not list a collection that would 404. */
export const getPopulatedCollectionTags = getPopulatedTags;

/**
 * Every tag that names a COLLECTION — the aesthetics, plus the series and sets
 * that have their own shelf. Used to stop one collection fronting two tiles on
 * an index grid (index-tiles.ts, rule 3).
 *
 * Deliberately not every tag a design carries: an average design carries ~6,
 * and excluding at tag level starves a grid by the third tile. Only a name a
 * shopper would call a collection counts.
 */
export const getCollectionTagSet = cache(async (): Promise<Set<string>> => {
  const { data, error } = await supabase
    .from("collections")
    .select("rule_tag")
    .in("kind", ["curated", "series", "set"])
    .not("rule_tag", "is", null);
  if (error) throw error;
  return new Set(((data as { rule_tag: string }[]) ?? []).map((c) => c.rule_tag));
});

/** Sibling collections of the same kind (rooms, styles/categories, colours…) — the
 *  browse bar on a collection page and the "Shop Wallpapers" mega-menu. Empty
 *  collections are omitted; see getPopulatedTags. */
/**
 * The collections behind an axis index page (/moods, /colours, /styles,
 * /rooms) — the same query four pages were each making on every view, which
 * is four cold reads of a table that changes when the studio publishes.
 */
export type AxisCollection = {
  handle: string; title: string; rule_tag: string; hero_product_handle: string | null;
};
export const getAxisCollections = cachedCatalogue("axis-collections", async (
  kind: string,
): Promise<AxisCollection[]> => {
  const { data, error } = await supabase
    .from("collections")
    .select("handle, title, rule_tag, hero_product_handle, position")
    .eq("kind", kind)
    .not("rule_tag", "is", null)
    .order("position", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data as unknown as AxisCollection[]) ?? [];
});

/** The style tags the lookbook de-clusters by — a `category` collection's
 *  rule_tag. Rows, not a Set: the cache round-trips through JSON. */
export const getStyleTagList = cachedCatalogue("style-tags", async (): Promise<string[]> => {
  const { data, error } = await supabase.from("collections").select("rule_tag, kind");
  if (error) throw error;
  return ((data ?? []) as { rule_tag: string | null; kind: string }[])
    .filter((c) => c.kind === "category" && c.rule_tag)
    .map((c) => c.rule_tag as string);
});

export const getCollectionsByKind = cachedCatalogue("collections-by-kind-newest-first", async (kind: string):  Promise<{ handle: string; title: string }[]> => {
  // Named collections lead with the latest addition on menus and browse tabs.
  // Facets (rooms, colours and styles) retain their editorial order.
  const newestFirst = kind === "curated";
  const [{ data, error }, populated] = await Promise.all([
    supabase
      .from("collections")
      .select("handle, title, position, rule_tag")
      .eq("kind", kind)
      .order(newestFirst ? "created_at" : "position", { ascending: !newestFirst, nullsFirst: false })
      .order("position", { ascending: true, nullsFirst: false })
      .order("handle", { ascending: true }),
    getPopulatedTags(),
  ]);
  if (error) throw error;
  return ((data as { handle: string; title: string; rule_tag: string | null }[]) ?? [])
    .filter((c) => c.rule_tag !== null && populated.has(c.rule_tag) && !PRICE_TIER_TAGS.has(c.rule_tag))
    .map(({ handle, title }) => ({ handle, title }));
});

// Search synonyms — a query for any word in a cluster also searches its
// siblings, so shoppers find the same wallpapers regardless of how they spell
// or word it. The catalogue is tagged with the canonical word (e.g. the 90+
// prayer-space designs all carry the "Pooja Room" tag), but customers type
// "puja", "mandir" or "prayer" just as often. Add new clusters here.
const SEARCH_SYNONYMS: string[][] = [
  ["pooja", "puja", "mandir", "prayer", "prayer room", "worship"],
  ["cow", "cows", "bull", "calf", "bovine", "cattle", "kamdhenu", "kamadhenu"],
  // Beige tones live under the "Neutral" tag/collection — unify the words.
  ["beige", "neutral", "cream", "ivory"],
];

/** Expand a query into the set of terms to actually search (original + any
 *  synonym-cluster siblings it triggers). */
function expandSearchTerms(term: string): string[] {
  const low = term.toLowerCase();
  const terms = new Set<string>([term]);
  for (const cluster of SEARCH_SYNONYMS) {
    if (cluster.some((w) => low.includes(w))) {
      for (const w of cluster) terms.add(w);
    }
  }
  return [...terms];
}

/**
 * Full-text search over title, design code, tags AND description, ordered by
 * relevance — see search_products_v1 in migration 0132.
 *
 * The previous implementation matched `%query%` against title, code and tags,
 * with the whole query as ONE pattern: "blue peacock" only matched something
 * literally containing that phrase, so most two-word searches returned nothing.
 * It never searched descriptions, and it ordered by aesthetic_rank, so what you
 * typed barely influenced what you got.
 *
 * The ilike path below is kept as the fallback — for one-character queries,
 * which a tsquery cannot serve, and for the case where full-text finds nothing
 * (a partial word inside a longer one, e.g. "eacock").
 */
/** Every collection a shopper could name, for {@link namedCollection}. Small
 *  and changes only when the catalogue does, so it rides the catalogue cache. */
export const getNamedCollectionRows = cachedCatalogue("search-named-collections", async (): Promise<NamedCollectionRow[]> => {
  const { data, error } = await supabase
    .from("collections")
    .select("handle, title, kind, rule_tag")
    .not("rule_tag", "is", null);
  if (error) throw error;
  return (data as NamedCollectionRow[]) ?? [];
});

/** The collection a query names outright — or undefined, including when the
 *  collection list cannot be read: a search must never fail for want of a
 *  ranking hint. */
async function namedCollectionFor(term: string): Promise<NamedCollection | undefined> {
  try {
    return namedCollection(term, await getNamedCollectionRows());
  } catch (err) {
    console.error("[search] collection names unavailable; ranking on words alone", err);
    return undefined;
  }
}

/** What a search query asks for: the collection it names outright (if any),
 *  the room its pictures should show, and the tag that ranks first. One
 *  answer for the results and for the live check that audits them
 *  (scripts/verify-search.mjs reads it back from /api/search). */
export async function searchIntent(q: string): Promise<{
  collection?: { handle: string; tag: string };
  roomKey?: string;
  boostTag: string | null;
}> {
  const term = q.trim();
  const named = term.length > 1 ? await namedCollectionFor(term) : undefined;
  const roomKey = named?.roomKey ?? roomKeyForQuery(term);
  const boostTag = named?.tag ?? (roomKey ? (SCENE_ROOM_TAGS[roomKey]?.[0] ?? null) : null);
  return { collection: named ? { handle: named.handle, tag: named.tag } : undefined, roomKey, boostTag };
}

/** Every collection the shop shows (it has live designs, and is not a price
 *  tier), by name — the list the live search check types in one by one. */
export async function getSearchableCollections(): Promise<{ handle: string; title: string; kind: string | null; tag: string }[]> {
  const [rows, populated] = await Promise.all([getNamedCollectionRows(), getPopulatedTags()]);
  return rows
    .filter((c) => c.rule_tag && populated.has(c.rule_tag) && !PRICE_TIER_TAGS.has(c.rule_tag))
    .map((c) => ({ handle: c.handle, title: c.title, kind: c.kind, tag: c.rule_tag as string }));
}

export async function searchProductCards(q: string, limit = 48): Promise<ProductCardData[]> {
  return (await searchProducts(q, limit)).results;
}

/** The dictionary spelling correction reads: `search_lexicon_json()` — the
 *  rows of `search_lexicon()` (migration 20261012041045) as ONE jsonb value,
 *  because PostgREST caps a set-returning function at 1,000 rows and the
 *  dictionary has ~3,900 words; the first deploy read an arbitrary quarter of
 *  it and "piano" was not there. An hour stale like every catalogue read. An
 *  error is thrown, not cached: a failed read must not become an empty
 *  dictionary for the next hour (spellSearchQuery catches it and runs the
 *  search uncorrected). */
const getSearchLexiconRows = cachedCatalogue("search-lexicon-v2", async (): Promise<LexiconEntry[]> => {
  const { data, error } = await supabase.rpc("search_lexicon_json");
  if (error) throw new Error(`search_lexicon_json failed: ${error.message}`);
  const rows = (data ?? []) as unknown;
  if (!Array.isArray(rows)) throw new Error("search_lexicon_json returned a non-array");
  return rows
    .filter((r): r is [string, number] => Array.isArray(r) && typeof r[0] === "string" && typeof r[1] === "number")
    .map((r) => [r[0], r[1]]);
});
let lexiconCache: { rows: LexiconEntry[]; lexicon: Lexicon } | null = null;
async function getSearchLexicon(): Promise<Lexicon> {
  const rows = await getSearchLexiconRows();
  if (!lexiconCache || lexiconCache.rows !== rows) {
    lexiconCache = { rows, lexicon: buildLexicon(rows, roomQueryVocabulary()) };
  }
  return lexiconCache.lexicon;
}

/** The query search will actually run for what the shopper typed — their own
 *  words unless one of them is a misspelling of a word the shelf knows (see
 *  search-spelling.ts: "paino" → "piano", 12 October 2026). */
export async function spellSearchQuery(q: string): Promise<{ query: string; changed: boolean }> {
  const term = q.trim();
  if (term.length < 4) return { query: term, changed: false };
  try {
    return correctSearchQuery(term, await getSearchLexicon());
  } catch (e) {
    console.error("spelling correction failed; search runs uncorrected:", (e as Error).message);
    return { query: term, changed: false };
  }
}

export type SearchResponse = {
  results: ProductCardData[];
  total: number;
  /** The query the results answer, when it is not the one typed — "piano" for
   *  "paino" — so the page can say so. Null when the shopper's words were used. */
  corrected: string | null;
};

export async function searchProducts(q: string, limit = 48, offset = 0): Promise<SearchResponse> {
  const typed = q.trim();
  if (!typed) return { results: [], total: 0, corrected: null };
  // Spelling first, so everything below — the room the query names, the words
  // it is scored on — reads the query the shopper meant. "paino" found nothing
  // and "paino room" found every room but the piano room (12 October 2026).
  const isCode = /^[a-z]+[\s-]*\d+$/i.test(typed);
  const spelled = isCode ? { query: typed, changed: false } : await spellSearchQuery(typed);
  const term = spelled.query;
  const corrected = spelled.changed ? term : null;
  const { results, total } = await searchCardsFor(term, limit, offset);
  return { results, total, corrected };
}

async function searchCardsFor(term: string, limit: number, offset = 0): Promise<{ results: ProductCardData[]; total: number }> {
  if (!term) return { results: [], total: 0 };
  // A query that NAMES a room is asking to see that room. "pooja room
  // wallpaper" used to come back with whatever picture happened to sort first
  // — a bedroom shot, or a bare swatch — while /collections/pooja-room-wallpaper
  // showed the same designs in a shrine. The results now answer with the room
  // the shopper typed, falling back to another room only when this design has
  // no render for it (see toCard).
  //
  // A query that names a COLLECTION outright ("tropical", "black and white",
  // "games room") is asking for that collection: its tag is the boost, in
  // place of the room's (search-intent.ts). A named room collection also says
  // which room its pictures should show, which the room words alone cannot
  // for rooms like Games Room or Fine Dining.
  const { roomKey, boostTag } = await searchIntent(term);

  if (term.length > 1) {
    // v2 (migration 20260926090000): drops catalogue-wide noise words from the
    // scoring and lifts designs carrying the boost tag above everything else.
    // Before it, "pooja room wallpaper" answered with a table tennis room.
    //
    // A room search reads deeper than it shows: a room tag is carried by
    // hundreds of designs (930 for Living Room), and the words alone ranked
    // "Board games room" and "Card room" first — designs with no living-room
    // picture, so a living-room search showed no living room. The deeper read
    // is HANDLES only; one light query asks which of them have the room's
    // picture, those lead (roomPicturesFirst, stable), and full cards are read
    // for the one page shown — never for the whole deeper list.
    const { data: hits, error: ftsErr } = await supabase.rpc("search_products_v3", {
      p_query: term,
      p_limit: limit,
      p_offset: offset,
      p_room_tag: boostTag,
      p_room_key: roomKey ?? null,
    });
    if (!ftsErr) {
      const ranked = ((hits ?? []) as { handle: string }[]).map((r) => r.handle);
      const total = Number(((hits ?? []) as { total_count: number }[])[0]?.total_count ?? 0);
      if (ranked.length) {
        const { data: products, error: pErr } = await supabase
          .from("products")
          .select(CARD_SELECT)
          .in("handle", ranked);
        if (pErr) throw pErr;
        // `in` does not preserve order, and relevance order is the whole point.
        const order = new Map(ranked.map((h, i) => [h, i]));
        const cards = ((products as unknown as Product[]) ?? [])
          .filter((p) => !heldOutOfRoom(p.handle, roomKey))
          .map((p) => toCard(p, roomKey, "room-then-any-scene"))
          .sort((a, b) => (order.get(a.handle) ?? 0) - (order.get(b.handle) ?? 0));
        // Within the page too: a design whose room picture did not survive
        // toCard's choice still yields to one that shows the room.
        return { results: roomPicturesFirst(cards, roomKey), total };
      }
      return { results: [], total: 0 };
    } else {
      console.error("full-text search failed, falling back to ilike:", ftsErr.message);
    }
  }

  const results = await searchProductCardsIlike(term, limit, roomKey);
  return { results, total: results.length };
}

/** `handles` (relevance order) with the designs that have a render of
 *  `roomKey` moved to the front, order kept within each group. Reads handles
 *  and scene keys only. On a failed read the order is left as it was: the
 *  pictures are a preference, the results are the answer. */
async function roomRenderedFirst(handles: string[], roomKey: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("products")
    .select("handle, room:product_images!inner(scene_key, is_flat)")
    .in("handle", handles)
    .eq("room.scene_key", roomKey)
    .eq("room.is_flat", false);
  if (error) {
    console.error("[search] room-render lookup failed; keeping relevance order", error.message);
    return handles;
  }
  const rendered = new Set(((data ?? []) as { handle: string }[]).map((r) => r.handle));
  return [...handles.filter((h) => rendered.has(h)), ...handles.filter((h) => !rendered.has(h))];
}

/** The original substring search, now the fallback. */
async function searchProductCardsIlike(q: string, limit = 48, roomKey?: string): Promise<ProductCardData[]> {
  const term = q.trim();
  if (!term) return [];
  const terms = expandSearchTerms(term)
    .map((t) => t.replace(/[%,()]/g, " ").trim())
    .filter(Boolean);
  if (!terms.length) return [];

  // Products carrying a tag that matches any of the terms (attributes feed search).
  const { data: tagRows } = await supabase
    .from("product_tags")
    .select("product_id")
    .or(terms.map((t) => `tag.ilike.%${t}%`).join(","))
    .limit(400);
  const ids = [...new Set(((tagRows ?? []) as { product_id: string }[]).map((r) => r.product_id))];

  const orParts = terms.flatMap((t) => [`title.ilike.%${t}%`, `code.ilike.%${t}%`]);
  if (ids.length) orParts.push(`id.in.(${ids.join(",")})`);

  const { data, error } = await supabase
    .from("products")
    .select(CARD_SELECT)
    .eq("status", "active").eq("is_service", false)
    .or(orParts.join(","))
    .order("aesthetic_rank", { ascending: true, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return ((data as unknown as Product[]) ?? [])
    .filter((p) => !heldOutOfRoom(p.handle, roomKey))
    .map((p) => toCard(p, roomKey, "room-then-any-scene"));
}

/**
 * Title search restricted to the designs that can actually be SAMPLED (see
 * eligible wallpaper and Soft Matte stock). The sample picker must never offer a design the
 * sample-order API will refuse, so it searches through here rather than
 * {@link searchProductCards}.
 */
export async function searchSampleDesigns(q: string, limit = 6): Promise<ProductCardData[]> {
  const term = q.trim().replace(/[%,()]/g, " ").trim();
  if (!term) return [];
  const { data, error } = await supabase
    .from("products")
    .select(`${CARD_SELECT}, sample_material:product_materials!inner(available, materials!inner(slug, active))`)
    .eq("status", "active").eq("is_service", false)
    .eq("category", WALLPAPER_CATEGORY)
    .eq("flat_verified", true)
    .eq("sample_material.available", true)
    .eq("sample_material.materials.slug", "self-adhesive-vinyl")
    .eq("sample_material.materials.active", true)
    .ilike("title", `%${term}%`)
    .order("aesthetic_rank", { ascending: true, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return ((data as unknown as Product[]) ?? []).map((p) => toCard(p));
}

/** Every design that can be sampled today — the picker's browse list, since the
 *  picker starts with a short list and searches the eligible catalogue. */
export async function getSampleDesigns(limit = 24): Promise<ProductCardData[]> {
  const { data, error } = await supabase
    .from("products")
    .select(`${CARD_SELECT}, sample_material:product_materials!inner(available, materials!inner(slug, active))`)
    .eq("status", "active").eq("is_service", false)
    .eq("category", WALLPAPER_CATEGORY)
    .eq("flat_verified", true)
    .eq("sample_material.available", true)
    .eq("sample_material.materials.slug", "self-adhesive-vinyl")
    .eq("sample_material.materials.active", true)
    .order("aesthetic_rank", { ascending: true, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  const seen = new Set<string>();
  return ((data as unknown as Product[]) ?? [])
    .filter((p) => !seen.has(p.handle) && seen.add(p.handle))
    .map((p) => toCard(p));
}

/** Server-side truth for "can this handle be ordered as a sample" — the check
 *  the sample-order API runs before it banks a paid order. */
export async function isSampleableHandle(handle: string): Promise<boolean> {
  if (!handle) return false;
  const { data, error } = await supabase
    .from("products")
    .select("handle, sample_material:product_materials!inner(available, materials!inner(slug, active))")
    .eq("handle", handle)
    .eq("status", "active").eq("is_service", false)
    .eq("category", WALLPAPER_CATEGORY)
    .eq("flat_verified", true)
    .eq("sample_material.available", true)
    .eq("sample_material.materials.slug", "self-adhesive-vinyl")
    .eq("sample_material.materials.active", true)
    .limit(1);
  if (error) throw error;
  return !!(data as unknown[] | null)?.length;
}

/** The same answer for the product PAGE (sample pill, CTA, spec row), through
 *  the catalogue cache: unwrapped it was 8,200 reads a day (1 Oct 2026), one
 *  per product-page render. Display only — the sample-order API must keep
 *  calling the live {@link isSampleableHandle}, which is what refuses an order
 *  for a design that went out of stock inside the cached hour. */
export const isSampleableForPage = cachedCatalogue("sampleable", async (handle: string): Promise<boolean> => {
  return isSampleableHandle(handle);
});

/**
 * The editorially pinned tile heroes, fetched BY HANDLE.
 *
 * A pin has to be fetched on its own, not looked for in the tile's shortlist:
 * the shortlist is the top of `aesthetic_rank`, and the whole reason a room is
 * pinned is that the right design for it is not near the top. Chateau Village
 * ranks 85th; asking a 20-deep shortlist for it silently returned nothing and
 * put the bull back on Living Room.
 *
 * Keyed by `roomKey:handle` because the same design pinned to two rooms needs
 * each room's own render. "scene-preferred" so a pin still lands if that
 * particular render has not been made yet.
 */
export const getTileHeroes = cachedCatalogue("tile-heroes", async (
  pins: { handle: string; roomKey?: string }[],
): Promise<Record<string, ProductCardData>> => {
  const handles = [...new Set(pins.map((p) => p.handle))];
  if (!handles.length) return {};
  const { data, error } = await supabase
    .from("products")
    .select(`${CARD_SELECT}, product_tags ( tag )`)
    .in("handle", handles)
    .eq("status", "active").eq("is_service", false);
  if (error) throw error;
  const byHandle = new Map(((data as unknown as Product[]) ?? []).map((p) => [p.handle, p]));
  const out: Record<string, ProductCardData> = {};
  for (const pin of pins) {
    const product = byHandle.get(pin.handle);
    if (product) out[`${pin.roomKey ?? ""}:${pin.handle}`] = toCard(product, pin.roomKey, "scene-preferred");
  }
  return out;
});

export const getProductsByHandles = cachedCatalogue("products-by-handles", async (handles: string[]): Promise<ProductCardData[]> => {
  if (!handles.length) return [];
  const { data, error } = await supabase
    .from("products")
    .select(CARD_SELECT)
    .in("handle", handles)
    .eq("status", "active").eq("is_service", false);
  if (error) throw error;
  const cards = ((data as unknown as Product[]) ?? []).filter(p => sellableAnywhere(p.handle)).map((p) => toCard(p));
  const order = new Map(handles.map((h, i) => [h, i]));
  return cards.sort((a, b) => (order.get(a.handle) ?? 0) - (order.get(b.handle) ?? 0));
});

/** Active designs a pasted name, product link or code names EXACTLY — by
 *  handle, by title (case-insensitive) or by design code. See design-name.ts. */
export async function findDesignsByName(text: string): Promise<{
  handle: string; title: string; category: string | null; price_tier: string | null;
}[]> {
  const c = nameCandidates(text);
  const cols = "handle, title, category, price_tier";
  const base = () => supabase.from("products").select(cols).eq("status", "active").eq("is_service", false);
  const [byHandle, byTitle, byCode] = await Promise.all([
    c.handles.length ? base().in("handle", c.handles) : null,
    c.title ? base().ilike("title", ilikeLiteral(c.title)).limit(5) : null,
    c.code ? base().ilike("code", ilikeLiteral(c.code)).limit(5) : null,
  ]);
  const out = new Map<string, { handle: string; title: string; category: string | null; price_tier: string | null }>();
  // Title first: it is what the designer actually copied.
  for (const r of [byTitle, byHandle, byCode]) {
    if (r?.error) throw r.error;
    for (const d of (r?.data ?? []) as { handle: string; title: string; category: string | null; price_tier: string | null }[]) {
      if (!out.has(d.handle)) out.set(d.handle, d);
    }
  }
  return [...out.values()];
}

/** Ranked full-text handles. v2 drops catalogue-wide noise words (wallpaper,
 *  mural, design…) from the scoring, which a pasted website name is full of;
 *  v1 stays as the fallback so a missing function cannot blank the portal. */
async function rankedSearchHandles(q: string, limit: number): Promise<string[]> {
  // A named collection leads here too (search-intent.ts): a designer who types
  // "black and white" is asking for that range, not for every design that
  // mentions black.
  const named = await namedCollectionFor(q);
  const v2 = await supabase.rpc("search_products_v2", { p_query: q, p_limit: limit, p_room_tag: named?.tag ?? null });
  if (!v2.error) return ((v2.data ?? []) as { handle: string }[]).map((r) => r.handle);
  console.error("search_products_v2 failed, using v1:", v2.error.message);
  const v1 = await supabase.rpc("search_products_v1", { p_query: q, p_limit: limit });
  if (v1.error) throw v1.error;
  return ((v1.data ?? []) as { handle: string }[]).map((r) => r.handle);
}

/**
 * Paged catalogue browse for the partner workspace: ALWAYS the whole wallpaper
 * range, optionally narrowed by a text search and optionally ordered for a room.
 *
 * A room is a PREFERENCE, never a filter. The chips used to gate the grid on
 * "has a render photographed in that room", and a HomeLane designer dressing a
 * dining wall saw 11 designs instead of 252 and could not reach the rest
 * (28 September 2026). Now every design stays in the set and the count; the
 * ones the studio has rendered in that room lead, and each card wears that
 * room's render where one exists and another room's where not — a results
 * grid is not a room page, so a different wall beats a swatch
 * (`room-then-any-scene`, see toCard).
 *
 * A render, not a tag, decides what "rendered in that room" means: 772 of 977
 * active wallpapers carry the "Living Room" tag, including every corporate wall
 * graphic, so tags cannot rank a room.
 *
 * Paging and the distinct count come from `partner_catalogue_v2` rather than a
 * join: a design can hold several renders for one room family (187 office
 * designs carry 361 such images), and joining images to products would both
 * overstate the total and repeat designs across pages.
 */
export const browseProductCards = cachedCatalogue("browse-cards", async (opts: {
  /** `product_images.scene_key` values that count as this room. Orders and
   *  pictures the grid for that room; never removes a design from it. */
  sceneKeys?: string[];
  q?: string;
  page?: number;
  pageSize?: number;
  /** Drop the tiers a reselling channel is not sold (autograph, saanjha,
   *  atelier). Applied inside the query, not after it: filtering a page after
   *  the fact returned short pages and a total the partner could never reach. */
  excludeExclusive?: boolean;
}): Promise<{ cards: ProductCardData[]; total: number }> => {
  const pageSize = Math.min(Math.max(opts.pageSize ?? 36, 1), 96);
  const offset = (Math.max(1, opts.page ?? 1) - 1) * pageSize;
  const q = (opts.q ?? "").trim();
  const sceneKeys = opts.sceneKeys?.filter(Boolean) ?? [];

  let rows: { handle: string; total: number }[];
  let total: number;
  let fts: string[] | null = null;
  if (q.length > 1) {
    // A pasted name, product link or code NAMES a design: it leads, whatever
    // else the words match (see design-name.ts). Then the ranked full-text
    // hits, in relevance order.
    // The ranked search reads the corrected spelling ("paino" → "piano"); a
    // pasted name or code is matched as typed, which is what a name search is.
    const [named, ranked] = await Promise.all([
      findDesignsByName(q),
      spellSearchQuery(q).then((s) => rankedSearchHandles(s.query, 480)),
    ]);
    fts = [...new Set([...named.map((d) => d.handle), ...ranked])];
    if (!fts.length) return { cards: [], total: 0 };
    // The partner catalogue decides which of them this account may see; the
    // ORDER stays relevance. Paging after partner_catalogue_v2 had its own
    // aesthetic_rank order put an exact title match on page three behind
    // designs that only shared the word "wallpaper".
    const { data: eligibleRows, error: eErr } = await supabase.rpc("partner_catalogue_v2", {
      p_scene_keys: null,
      p_handles: fts,
      p_limit: fts.length,
      p_offset: 0,
      p_exclude_exclusive: !!opts.excludeExclusive,
    });
    if (eErr) throw eErr;
    const eligible = new Set(((eligibleRows ?? []) as { handle: string }[]).map((r) => r.handle));
    const ordered = fts.filter((h) => eligible.has(h));
    total = ordered.length;
    rows = ordered.slice(offset, offset + pageSize).map((handle) => ({ handle, total }));
  } else {
    const { data: pageRows, error: pErr } = await supabase.rpc("partner_catalogue_v2", {
      p_scene_keys: sceneKeys.length ? sceneKeys : null,
      p_handles: null,
      p_limit: pageSize,
      p_offset: offset,
      p_exclude_exclusive: !!opts.excludeExclusive,
    });
    if (pErr) throw pErr;
    rows = (pageRows ?? []) as { handle: string; total: number }[];
    total = Number(rows[0]?.total ?? 0);
  }
  if (!rows.length) return { cards: [], total };
  const handles = rows.map((r) => r.handle);

  const { data, error } = await supabase.from("products").select(CARD_SELECT).in("handle", handles);
  if (error) throw error;
  // Show the design AS IT LOOKS in the room being browsed. A room family can
  // span several scenes (Office: reception, boardroom, open plan…), so the
  // card takes whichever of them this design has been rendered in.
  const cards = ((data as unknown as Product[]) ?? []).map((p) => {
    const roomKey = sceneKeys.find((k) => (p.product_images ?? []).some((i) => i.scene_key === k)) ?? sceneKeys[0];
    return toCard(p, roomKey, "room-then-any-scene");
  });

  // `in` does not preserve order; relevance (or aesthetic rank) is the point.
  const order = new Map((fts ?? handles).map((h, i) => [h, i]));
  cards.sort((a, b) => (order.get(a.handle) ?? 0) - (order.get(b.handle) ?? 0));
  return { cards, total };
});

/** A partner's "Shortlisted for you" strip: these handles as catalogue cards,
 *  in the order given, keeping only designs a partner may order (active,
 *  wallpaper, flat verified — see lib/partner-shortlist.ts). Not cached: it is
 *  a handful of rows and staff expect an edit to show on the next load. */
export async function shortlistProductCards(
  handles: string[],
  opts: { excludeExclusive?: boolean } = {},
): Promise<ProductCardData[]> {
  if (!handles.length) return [];
  const { data, error } = await supabase.from("products")
    .select(`status, ${CARD_SELECT}`).in("handle", handles).eq("status", "active");
  if (error) throw error;
  const products = (data as unknown as (Product & { status: string })[]) ?? [];
  return eligibleShortlist(handles, products, opts).map((p) => toCard(p));
}

// Product page structured data: the review rating and the attribute sheet.
// Both change on a review approval or a studio edit, not on a visit, yet the
// product page asked each on every render (23–25k reads a day on 29 Sep 2026).
// A failed read throws so it is not cached; the page renders without it.
export const getProductRating = cachedCatalogue("product-rating", async (handle: string): Promise<{ count: number; average: number } | null> => {
  const { data, error } = await supabase.rpc("product_rating", { p_handle: handle });
  if (error) throw new Error(`product_rating(${handle}): ${error.message}`);
  return (data ?? null) as { count: number; average: number } | null;
});

export const getProductAttributes = cachedCatalogue("product-attributes", async (handle: string): Promise<unknown> => {
  const { data, error } = await supabase.rpc("product_attributes", { p_handle: handle });
  if (error) throw new Error(`product_attributes(${handle}): ${error.message}`);
  return data ?? null;
});
