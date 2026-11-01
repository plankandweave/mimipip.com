"use client";

import { useMarket } from "@/components/MarketProvider";
import { formatMarketMoney } from "@/lib/markets";
import type { CardMoney } from "@/lib/card-copy";

/**
 * The money formatters a product card needs, in the visitor's market.
 *
 * Both card components take this from one place: they used to price
 * separately, and the collection card's copy of the logic was still in rupees
 * long after the product card's was not.
 */
export function useCardMoney(): CardMoney {
  const { market, money, quote } = useMarket();
  return {
    money,
    fixedFrom: (amountInr: number) =>
      `${formatMarketMoney(quote(amountInr).total, market.currency)}${
        market.currency === "USD" ? " incl. delivery" : ""
      }`,
  };
}
