// The Worker's front door: the host and crawler rules every request needs,
// decided BEFORE vinext sees the request.
//
// These used to live in src/proxy.ts. They cannot any more: vinext refuses to
// cache any path the proxy matcher covers ("middleware matched this request" →
// no-store), so the matcher now covers only the private and API paths, and the
// public catalogue — the pages the Cloudflare edge must hold — never reaches the
// proxy. Rules that must apply to EVERY path therefore run here, in the gateway
// (src/edge/worker.ts), in code and deployed from GitHub rather than as
// dashboard rules nobody can review.
//
// The gateway is the Worker's default entrypoint and is NEVER cached: it runs
// on every request, cache hits included, and only then calls the cached `Site`
// entrypoint. That order is the whole point. The Workers cache key is the path,
// the entrypoint, ctx.props and the Worker version — NOT the hostname — so when
// the cache sat in front of these rules (30 Sep 2026, #611),
// casestudy.zyvorah.com/ was answered with zyvorah.com's cached storefront
// before any rule could run. Now no request reaches the cache without passing
// through here first, and the host rides in ctx.props, which IS in the key.
import { canonicalApexUrl } from "@/lib/host-canonical";
import { facetCrawlerRedirect } from "@/lib/facet-crawler";
import { isRefusedCrawler } from "@/lib/ua";
import { WRAPS_HOST, isWrapsPath } from "@/lib/wraps-paths";
import { LORANGE_HOST, LORANGE_PATH, lorangeHostServes } from "@/lib/lorange-kids";
import { APEX_HOST } from "@/lib/host-canonical";
import { MARKET_COUNTRY_COOKIE } from "@/lib/markets";

// Kept in step with BrandHomeLink and StorefrontOnly, which on this host strip
// the shop chrome to just the wordmark and point it at /projects.
export const CASE_STUDY_HOST = "casestudy.mimi-pip.invalid";

// The known-missing project the case-study host renders its 404 through: the
// project route calls notFound(), so the visitor keeps the URL they asked for
// and gets a real 404 with the same designed page as the apex.
export const CASE_STUDY_NOT_FOUND = "/projects/__zyvorah-not-found__";

// wraps.zyvorah.com is the appliance-wraps range, served by this same Worker
// since 6 Oct 2026 (it was the last hostname on Vercel, on the retired
// `fridge-wraps` branch). Its root opens the range's hub; every other path —
// /fridge-wraps/*, /wraps/designs/*, the store's own pages — is served
// unchanged, exactly as the old next.config.ts rewrite did. The line is not
// launched, so every response on the host says noindex (hostResponseHeaders).
export { WRAPS_HOST };
export const WRAPS_ROOT = "/wraps";
export const WRAPS_ROBOTS = "noindex, nofollow";

const NO_STORE = { "cache-control": "no-store" };

export type GateResult =
  | { kind: "respond"; response: Response }
  | { kind: "rewrite"; url: URL }
  | { kind: "pass" };

function redirect(to: URL | string, status: 307 | 308, extra?: Record<string, string>): GateResult {
  return {
    kind: "respond",
    response: new Response(null, { status, headers: { location: String(to), ...NO_STORE, ...extra } }),
  };
}

