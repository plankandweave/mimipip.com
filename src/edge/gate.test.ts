import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CASE_STUDY_NOT_FOUND,
  GEO_COUNTRY_HEADER,
  GEO_REGION_HEADER,
  GEO_CITY_HEADER,
  WRAPS_ROBOTS,
  edgeGate,
  routeRequest,
  withHostHeaders,
} from "./gate";

function req(
  url: string,
  init: { host?: string; ua?: string; asn?: number; country?: string; lang?: string } = {},
): Request {
  const r = new Request(url, {
    headers: {
      host: init.host ?? new URL(url).host,
      "user-agent": init.ua ?? "Mozilla/5.0 (Macintosh) Chrome/140",
      ...(init.lang ? { "accept-language": init.lang } : {}),
    },
  });
  if (init.asn !== undefined || init.country !== undefined) {
    Object.defineProperty(r, "cf", { value: { asn: init.asn, country: init.country } });
  }
  return r;
}

const location = (g: ReturnType<typeof edgeGate>) =>
  g.kind === "respond" ? `${g.response.status} ${g.response.headers.get("location")}` : g.kind;

test("www goes to the apex, path and query intact", () => {
  assert.equal(
    location(edgeGate(req("https://www.zyvorah.com/products/ochre-drift?market=us"))),
    "308 https://zyvorah.com/products/ochre-drift?market=us",
  );
});

test("www.wraps goes to the wraps host, path and query intact", () => {
  assert.equal(
    location(edgeGate(req("https://www.wraps.zyvorah.com/fridge-wraps?format=B"))),
    "308 https://wraps.zyvorah.com/fridge-wraps?format=B",
  );
  assert.equal(location(edgeGate(req("https://www.wraps.zyvorah.com/"))), "308 https://wraps.zyvorah.com/");
});

test("the case-study host shows only the case studies", () => {
  const cs = "https://casestudy.zyvorah.com";
  assert.equal(location(edgeGate(req(`${cs}/`))), `307 ${cs}/projects`);
  assert.equal(edgeGate(req(`${cs}/projects`)).kind, "pass");
  assert.equal(edgeGate(req(`${cs}/projects/iilm`)).kind, "pass");
  assert.equal(edgeGate(req(`${cs}/api/traffic`)).kind, "pass");
  assert.equal(edgeGate(req(`${cs}/robots.txt`)).kind, "pass");
  assert.equal(edgeGate(req(`${cs}/projects/blue-tokai-k6gujret2jruq6lejrda5jmk`)).kind, "pass");
  assert.equal(edgeGate(req(`${cs}/private/blue-tokai-k6gujret2jruq6lejrda5jmk/pune-wall-study.svg`)).kind, "pass");
  const shop = edgeGate(req(`${cs}/products/ochre-drift`));
  assert.equal(shop.kind, "rewrite");
  assert.equal(shop.kind === "rewrite" && shop.url.pathname, CASE_STUDY_NOT_FOUND);
  assert.equal(shop.kind === "rewrite" && shop.url.host, "casestudy.zyvorah.com");
});

// 6 Oct 2026: wraps.zyvorah.com moved off Vercel onto this Worker. Its root is
// the range's hub; everything else on it is the same app, unchanged.
test("the wraps host opens on the hub and serves every other path unchanged", () => {
  const w = "https://wraps.zyvorah.com";
  const root = edgeGate(req(`${w}/`));
  assert.equal(root.kind, "rewrite");
  assert.equal(root.kind === "rewrite" && root.url.pathname, "/wraps");
  assert.equal(root.kind === "rewrite" && root.url.host, "wraps.zyvorah.com");
  // A campaign tag on the bare hostname survives the rewrite.
  const tagged = edgeGate(req(`${w}/?utm_source=ig`));
  assert.equal(tagged.kind === "rewrite" && `${tagged.url.pathname}${tagged.url.search}`, "/wraps?utm_source=ig");
  for (const path of ["/wraps", "/fridge-wraps", "/fridge-wraps/fit-finder", "/wraps/designs/fw-rose-garden", "/products/ochre-drift", "/cart"]) {
    assert.equal(edgeGate(req(`${w}${path}`)).kind, "pass", path);
  }
  // The hub is the wraps host's root only — never the storefront's.
  assert.equal(edgeGate(req("https://zyvorah.com/")).kind, "pass");
  // Refused crawlers are refused on the wraps host too, root included.
  const bot = edgeGate(req(`${w}/`, { ua: "Mozilla/5.0 (compatible; GPTBot/1.2)" }));
  assert.equal(bot.kind === "respond" && bot.response.status, 403);
});

