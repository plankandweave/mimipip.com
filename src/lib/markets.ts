import { MIMIPIP_PRICING } from '@/brand/pricing-policy';
export type CurrencyCode = "INR" | "USD";
export type MarketTier = "india" | "value" | "standard" | "core" | "premium";

export const MARKET_COUNTRY_COOKIE = "zyv_country";

// The wallpaper is dispatched in this tube. Couriers bill the greater of
// actual and volumetric weight; the latter is 140 x 7.5 x 7.5 / 5000 = 1.575kg.
export const WALLPAPER_PACKAGE = {
  lengthMm: 1400,
  diameterMm: 75,
  lengthCm: 140,
  widthCm: 7.5,
  heightCm: 7.5,
  tareKg: 0.45,
  averageWallpaperGsm: 250,
} as const;

// Mimi Pip's verified fulfilment and approved pricing markets.
const COUNTRY_CODES = ['IN', 'US'];
const VALID_COUNTRIES = new Set(COUNTRY_CODES);

const PREMIUM = new Set("AE AU CH DK HK IS KW LI LU MC NO NZ QA SE SG".split(" "));
const CORE = new Set("AT BE CA DE ES FI FR GB IE IL IT JP KR NL PT SA US".split(" "));
const VALUE = new Set(
  "AF BD BF BI BJ BO BT CD CF CG CI CM ER ET GH GM GN GW HT KH LA LR LS MG ML MM MW MZ NE NG NP PK RW SD SL SN SO SS SY TD TG TJ TZ UG YE ZM ZW".split(" "),
);

const SOUTH_ASIA = new Set("BD BT LK MV NP PK".split(" "));
const NEARBY = new Set("AE BH BN HK ID KH KW LA MM MY OM PH QA SA SG TH VN".split(" "));
const EAST_ASIA = new Set("CN JP KR MO TW".split(" "));
const EUROPE = new Set("AD AL AT BA BE BG BY CH CY CZ DE DK EE ES FI FO FR GB GG GI GR HR HU IE IM IS IT JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS SE SI SK SM TR UA VA".split(" "));
const NORTH_AMERICA = new Set("CA MX US".split(" "));
const OCEANIA = new Set("AU FJ NC NZ PG".split(" "));

const PRICE_FACTORS: Record<MarketTier, number> = { india: 1, value: 1, standard: 1, core: 1, premium: 1 };
// Native totals are GST-inclusive INR. This is a retail price mapping, not FX.
const INR_PER_GLOBAL_PRICING_UNIT = MIMIPIP_PRICING.sellingInrPerSqFt / MIMIPIP_PRICING.sellingUsdPerSqFt;

export type Market = {
  countryCode: string;
  countryName: string;
  currency: CurrencyCode;
  tier: MarketTier;
  priceFactor: number;
  shippingIncluded: true;
  customsIncluded: boolean;
};

/**
 * Where the visitor is, as Cloudflare saw the connection.
 *
 * On Workers the country rides on `request.cf.country`, which vinext carries
 * through to the request — and it is there whether or not the zone's IP
 * Geolocation setting is on. The `cf-ipcountry` header, by contrast, is only
 * written when that zone setting is enabled, and on zyvorah.com it is not: the
 * header never arrived, the lookup fell through to the browser's
 * Accept-Language, and a Mac in Mumbai set to "English (UK)" was shown the
 * whole shop in US dollars for the United Kingdom (14 September 2026). The
 * header stays as a second reading for any proxy that does set it.
 *
 * The browser's language is deliberately never consulted: it says which
 * English someone reads, not where a parcel goes.
 */
export function geoCountry(req: { cf?: unknown; headers: { get(name: string): string | null } }): string | null {
  const cf = (req as { cf?: { country?: unknown } }).cf;
  const fromCf = typeof cf?.country === "string" ? cf.country : null;
  // x-zyv-geo-country: request.cf.country as the gateway saw it, when the call
  // into the cached Site entrypoint does not carry request.cf itself. The
  // gateway always overwrites it, so a client cannot set it (src/edge/gate.ts).
  return (
    normalizeCountryCode(fromCf) ??
    normalizeCountryCode(req.headers.get("x-zyv-geo-country")) ??
    normalizeCountryCode(req.headers.get("cf-ipcountry"))
  );
}

export function normalizeCountryCode(value?: string | null): string | null {
  const code = value?.trim().toUpperCase();
  return code && VALID_COUNTRIES.has(code) ? code : null;
}

let regionNames: Intl.DisplayNames | null = null;
export function countryName(code: string): string {
  const normalized = normalizeCountryCode(code) ?? "IN";
  try {
    regionNames ??= new Intl.DisplayNames(["en"], { type: "region" });
    return regionNames.of(normalized) ?? normalized;
  } catch {
    return normalized;
  }
}

