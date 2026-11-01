import { countryName, formatMarketMoney, marketFor, marketGoodsFromInr } from "@/lib/markets";

/**
 * Telling a search engine which country a page is priced for.
 *
 * A search snippet is written when the page is built, long before anyone
 * searches, so it cannot read the visitor's location the way the storefront
 * does. That is not the end of the story: the standard answer is to publish
 * one URL per market and link them with hreflang, which is exactly what
 * Google uses to serve an American searcher the dollar page and an Indian
 * searcher the rupee one.
 *
 * The market URL already exists — `?market=US` renders the whole page, and its
 * Product structured data, in that country's currency (see landingMarket in
 * the product route). What was missing was the head links that tell Google the
 * variants are the same product for different countries, a self-referencing
 * canonical on each one, and a description that quotes the currency its own
 * page shows.
 *
 * SEARCH_MARKETS is deliberately short. Every extra market is another URL per
 * design in the index, so this carries only the countries Zyvorah actually
 * merchandises to — the same list the Google Merchant feed is built for
 * (/feeds/google-merchant.xml?country=). India is the home market: it keeps
 * the clean URL and answers x-default.
 */
export const HOME_MARKET = "IN";

/**
 * The lowest rupee rate the catalogue is ever advertised at, used only where
 * no single design's own rate applies (a collection listing spans several).
 * A design's page quotes its OWN floor — see fromRateFor in the product route.
 */
export const CATALOGUE_FLOOR_RATE = 200;
export const SEARCH_MARKETS = ["US", "AE"] as const;

/** hreflang for a market. All copy is English; the country does the targeting. */
function hreflangFor(countryCode: string): string {
  return `en-${countryCode}`;
}

/**
 * The URL a market's variant of `path` lives at. The home market keeps the
 * clean path — no `?market=IN` copy of every page competing with the original.
 */
export function marketUrl(path: string, countryCode: string): string {
  if (countryCode === HOME_MARKET) return path;
  return `${path}${path.includes("?") ? "&" : "?"}market=${countryCode}`;
}

/**
 * The hreflang cluster for a page, for `Metadata.alternates.languages`.
 *
 * Every variant publishes the SAME map, including a link back to itself —
 * hreflang has to be reciprocal or Google discards the whole cluster.
 */
export function marketAlternates(path: string): Record<string, string> {
  const languages: Record<string, string> = {
    "x-default": marketUrl(path, HOME_MARKET),
    [hreflangFor(HOME_MARKET)]: marketUrl(path, HOME_MARKET),
  };
  for (const code of SEARCH_MARKETS) languages[hreflangFor(code)] = marketUrl(path, code);
  return languages;
}

/**
 * Canonical + hreflang for one market's variant of a page, ready to spread
 * into `Metadata.alternates`. The canonical points at the variant itself: a
 * canonical back to the India page would tell Google the dollar page is a
 * duplicate and drop it, which is the opposite of the intent.
 */
export function marketMetadataAlternates(path: string, countryCode: string) {
  return {
    canonical: marketUrl(path, countryCode),
    languages: marketAlternates(path),
  };
}

/** A price written in the market's own currency, from the rupee figure. */
export function marketPriceLabel(amountInr: number, countryCode: string): string {
  const market = marketFor(countryCode);
  return formatMarketMoney(marketGoodsFromInr(amountInr, market.countryCode), market.currency);
}

/**
 * A country's name as it reads inside a sentence. English wants an article in
 * front of a handful of them — "delivered to United States" is what a machine
 * writes, and this copy is what Google prints under the result.
 */
export function countryPhrase(countryCode: string): string {
  const name = countryName(marketFor(countryCode).countryCode);
  return /^(United |Netherlands|Philippines|Maldives|Bahamas|Czech |Gambia|Democratic |Central African|Cayman|Falkland|Faroe|Solomon|Seychelles|Comoros|Marshall|Cocos|Turks|British |U\.S\.)/.test(name)
    ? `the ${name}`
    : name;
}

/**
 * The delivery half of a meta description. India is quoted free delivery;
 * every other market's displayed price already carries international delivery,
 * and its duties do not, so neither claim may be silently swapped.
 */
export function deliveryPitch(countryCode: string): string {
  const market = marketFor(countryCode);
  if (market.countryCode === HOME_MARKET) return "Free India delivery and global shipping.";
  return `Delivered to ${countryPhrase(market.countryCode)} with international delivery included; duties and local taxes are excluded.`;
}

/**
 * Everything a priced page needs to serve one country, from its `?market=`
 * query: the code to render in, and the head links that tell Google which
 * country this URL is for.
 *
 * `landingCountryCode` is null for the home market so the page keeps its
 * ordinary client-side detection — a shopper in Mumbai on the clean URL is
 * still detected at the edge, and only a deliberate market URL is pinned.
 */
export function marketLanding(path: string, rawMarket: string | null | undefined) {
  const countryCode = searchMarketFor(rawMarket);
  return {
    countryCode,
    landingCountryCode: countryCode === HOME_MARKET ? null : countryCode,
    alternates: marketMetadataAlternates(path, countryCode),
  };
}

/**
 * Whether a `?market=` value should be honoured for SEO. An arbitrary country
 * in the query would mint an unbounded set of indexable URLs for every design,
 * so only the published markets get a variant; anything else falls back to the
 * home market and its clean canonical.
 */
export function searchMarketFor(value: string | null | undefined): string {
  const code = value?.trim().toUpperCase();
  return code && (SEARCH_MARKETS as readonly string[]).includes(code) ? code : HOME_MARKET;
}
