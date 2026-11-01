// Shop-by-size landing pages for Canvas Art (/wall-art/[size]).
//
// Why these exist: Search Console showed size queries — "6 feet by 4 feet
// painting", "3ft by 3ft canvas painting", "2 x 3 ft canvas" — earning
// impressions and no clicks, because the only pages that could answer them
// were product pages each naming several sizes. A page per size answers the
// query as typed.
//
// The sizes are READ FROM THE CATALOGUE (products.ready_sizes), never listed by
// hand: a canvas's ready sizes are cut to its own proportion (canvas-sizes.ts),
// so the set of sizes that exist moves as designs are published. A size with no
// active, rendered canvas behind it has no page — it is not in the index, not
// in the sitemap, and its URL 404s rather than serving an empty grid with a 200.

import { supabase } from "./supabase";
import { cachedCatalogue } from "./catalogue-cache";
import { CANVAS_CATEGORY } from "./product-category";
import { feetLabel } from "./product-facts";

/** One finished size, orientation-free: short edge × long edge, inches. */
export type CanvasSize = {
  /** URL segment: "4x6-ft" when both edges are whole feet, else "30x60-in". */
  slug: string;
  shortIn: number;
  longIn: number;
  /** Designs (handles) sold at this size, catalogue rank order. */
  handles: string[];
  /** handle → the ?size= value the product page preselects (its own stored
   *  orientation), for sizes the product page can parse (whole inches). */
  sizeParam: Record<string, string>;
};

type Row = {
  handle: string;
  ready_sizes: [number, number][] | null;
  product_images: { is_flat: boolean }[] | null;
};

const wholeFeet = (inches: number) => inches % 12 === 0;

/** The canonical slug for a size, orientation-free. */
export function canvasSizeSlug(a: number, b: number): string {
  const [s, l] = a <= b ? [a, b] : [b, a];
  return wholeFeet(s) && wholeFeet(l) ? `${s / 12}x${l / 12}-ft` : `${s}x${l}-in`;
}

/** "4 × 6 ft", "2 ft 6 in × 5 ft" — short edge first. */
export function canvasSizeLabel(size: Pick<CanvasSize, "shortIn" | "longIn">): string {
  const { shortIn: s, longIn: l } = size;
  if (wholeFeet(s) && wholeFeet(l)) return `${s / 12} × ${l / 12} ft`;
  return `${feetLabel(s)} × ${feetLabel(l)}`;
}

/** The same size said the other way round, as people also search it:
 *  "6 × 4 feet"; a square as "3 by 3 feet"; a size that is not whole feet in
 *  inches, long edge first. */
export function canvasSizeAltLabel(size: Pick<CanvasSize, "shortIn" | "longIn">): string {
  const { shortIn: s, longIn: l } = size;
  if (wholeFeet(s) && wholeFeet(l)) return s === l ? `${s / 12} by ${s / 12} feet` : `${l / 12} × ${s / 12} feet`;
  return `${l} × ${s} in`;
}

/** Inches, short edge first: "48 × 72 in". */
export function canvasSizeInches(size: Pick<CanvasSize, "shortIn" | "longIn">): string {
  return `${size.shortIn} × ${size.longIn} in`;
}

/** Every way of saying this size beyond its label, without repeats. */
export function canvasSizeAliases(size: Pick<CanvasSize, "shortIn" | "longIn">): string[] {
  return [...new Set([canvasSizeAltLabel(size), canvasSizeInches(size)])];
}

/**
 * Every size an active canvas is sold in, with the designs sold at it. Only
 * designs with a room render count (homepage rule 9 in spirit — a size page is
 * a shop window, and a swatch never fronts a card there), and only whole-inch
 * sizes (a half-inch edge is a proportion artefact, not a size anyone types).
 *
 * Cached through the catalogue cache so the page cannot hang on a slow read.
 */
export const getCanvasSizes = cachedCatalogue("canvas-sizes-index", async (): Promise<CanvasSize[]> => {
  const { data, error } = await supabase
    .from("products")
    .select("handle, ready_sizes, product_images ( is_flat )")
    .eq("status", "active").eq("is_service", false)
    .eq("category", CANVAS_CATEGORY)
    .order("aesthetic_rank", { ascending: true, nullsFirst: false })
    .order("handle", { ascending: true })
    .limit(1000);
  if (error) throw error;

  const bySlug = new Map<string, CanvasSize>();
  for (const p of (data as unknown as Row[]) ?? []) {
    const rendered = (p.product_images ?? []).some((i) => !i.is_flat);
    if (!rendered) continue;
    for (const pair of p.ready_sizes ?? []) {
      const [w, h] = [Number(pair?.[0]), Number(pair?.[1])];
      if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) continue;
      const slug = canvasSizeSlug(w, h);
      let size = bySlug.get(slug);
      if (!size) {
        size = { slug, shortIn: Math.min(w, h), longIn: Math.max(w, h), handles: [], sizeParam: {} };
        bySlug.set(slug, size);
      }
      if (!size.sizeParam[p.handle]) {
        size.handles.push(p.handle);
        size.sizeParam[p.handle] = `${w}x${h}`;
      }
    }
  }
  return [...bySlug.values()].sort((a, b) => a.shortIn * a.longIn - b.shortIn * b.longIn || a.shortIn - b.shortIn);
});

/** Parses a URL segment, tolerating the reversed order ("6x4-ft"). Returns the
 *  canonical slug it means, or null when it is not a size at all. */
export function parseCanvasSizeSlug(raw: string): string | null {
  const m = raw.toLowerCase().match(/^(\d{1,3})x(\d{1,3})-(ft|in)$/);
  if (!m) return null;
  const k = m[3] === "ft" ? 12 : 1;
  const a = Number(m[1]) * k;
  const b = Number(m[2]) * k;
  if (!a || !b) return null;
  return canvasSizeSlug(a, b);
}