test("the wraps host is noindexed on every response; the apex never is", async () => {
  const route = routeRequest(req("https://wraps.zyvorah.com/"));
  assert.equal(route.kind === "site" && new URL(route.request.url).pathname, "/wraps");
  assert.equal(route.kind === "site" && route.props.host, "wraps.zyvorah.com");

  const page = new Response("<html></html>", { headers: { "content-type": "text/html" } });
  const tagged = withHostHeaders(page, "wraps.zyvorah.com");
  assert.equal(tagged.headers.get("x-robots-tag"), WRAPS_ROBOTS);
  assert.equal(tagged.headers.get("content-type"), "text/html");
  assert.equal(await tagged.text(), "<html></html>");
  // A redirect keeps its status and location.
  const moved = withHostHeaders(Response.redirect("https://wraps.zyvorah.com/wraps", 307), "wraps.zyvorah.com");
  assert.equal(moved.status, 307);
  assert.equal(moved.headers.get("location"), "https://wraps.zyvorah.com/wraps");
  assert.equal(moved.headers.get("x-robots-tag"), WRAPS_ROBOTS);

  const apex = new Response("ok");
  assert.equal(withHostHeaders(apex, "zyvorah.com", "/"), apex);
  assert.equal(withHostHeaders(apex, "zyvorah.com", "/products/ochre-drift").headers.get("x-robots-tag"), null);
  // Not "/wrapsody" or "/fridge-wraps-guide": the range's own paths only.
  assert.equal(withHostHeaders(apex, "zyvorah.com", "/wrapsody").headers.get("x-robots-tag"), null);
  // The range's pages are reachable on the apex too, and noindexed there as well.
  for (const path of ["/wraps", "/wraps/designs/fw-rose-garden", "/fridge-wraps", "/fridge-wraps/fit-finder", "/ac-wraps", "/dryer-wraps"]) {
    assert.equal(withHostHeaders(new Response("ok"), "zyvorah.com", path).headers.get("x-robots-tag"), WRAPS_ROBOTS, path);
  }
});

test("the private Blue Tokai proposal and its files carry noindex headers", () => {
  const response = new Response("ok");
  for (const path of [
    "/projects/blue-tokai-k6gujret2jruq6lejrda5jmk",
    "/private/blue-tokai-k6gujret2jruq6lejrda5jmk/Blue-Tokai-Zyvorah-Private-Proposal.pdf",
  ]) {
    const tagged = withHostHeaders(response, "casestudy.zyvorah.com", path);
    assert.match(tagged.headers.get("x-robots-tag") ?? "", /noindex/);
  }
});

test("the Meta facet crawler is sent to the bare collection; everyone else is not", () => {
  const url = "https://zyvorah.com/collections/pastel-wallpaper?tag=blue&sort=new";
  const g = edgeGate(req(url, { asn: 32934 }));
  assert.equal(location(g), "307 https://zyvorah.com/collections/pastel-wallpaper");
  assert.equal(g.kind === "respond" && g.response.headers.get("x-zvy-edge"), "asn-redirect");
  assert.equal(edgeGate(req(url, { asn: 13335 })).kind, "pass");
  assert.equal(edgeGate(req(url)).kind, "pass");
});

// 3–4 Oct 2026: a scraper on Chinese residential proxies (a dozen China
// Mobile/Telecom/Unicom ASNs, plus exits abroad that still send zh-CN) walked
// the filter combinations no ASN list could name. See facet-crawler.ts.
test("the residential-proxy facet crawler is caught by country or by language", () => {
  const url = "https://zyvorah.com/collections/wall-art?tag=Geometric&tag=Play+School&tag=Powder+Bathroom";
  const cn = edgeGate(req(url, { asn: 9808, country: "CN", lang: "zh-CN,zh;q=0.9" }));
  assert.equal(location(cn), "307 https://zyvorah.com/collections/wall-art");
  assert.equal(cn.kind === "respond" && cn.response.headers.get("x-zvy-edge"), "country-redirect");
  const exit = edgeGate(req(url, { asn: 213790, country: "IQ", lang: "zh-CN,zh;q=0.9" }));
  assert.equal(location(exit), "307 https://zyvorah.com/collections/wall-art");
  assert.equal(exit.kind === "respond" && exit.response.headers.get("x-zvy-edge"), "lang-redirect");
  // An Indian shopper stacking three filters keeps them.
  assert.equal(edgeGate(req(url, { asn: 24560, country: "IN", lang: "en-IN,en;q=0.9" })).kind, "pass");
  // The bare collection is served to everyone, China included.
  assert.equal(edgeGate(req("https://zyvorah.com/collections/wall-art", { country: "CN", lang: "zh-CN" })).kind, "pass");
});