function tierFor(countryCode: string): MarketTier {
  if (countryCode === "IN") return "india";
  if (PREMIUM.has(countryCode)) return "premium";
  if (CORE.has(countryCode)) return "core";
  if (VALUE.has(countryCode)) return "value";
  return "standard";
}

export function marketFor(countryCode: string): Market {
  const code = normalizeCountryCode(countryCode) ?? "IN";
  const tier = tierFor(code);
  return {
    countryCode: code,
    countryName: countryName(code),
    currency: code === "IN" ? "INR" : "USD",
    tier,
    priceFactor: PRICE_FACTORS[tier],
    shippingIncluded: true,
    customsIncluded: code === "IN",
  };
}

export function countryOptions(): { code: string; name: string }[] {
  return COUNTRY_CODES.map((code) => ({ code, name: countryName(code) })).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

export function formatMarketMoney(amount: number, currency: CurrencyCode): string {
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: currency === "INR" ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function marketGoodsFromInr(amountInr: number, countryCode: string): number {
  const market = marketFor(countryCode);
  if (market.currency === "INR") return roundMoney(amountInr);
  return roundMoney((amountInr / INR_PER_GLOBAL_PRICING_UNIT) * market.priceFactor);
}

export function volumetricWeightKg(tubeCount = 1): number {
  const one = (WALLPAPER_PACKAGE.lengthCm * WALLPAPER_PACKAGE.widthCm * WALLPAPER_PACKAGE.heightCm) / 5000;
  return roundMoney(one * Math.max(1, tubeCount));
}

export function chargeableWeightKg(areaSqFt: number, tubeCount = 1): number {
  const count = Math.max(1, Math.ceil(tubeCount));
  const areaSqM = Math.max(0, areaSqFt) * 0.092903;
  const actual = count * WALLPAPER_PACKAGE.tareKg + (areaSqM * WALLPAPER_PACKAGE.averageWallpaperGsm) / 1000;
  return Math.ceil(Math.max(actual, volumetricWeightKg(count)) * 2) / 2;
}

export function internationalDeliveryUsd(countryCode: string, areaSqFt: number, tubeCount = 1): number {
  const code = normalizeCountryCode(countryCode) ?? "US";
  if (code === "IN") return 0;
  let base = 58;
  let extra = 11;
  if (SOUTH_ASIA.has(code)) [base, extra] = [28, 7];
  else if (NEARBY.has(code)) [base, extra] = [38, 8];
  else if (EAST_ASIA.has(code)) [base, extra] = [45, 9];
  else if (EUROPE.has(code)) [base, extra] = [52, 10];
  else if (NORTH_AMERICA.has(code)) [base, extra] = [58, 11];
  else if (OCEANIA.has(code)) [base, extra] = [58, 12];
  const weight = chargeableWeightKg(areaSqFt, tubeCount);
  return Math.ceil(base * Math.max(1, tubeCount) + Math.max(0, weight - 2 * Math.max(1, tubeCount)) * extra);
}

export function internationalTransitWorkingDays(countryCode: string): { min: number; max: number } {
  const code = normalizeCountryCode(countryCode) ?? "US";
  if (SOUTH_ASIA.has(code) || NEARBY.has(code)) return { min: 5, max: 10 };
  if (EAST_ASIA.has(code)) return { min: 7, max: 12 };
  if (EUROPE.has(code) || NORTH_AMERICA.has(code) || OCEANIA.has(code)) return { min: 8, max: 15 };
  return { min: 8, max: 18 };
}

export type MarketQuote = {
  countryCode: string;
  currency: CurrencyCode;
  goods: number;
  delivery: number;
  total: number;
  chargeableWeightKg: number;
  tubeCount: number;
};

export function quoteMarketOrder(input: {
  amountInr: number;
  countryCode: string;
  areaSqFt?: number;
  tubeCount?: number;
  /** A creator collaboration that includes delivery (Roheena, 7 October 2026)
   *  covers the international delivery too, not only India's courier — so a
   *  100% gift abroad lands on 0 and is confirmed without a payment window. */
  waiveDelivery?: boolean;
}): MarketQuote {
  const market = marketFor(input.countryCode);
  const tubeCount = Math.max(1, Math.ceil(input.tubeCount ?? 1));
  const areaSqFt = Math.max(0, input.areaSqFt ?? 0);
  const goods = marketGoodsFromInr(input.amountInr, market.countryCode);
  const delivery = 0; // MimiPip wallpaper retail includes shipping.
  return {
    countryCode: market.countryCode,
    currency: market.currency,
    goods,
    delivery,
    total: roundMoney(goods + delivery),
    chargeableWeightKg: chargeableWeightKg(areaSqFt, tubeCount),
    tubeCount,
  };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
