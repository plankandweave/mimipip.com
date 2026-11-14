"use client";

import { useRef, createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { MARKET_PENDING_CLASS } from "@/lib/market-pending";
import {
  MARKET_COUNTRY_COOKIE,
  normalizeCountryCode,
  countryOptions,
  formatMarketMoney,
  marketFor,
  marketGoodsFromInr,
  quoteMarketOrder,
  type Market,
  type MarketQuote,
} from "@/lib/markets";

type MarketContextValue = {
  market: Market;
  ready: boolean;
  setCountry: (code: string) => Promise<void>;
  money: (amountInr: number) => string;
  quote: (amountInr: number, areaSqFt?: number, tubeCount?: number) => MarketQuote;
};

const MarketContext = createContext<MarketContextValue | null>(null);

/**
 * The market the edge already worked out for this visitor, read straight off
 * the cookie the proxy set on this page's own response (src/proxy.ts). No
 * network, so it is known before the browser paints.
 */
function cookieCountry(): string | null {
  if (typeof document === "undefined") return null;
  const raw = document.cookie.match(new RegExp(`(?:^|;\\s*)${MARKET_COUNTRY_COOKIE}=([^;]*)`))?.[1];
  if (!raw) return null;
  try {
    return normalizeCountryCode(decodeURIComponent(raw));
  } catch {
    return normalizeCountryCode(raw);
  }
}

/**
 * Before paint in the browser, a no-op on the server. The cookie read has to
 * land in the same frame as hydration — in a plain effect the browser paints
 * the server's home-market rupees first, which is the flip this exists to
 * stop — and useLayoutEffect on the server only logs a warning.
 */
const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function MarketProvider({
  children,
  initialCountryCode,
}: {
  children: React.ReactNode;
  /** Stable market for country-specific shopping landing URLs. */
  initialCountryCode?: string | null;
}) {
  const initialCode = initialCountryCode ? marketFor(initialCountryCode).countryCode : null;
  const [market, setMarket] = useState<Market>(() => marketFor(initialCode ?? "IN"));
  const [ready, setReady] = useState(Boolean(initialCode));
  // Set once the visitor names a country themselves. The first-visit lookup
  // below can answer AFTER that (6 October 2026: a shopper picked India from
  // the header, the slow /api/market answer landed a moment later and put
  // the page back in dollars), and a named country is never overwritten.
  const named = useRef(false);

  // The edge already knows where this visitor is. Apply it before the browser
  // paints, so the first thing on screen is their currency rather than rupees
  // corrected a moment later. The server rendered the home market (it must:
  // the HTML is cached and shared), so this deliberately runs after hydration
  // rather than seeding useState, which would be a hydration mismatch.
  useBeforePaint(() => {
    if (initialCode) return;
    // A feed landing URL also sets the outer header's market, not only the
    // product's nested provider. Ignore unsupported query values.
    const requested = new URLSearchParams(window.location.search).get("market");
    const landing = requested === "IN" || requested === "US" ? requested : null;
    const detected = landing ?? cookieCountry();
    if (!detected) return;
    if (landing) document.cookie = MARKET_COUNTRY_COOKIE + "=" + landing + "; Path=/; SameSite=Lax; Max-Age=31536000";
    setMarket((current) => (current.countryCode === detected ? current : marketFor(detected)));
    setReady(true);
  }, [initialCode]);

  useEffect(() => {
    // The Worker names the country in a cookie; with none, the page shows the home market.
    if(process.env.NEXT_PUBLIC_MIMIPIP_LOCAL_REVIEW==="1"){if(initialCode)document.cookie=MARKET_COUNTRY_COOKIE+"="+encodeURIComponent(initialCode)+"; Path=/; SameSite=Lax; Max-Age=31536000";setReady(true);return;}
    if (initialCode) {
      // Carry the landing market into cart and checkout navigation.
      void fetch("/api/market", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countryCode: initialCode }),
      }).catch(() => undefined);
      return;
    }
    // The cookie path above already settled it — a layout effect runs before
    // this one, so the market and `ready` are both set by now. Only a visitor
    // without a cookie (blocked, or an edge that could not read a country)
    // still pays for the round trip.
    if (cookieCountry()) return;
    let live = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    void fetch("/api/market", { cache: "no-store", signal: controller.signal })
      .then((r) => r.json())
      .then((data: { countryCode?: string }) => {
        if (live && data.countryCode && !named.current) setMarket(marketFor(data.countryCode));
      })
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(timeout);
        if (live) setReady(true);
      });
    return () => {
      live = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [initialCode]);

  const setCountry = useCallback(async (code: string) => {
    const next = marketFor(code);
    named.current = true;
    setMarket(next);
    setReady(true);
    if(process.env.NEXT_PUBLIC_MIMIPIP_LOCAL_REVIEW==="1"){
      document.cookie=MARKET_COUNTRY_COOKIE+"="+encodeURIComponent(next.countryCode)+"; Path=/; SameSite=Lax; Max-Age=31536000";
      return;
    }
    try {
      await fetch("/api/market", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countryCode: next.countryCode }),
      });
    } catch {
      // The visible selection still works for this page even if cookies are blocked.
    }
  }, []);

  // The market is known: show the prices MARKET_PENDING_SCRIPT hid.
  useEffect(() => {
    if (ready) document.documentElement.classList.remove(MARKET_PENDING_CLASS);
  }, [ready]);

  const value = useMemo<MarketContextValue>(
    () => ({
      market,
      ready,
      setCountry,
      money: (amountInr) => formatMarketMoney(marketGoodsFromInr(amountInr, market.countryCode), market.currency),
      quote: (amountInr, areaSqFt = 0, tubeCount = 1) =>
        quoteMarketOrder({ amountInr, countryCode: market.countryCode, areaSqFt, tubeCount }),
    }),
    [market, ready, setCountry],
  );

  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>;
}

export function useMarket(): MarketContextValue {
  const value = useContext(MarketContext);
  if (!value) throw new Error("useMarket must be used within MarketProvider");
  return value;
}

/** The delivery country controls the quoted market and checkout address. */
export function ShipToCountry({ className = "" }: { className?: string }) {
  const { market, setCountry } = useMarket();
  return (
    <label className={`inline-flex items-center gap-1 ${className}`}>
      <span className="text-[0.68rem] font-medium text-charcoal/80">Delivering to</span>
      <select
        aria-label="Shipping country"
        value={market.countryCode}
        onChange={(event) => void setCountry(event.target.value)}
        className="max-w-[8rem] cursor-pointer appearance-none bg-transparent pr-2 text-[0.68rem] font-semibold text-charcoal/80 outline-none"
      >
        {countryOptions().map((option) => (
          <option key={option.code} value={option.code}>
            {option.name}
          </option>
        ))}
      </select>
      <span aria-hidden className="-ml-2 text-[0.6rem] text-charcoal/60">⌄</span>
    </label>
  );
}
