/**
 * Everything the product page needs to know about a wrap, resolved once.
 *
 * WHY THIS EXISTS. The fridge build spread its family knowledge across roughly
 * nine `isFridge` branches in src/app/products/[handle]/page.tsx — the "from"
 * price, the JSON-LD offer list, the gallery pill's label, the price line, the
 * buy-box choice, the attributes surface, the sizing accordion, the supply
 * sentence, even the founder's note. Each was correct. With five more appliances
 * every one of them becomes a chain, and a chain is where the sixth appliance
 * gets forgotten in exactly one branch and nobody notices until a customer reads
 * "See it on your fridge" above a dishwasher.
 *
 * So the page asks one question — is this a wrap, and if so what do I need to
 * know? — and every former branch becomes a field read off the answer. A new
 * appliance is then a row in wrap_appliances plus an entry in APPLIANCES, and the
 * product page does not change at all.
 */

import { getWrapFormats, getProductAppliances, getApplianceFlats } from "./wrap-queries";
import { APPLIANCES, APPLIANCE_CATEGORY, isApplianceKey } from "./appliances";
import type { ApplianceConfig, ApplianceKey } from "./appliances";
import { fromWrapPrice, offeredFormats, type WrapFormat } from "./wraps";

export type WrapContext = {
  /** Appliances this design is sold on, in picker order. Never empty. */
  offered: ApplianceKey[];
  /** The appliance the page presents itself as — position 0, or the deep link. */
  primary: ApplianceConfig;
  /** Every format of every offered appliance, allowed by wrap_format_codes. */
  formats: WrapFormat[];
  /** The authored flat per appliance. */
  flats: Partial<Record<ApplianceKey, { url: string; alt: string }>>;
  /** Cheapest standard format across every offered appliance. */
  fromPrice: number | null;
  /**
   * Every standard set price on offer, for the JSON-LD offer list.
   *
   * Deduplicated and sorted, because two appliances can legitimately share a
   * price — a front-load washer panel and a dryer panel are the same cabinet at
   * the same ₹1,000 — and a schema.org offer list repeating it says there are
   * two prices when there is one.
   */
  fixedPrices: number[];
};

/**
 * Resolve a wrap product, or null when the product is not one.
 *
 * Returns null rather than throwing on a wrap with no availability rows: that is
 * a half-finished upload, not a crash, and the page falls back to its ordinary
 * fixed-size rendering instead of 500ing on a design nobody can buy yet.
 */
export async function getWrapContext(
  product: { handle: string; category?: string | null; wrap_format_codes?: string[] | null },
  requestedAppliance?: string | null,
): Promise<WrapContext | null> {
  if (product.category !== APPLIANCE_CATEGORY) return null;

  const [allFormats, offered, flats] = await Promise.all([
    getWrapFormats(),
    getProductAppliances(product.handle),
    getApplianceFlats(product.handle),
  ]);
  if (!offered.length) return null;

  const formats = offeredFormats(allFormats, offered, product.wrap_format_codes ?? null);

  // A deep link from an appliance landing page opens on that appliance, so a
  // customer who arrived from /dishwasher-wraps is not asked to pick it again.
  // Anything unrecognised or not on offer falls back to the primary rather than
  // erroring — a stale link should still show the product.
  const wanted =
    isApplianceKey(requestedAppliance) && offered.includes(requestedAppliance)
      ? requestedAppliance
      : offered[0];

  const standard = formats.filter((f) => !f.isMadeToMeasure && (f.priceInr ?? 0) > 0);

  return {
    offered,
    primary: APPLIANCES[wanted],
    formats,
    flats,
    fromPrice: fromWrapPrice(formats),
    fixedPrices: [...new Set(standard.map((f) => f.priceInr as number))].sort((a, b) => a - b),
    // No page-level placeholder flag: the caveat belongs to the FORMAT the
    // customer has selected, and the buy box checks isPlaceholderFormat() on it
    // directly. A whole-product boolean had no consumer for exactly that reason.
  };
}
