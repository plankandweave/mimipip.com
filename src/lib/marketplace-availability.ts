import { cache } from "react";
import { supabase } from "./supabase";
import { cachedCatalogue } from "./catalogue-cache";

/**
 * Where a Zyvorah design can be bought besides zyvorah.com.
 *
 * Some customers simply prefer to buy on Amazon — their card is saved there,
 * they have Prime, they trust the returns flow. Hiding that we are on Amazon
 * does not win that sale, it loses it. So a design that IS on Amazon says so
 * and links straight to it.
 *
 * The one thing this must never do is guess. `marketplace_listing_exports.asin`
 * is only populated where our design title was found VERBATIM in the live
 * Amazon title; handles whose ASIN could not be verified that way are
 * deliberately NULL (fuzzy matching produced confident-looking but WRONG pairs
 * — see migration 0084). No ASIN → no link, ever: a wrong deep link sends a
 * customer to a competitor's product page.
 *
 * Read through the `product_amazon_asin` RPC rather than the table, because
 * marketplace_listing_exports is server-only (internal channel state: batches,
 * frozen prices, export history) while an ASIN is already public. That also
 * keeps the storefront off the service-role key, which is not required for
 * anything else a product page renders.
 *
 * Both RPCs exclude Autograph designs at the database level too — the tier is
 * exclusive to zyvorah.com and must never resolve to a marketplace link.
 */

export const AMAZON_MARKETPLACE = "amazon.in";

/** Amazon's canonical product URL. No affiliate tag — we are the seller here. */
export function amazonUrl(asin: string): string {
  return `https://www.amazon.in/dp/${encodeURIComponent(asin)}`;
}

/** Brand search, for the where-to-buy page's catch-all link. */
export const AMAZON_STOREFRONT_URL = "https://www.amazon.in/s?k=Zyvorah";

export type MarketplaceListing = {
  marketplace: string;
  asin: string;
  url: string;
};

/**
 * The verified Amazon listing for one design, or null. Memoised per request:
 * the product page and its JSON-LD both ask.
 *
 * Never throws — a failing side-channel lookup must not take a product page
 * down over a link that is, at worst, nice to have.
 */
// The ASIN changes when a listing is verified or withdrawn, not when a visitor
// arrives — yet every product page render asked (22,700 reads on 29 Sep 2026).
// An error throws so it is never cached as "no listing".
const readAmazonAsin = cachedCatalogue("amazon-asin", async (handle: string): Promise<string | null> => {
  const { data, error } = await supabase.rpc("product_amazon_asin", { p_handle: handle });
  if (error) throw new Error(`product_amazon_asin(${handle}): ${error.message}`);
  const asin = typeof data === "string" ? data.trim() : "";
  return asin || null;
});

export const getAmazonListing = cache(
  async (handle: string): Promise<MarketplaceListing | null> => {
    let asin: string | null;
    try {
      asin = await readAmazonAsin(handle);
    } catch {
      return null;
    }
    if (!asin) return null;
    return { marketplace: AMAZON_MARKETPLACE, asin, url: amazonUrl(asin) };
  },
);

/** How many designs are live on Amazon right now — counted from verified ASINs
 *  rather than asserted, so the where-to-buy page cannot go stale. */
export const countAmazonListings = cache(async (): Promise<number> => {
  const { data, error } = await supabase.rpc("amazon_listing_count");
  if (error || typeof data !== "number") return 0;
  return data;
});
