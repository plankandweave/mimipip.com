import { cache } from "react";
import { supabaseWraps as supabase } from "./supabase-wraps";
import { APPLIANCES, APPLIANCE_CATEGORY } from "./appliances";
import type { ApplianceKey } from "./appliances";
import { fromWrapPrice } from "./wraps";
import type { MockupSpec, WrapFormat, WrapPanel } from "./wraps";
import type { ProductCardData } from "./types";

// ---------------------------------------------------------------------------
// The appliance-wraps catalogue reads.
//
// Ported from the retired `fridge-wraps` branch, where they sat in the shared
// queries.ts and read through a client pinned to the `wraps` schema. Here they
// stay in their own module, on their own client (src/lib/supabase-wraps.ts), so
// nothing in the store's own queries can drift into the wraps schema or the
// other way round. See supabase-wraps.ts for why the range is a separate
// catalogue.
// ---------------------------------------------------------------------------

/** A wrap design as a card. The store's card shape, plus the two wrap facts. */
export type WrapCardData = ProductCardData & {
  /** null = every standard format of every appliance the design is offered on;
   *  otherwise the design is sold at these alone (Mini Fridge Exclusives = E).
   *  The studio's format pills read this so a mini-only design cannot be
   *  previewed on a side-by-side. */
  wrapFormatCodes: string[] | null;
  /** Which appliances the design is made for, named as the picker names them. */
  wrapAppliances?: string[] | null;
  /** The same, as keys, in picker order — what a card draws the design on. */
  wrapApplianceKeys?: ApplianceKey[];
  /** The artwork as authored for each appliance (0095). */
  applianceFlats: Partial<Record<ApplianceKey, string>>;
};

type WrapImageRow = {
  url: string;
  alt: string | null;
  position: number;
  is_featured: boolean;
  is_flat: boolean;
  appliance: string | null;
  is_appliance_flat: boolean;
};

type WrapProductRow = {
  handle: string;
  title: string;
  description?: string | null;
  created_at: string | null;
  is_new: boolean | null;
  category: string | null;
  wrap_format_codes: string[] | null;
  product_images: WrapImageRow[] | null;
  product_tags?: { tag: string }[] | null;
};

const CARD_SELECT = `
  handle, title, created_at, is_new, category, wrap_format_codes,
  product_images ( url, alt, position, is_featured, is_flat, appliance, is_appliance_flat )
`;

function sortWrapImages(images: WrapImageRow[]): WrapImageRow[] {
  return [...images].sort(
    (a, b) => Number(b.is_featured) - Number(a.is_featured) || a.position - b.position,
  );
}

function toWrapCard(p: WrapProductRow, applianceKey?: ApplianceKey): WrapCardData {
  const images = p.product_images ?? [];
  // On an appliance page, show THIS design's artwork as authored for that
  // appliance. A shared design carries one flat per appliance (0095), and the
  // canonical is_flat is only the PRIMARY appliance's — so without this an AC
  // page would show 1:2 fridge compositions letterboxed into 3:1 tiles.
  const own = applianceKey
    ? images.find((i) => i.is_appliance_flat && i.appliance === applianceKey)
    : undefined;
  const card = own ?? images.find((i) => i.is_flat) ?? sortWrapImages(images)[0];
  const applianceFlats: Partial<Record<ApplianceKey, string>> = {};
  for (const i of images) {
    if (i.is_appliance_flat && i.appliance && i.appliance in APPLIANCES) {
      applianceFlats[i.appliance as ApplianceKey] = i.url;
    }
  }
  return {
    handle: p.handle,
    title: p.title,
    image: card?.url ?? null,
    imageAlt: card?.alt || p.title,
    // A wrap is sold per finished panel set; its material's ₹/sq ft (which
    // only Format Z prices off) must never reach a card. See priceWrapCards.
    fromPricePerSqft: null,
    fromPrice: null,
    tags: (p.product_tags ?? []).map((t) => t.tag),
    createdAt: p.created_at ?? null,
    isNew: p.is_new ?? false,
    category: p.category ?? APPLIANCE_CATEGORY,
    measurementType: "fixed",
    wrapFormatCodes: p.wrap_format_codes ?? null,
    applianceFlats,
  };
}

