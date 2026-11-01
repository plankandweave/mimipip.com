/**
 * Browser chunks must never be named after a tracker.
 *
 * The bundler names each JavaScript chunk after its source file, so
 * src/lib/meta-pixel.ts shipped as /_next/static/chunks/meta-pixel-<hash>.js,
 * src/lib/openai-pixel.ts as openai-pixel-<hash>.js and src/lib/ga.ts as
 * ga-<hash>.js. Ad and tracker blockers (Brave Shields, Safari content
 * blockers, uBlock Origin) block requests by URL, and those names are what
 * they look for. The sample button (OrderSample) imports all three, the
 * gallery imports the sample button, and the wall builder loads the gallery:
 * on 7 October 2026, with any one of the three blocked, the live product page
 * lost its wall builder, and with openai-pixel blocked it showed "Something
 * went wrong on our end". Every product page, for every shopper who blocks
 * trackers.
 *
 * The trackers themselves are third-party tags (gtag, fbevents, the OpenAI
 * SDK) and may be blocked; that is the shopper's choice and the site works
 * without them. What must never be blockable is OUR code, so a chunk whose
 * name reads like a tracker is written out as `m-<hash>.js` instead. The
 * rename happens at build time (vite.config.ts) and is pinned by
 * neutral-chunk-names.test.ts.
 */

/** Words a URL blocker matches on, as whole segments of a chunk name. */
const SEGMENT_WORDS = new Set([
  "ga", "gtag", "gtm", "ad", "ads", "adsense", "pixel", "meta", "fb", "facebook",
  "openai", "analytics", "track", "tracker", "tracking", "conversion", "conversions",
  "consent", "beacon", "telemetry", "doubleclick", "capi", "mp", "traffic", "visitor",
]);

/** Fragments blocked anywhere in a name, even inside a longer word. */
const ANYWHERE = /pixel|analytic|gtag|openai|facebook|doubleclick|adsense|tracking|telemetry/i;

/** True when a chunk's name could get it blocked by an ad or tracker blocker. */
export function isBlockableChunkName(name: string | undefined | null): boolean {
  if (!name) return false;
  if (ANYWHERE.test(name)) return true;
  // MetaPixel -> meta-pixel, AdsConsentToggle -> ads-consent-toggle
  const kebab = name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  return kebab.split(/[-_.\s/]+/).some((part) => SEGMENT_WORDS.has(part));
}

/**
 * Wrap a `[name]-[hash].js` file-name pattern so blockable chunks drop their
 * name. Any other pattern, or a pattern already given as a function, is
 * returned unchanged.
 */
export function neutralFileNames<T>(pattern: T): T | ((chunk: { name: string }) => string) {
  if (typeof pattern !== "string" || !pattern.includes("[name]")) return pattern;
  const neutral = pattern.replace("[name]", "m");
  return (chunk: { name: string }) => (isBlockableChunkName(chunk.name) ? neutral : pattern);
}
