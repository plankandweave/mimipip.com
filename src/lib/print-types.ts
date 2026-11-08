import type { SupabaseClient } from "@/brand/database-types";

/**
 * Print rules, owned by the product TYPE.
 *
 * Roheena, 2026-08-24: "It should always be about product type. The rule for
 * wall art is different. The rule for wallpaper is different, and the rule for
 * wrap is different. As well, the rule for borders is different."
 *
 * Before this, the OS dispatched every Zyvorah order with one global overlap
 * (`zyvorah.print.overlap_mm` = 15) and one global panel cap. Those are
 * WALLPAPER's rules: 15 mm of printed overlap is what lets an installer butt
 * two strips on a wall so the pattern matches. A wrap is cut to its finished
 * edge by the machine and butts nothing, and paying wallpaper's overlap on a
 * wrap is not merely redundant — it makes each 660 mm appliance panel 690 mm
 * across the roll, which is what stopped two of them nesting side by side and
 * threw away half a 1350 mm web on the Vijay Sales order.
 *
 * The rules live in print_product_types (migration 0104), a table of their own
 * rather than on product_categories. product_categories turned out to be the
 * STOREFRONT taxonomy in production — browse_tag, collection_handle, nav
 * position, Google Merchant category — and a wrap is not a shelf a customer
 * browses to: wraps are made for a partner and fitted in their stores. So the
 * taxonomy POINTS at a print type instead of being one.
 *
 * Distinct from print-rules.ts, which reads the OS's GLOBAL zyvorah.print.*
 * rules to show a customer the panel plan for their wall. That file answers
 * "how does the machine split a wall today"; this one answers "which rules does
 * this product print under at all". The global pair is wallpaper's, so the
 * storefront's panel preview is still wallpaper-shaped for every type — worth
 * revisiting once a wrap is orderable from the storefront rather than only
 * through the partner portal.
 *
 * They are resolved HERE and travel with the order to the OS, rather than being
 * restated in the OS: the category table is the source of truth, and a copy of
 * these numbers in a second system is a copy that will disagree one day.
 */
export type ProductPrintRules = {
  /** Printed seam overlap per strip edge, mm. Wallpaper 15, wrap 0. */
  overlapMm: number;
  /** Artwork printed past the knife, mm. Null = the engine's 0.3 mm clip floor. */
  cutBleedMm: number | null;
  /** Ship-friendly cap on printed strip width, mm. Null = no cap. */
  maxPanelMm: number | null;
  /** May pieces sit side by side across the roll instead of one lane down it? */
  nestAcross: boolean;
  /** Roll width this type prints on, mm. Null = no billing floor (0106). */
  mediaWidthMm: number | null;
  /** Edge allowance off media_width_mm before billing, mm (~20 per edge). */
  billingTrimMm: number;
};

/**
 * What every order placed before 2026-08-24 effectively was, and what the OS
 * sent for all of them. Used when a type cannot be resolved, so an unknown
 * product prints the way it printed yesterday rather than a new way nobody
 * chose.
 */
export const WALLPAPER_PRINT_TYPE = "wallpaper";
export const WALLPAPER_RULES: ProductPrintRules = {
  overlapMm: 15,
  cutBleedMm: null,
  maxPanelMm: 610,
  nestAcross: false,
  mediaWidthMm: 1350,
  billingTrimMm: 40,
};

/**
 * The minimum billable width for a piece of this type, mm — or null when the
 * type has no floor.
 *
 * Roheena, 2026-08-26, after Vijay Sales ZVY-10716..10719 printed 661 mm bands
 * one lane down a 1350 mm roll: "no matter what dimensions we print, the
 * minimum billing should always be the width of the paper minus 40 mm." A
 * piece that runs its own lane consumes the full web for every running metre,
 * so the bill covers the web, not the artwork's slice of it. The 40 mm is the
 * edge margin that can never carry sellable print (the engine keeps >=25 mm
 * clear per edge for the cut).
 *
 * A nest-capable type (wrap) shares the web between pieces, so no single piece
 * carries the floor — "if it is nested, then you don't need to apply it."
 */
export function minBillableWidthMm(rules: ProductPrintRules): number | null {
  if (rules.nestAcross || !rules.mediaWidthMm) return null;
  const floor = rules.mediaWidthMm - rules.billingTrimMm;
  return floor > 0 ? floor : null;
}

/**
 * Sq ft of web a one-lane piece actually consumes under the billing floor.
 *
 * Run length is the piece's length down the roll in the orientation that
 * consumes the LEAST media: the longer edge lies across the web whenever it
 * fits inside the billable width, otherwise it has to run down the roll. The
 * customer is never charged for a rotation the machine could have made.
 *
 * A piece both of whose dimensions exceed the billable width already covers
 * the web, so the floor never exceeds its plain area there — full-height
 * wallpaper walls price exactly as they always did.
 */
