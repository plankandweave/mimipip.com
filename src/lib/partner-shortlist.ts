import { isExclusiveTier } from "@/lib/pricing";

/** Most designs a shortlist strip carries. A shortlist is a handful of liked
 *  designs, not a second catalogue. */
export const SHORTLIST_MAX = 24;

const HANDLE = /^[a-z0-9][a-z0-9-]{0,199}$/;

/** `corporate_accounts.shortlist_handles` as a clean, ordered list: strings
 *  only, trimmed and lower-cased, valid handle shape, first occurrence wins,
 *  capped. Anything else (null before the migration, a non-array) is empty. */
export function parseShortlistHandles(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const h = v.trim().toLowerCase();
    if (!HANDLE.test(h) || out.includes(h)) continue;
    out.push(h);
    if (out.length >= SHORTLIST_MAX) break;
  }
  return out;
}

export type ShortlistProduct = {
  handle: string;
  status?: string | null;
  category?: string | null;
  flat_verified?: boolean | null;
  is_service?: boolean | null;
  price_tier?: string | null;
};

/** The products a partner's strip may show, in the STORED order (not the
 *  database's): active, a wallpaper, flat verified, not a service, and not an
 *  exclusive tier where the account is blocked from those. A handle with no
 *  such product — renamed, archived, never existed — drops out silently. */
export function eligibleShortlist<P extends ShortlistProduct>(
  handles: string[],
  products: P[],
  opts: { excludeExclusive?: boolean } = {},
): P[] {
  const byHandle = new Map(products.map((p) => [p.handle, p]));
  const out: P[] = [];
  for (const h of handles) {
    const p = byHandle.get(h);
    if (!p) continue;
    if (p.status !== "active" || p.category !== "wallpaper" || p.flat_verified !== true || p.is_service) continue;
    if (opts.excludeExclusive && isExclusiveTier(p.price_tier)) continue;
    out.push(p);
  }
  return out;
}
