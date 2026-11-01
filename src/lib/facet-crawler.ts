// Faceted collection URLs requested from networks that crawl, not shop.
//
// From 18:30 UTC on 27 Sep 2026 a crawler on Meta's network (AS32934, "Meta
// Platforms Ireland Limited", US egress) began walking every combination of
// collection filters — /collections/textures?tag=Art&tag=Dark&new=1 and
// thousands like it — around the clock, under ordinary Chrome and Safari
// user-agents. robots.txt already disallows exactly these URLs; it ignores
// that. Every combination is a new catalogue-cache key, so every one was a
// Supabase round trip: rpc/collection_page_v2 went from ~400 calls an hour to
// ~7,500, and REST traffic to 344k/day against 186k before the cache landed,
// on an org already over its free egress quota (grace ends 26 Oct 2026).
//
// The answer is a 307 to the bare collection, not a 403: Meta also reviews ad
// landing pages from this network, and those are bare collection and product
// URLs, which this never touches. The bare page is cached, so the crawler now
// costs a KV read instead of a database query.
//
// 3–4 Oct 2026: a second crawler, on Chinese residential proxies, did the same
// from 23:00 UTC — /collections/wall-art?tag=Geometric&tag=Play+School&tag=…,
// each URL's referer the same one with one tag fewer — and took
// collection_page_v2 from ~2,000 calls an hour to ~6,500. It came from a dozen
// China Mobile, Chinanet and Unicom ASNs and from exits in Brazil, Russia, Iraq
// and Tunisia, so no ASN list can name it. Two signals cover all of it: the
// country (Zyvorah does not sell to China) and the browser language its exits
// abroad still send (zh-CN). Shoppers in India, the US and the Gulf keep their
// filters, however many they stack.
//
// 26–27 Oct 2026: a third, from 19:00 UTC — residential proxies across ~40
// ASNs in the US, Brazil, Argentina and Chile, en-US, macOS Chrome, no
// referer — stacking six, seven, up to twenty-five tags on /collections/
// wall-art. collection_page_v2 went from ~150 calls an hour to ~3,800, and
// almost every answer was `[]`: that many ANDed tags matches no design. No
// network, country or language names it, so the rule is structural: a
// listing never offers more than MAX_FILTER_TAGS stacked tags (the grid stops
// linking a further one), and a URL carrying more than that is sent to the
// bare collection whoever asks. A shopper loses nothing — no click can make
// that URL, and a pasted link with that many tags was already an empty grid.
//
// Evidence-only lists: add an ASN or a country when a `wrangler tail` shows it
// doing the same. Not Google's 15169 — Googlebot shares it and honours
// robots.txt already.
export const REDIRECTED_ASNS: ReadonlySet<number> = new Set([32934]);
export const REDIRECTED_COUNTRIES: ReadonlySet<string> = new Set(["CN"]);

/** The most tags a listing lets a shopper stack (CollectionBrowser stops
 *  linking a further one here). More than this in a URL is a crawler. */
export const MAX_FILTER_TAGS = 4;

// Every query parameter the collection page reads to filter, sort or page.
const FACET_PARAMS = ["tag", "sort", "signature", "new", "child", "page"];

const COLLECTION_RE = /^\/collections\/[^/]+\/?$/;

export type FacetSignals = { asn?: unknown; country?: unknown; acceptLanguage?: string | null };

/** Which signal caught it — the gateway reports it in x-zvy-edge so a tail proves it. */
export type FacetReason = "asn" | "country" | "lang" | "depth";

function primaryLanguage(header: string | null | undefined): string {
  return (header ?? "").split(",")[0].split(";")[0].trim().toLowerCase();
}

function crawlingSignal(s: FacetSignals): FacetReason | null {
  if (typeof s.asn === "number" && REDIRECTED_ASNS.has(s.asn)) return "asn";
  if (typeof s.country === "string" && REDIRECTED_COUNTRIES.has(s.country.toUpperCase())) return "country";
  if (primaryLanguage(s.acceptLanguage).startsWith("zh")) return "lang";
  return null;
}

/** The bare collection URL to send a crawling visitor to, or null to serve normally. */
export function facetCrawlerRedirect(url: URL, signals: FacetSignals): { to: URL; reason: FacetReason } | null {
  if (!COLLECTION_RE.test(url.pathname)) return null;
  if (!FACET_PARAMS.some((p) => url.searchParams.has(p))) return null;
  const reason: FacetReason | null =
    url.searchParams.getAll("tag").length > MAX_FILTER_TAGS ? "depth" : crawlingSignal(signals);
  if (!reason) return null;
  const to = new URL(url);
  to.search = "";
  to.pathname = url.pathname.replace(/\/$/, "");
  return { to, reason };
}
