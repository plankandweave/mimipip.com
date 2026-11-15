/**
 * MimiPip designs that are also sold on Amazon India. The one place this lives.
 *
 * The listings themselves are in amazon-india.json. Only listings checked live on
 * amazon.in go there: the three Hopscotch stickers were opened on 14 Nov 2026; on
 * 15 Nov 2026 every recorded ASIN was fetched from amazon.in and showed Add to cart.
 * A wallpaper is recorded by its parent ASIN, which opens the design with its three
 * finished sizes (2 x 3, 3 x 4.5 and 4 x 6 ft). World Explorer Vintage Plane
 * (MP-WP-KD-0011) is listed but inactive on Amazon, so it is left out until it is live.
 *
 * The owner's rule of 7 October 2026 for Zyvorah stands: Amazon is never offered on
 * a product page beside Add to cart. MimiPip names it in the footer, the FAQ and its
 * own page (/guides/amazon) only. MimiPip has no Amazon brand store yet, so links go
 * to each product page directly.
 */
import listings from './amazon-india.json';

export const AMAZON_GROUPS = ['Wallpaper', 'Floor games', 'Bathroom Buddies'] as const;
export type AmazonGroup = (typeof AMAZON_GROUPS)[number];
export type AmazonListing = { slug: string; name: string; asin: string; group?: AmazonGroup };

export const AMAZON_INDIA_LISTINGS: readonly AmazonListing[] = listings as AmazonListing[];

const ASIN = /^B0[A-Z0-9]{8}$/;

/** The listings to show: well-formed ASINs only, each once. */
export function amazonListings(list: readonly AmazonListing[] = AMAZON_INDIA_LISTINGS): AmazonListing[] {
  const seen = new Set<string>();
  return list.filter(l => ASIN.test(l.asin) && l.name.trim() && !seen.has(l.asin) && seen.add(l.asin));
}

export const amazonProductUrl = (asin: string) => `https://www.amazon.in/dp/${asin}`;

/** Our own page listing them, or null when there is nothing on Amazon to point to. */
export function amazonIndiaLink(list: readonly AmazonListing[] = AMAZON_INDIA_LISTINGS): string | null {
  return amazonListings(list).length ? '/guides/amazon' : null;
}
