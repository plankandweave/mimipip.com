"use client";

import { bookColophon } from "@/lib/taash-book";
import { useMarket } from "@/components/MarketProvider";

/**
 * The colophon, in the market of whoever is reading it. A client component
 * because the page around it is served from cache and cannot know the country;
 * see src/proxy.ts for how the market is settled before first paint.
 */
export function BookColophon() {
  const { market } = useMarket();
  return <p className="colophon">{bookColophon(market.countryCode)}</p>;
}