// 26–27 Oct 2026: residential proxies in the Americas, en-US, stacking six
// to twenty-five tags. No signal names them; the depth does.
test("a filter stack deeper than any listing offers is sent to the bare collection", () => {
  const deep = "https://zyvorah.com/collections/wall-art?tag=Art&tag=Dark&tag=Bold&tag=Calm&tag=Birds&tag=Bagh";
  const g = edgeGate(req(deep, { asn: 62874, country: "US", lang: "en-US,en;q=0.9" }));
  assert.equal(location(g), "307 https://zyvorah.com/collections/wall-art");
  assert.equal(g.kind === "respond" && g.response.headers.get("x-zvy-edge"), "depth-redirect");
  assert.equal(g.kind === "respond" && g.response.headers.get("x-zvy-edge-tags"), "6");
  // Four is what the grid offers, and a shopper keeps all four.
  const four = "https://zyvorah.com/collections/wall-art?tag=Art&tag=Dark&tag=Bold&tag=Calm";
  assert.equal(edgeGate(req(four, { asn: 62874, country: "US", lang: "en-US,en;q=0.9" })).kind, "pass");
});

test("refused crawlers get a 403 that no cache keeps", () => {
  const g = edgeGate(req("https://zyvorah.com/", { ua: "Mozilla/5.0 (compatible; GPTBot/1.2)" }));
  assert.equal(g.kind === "respond" && g.response.status, 403);
  assert.equal(g.kind === "respond" && g.response.headers.get("cache-control"), "no-store");
});

test("an ordinary visit to the apex passes straight to the app", () => {
  assert.equal(edgeGate(req("https://zyvorah.com/products/ochre-drift")).kind, "pass");
  assert.equal(edgeGate(req("https://zyvorah.com/")).kind, "pass");
});

// The Workers cache key does not include the hostname (30 Sep 2026: the
// case-study host was served zyvorah.com's cached storefront). The gateway puts
// the host in ctx.props, which IS in the key, on every call into Site.
test("every request handed to the cached Site carries its host in ctx.props", () => {
  for (const [url, host] of [
    ["https://zyvorah.com/", "zyvorah.com"],
    ["https://zyvorah.com/products/ochre-drift", "zyvorah.com"],
    ["https://casestudy.zyvorah.com/projects", "casestudy.zyvorah.com"],
    ["https://casestudy.zyvorah.com/products/ochre-drift", "casestudy.zyvorah.com"],
    ["https://wraps.zyvorah.com/", "wraps.zyvorah.com"],
    ["https://wraps.zyvorah.com/wraps", "wraps.zyvorah.com"],
  ] as const) {
    const route = routeRequest(req(url));
    assert.equal(route.kind, "site", url);
    assert.equal(route.kind === "site" && route.props.host, host, url);
  }
  const shop = routeRequest(req("https://casestudy.zyvorah.com/products/ochre-drift"));
  assert.equal(shop.kind === "site" && new URL(shop.request.url).pathname, CASE_STUDY_NOT_FOUND);
});

test("the country header is the gateway's own reading, never the client's", () => {
  const spoofed = new Request("https://zyvorah.com/api/market", { headers: { [GEO_COUNTRY_HEADER]: "US" } });
  const none = routeRequest(spoofed);
  assert.equal(none.kind === "site" && none.request.headers.get(GEO_COUNTRY_HEADER), null);

  const seen = new Request("https://zyvorah.com/api/market", { headers: { [GEO_COUNTRY_HEADER]: "US" } });
  Object.defineProperty(seen, "cf", { value: { country: "IN" } });
  const fromCf = routeRequest(seen);
  assert.equal(fromCf.kind === "site" && fromCf.request.headers.get(GEO_COUNTRY_HEADER), "IN");
});

