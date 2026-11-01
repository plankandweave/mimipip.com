// Crawler classification from the user agent. Shared by proxy.ts and the two
// telemetry routes so they cannot drift apart.
//
// Why it exists (audit, Aug 2026): 15,247 of 15,498 `session` rows were
// source='direct' with exactly one session per unique token, landing on deep
// collection pages and never returning — a crawler fingerprint. Nothing recorded
// could tell a crawler from a person, because the user agent was never captured,
// and the traffic dashboard reported all of it as visitors.
//
// Most real crawlers identify themselves. Undeclared scrapers do not, which is
// why the `site_events_human` view also keeps a behavioural heuristic.

const BOT_UA =
  /(chatgpt-user|bot|crawler|spider|crawl|slurp|bingpreview|facebookexternalhit|ia_archiver|headless|phantomjs|puppeteer|playwright|curl\/|wget\/|python-requests|axios\/|go-http-client|java\/|okhttp|scrapy|semrush|ahrefs|mj12|dotbot|petalbot|yandex|baidu|gptbot|claudebot|ccbot|perplexity|bytespider|amazonbot|applebot|duckduckbot)/i;

const NAMED =
  /(oai-searchbot|chatgpt-user|googlebot|bingbot|gptbot|claudebot|ccbot|perplexity|bytespider|amazonbot|applebot|duckduckbot|semrushbot|ahrefsbot|petalbot|yandexbot|baiduspider|facebookexternalhit|headless|curl|wget|python-requests|scrapy|playwright|puppeteer)/i;

/** A missing user agent is treated as a crawler: no real browser omits it. */
export function isCrawler(ua: string | null | undefined): boolean {
  const s = ua ?? "";
  return s === "" || BOT_UA.test(s);
}

export function uaFamily(ua: string | null | undefined): string {
  const s = ua ?? "";
  if (!s) return "none";
  if (BOT_UA.test(s)) {
    const named = s.match(NAMED)?.[1];
    if (named) return named.toLowerCase();
    // An unnamed crawler collapsed to the useless label "bot" in the first
    // version of this, so 52 bot visits in three hours told us nothing about
    // WHO. Keep a trimmed slice of the raw agent string instead: enough to
    // identify it, short enough for the column, and it is a self-declared
    // public header rather than anything personal.
    return "bot:" + s.replace(/[^\x20-\x7e]/g, "").slice(0, 34);
  }
  if (/edg\//i.test(s)) return "edge";
  if (/chrome\//i.test(s) && !/chromium/i.test(s)) return "chrome";
  if (/safari\//i.test(s) && !/chrome\//i.test(s)) return "safari";
  if (/firefox\//i.test(s)) return "firefox";
  return "other";
}

// Crawlers we actively refuse at the door, mirroring the robots.txt block list.
// robots.txt asks; this one closes the door. Search engines that bring buyers
// (Googlebot, Bingbot, Applebot, OAI-SearchBot, Amazonbot) are NOT here.
const REFUSED =
  /(gptbot|claudebot|anthropic-ai|claude-web|ccbot|applebot-extended|meta-externalagent|facebookbot|bytespider|diffbot|omgili|timpibot|imagesift|img2dataset|ahrefsbot|semrushbot|mj12bot|dotbot|dataforseo|blexbot|petalbot|serpstat|zoominfo|barkrowler|seekport|linkfluence)/i;

/**
 * True for a crawler we refuse outright.
 *
 * Honest limit: this trusts what the visitor calls itself. An honest crawler
 * identifies itself and gets refused; a scraper that claims to be Chrome walks
 * straight through. Catching liars needs behavioural detection at the edge,
 * which no code inside the app can do.
 */
export function isRefusedCrawler(ua: string | null | undefined): boolean {
  return REFUSED.test(ua ?? "");
}

export const VISITOR_TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
