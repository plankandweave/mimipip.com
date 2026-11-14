/**
 * MimiPip designs that are also sold on Amazon India. The one place this lives.
 *
 * Only listings checked live on amazon.in go here (each was opened on amazon.in on
 * 14 Nov 2026: in stock, Add to cart, ₹4,900 — Amazon price observed then; not the current mimipip.com price). The
 * Seller Central batch has 14 active MimiPip listings; the rest are added by their
 * ASIN once read from Seller Central.
 *
 * The owner's rule of 7 October 2026 for Zyvorah stands: Amazon is never offered on
 * a product page beside Add to cart. MimiPip names it in the footer, the FAQ and its
 * own page (/guides/amazon) only. MimiPip has no Amazon brand store yet and Amazon's
 * search does not show the new listings, so links go to each product page directly.
 */
export type AmazonListing = { slug: string; name: string; asin: string };

export const AMAZON_INDIA_LISTINGS: readonly AmazonListing[] = [
  { slug: 'hopscotch-peach-pop', name: 'Connected Hopscotch Floor Sticker, Peach Pop', asin: 'B0HRKMD283' },
  { slug: 'hopscotch-pastel-play', name: 'Connected Hopscotch Floor Sticker, Pastel Play', asin: 'B0HRKDH71S' },
  { slug: 'hopscotch-bold-adventure', name: 'Connected Hopscotch Floor Sticker, Bold Adventure', asin: 'B0HRKXF8ZM' },
];

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
