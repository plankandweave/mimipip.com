import { supabaseWraps as supabase } from "./supabase-wraps";
import { getApplianceFormats, getWrapProductsByTag } from "./wrap-queries";
import { getFridgeHeroScenes } from "@/app/fridge-wraps/_lib/scenes";
import { APPLIANCES, APPLIANCE_CATEGORY, type ApplianceKey } from "./appliances";
import { WRAP_COLLECTIONS } from "./wrap-collections";
import type { WrapCardData } from "./wrap-queries";
import type { WrapFormat } from "./wraps";
import type { FridgeHeroScene } from "@/app/fridge-wraps/_lib/scenes";

/**
 * Everything an appliance landing page renders, in one call.
 *
 * The aesthetic rows are the interesting part. They are SHARED across the range
 * (a Florals batch is a Florals batch whether it is going on a fridge or an air
 * conditioner — see migration 0096), so the rows themselves are not per
 * appliance. What IS per appliance is which of them have anything in them: a
 * design tagged Florals might be sold on fridges only, and linking an AC page to
 * a Florals row containing no AC artwork sends the customer to a listing that
 * either 404s or shows fridge panels they cannot buy.
 *
 * So membership is counted per appliance, from the appliance's own family tag.
 * getSubCollections could not answer this: it counts by CATEGORY, and every
 * appliance shares one category now.
 */

export type WrapLandingData = {
  formats: WrapFormat[];
  designs: WrapCardData[];
  rows: { handle: string; title: string; key: string }[];
  heroScenes: FridgeHeroScene[];
};

/**
 * The aesthetic rows holding at least one design sold on this appliance.
 *
 * One query rather than one per row: five rows × five appliances would be
 * twenty-five round trips a page, for an answer that is a single join.
 */
export async function getPopulatedWrapRows(
  appliance: ApplianceKey,
): Promise<{ handle: string; title: string; key: string }[]> {
  const familyTag = APPLIANCES[appliance].familyTag;
  const rowTags = WRAP_COLLECTIONS.map((c) => c.key);

  // Designs on this appliance, with all their tags — so the row tags they carry
  // can be counted without asking about each row separately.
  const { data, error } = await supabase
    .from("products")
    .select("product_tags ( tag ), member:product_tags!inner ( tag )")
    .eq("status", "active")
    .eq("is_service", false)
    .eq("category", APPLIANCE_CATEGORY)
    .eq("member.tag", familyTag);
  // A landing page must not 500 because a browse aid is unavailable. No rows
  // shown is a page missing a convenience; a crash is a page missing.
  if (error) return [];

  const present = new Set<string>();
  for (const p of (data as { product_tags: { tag: string }[] }[]) ?? []) {
    for (const t of p.product_tags ?? []) {
      if (rowTags.includes(t.tag)) present.add(t.tag);
    }
  }

  return WRAP_COLLECTIONS.filter((c) => present.has(c.key)).map((c) => ({
    handle: c.handle,
    title: c.label,
    // The row's TAG, so a landing page can filter its own appliance's listing
    // by the look rather than sending an AC shopper to a fridge collection.
    key: c.key,
  }));
}

export async function getWrapLandingData(appliance: ApplianceKey): Promise<WrapLandingData> {
  const cfg = APPLIANCES[appliance];
  // Each piece degrades on its own. A missing ladder costs the fit table, a
  // missing shoot costs the photography, and the page still renders — which is
  // the state every one of these pages is in until its numbers are signed off.
  const [formats, designs, rows, heroScenes] = await Promise.all([
    getApplianceFormats(appliance).catch(() => [] as WrapFormat[]),
    // The appliance key makes each card show THIS appliance's authored flat
    // rather than the design's canonical (primary appliance's) one.
    getWrapProductsByTag(cfg.familyTag, 24, appliance).catch(() => [] as WrapCardData[]),
    getPopulatedWrapRows(appliance),
    getFridgeHeroScenes(3, appliance).catch(() => [] as FridgeHeroScene[]),
  ]);
  return { formats, designs, rows, heroScenes };
}
