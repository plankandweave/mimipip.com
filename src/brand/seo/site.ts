/**
 * What mimipip.com sells, for search engines, shopping feeds and the shop itself.
 * One answer, from the catalogue, prices.json and the print map: a design is on
 * sale when it has a price AND a print file the OS will print from. Everything
 * else is hidden: not listed, not linked, not in the sitemap, not in a feed.
 */
import records from '../review/catalogue.json';
import { artFor } from '../commerce/order-payload';
import { saleOf, sellableAnywhere, type Sale } from '../commerce/sale';
import { fixedPrice, measured, MIN_BILLED_SQFT, WALLPAPER_FIXED_SIZES } from '../commerce/prices';

export const ORIGIN = 'https://mimipip.com';
export const BRAND = 'MimiPip';
export const abs = (path: string) => (/^https?:\/\//.test(path) ? path : ORIGIN + path);

export type Rec = (typeof records)[number];
export const sellable: Rec[] = records.filter(r => sellableAnywhere(r.slug));
export const hidden: Rec[] = records.filter(r => !sellableAnywhere(r.slug));
const bySlug = new Map(records.map(r => [r.slug, r]));
export const recordOf = (slug: string) => bySlug.get(slug) ?? null;
export const isSellable = (slug: string) => sellableAnywhere(slug);
export const isWallpaper = (r: Rec) => r.type.some(t => t.includes('wallpaper'));

/** Why a design is not on sale, in plain words, for the report and the tests. */
export function hiddenReason(r: Rec): string {
  const priced = measured(r as never) || fixedPrice(r.slug, 'IN') !== null || fixedPrice(r.slug, 'ABROAD') !== null;
  if (!artFor(r.slug)) return priced ? 'no print file connected to the order' : 'no price and no print file';
  return 'no price';
}

/** The standard wall the product page opens on: 8 × 9 ft. */
export const STANDARD_WALL_SQFT = 72;
export type Money = { currency: 'INR' | 'USD'; amount: number };
const round2 = (n: number) => Math.round(n * 100) / 100;

/** What a shopper pays for the listed piece: a fixed piece's price, or a wallpaper's standard wall. GST included in India. */
export function listPrice(slug: string, market: 'IN' | 'ABROAD', sqft = STANDARD_WALL_SQFT): Money | null {
  const sale: Sale = saleOf(slug);
  const offer = market === 'IN' ? sale.india : sale.abroad;
  if (!offer) return null;
  const currency = market === 'IN' ? 'INR' : 'USD';
  if (offer.fixed !== undefined) return { currency, amount: round2(offer.fixed) };
  if (offer.rate === undefined) return null;
  return { currency, amount: round2(Math.max(sqft, MIN_BILLED_SQFT) * offer.rate) };
}
/** India offers finished sizes; custom walls and overseas orders retain minimum billing. */
export const minPrice = (slug: string, market: 'IN' | 'ABROAD'): Money | null => {
  const offer = saleOf(slug).india;
  if (market === 'IN' && offer?.rate !== undefined) {
    const area = Math.min(...WALLPAPER_FIXED_SIZES.map(([w,h]) => w*h));
    return { currency: 'INR', amount: round2(area * offer.rate) };
  }
  return listPrice(slug, market, MIN_BILLED_SQFT);
};

/** A JPEG of the product picture, for feeds and link previews (made by scripts/gen-feed-images.py). */
export const feedImage = (slug: string) => `/feed-images/${slug}.jpg`;
export const productPath = (slug: string) => '/products/' + slug;

export const typeLabel = (r: Rec) =>
  isWallpaper(r) ? "kids' wallpaper" : r.type.includes('floor-sticker') ? 'floor game sticker' : r.type.includes('border') ? 'wall border' : r.type.includes('stair-sticker') ? 'stair sticker set' : 'wall sticker';
