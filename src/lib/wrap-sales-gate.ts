/**
 * Whether an appliance wrap can be BOUGHT yet — and the one sentence a customer
 * reads when it can't.
 *
 * This lives in its own file, with no imports, on purpose. The wrap family is
 * mid-rename (fridge.ts → wraps.ts → appliances.ts, 'fridge-wrap' →
 * 'appliance-wrap'), and a sales gate that rides along inside a module being
 * refactored is a gate that quietly disappears in a rename. Nothing here depends
 * on the shape of that refactor, so nothing here breaks with it.
 *
 * WHY THE RANGE IS BROWSABLE BUT NOT BUYABLE. The designs, the fit database and
 * the format ladder are all real and finished. The film is not: the choice
 * between Avery and 3M self-adhesive stock is unsigned, so no panel can be
 * printed to a standard we'd stand behind. A paid order today is an order we
 * cannot fulfil, which is worse than no order — so every add-to-cart path says
 * "coming soon" instead, and none of them silently fails or 500s.
 */

/**
 * Every category slug a wrap product has carried.
 *
 * 0087 shipped 'fridge-wrap'. 0096 renames the family to 'appliance-wrap',
 * because `category` is a scalar and a design sold on a fridge AND a dishwasher
 * cannot hold one of each. BOTH are listed here deliberately: a gate keyed to a
 * single literal stops gating the day the other migration is applied — it fails
 * OPEN, selling the thing it was written to withhold. Match on this list.
 */
export const WRAP_CATEGORY_SLUGS: readonly string[] = ["fridge-wrap", "appliance-wrap"];

/** Is this product category a wrap, under either of its slugs? */
export function isWrapCategory(slug: string | null | undefined): boolean {
  return typeof slug === "string" && WRAP_CATEGORY_SLUGS.includes(slug);
}

/**
 * The switch. OFF, and deliberately not an environment variable here.
 *
 * On the retired `fridge-wraps` branch this read NEXT_PUBLIC_WRAPS_PURCHASABLE,
 * and that branch's /api/cart priced a wrap line from wrap_formats. This app's
 * cart and checkout read the store's own catalogue (the `public` schema), where
 * no wrap design exists — wrap designs live in the `wraps` schema (see
 * src/lib/supabase-wraps.ts). So there is no buy path for a wrap here at all,
 * and a switch that could be flipped on would offer a cart the API cannot
 * honour. Opening sales means porting the cart's wrap price-pinning first; until
 * then the range is browsable and every buy box says "coming soon".
 */
export const WRAPS_PURCHASABLE: boolean = false;

/** What the customer is told, everywhere a wrap would have been bought. */
export const WRAPS_COMING_SOON_MESSAGE =
  "Appliance wraps are coming soon — they're not available to buy just yet.";

/** The error code the cart and checkout routes return on a blocked wrap line. */
export const WRAPS_COMING_SOON_CODE = "wraps_coming_soon";
