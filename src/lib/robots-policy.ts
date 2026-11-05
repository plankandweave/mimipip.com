import type { MetadataRoute } from "next";
const SITE_URL = "https://mimipip.com";

// Served at /robots.txt (HTTP 200, text/plain). Public pages crawlable;
// transactional/account/internal routes blocked; sitemap advertised.

// Routes no crawler should index — transactional, account-scoped, internal or
// tokenised. Shared by EVERY rule group below: a bot we name explicitly gets
// its own group, and a group replaces the "*" group rather than adding to it,
// so any group that forgot this list would quietly hand that bot the checkout
// and the admin console.
const PRIVATE_PATHS = [
  "/choose-floor/",
  "/payment-setup",
  "/cart",
  "/checkout",
  "/wishlist",
  "/boards",
  "/account",
  "/admin",
  "/studio",
  "/decide", // internal ops decision links, tokenised and private
  "/projects/blue-tokai-", // unlisted founder proposals
  "/private/blue-tokai-", // proposal images and PDFs
  "/order/", // customer order-status links, tokenised and private
  // Partner portals. Every page behind the sign-in already redirects, and the
  // sign-in itself is noindex — but the page still names the partner and shows
  // their logo, and which companies buy from us is theirs to disclose, not a
  // crawler's to publish.
  "/partners/",
  "/api/",
  "/search", // internal search results — not canonical content
];

// Filters multiply into millions of duplicate URLs. Keep the curated category
// URLs and unfiltered ?page= pagination crawlable, plus all product variant
// landing URLs used by Merchant Center. Only collection filter/sort URLs stop.
const FILTER_PATHS = ["tag", "sort", "signature", "new", "child"].map(
  (parameter) => `/collections/*?*${parameter}=`,
);

// Public machine-readable resources. /api/ stays private by default below,
// but the agent catalogue and its read-only search/product routes were built
// specifically for discovery. Robots uses the longest matching rule, so this
// narrower Allow wins without opening checkout, account or internal APIs.
const PUBLIC_MACHINE_PATHS = ["/api/brand/", "/api/agent"];

// Search crawlers and user-directed fetchers. Google-Extended is a coupled
// Gemini grounding/training permission; the other training agents stay blocked.
// ChatGPT
// search, Perplexity and Claude's search reach the site through these, and
// they are NOT the training crawlers of the same brands (GPTBot, ClaudeBot,
// Applebot-Extended…), which stay blocked below. Naming them explicitly is
// the point: the deny list underneath is long and grows, and a brand-name
// match added carelessly ("Claude", "OpenAI") would cut off the answer
// engines we actually want quoting us. An explicit group cannot be caught by
// a later edit to the "*" group.
const ANSWER_ENGINE_AGENTS = [
  "OAI-SearchBot",   // ChatGPT search index
  "ChatGPT-User",    // ChatGPT fetching a page on a user's behalf
  "PerplexityBot",   // Perplexity index
  "Perplexity-User", // Perplexity fetching a page on a user's behalf
  "Claude-SearchBot",
  "Claude-User",
  "Google-Extended", // Gemini grounding and future model training share this permission.
  "Googlebot",
  "Googlebot-Image",
  "bingbot",         // Bing's index, which several assistants still read
  "Applebot",        // Siri + Spotlight. Applebot-Extended (training) is blocked below.
  "DuckDuckBot",
];

export const CONTENT_SIGNAL = "search=yes,ai-input=yes,ai-train=no,use=reference";

export function robotsPolicy(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", ...PUBLIC_MACHINE_PATHS],
        disallow: [...PRIVATE_PATHS, ...FILTER_PATHS],
      },

      // ── Invited in, on the same terms ──────────────────────────────────
      {
        userAgent: ANSWER_ENGINE_AGENTS,
        allow: ["/", ...PUBLIC_MACHINE_PATHS],
        disallow: [...PRIVATE_PATHS, ...FILTER_PATHS],
      },

      // ── Turned away ────────────────────────────────────────────────────
      // The catalogue is 3,951 product images and the designs ARE the
      // product. These crawlers take them to train image models or to resell
      // competitive intelligence, and send back nothing. Search engines that
      // bring buyers are deliberately NOT in this list.
      //
      // robots.txt is a request, not a barrier: Google and Bing honour it, a
      // scraper stealing designs ignores it. Real enforcement needs edge
      // blocking (Cloudflare bot management) — this is the polite half.
      {
        userAgent: [
          // AI training crawlers
          "GPTBot",              // OpenAI model training
          "ClaudeBot",           // Anthropic model training
          "anthropic-ai",
          "Claude-Web",
          "CCBot",               // Common Crawl — feeds most public AI datasets
          "Applebot-Extended",   // Apple Intelligence training. Applebot itself stays allowed.
          "Meta-ExternalAgent",
          "FacebookBot",
          "Bytespider",          // ByteDance — aggressive, ignores crawl-delay
          "Diffbot",
          "Omgilibot",
          "Timpibot",
          // Image-specific scrapers — the direct threat to a design catalogue
          "ImagesiftBot",
          "img2dataset",
          // SEO / competitive-intelligence tools: these exist so competitors
          // can study our catalogue, pricing and backlinks.
          "AhrefsBot",
          "SemrushBot",
          "MJ12bot",
          "DotBot",
          "DataForSeoBot",
          "BLEXBot",
        ],
        disallow: "/",
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}

/**
 * Next's MetadataRoute serializer intentionally supports only the established
 * robots directives. Serve the policy ourselves so the newer Content-Signal
 * directive can coexist with the same typed crawl rules. Repeat the signal for
 * every invited user-agent group because robots groups do not inherit from *.
 */
export function robotsText(): string {
  const policy = robotsPolicy();
  const rules = Array.isArray(policy.rules) ? policy.rules : [policy.rules];
  const lines: string[] = [];

  for (const rule of rules) {
    const agents = Array.isArray(rule.userAgent) ? rule.userAgent : [rule.userAgent];
    const allows = rule.allow == null ? [] : Array.isArray(rule.allow) ? rule.allow : [rule.allow];
    const disallows = rule.disallow == null ? [] : Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow];
    for (const agent of agents) lines.push(`User-Agent: ${agent}`);
    if (!(disallows.length === 1 && disallows[0] === "/")) {
      lines.push(`Content-Signal: ${CONTENT_SIGNAL}`);
    }
    for (const path of allows) lines.push(`Allow: ${path}`);
    for (const path of disallows) lines.push(`Disallow: ${path}`);
    lines.push("");
  }

  if (policy.sitemap) {
    const sitemaps = Array.isArray(policy.sitemap) ? policy.sitemap : [policy.sitemap];
    for (const sitemap of sitemaps) lines.push(`Sitemap: ${sitemap}`);
  }
  if (policy.host) lines.push(`Host: ${policy.host}`);
  return `${lines.join("\n")}\n`;
}
