import { MARKET_COUNTRY_COOKIE } from "./markets";

export const MARKET_PENDING_CLASS = "mkt-pending";

/**
 * Runs in <head>, before the body paints. A visitor with no country cookie yet
 * (a first visit — the page is shared and cached, so it cannot carry one) has
 * their prices hidden until MarketProvider learns the market from /api/market,
 * instead of seeing rupees that flip to their currency a moment later. Every
 * visitor with a cookie is untouched. A hydration failure must not hide prices
 * forever: after eight seconds, show the rendered home-market fallback.
 */
export const MARKET_PENDING_SCRIPT = `try{if(!/(?:^|;\\s*)${MARKET_COUNTRY_COOKIE}=/.test(document.cookie)){document.documentElement.classList.add("${MARKET_PENDING_CLASS}");setTimeout(function(){document.documentElement.classList.remove("${MARKET_PENDING_CLASS}")},8000)}}catch(e){}`;
