import { supabaseWraps as supabase } from "@/lib/supabase-wraps";
import { toMediaUrl } from "@/lib/media-url";
import type { ApplianceKey } from "@/lib/appliances";

/**
 * The photographic stages behind the appliance-wrap landing pages.
 *
 * Lives here rather than in `src/lib/queries.ts` on purpose: the render
 * pipeline that fills `wrap_scenes` is being built alongside this page, and
 * two workstreams editing the same shared module is how a merge eats one of
 * them.
 *
 * Second consumer since: /wraps, the hub at the root of wraps.zyvorah.com,
 * which fronts the whole appliance range rather than the fridge alone. Kept
 * here rather than promoted into queries.ts because both callers are wrap
 * surfaces and this is still one query — move it the day a third asks.
 *
 * `kind = 'hero'` is the only kind this page may show. A 'template' scene is
 * a render stage whose artwork is a promise about a specific SKU (0090) — it
 * belongs on a product page, not in a mood band.
 */

export type FridgeHeroScene = {
  slug: string;
  title: string;
  url: string;
  formatCodes: string[];
};

// The TABLE is `wrap_scenes` (0094) but the storage bucket keeps the id
// `fridge-scenes`: a bucket cannot be renamed in a migration that replays
// cleanly, and every existing row already points into it. Other appliances
// upload under an `{appliance}/` prefix inside the same bucket, so the paths
// on the rows stay correct either way. Do not "fix" this to match the table.
const BUCKET = "fridge-scenes";

/**
 * Art-directed hero images, in display order. Returns an empty array when the
 * shoot hasn't happened yet — the page must render honestly on nothing rather
 * than draw a substitute, because a drawn fridge is exactly the vector look
 * this line was told not to have (Roheena, 2026-08-06).
 *
 * `appliance` scopes the shoot to one appliance's landing page. Left undefined
 * it returns the whole range, which is what the /wraps hub wants and what a
 * per-appliance page must never take: a split-AC stage on the fridge page is a
 * mood band advertising a product that page does not sell.
 */
export async function getFridgeHeroScenes(
  limit = 3,
  appliance?: ApplianceKey,
): Promise<FridgeHeroScene[]> {
  let q = supabase
    .from("wrap_scenes")
    .select("slug, title, storage_path, format_codes")
    .eq("active", true)
    .eq("kind", "hero");
  if (appliance) q = q.eq("appliance", appliance);
  // Unscoped, the same photograph appears once per appliance it was registered
  // for — so the hub asked for three scenes and got the SAME kitchen three
  // times, under three different captions. De-duplicate on the file, then take
  // the limit, so "three scenes" means three pictures.
  const { data, error } = await q.order("position").limit(appliance ? limit : limit * 8);
  // A landing page must not 500 because a mood image is missing. The type
  // carries the page; the photography is an enhancement to it.
  if (error) return [];
  const rows =
    (data as { slug: string; title: string; storage_path: string; format_codes: string[] | null }[]) ??
    [];
  const seen = new Set<string>();
  const out: FridgeHeroScene[] = [];
  for (const r of rows) {
    if (seen.has(r.storage_path)) continue;
    seen.add(r.storage_path);
    out.push({
      slug: r.slug,
      title: r.title,
      // The row keeps storage's spelling; the bytes are served from R2 through
      // /media (lib/media-url.ts), so a busy wrap day costs no storage egress.
      url: toMediaUrl(supabase.storage.from(BUCKET).getPublicUrl(r.storage_path).data.publicUrl),
      formatCodes: r.format_codes ?? [],
    });
    if (out.length >= limit) break;
  }
  return out;
}
