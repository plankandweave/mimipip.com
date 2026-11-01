// The product page's secondary reads — rating, attributes, edition count and
// the Amazon listing — behind the same cache and deadline as the catalogue.
//
// The page's main reads already go through cachedCatalogue, which answers
// within CATALOGUE_READ_DEADLINE_MS or throws. These four did not: they were
// bare supabase.rpc calls on every render, with no timeout, so a stalled
// PostgREST held the whole product page open until Cloudflare's 100 s limit
// and served Googlebot a 524. A product page that times out for the crawler
// is a product page that drops out of the index.
//
// Every read here is decoration, not the page: a failure or a timeout
// degrades to "no rating / no attributes / no Amazon link" and the page still
// renders. The attributes are also what the <head> title reads, so caching
// them means generateMetadata and the page body share one read.

import { supabase } from "@/lib/supabase";
import { cachedCatalogue } from "@/lib/catalogue-cache";
import { getAmazonListing } from "@/lib/marketplace-availability";
import type { RawAttributes } from "@/lib/seo";

/** An RPC that throws on error, so a failed read is never cached. */
async function rpcOrThrow<T>(name: string, args: Record<string, unknown>): Promise<T | null> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return (data ?? null) as T | null;
}

const readAttributes = cachedCatalogue("product-attributes", (handle: string) =>
  rpcOrThrow<RawAttributes>("product_attributes", { p_handle: handle }),
);

// Ten minutes, not an hour: a new review should reach the page the same session.
const readRating = cachedCatalogue(
  "product-rating",
  (handle: string) => rpcOrThrow<{ count: number; average: number }>("product_rating", { p_handle: handle }),
  600,
);

// A minute: this is the "only N left" figure on a limited edition, and it
// must not keep selling pieces that have gone.
const readEditionSold = cachedCatalogue(
  "edition-sold",
  (handle: string) => rpcOrThrow<number>("edition_sold", { p_handle: handle }),
  60,
);

/** Resolve to null instead of throwing, and give up after `ms`. */
async function settle<T>(name: string, work: Promise<T>, ms = 4_000): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`did not answer within ${ms}ms`)), ms);
      }),
    ]);
  } catch (err) {
    console.error(`[product-page] ${name} skipped:`, (err as Error).message);
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const productAttributesRaw = (handle: string) => settle("product_attributes", readAttributes(handle));
export const productRating = (handle: string) => settle("product_rating", readRating(handle));
export const productEditionSold = (handle: string) => settle("edition_sold", readEditionSold(handle));
export const amazonListingFor = (handle: string) => settle("amazon_listing", getAmazonListing(handle));