export function edgeGate(request: Request): GateResult {
  const url = new URL(request.url);
  // The Host header, not the parsed URL: behind Cloudflare the URL's host is
  // not reliably the one the visitor typed.
  const host = request.headers.get("host")?.split(":")[0].toLowerCase() ?? url.hostname;

  // Search Console found the same catalogue under both the apex and www
  // hostnames. Make the choice unambiguous; path and query kept exactly.
  const canonical = canonicalApexUrl(request.url, host);
  if (canonical) return redirect(canonical, 308);

  // casestudy.zyvorah.com exists ONLY to show the case studies. Its root opens
  // them; /projects and the same-origin API routes they call stay; every other
  // path is not a Zyvorah URL on this host and is a 404, never the storefront.
  if (host === CASE_STUDY_HOST) {
    const path = url.pathname;
    if (path === "/") return redirect(new URL("/projects", url), 307);
    const existsOnOutreach = path === "/projects" || path.startsWith("/projects/") || path.startsWith("/api/") || path === "/robots.txt" || path.startsWith("/private/blue-tokai-");
    if (!existsOnOutreach) return { kind: "rewrite", url: new URL(CASE_STUDY_NOT_FOUND, url) };
  }

  // Crawlers on Meta's network, on Chinese residential proxies, and stacking
  // more tags than a listing offers walk every filter combination, ignoring
  // robots.txt; each one renders uncached. Send them to the bare collection,
  // which the edge holds. See facet-crawler.ts. The tag count rides in the
  // header so a tail shows how deep the walk was.
  const cf = (request as unknown as { cf?: { asn?: unknown; country?: unknown } }).cf;
  const facet = facetCrawlerRedirect(url, {
    asn: cf?.asn,
    country: cf?.country,
    acceptLanguage: request.headers.get("accept-language"),
  });
  if (facet) return redirect(facet.to, 307, {
    "x-zvy-edge": `${facet.reason}-redirect`,
    "x-zvy-edge-tags": String(url.searchParams.getAll("tag").length),
  });

  // robots.txt is the sign; this is the door — for crawlers that identify
  // themselves honestly. Enforced on every request, cached pages included:
  // the gateway runs before the cache.
  if (isRefusedCrawler(request.headers.get("user-agent"))) {
    return {
      kind: "respond",
      response: new Response("Not available to automated clients.", {
        status: 403,
        headers: { "content-type": "text/plain", ...NO_STORE },
      }),
    };
  }

  // zyvorah.com/us is the American shop: dollars on every page, for as long
  // as the visitor shops, wherever they are connecting from (Roheena, 7 October
  // 2026). It sends them to the US variant of the page they asked for —
  // `/us` to `/?market=US`, `/us/products/x` to `/products/x?market=US`, the
  // one URL per market that hreflang already publishes (src/lib/market-seo.ts)
  // — and names the United States in the country cookie, so every page after
  // it, cart and checkout included, stays in dollars (MarketProvider reads the
  // cookie before paint; /api/market never overwrites a named country). Not
  // a second copy of the store under /us: that would put every design in the
  // index twice. Answered here and never cached, so the cookie is set on
  // every visit, a cache hit included.
  if (host !== WRAPS_HOST) {
    const us = usStoreRedirect(url);
    if (us) {
      return redirect(us, 307, {
        "set-cookie": `${MARKET_COUNTRY_COOKIE}=US; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax; Secure`,
      });
    }
  }

  // wraps.zyvorah.com: the root is the range's hub. A REWRITE, not a redirect,
  // so the visitor keeps the bare hostname they were given. Host-scoped here
  // and not in next.config.ts, for the reason the case-study rule above is:
  // vinext ignores a redirect/rewrite's `has: host` condition, so a config
  // rule would either match nothing or put the hub on zyvorah.com's root.
  // Last, so refused crawlers are refused here as on every other host.
  if (host === WRAPS_HOST && url.pathname === "/") {
    return { kind: "rewrite", url: new URL(`${WRAPS_ROOT}${url.search}`, url) };
  }

  // lorangekids.com is the L'Orange Kids door (Roheena, 29 October 2026): its
  // root is the brand's shop, kept on the brand's address by a rewrite, for
  // the reason the wraps rule above is a rewrite. A page it does not serve
  // itself (lorangeHostServes) — a product, the cart, checkout — goes to the
  // same path on zyvorah.com, where checkout and sign-in live.
  if (host === LORANGE_HOST) {
    if (url.pathname === "/") return { kind: "rewrite", url: new URL(`${LORANGE_PATH}${url.search}`, url) };
    if (!lorangeHostServes(url.pathname)) {
      const to = new URL(`${url.pathname}${url.search}`, `https://${APEX_HOST}`);
      return redirect(to, 307);
    }
  }

  return { kind: "pass" };
}

/** `/us`, `/usa` or `/us/<path>` (any case) → `/<path>?market=US`, query kept; otherwise null. */
export function usStoreRedirect(url: URL): URL | null {
  const m = /^\/usa?(\/.*)?$/i.exec(url.pathname);
  if (!m) return null;
  const to = new URL(url);
  to.pathname = m[1] && m[1] !== "/" ? m[1] : "/";
  to.searchParams.set("market", "US");
  return to;
}

// ---- Handing the request to the cached Site entrypoint ----------------------

