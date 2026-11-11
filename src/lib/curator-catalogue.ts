import { sellableAnywhere } from "../brand/commerce/sale";
import { supabase } from "./supabase";
import { pickFlatImage } from "./queries";
import type { Product } from "./types";

/**
 * Catalogue access for the Design-with-Zyvorah curator. Like `searchProducts`
 * in concierge-tools, but it carries each product's **flat** image (for the
 * "see it on your wall" RoomVisualizer) and its full tag set (for ranking +
 * the honest "closest I could find" check). Grounded in the real, active
 * catalogue — the curator never invents a design.
 */

export type CuratorCandidate = {
  sampleable: boolean;
  handle: string;
  title: string;
  flatUrl: string | null;
  flatAlt: string;
  fromPricePerSqft: number | null;
  tags: string[];
};

const SELECT = `
  handle, title, category, flat_verified, is_service,
  product_images ( url, alt, position, is_featured, is_flat, scene_key ),
  product_materials ( price_per_sqft, available, materials(slug) ),
  product_tags ( tag )
`;

function toCandidate(p: Product): CuratorCandidate {
  const flat = pickFlatImage(p.product_images ?? []);
  const prices = (p.product_materials ?? [])
    .filter((m) => m.available)
    .map((m) => Number(m.price_per_sqft))
    .filter((n) => n > 0);
  return {
    sampleable: p.category === "wallpaper" && p.flat_verified === true && p.is_service === false && p.product_materials.some(m => m.available && m.materials?.slug === "smooth-matt"),
    handle: p.handle,
    title: p.title,
    flatUrl: flat?.url ?? null,
    flatAlt: flat?.alt || p.title,
    fromPricePerSqft: prices.length ? Math.min(...prices) : null,
    tags: (p.product_tags ?? []).map((t) => t.tag),
  };
}

/** One keyword search over titles, descriptions and style tags of active products. */
export async function curatorSearch(query: string, limit = 10): Promise<CuratorCandidate[]> {
  const q = query.trim().slice(0, 80);
  if (!q) return [];
  const pattern = `%${q.replace(/[%_]/g, "")}%`;

  const [byText, byTag] = await Promise.all([
    supabase
      .from("products")
      .select(SELECT)
      .eq("status", "active").eq("is_service", false)
      .or(`title.ilike.${pattern},description.ilike.${pattern}`)
      .limit(limit),
    supabase
      .from("products")
      .select(`${SELECT}, member:product_tags!inner ( tag )`)
      .eq("status", "active").eq("is_service", false)
      .ilike("member.tag", pattern)
      .limit(limit),
  ]);

  const seen = new Map<string, CuratorCandidate>();
  for (const row of [...(byText.data ?? []), ...(byTag.data ?? [])] as unknown as Product[]) {
    if (sellableAnywhere(row.handle) && !seen.has(row.handle)) seen.set(row.handle, toCandidate(row));
  }
  return [...seen.values()];
}

/**
 * Run several searches (one per facet of the conversation) and merge into a
 * single deduped candidate pool, dropping anything without a flat image (the
 * wall preview needs one). Capped so the ranking prompt stays small.
 */
export async function gatherCandidates(queries: string[], perQuery = 8, cap = 24): Promise<CuratorCandidate[]> {
  const clean = [...new Set(queries.map((q) => q.trim()).filter(Boolean))].slice(0, 8);
  const results = await Promise.all(clean.map((q) => curatorSearch(q, perQuery)));
  const seen = new Map<string, CuratorCandidate>();
  for (const list of results) {
    for (const c of list) {
      if (c.flatUrl && !seen.has(c.handle)) seen.set(c.handle, c);
    }
  }
  return [...seen.values()].slice(0, cap);
}