export function mediaFloorSqft(widthMm: number, heightMm: number, minWidthMm: number): number {
  const runMm = Math.max(widthMm, heightMm) <= minWidthMm
    ? Math.min(widthMm, heightMm)
    : Math.max(widthMm, heightMm);
  return (runMm * minWidthMm) / 92_903.04;
}

/**
 * slug → minimum billable width, for every print type at once — what the order
 * form needs to MIRROR the floor while the buyer is still deciding, so the
 * number on screen is the number the server will bill. Falls back to
 * wallpaper's floor alone if the lookup fails: the server stays authoritative,
 * this only keeps the preview honest.
 */
export async function billingFloorsBySlug(
  sb: SupabaseClient,
): Promise<Record<string, number | null>> {
  const fallback = { [WALLPAPER_PRINT_TYPE]: minBillableWidthMm(WALLPAPER_RULES) };
  const { data, error } = await sb
    .from("print_product_types")
    .select("slug, nest_across, media_width_mm, billing_trim_mm");
  if (error || !data) {
    if (error) console.error("[print-types] billing floors lookup failed:", error.message);
    return fallback;
  }
  const out: Record<string, number | null> = { ...fallback };
  for (const r of data) {
    out[String(r.slug)] = minBillableWidthMm({
      ...WALLPAPER_RULES,
      nestAcross: Boolean(r.nest_across),
      mediaWidthMm: r.media_width_mm == null ? null : Number(r.media_width_mm),
      billingTrimMm: Number(r.billing_trim_mm ?? WALLPAPER_RULES.billingTrimMm),
    });
  }
  return out;
}

/**
 * A product type sent by the browser, accepted only if it is a real one.
 *
 * The type reaches the server from the client because that is where it is
 * known: a library design carries it (migration 0105) and a rack band inherits
 * it from its segments, and a composed band has neither a library row nor a
 * catalogue handle for the server to look it up from afterwards.
 *
 * So it is validated rather than trusted — an unknown slug falls back to the
 * catalogue product, and failing that to wallpaper. What this deliberately does
 * NOT do is prove the claim: a partner who edits the request could mark a
 * wallpaper as a wrap and have it print without seam overlap. That is a change
 * to their own order's finish, visible on their own wall, and not worth making
 * a band un-composable to prevent.
 */
export async function validPrintType(
  sb: SupabaseClient,
  sent: unknown,
): Promise<string | null> {
  if (typeof sent !== "string" || !sent.trim()) return null;
  const { data, error } = await sb
    .from("print_product_types")
    .select("slug")
    .eq("slug", sent.trim())
    .maybeSingle();
  if (error || !data) return null;
  return String(data.slug);
}

/**
 * The product type for an order, from the catalogue product it was placed
 * against.
 *
 * Falls back to wallpaper in every uncertain case — no handle (the partner
 * brought their own artwork), a handle we cannot find, or a product with no
 * category. A wrong guess here changes how something PRINTS, so the fallback is
 * the status quo rather than anything cleverer.
 */
export async function resolvePrintType(
  sb: SupabaseClient,
  productHandle: string | null,
): Promise<string> {
  if (!productHandle) return WALLPAPER_PRINT_TYPE;
  const { data, error } = await sb
    .from("products")
    .select("category, product_categories!inner(print_type)")
    .eq("handle", productHandle)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error(`[print-types] category lookup failed for ${productHandle}:`, error.message);
    return WALLPAPER_PRINT_TYPE;
  }
  // The category is the storefront's axis; print_type is the printing one, and
  // a category with no mapping prints as wallpaper — the status quo.
  const cat = data.product_categories as unknown as { print_type?: string | null } | null;
  return cat?.print_type ?? WALLPAPER_PRINT_TYPE;
}

/**
 * The print rules for a type.
 *
 * Same fallback discipline: a type with no row, or a lookup that fails, prints
 * as wallpaper. The one thing this must never do is return a rule set that
 * makes something print differently because a query was unlucky.
 */
export async function printRulesFor(
  sb: SupabaseClient,
  printType: string,
): Promise<ProductPrintRules> {
  const { data, error } = await sb
    .from("print_product_types")
    .select("overlap_mm, cut_bleed_mm, max_panel_mm, nest_across, media_width_mm, billing_trim_mm")
    .eq("slug", printType)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error(`[print-rules] rules lookup failed for ${printType}:`, error.message);
    return WALLPAPER_RULES;
  }
  return {
    overlapMm: Number(data.overlap_mm ?? WALLPAPER_RULES.overlapMm),
    cutBleedMm: data.cut_bleed_mm === null || data.cut_bleed_mm === undefined
      ? null : Number(data.cut_bleed_mm),
    maxPanelMm: data.max_panel_mm === null || data.max_panel_mm === undefined
      ? null : Number(data.max_panel_mm),
    nestAcross: Boolean(data.nest_across),
    mediaWidthMm: data.media_width_mm === null || data.media_width_mm === undefined
      ? null : Number(data.media_width_mm),
    billingTrimMm: Number(data.billing_trim_mm ?? WALLPAPER_RULES.billingTrimMm),
  };
}