/**
 * The visitor's country, as the gateway saw it on request.cf. Always written by
 * the gateway, never passed through: whatever a client sends in this header is
 * replaced (or removed), so it cannot be spoofed. geoCountry() reads it when the
 * loopback call to Site does not carry request.cf.
 */
export const GEO_COUNTRY_HEADER = "x-zyv-geo-country";

/**
 * The visitor's region and city, as the gateway saw them on request.cf —
 * same rule as the country: always written here, never passed through. They
 * say which towns a creator's audience comes from (the collaboration desk,
 * /api/traffic); they are approximate by nature and never an address.
 * URI-encoded, because a header value must be Latin-1 and a city need not be
 * ("São Paulo", "Düsseldorf"). Read them back with geoFromHeaders().
 */
export const GEO_REGION_HEADER = "x-zyv-geo-region";
export const GEO_CITY_HEADER = "x-zyv-geo-city";

/** What the cached entrypoint is told. EVERY field is part of the cache key. */
export type SiteProps = { host: string };

export type SiteCall = { request: Request; props: SiteProps };

/**
 * Decide what the gateway does with a request: answer it here, or hand it to
 * Site with the props that partition the cache. The host is always in props,
 * so two hostnames can never share a cached response, whatever the rules above
 * come to say.
 */
export function routeRequest(request: Request): { kind: "respond"; response: Response } | ({ kind: "site" } & SiteCall) {
  const gate = edgeGate(request);
  if (gate.kind === "respond") return gate;
  const target = gate.kind === "rewrite" ? new Request(gate.url, request) : request;
  const host = requestHost(request);

  const headers = new Headers(target.headers);
  const cf = (request as unknown as { cf?: { country?: unknown; region?: unknown; city?: unknown } }).cf;
  const country = cf?.country;
  if (typeof country === "string" && country) headers.set(GEO_COUNTRY_HEADER, country);
  else headers.delete(GEO_COUNTRY_HEADER);
  for (const [name, value] of [[GEO_REGION_HEADER, cf?.region], [GEO_CITY_HEADER, cf?.city]] as const) {
    if (typeof value === "string" && value) headers.set(name, encodeURIComponent(value.slice(0, 80)));
    else headers.delete(name);
  }

  return { kind: "site", request: new Request(target, { headers }), props: { host } };
}

// ---- Headers the gateway adds on the way out --------------------------------

/**
 * Response headers a request always carries, whatever answered — the cached
 * Site, a gate redirect or a refusal. Applied in the gateway AFTER Site, so a
 * cache hit gets them too.
 */
export function hostResponseHeaders(host: string, pathname = "/"): Record<string, string> {
  if (/^\/(?:api\/)?(?:trace|walk)(?:\/|$)/.test(pathname)) {
    return {
      "cache-control": "private, no-store",
      "referrer-policy": "no-referrer",
      "x-robots-tag": "noindex, nofollow, noarchive, noimageindex",
      // Bearer URLs must never reach the storefront's third-party pixels.
      "content-security-policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    };
  }
  if (pathname.startsWith("/projects/blue-tokai-") || pathname.startsWith("/private/blue-tokai-")) {
    return { "x-robots-tag": "noindex, nofollow, noarchive, noimageindex" };
  }
  // Not launched: keep the whole wraps host out of every index, its robots.txt
  // and sitemap included (both are the store's, served unchanged) — and the
  // range's own pages (src/lib/wraps-paths.ts) out of it on every other host,
  // since the same Worker serves them on the apex too, unlinked from the shop.
  if (host === WRAPS_HOST || isWrapsPath(pathname)) return { "x-robots-tag": WRAPS_ROBOTS };
  return {};
}

/** The request's hostname, as the gateway reads it everywhere. */
export function requestHost(request: Request): string {
  return (request.headers.get("host")?.split(":")[0] ?? new URL(request.url).hostname).toLowerCase();
}

/** `response` with the request's host-wide headers set; the same object when there are none. */
export function withHostHeaders(response: Response, host: string, pathname = "/"): Response {
  const extra = Object.entries(hostResponseHeaders(host, pathname));
  if (!extra.length) return response;
  // A fetched Response's headers are immutable; re-wrap rather than mutate.
  const out = new Response(response.body, response);
  for (const [k, v] of extra) out.headers.set(k, v);
  return out;
}
