/** One answer to "can this design be bought, and for how much", for the shop and the product page. */
import { fixedPrice, onSale, ratePerSqft, type Market } from './prices';
import { artFor } from './order-payload';

export type Offer = { rate?: number; fixed?: number } | null;
function offer(slug: string, market: Market): Offer {
  if (!artFor(slug) || !onSale(slug, market)) return null;
  const fixed = fixedPrice(slug, market);
  if (fixed !== null) return { fixed };
  const rate = ratePerSqft(slug, market);
  return rate === null ? null : { rate };
}
export type Sale = { india: Offer; abroad: Offer };
export const saleOf = (slug: string): Sale => ({ india: offer(slug, "IN"), abroad: offer(slug, "ABROAD") });
export const sellableAnywhere = (slug: string) => { const s = saleOf(slug); return !!(s.india || s.abroad); };