test("region and city are the gateway's own reading too, encoded so any town survives a header", () => {
  const spoofed = new Request("https://zyvorah.com/api/traffic", { headers: { [GEO_CITY_HEADER]: "Paris", [GEO_REGION_HEADER]: "IDF" } });
  const none = routeRequest(spoofed);
  assert.equal(none.kind === "site" && none.request.headers.get(GEO_CITY_HEADER), null);
  assert.equal(none.kind === "site" && none.request.headers.get(GEO_REGION_HEADER), null);

  const seen = new Request("https://zyvorah.com/api/traffic");
  Object.defineProperty(seen, "cf", { value: { country: "BR", region: "São Paulo", city: "São Paulo" } });
  const fromCf = routeRequest(seen);
  assert.equal(fromCf.kind === "site" && decodeURIComponent(fromCf.request.headers.get(GEO_CITY_HEADER) ?? ""), "São Paulo");
  assert.equal(fromCf.kind === "site" && decodeURIComponent(fromCf.request.headers.get(GEO_REGION_HEADER) ?? ""), "São Paulo");
});

// 7 Oct 2026: zyvorah.com/us is the US dollar store, wherever the visitor is.
test("/us opens the US-dollar store and names the United States in the cookie", () => {
  const cases: [string, string][] = [
    ["https://zyvorah.com/us", "307 https://zyvorah.com/?market=US"],
    ["https://zyvorah.com/US/", "307 https://zyvorah.com/?market=US"],
    ["https://zyvorah.com/usa", "307 https://zyvorah.com/?market=US"],
    ["https://zyvorah.com/us/products/ochre-drift", "307 https://zyvorah.com/products/ochre-drift?market=US"],
    ["https://zyvorah.com/us/collections/bedroom?colour=blue", "307 https://zyvorah.com/collections/bedroom?colour=blue&market=US"],
    ["https://zyvorah.com/us?market=AE", "307 https://zyvorah.com/?market=US"],
  ];
  for (const [from, to] of cases) {
    const g = edgeGate(req(from, { country: "IN" }));
    assert.equal(location(g), to, from);
    const cookie = g.kind === "respond" ? g.response.headers.get("set-cookie") : null;
    assert.match(cookie ?? "", /^zyv_country=US; Path=\/; Max-Age=31536000;/, from);
    assert.equal(g.kind === "respond" && g.response.headers.get("cache-control"), "no-store");
  }
  // Not a prefix match on unrelated paths, and not on the wraps host.
  for (const other of ["https://zyvorah.com/user", "https://zyvorah.com/usage", "https://zyvorah.com/sustainability"]) {
    assert.equal(edgeGate(req(other)).kind, "pass", other);
  }
  assert.equal(edgeGate(req("https://wraps.zyvorah.com/us")).kind, "pass");
});

 test("Trace bearer pages and APIs exclude third-party scripts, referrers and caching", () => {
  for (const path of ["/trace/private-token", "/api/trace/private-token/media", "/walk/private-token", "/api/walk/private-token/media"]) {
    const response = withHostHeaders(new Response("private"), "zyvorah.com", path);
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.match(response.headers.get("content-security-policy") ?? "", /connect-src 'self';/);
    assert.match(response.headers.get("content-security-policy") ?? "", /script-src 'self' 'unsafe-inline';/);
    assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/);
  }
  assert.equal(withHostHeaders(new Response(), "zyvorah.com", "/traceable").headers.get("content-security-policy"), null);
  assert.equal(withHostHeaders(new Response(), "zyvorah.com", "/walkthrough-wallpaper").headers.get("content-security-policy"), null);
});

// 29 Oct 2026: lorangekids.com is the L'Orange Kids door. Its root is the
// brand's shop on the brand's address; a product, the cart or checkout goes to
// zyvorah.com, where sign-in and Razorpay live.
test("lorangekids.com opens the L'Orange shop and sends shopping to zyvorah.com", () => {
  const root = edgeGate(req("https://lorangekids.com/?utm_source=ig"));
  assert.equal(root.kind === "rewrite" && `${root.url.host}${root.url.pathname}${root.url.search}`, "lorangekids.com/lorange-kids?utm_source=ig");
  assert.equal(edgeGate(req("https://lorangekids.com/lorange-kids/logo.png")).kind, "pass");
  assert.equal(location(edgeGate(req("https://lorangekids.com/products/jungle?x=1"))), "307 https://zyvorah.com/products/jungle?x=1");
  assert.equal(location(edgeGate(req("https://lorangekids.com/cart"))), "307 https://zyvorah.com/cart");
  assert.equal(location(edgeGate(req("https://www.lorangekids.com/"))), "308 https://lorangekids.com/");
  // zyvorah.com's own root is never the L'Orange shop.
  assert.equal(edgeGate(req("https://zyvorah.com/")).kind, "pass");
});
