import type { ReactNode } from "react";
import { MarketProvider } from "@/components/MarketProvider";

/**
 * Render a page inside a fixed market, or leave it on ordinary detection.
 *
 * A `?market=XX` URL is that country's version of the page: it must come out
 * of the server already priced in that currency, because it is the copy
 * Google indexes and the one a shopper follows from a search result. The clean
 * URL passes null and keeps the edge detection every other visitor gets
 * (src/proxy.ts), so India is never pinned by a wrapper it does not need.
 *
 * One helper rather than a ternary per page, so a new priced page cannot
 * half-adopt the pattern — see src/lib/market-seo.ts for the URL side.
 */
export function inMarket(countryCode: string | null, page: ReactNode): ReactNode {
  return countryCode ? <MarketProvider initialCountryCode={countryCode}>{page}</MarketProvider> : page;
}
