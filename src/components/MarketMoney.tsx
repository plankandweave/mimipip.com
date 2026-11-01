"use client";

import { formatMarketMoney, marketGoodsFromInr } from "@/lib/markets";
import { useMarket } from "@/components/MarketProvider";

export function MarketMoney({
  inr,
  includeDelivery = false,
  areaSqFt = 0,
  tubeCount = 1,
}: {
  inr: number;
  includeDelivery?: boolean;
  areaSqFt?: number;
  tubeCount?: number;
}) {
  const { market, quote } = useMarket();
  const amount = includeDelivery
    ? quote(inr, areaSqFt, tubeCount).total
    : marketGoodsFromInr(inr, market.countryCode);
  // data-mkt-price: hidden before first paint while a first-time visitor's
  // market is still unknown (see MARKET_PENDING_SCRIPT), so it never flips.
  return <span data-mkt-price>{formatMarketMoney(amount, market.currency)}</span>;
}

export function MarketPricingNote({
  india,
  international = "Delivery included in the configured total · duties, customs and destination taxes excluded",
}: {
  india: string;
  international?: string;
}) {
  const { market } = useMarket();
  return <>{market.countryCode === "IN" ? india : international}</>;
}
