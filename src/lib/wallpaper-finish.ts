/**
 * ONE FINISH PER WALLPAPER (founder, 5 and 7 October 2026).
 *
 * A design is sold on one material, chosen when it is uploaded — never
 * "Soft Matte or Linen Textured" on the product page. Two finishes at two
 * prices under one name is two products wearing one, and the customer is left
 * to guess which one the studio meant.
 *
 * The database holds the rule (`product_materials_one_finish`, migration
 * 20261007180000) and seeds the finish the Studio sends; this module is the
 * same two surface choices for the Studio's form and route. Collection membership
 * sets a new standard design's price — the cart always prices off
 * `product_materials.price_per_sqft`, never off this file.
 */
export const WALLPAPER_FINISHES = [
  { slug: "smooth-matt", label: "Smooth matte surface" },
  { slug: "linen-touch", label: "Linen feel" },
] as const;

export type WallpaperFinishSlug = (typeof WALLPAPER_FINISHES)[number]["slug"];

export const DEFAULT_WALLPAPER_FINISH: WallpaperFinishSlug = "smooth-matt";

/** The finish an upload asked for. Anything unrecognised is the everyday
 *  finish, mirroring the database. */
export function requestedFinish(v: unknown): WallpaperFinishSlug {
  return WALLPAPER_FINISHES.some((f) => f.slug === v) ? (v as WallpaperFinishSlug) : DEFAULT_WALLPAPER_FINISH;
}

/** Surface never determines retail price. Special tiers retain their saved rate. */
export function newWallpaperRate(input: { tags: string[]; collections: { tags: string[]; signature: boolean }[]; signature: boolean; existingRate: number }): number {
  const memberships = input.collections.filter((c) => c.tags.some((tag) => input.tags.includes(tag)));
  if (input.signature || memberships.some((c) => c.signature)) return input.existingRate;
  return memberships.length ? 300 : 200;
}
