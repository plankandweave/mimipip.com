/**
 * MimiPip's prices: the only place a figure lives. The browser shows these and
 * the server re-works them at checkout, so a price cannot be typed in a request.
 *
 * Fixed retail figures come from the owner-selected Simple Price List (8 November). A
 * design with no figure here is not on sale: the shop leaves it out, and the
 * checkout refuses it. There is no "price to confirm" state.
 */
import records from '../review/catalogue.json';
import prices from './prices.json';
import { MIMIPIP_PRICING } from '../pricing-policy';
export const INDIA_GST_RATE = MIMIPIP_PRICING.gstRate ?? 0.18;

export const SQFT_PER_SQCM = 1 / 929.0304;
/** Zyvorah's rule, carried over: wallpaper is billed at 20 sq ft at least. */
export const MIN_BILLED_SQFT = 20;
export const MAX_QTY = 99;
export const MAX_WALL_CM = 3000;

export type Market = 'IN' | 'ABROAD';
export const marketOf = (countryCode: string): Market => (countryCode.toUpperCase() === 'IN' ? 'IN' : 'ABROAD');
export const currencyOf = (market: Market) => (market === 'IN' ? 'INR' : 'USD') as 'INR' | 'USD';

type Rec = (typeof records)[number] & { sourceIndiaPricePerSqft?: number | null };
const bySlug = new Map((records as Rec[]).map(r => [r.slug, r]));
const isWallpaper = (r: Rec) => r.type.includes('wallpaper');
/** A wall is measured; a fixed piece has one size. */
export const measured = (r: Rec) => isWallpaper(r) && r.measurementType === 'made-to-measure';

/** Per sq ft in whole rupees or dollars, or null when she has set none. */
export function ratePerSqft(slug: string, market: Market): number | null {
  const r = bySlug.get(slug);
  if (!r || !isWallpaper(r)) return null;
  if (market === 'ABROAD') return prices.abroadWallpaperUsdPerSqft;
  return MIMIPIP_PRICING.sellingInrPerSqFt;
}

/** A fixed-size piece's price in whole rupees or dollars, or null. */
export function fixedPrice(slug: string, market: Market): number | null {
  const table = (market === 'IN' ? prices.fixedInr : prices.fixedUsd) as Record<string, number>;
  return table[slug] ?? null;
}

export const billedSqft = (widthCm: number, heightCm: number) =>
  Math.max(widthCm * heightCm * SQFT_PER_SQCM, MIN_BILLED_SQFT);

export type Priced = {
  slug: string; name: string; qty: number; currency: 'INR' | 'USD';
  /** Minor units for one piece, GST included in India. */
  unitMinor: number; lineMinor: number;
  widthCm: number | null; heightCm: number | null;
  ratePerSqft: number | null; billedSqft: number | null;
};

export type Refusal = { refused: string };
export const refused = (x: Priced | Refusal): x is Refusal => 'refused' in x;

const validCm = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 10 && n <= MAX_WALL_CM;

export function priceLine(input: { slug: string; qty: number; widthCm?: number; heightCm?: number }, market: Market): Priced | Refusal {
  const r = bySlug.get(input.slug);
  if (!r) return { refused: 'This design is no longer available.' };
  if (!Number.isInteger(input.qty) || input.qty < 1 || input.qty > MAX_QTY) return { refused: 'Check the quantity.' };
  const currency = currencyOf(market);
  if (measured(r)) {
    if (!validCm(input.widthCm) || !validCm(input.heightCm)) return { refused: `Enter the wall size for ${r.name}.` };
    const rate = ratePerSqft(r.slug, market);
    if (rate === null) return { refused: `${r.name} is not on sale in this country.` };
    const sqft = billedSqft(input.widthCm, input.heightCm);
    const unitMinor = Math.round(sqft * rate * (market === 'IN' ? 1 + INDIA_GST_RATE : 1) * 100);
    return { slug: r.slug, name: r.name, qty: input.qty, currency, unitMinor, lineMinor: unitMinor * input.qty, widthCm: input.widthCm, heightCm: input.heightCm, ratePerSqft: rate, billedSqft: Math.round(sqft * 100) / 100 };
  }
  const price = fixedPrice(r.slug, market);
  if (price === null) return { refused: `${r.name} is not on sale in this country.` };
  const unitMinor = Math.round(price * 100);
  return { slug: r.slug, name: r.name, qty: input.qty, currency, unitMinor, lineMinor: unitMinor * input.qty, widthCm: r.widthCm ?? null, heightCm: r.heightCm ?? null, ratePerSqft: null, billedSqft: null };
}

export const nameOf = (slug: string) => bySlug.get(slug)?.name ?? 'This design';

/** Is this design for sale in this market? The shop filters on the same answer. */
export function onSale(slug: string, market: Market): boolean {
  const r = bySlug.get(slug);
  if (!r) return false;
  return measured(r) ? ratePerSqft(slug, market) !== null : fixedPrice(slug, market) !== null;
}