/**
 * Fill in each card's "from ₹X" and the appliances it is made for, in place.
 * The price lives in the format ladder, which depends on which appliances the
 * design is sold on: two queries for the whole page, not two per card.
 */
async function priceWrapCards(cards: WrapCardData[]): Promise<void> {
  const handles = cards.map((c) => c.handle);
  if (!handles.length) return;
  const [formats, offered] = await Promise.all([
    getWrapFormats().catch(() => [] as WrapFormat[]),
    supabase
      .from("products")
      .select("handle, product_appliances ( appliance, position )")
      .in("handle", handles)
      .then(
        (r) =>
          (r.data as { handle: string; product_appliances: { appliance: string; position: number }[] }[]) ?? [],
        () => [],
      ),
  ]);
  if (!formats.length || !offered.length) return;
  const byHandle = new Map<string, ApplianceKey[]>();
  for (const row of offered) {
    const keys = [...(row.product_appliances ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((a) => a.appliance)
      .filter((a): a is ApplianceKey => a in APPLIANCES);
    if (keys.length) byHandle.set(row.handle, keys);
  }
  for (const card of cards) {
    const keys = byHandle.get(card.handle);
    if (!keys?.length) continue;
    // Scoped to the formats this design is actually sold at, so a mini-fridge
    // exclusive quotes the mini price and not the range's cheapest rung.
    const codes = card.wrapFormatCodes;
    const usable = formats.filter(
      (f) => keys.includes(f.appliance) && (!codes?.length || codes.includes(f.code)),
    );
    card.fromPrice = fromWrapPrice(usable);
    card.wrapAppliances = [...new Set(keys.map((k) => APPLIANCES[k].pickerGroupLabel))];
    card.wrapApplianceKeys = keys;
  }
}

/**
 * Active wrap designs carrying `tag`, ranked, as cards. `applianceKey` makes
 * each card carry that appliance's authored flat.
 */
export async function getWrapProductsByTag(
  tag: string,
  limit = 48,
  applianceKey?: ApplianceKey,
): Promise<WrapCardData[]> {
  // `member` inner-joins to filter to the tag; the separate `product_tags`
  // embed returns ALL of each design's tags, which the landing pages use to
  // pick a cover per aesthetic row.
  const { data, error } = await supabase
    .from("products")
    .select(`${CARD_SELECT}, product_tags ( tag ), member:product_tags!inner ( tag )`)
    .eq("status", "active")
    .eq("is_service", false)
    .eq("category", APPLIANCE_CATEGORY)
    .eq("member.tag", tag)
    .order("aesthetic_rank", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  const cards = ((data as unknown as WrapProductRow[]) ?? []).map((p) => toWrapCard(p, applianceKey));
  await priceWrapCards(cards);
  return cards;
}

// ---- Collections ------------------------------------------------------------

export type WrapCollection = { handle: string; title: string; ruleTag: string; description: string | null };

/** A collection in the wraps catalogue, by handle, or null. */
export const getWrapCollection = cache(async (handle: string): Promise<WrapCollection | null> => {
  const { data, error } = await supabase
    .from("collections")
    .select("handle, title, rule_tag, description")
    .eq("handle", handle)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { handle: string; title: string; rule_tag: string | null; description: string | null };
  if (!row.rule_tag) return null;
  return { handle: row.handle, title: row.title, ruleTag: row.rule_tag, description: row.description ?? null };
});

// ---- One design -------------------------------------------------------------

export type WrapProduct = {
  handle: string;
  title: string;
  description: string | null;
  tags: string[];
  wrapFormatCodes: string[] | null;
  images: { url: string; alt: string; appliance: string | null; isFlat: boolean; isApplianceFlat: boolean }[];
};

/** An active wrap design by handle, or null. */
export const getWrapProduct = cache(async (handle: string): Promise<WrapProduct | null> => {
  const { data, error } = await supabase
    .from("products")
    .select(
      "handle, title, description, created_at, is_new, category, wrap_format_codes, product_tags ( tag ), product_images ( url, alt, position, is_featured, is_flat, appliance, is_appliance_flat )",
    )
    .eq("handle", handle)
    .eq("status", "active")
    .eq("category", APPLIANCE_CATEGORY)
    .maybeSingle();
  if (error || !data) return null;
  const p = data as unknown as WrapProductRow;
  return {
    handle: p.handle,
    title: p.title,
    description: p.description ?? null,
    tags: (p.product_tags ?? []).map((t) => t.tag),
    wrapFormatCodes: p.wrap_format_codes ?? null,
    images: sortWrapImages(p.product_images ?? []).map((i) => ({
      url: i.url,
      alt: i.alt || p.title,
      appliance: i.appliance,
      isFlat: i.is_flat,
      isApplianceFlat: i.is_appliance_flat,
    })),
  };
});

// ---------------------------------------------------------------------------
// Formats.
//
// The formats are the fleet's shapes, not an artwork's ladder, so they live in
// their own table shared by every wrap design (migrations 0087, 0094). Read them
// — never hardcode a format price in a component; the ladder is set, and the one
// place it is set is the database.
// ---------------------------------------------------------------------------

type WrapFormatRow = {
  code: string;
  appliance: string;
  label: string;
  door_type: string;
  capacity_label: string | null;
  door_width_min_mm: number | null;
  door_width_max_mm: number | null;
  door_height_min_mm: number | null;
  door_height_max_mm: number | null;
  panel_spec: WrapPanel[] | null;
  overall_width_mm: number | null;
  overall_height_mm: number | null;
  cut_area_sqft: number | string | null;
  price_inr: number | null;
  is_made_to_measure: boolean;
  own_site_only: boolean;
  lead_time_days: number | null;
  active: boolean;
  position: number;
  mockup_spec: MockupSpec | null;
  source_note: string | null;
};

function toWrapFormat(r: WrapFormatRow): WrapFormat {
  return {
    code: r.code,
    appliance: r.appliance as ApplianceKey,
    label: r.label,
    doorType: r.door_type,
    capacityLabel: r.capacity_label,
    doorWidthMinMm: r.door_width_min_mm,
    doorWidthMaxMm: r.door_width_max_mm,
    doorHeightMinMm: r.door_height_min_mm,
    doorHeightMaxMm: r.door_height_max_mm,
    panels: Array.isArray(r.panel_spec) ? r.panel_spec : [],
    overallWidthMm: r.overall_width_mm,
    overallHeightMm: r.overall_height_mm,
    cutAreaSqFt: r.cut_area_sqft != null ? Number(r.cut_area_sqft) : null,
    priceInr: r.price_inr,
    isMadeToMeasure: r.is_made_to_measure,
    ownSiteOnly: r.own_site_only,
    leadTimeDays: r.lead_time_days,
    active: r.active,
    position: Number(r.position) || 0,
    mockupSpec: r.mockup_spec ?? null,
    sourceNote: r.source_note ?? null,
  };
}

const WRAP_FORMAT_SELECT =
  "code, appliance, label, door_type, capacity_label, door_width_min_mm, door_width_max_mm, door_height_min_mm, door_height_max_mm, panel_spec, overall_width_mm, overall_height_mm, cut_area_sqft, price_inr, is_made_to_measure, own_site_only, lead_time_days, active, position, mockup_spec, source_note";

/** Every active wrap format across every appliance, in display order. */
export const getWrapFormats = cache(async (): Promise<WrapFormat[]> => {
  const { data, error } = await supabase
    .from("wrap_formats")
    .select(WRAP_FORMAT_SELECT)
    .eq("active", true)
    .order("position");
  if (error) throw error;
  return ((data as WrapFormatRow[]) ?? []).map(toWrapFormat);
});

/** One appliance's ladder, in display order. */
export async function getApplianceFormats(appliance: ApplianceKey): Promise<WrapFormat[]> {
  const all = await getWrapFormats();
  return all.filter((f) => f.appliance === appliance);
}

/** One format by code, or null. */
export async function getWrapFormat(code: string): Promise<WrapFormat | null> {
  const all = await getWrapFormats();
  return all.find((f) => f.code === code.trim().toUpperCase()) ?? null;
}

/** Which appliances a design is sold on, in picker order (migration 0095). */
export async function getProductAppliances(handle: string): Promise<ApplianceKey[]> {
  const { data, error } = await supabase
    .from("products")
    .select("product_appliances ( appliance, position )")
    .eq("handle", handle)
    .maybeSingle();
  if (error) throw error;
  const rows =
    (data as { product_appliances: { appliance: string; position: number }[] } | null)
      ?.product_appliances ?? [];
  return [...rows]
    .sort((a, b) => a.position - b.position)
    .map((r) => r.appliance)
    .filter((a): a is ApplianceKey => a in APPLIANCES);
}

/**
 * The authored flat for each appliance a design is sold on. A shared design
 * carries one flat per appliance, drawn at that appliance's proportions (0095)
 * — showing a 1:2 fridge composition on a 3:1 AC panel is a picture of the
 * wrong product.
 */
export async function getApplianceFlats(
  handle: string,
): Promise<Partial<Record<ApplianceKey, { url: string; alt: string }>>> {
  const { data, error } = await supabase
    .from("products")
    .select("title, product_images ( url, alt, appliance, is_appliance_flat )")
    .eq("handle", handle)
    .maybeSingle();
  if (error) throw error;
  const row = data as
    | {
        title: string;
        product_images: { url: string; alt: string | null; appliance: string | null; is_appliance_flat: boolean }[];
      }
    | null;
  const out: Partial<Record<ApplianceKey, { url: string; alt: string }>> = {};
  for (const img of row?.product_images ?? []) {
    if (!img.is_appliance_flat || !img.appliance || !(img.appliance in APPLIANCES)) continue;
    const key = img.appliance as ApplianceKey;
    // Composed from the appliance the flat is FOR, not read from the row: the
    // stored alts went stale as designs were extended to more appliances.
    const noun = APPLIANCES[key].altNoun;
    const title = row?.title ?? "";
    out[key] = { url: img.url, alt: title ? `${title} — ${noun} wrap` : img.alt || title };
  }
  return out;
}

// ---- The fridge model database (wrap_models) --------------------------------

export type FridgeModelMatch = {
  brand: string;
  modelCode: string;
  formatCode: string;
  capacityL: number | null;
  /** True only when the door dimensions came from the manufacturer's own spec
   *  sheet. An unverified match must be shown WITH the measure-your-door
   *  fallback, never presented as settled. */
  verified: boolean;
  sourceNote: string | null;
};

type FridgeModelRow = {
  brand: string;
  model_code: string;
  aliases: string[] | null;
  format_code: string;
  capacity_l: number | null;
  verified: boolean;
  source_note: string | null;
};

const toModelMatch = (r: FridgeModelRow): FridgeModelMatch => ({
  brand: r.brand,
  modelCode: r.model_code,
  formatCode: r.format_code,
  capacityL: r.capacity_l,
  verified: r.verified,
  sourceNote: r.source_note,
});

/**
 * Fridge models matching what the customer typed off the sticker inside their
 * door. Searches brand, model code and the alias list, because nobody types
 * "GL-B199ORLB" the way the catalogue spells it.
 */
export async function searchFridgeModels(q: string, limit = 8): Promise<FridgeModelMatch[]> {
  const term = q.trim().replace(/[%,(){}"]/g, " ").trim();
  if (term.length < 2) return [];
  // Normalised form, so "gl b199" and "GL-B199" find the same row.
  const loose = term.replace(/[\s-]+/g, "");
  const { data, error } = await supabase
    .from("wrap_models")
    .select("brand, model_code, aliases, format_code, capacity_l, verified, source_note")
    .eq("active", true)
    .or(`brand.ilike.%${term}%,model_code.ilike.%${term}%,aliases.cs.{${term}}`)
    .limit(limit * 3);
  if (error) throw error;
  const rows = (data as FridgeModelRow[]) ?? [];
  // Rank an exact-ish code hit above a brand-only hit: someone typing a model
  // number wants that model, not every fridge the brand makes.
  const scored = rows.map((r) => {
    const code = r.model_code.replace(/[\s-]+/g, "").toLowerCase();
    const hit = code.includes(loose.toLowerCase()) || loose.toLowerCase().includes(code);
    return { r, score: hit ? 0 : 1 };
  });
  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map(({ r }) => toModelMatch(r));
}

/** Every brand we know, for the fit finder's brand picker. */
export const getFridgeBrands = cache(async (): Promise<string[]> => {
  const { data, error } = await supabase.from("wrap_models").select("brand").eq("active", true);
  if (error) throw error;
  const brands = new Set(((data as { brand: string }[]) ?? []).map((r) => r.brand));
  return [...brands].sort();
});
