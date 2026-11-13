/**
 * The shop's public pages, kept whole at Cloudflare's edge.
 *
 * Why (13 Nov 2026): the homepage makes a dozen database reads to the shop's Supabase in Mumbai,
 * and the framework's own page cache lives in one isolate's memory, so nearly every request from
 * outside India rebuilt the page: 2 s when the Worker ran in Mumbai, 5-6 s when it ran in New York.
 *
 * What it is safe for: the HTML of a public page is the same for every shopper. The visitor's
 * country is set as a cookie AFTER this cache (worker/index.ts, withVisitorCountry) and the price
 * shown is chosen in the browser from that cookie (src/components/MarketProvider.tsx). So a page is
 * stored only when the request carries no session or cart cookie and the response sets no cookie,
 * and only for an address on the published list.
 *
 * Freshness: a stored page is served at once. Older than FRESH_SECONDS, it is served once more and
 * built again in the background; older than STALE_SECONDS it is never served. Each deploy is its
 * own key, so a page never points at the script and style files of an earlier release.
 */
export const FRESH_SECONDS = 600;
export const STALE_SECONDS = 86_400;
const STORED_AT = 'x-mimipip-edge-stored';
const ORIGINAL_CC = 'x-mimipip-edge-cc';

/** Query parameters that change nothing on the page: dropped from the key, so ad clicks share one copy. */
const TRACKING = /^(utm_[a-z]+|gclid|gbraid|wbraid|fbclid|msclkid|ttclid|igshid|mc_cid|mc_eid|ref|_ga|_gl)$/i;
/** Query parameters that do change a public page and are part of its key. Anything else is not cached. */
const KEYED = new Set(['market', 'value', 'colourway']);
/** Cookies that make a page someone's own. A request carrying one is never served or stored here. */
const PRIVATE_COOKIE = /(?:^|;\s*)(sb-[^=]*|__session|session|cart[^=]*|zyv_cart[^=]*|mimipip_[^=]*)=/i;
/** Framework headers that ask for something other than the full document. */
const NOT_A_DOCUMENT = ['rsc', 'next-router-state-tree', 'next-router-prefetch', 'next-router-segment-prefetch', 'next-action', 'x-vinext-rsc-render-mode'];

/** The cache key for this request, or null when the page must be built for this request alone. */
export function edgeCacheKey(request: Request, publicPaths: ReadonlySet<string>, version: string): string | null {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  const url = new URL(request.url);
  if (url.hostname !== 'mimipip.com') return null;
  const path = url.pathname.replace(/\/$/, '') || '/';
  if (!publicPaths.has(path)) return null;
  for (const h of NOT_A_DOCUMENT) if (request.headers.has(h)) return null;
  if (PRIVATE_COOKIE.test(request.headers.get('cookie') ?? '')) return null;
  if (request.headers.has('authorization')) return null;
  const kept: [string, string][] = [];
  for (const [k, v] of url.searchParams) {
    if (TRACKING.test(k)) continue;
    if (!KEYED.has(k)) return null;
    kept.push([k, v]);
  }
  kept.sort(([a, x], [b, y]) => (a === b ? x.localeCompare(y) : a.localeCompare(b)));
  const q = new URLSearchParams(kept).toString();
  return `https://mimipip.com/__edge/${encodeURIComponent(version || 'dev')}${url.pathname}${q ? '?' + q : ''}`;
}

/** Whether a built page may be stored for everyone. */
export function storable(response: Response): boolean {
  return response.status === 200
    && !!response.body
    && (response.headers.get('content-type') ?? '').includes('text/html')
    && !response.headers.has('set-cookie')
    && /\bindex\b/.test(response.headers.get('x-robots-tag') ?? '');
}

export type Age = 'fresh' | 'stale' | 'expired';
export function ageOf(storedAtMs: number, nowMs: number): Age {
  if (!Number.isFinite(storedAtMs)) return 'expired';
  const s = (nowMs - storedAtMs) / 1000;
  if (s < 0 || s > STALE_SECONDS) return 'expired';
  return s <= FRESH_SECONDS ? 'fresh' : 'stale';
}

/** The copy kept in the edge cache: the page as built, with the time it was built. */
export function forStore(response: Response, body: BodyInit, nowMs: number): Response {
  const headers = new Headers(response.headers);
  headers.set(ORIGINAL_CC, headers.get('cache-control') ?? '');
  headers.set('cache-control', `public, max-age=${STALE_SECONDS}`);
  headers.set(STORED_AT, String(nowMs));
  return new Response(body, { status: response.status, headers });
}

/** The stored copy as the shopper receives it: the browser keeps the page's own caching rule. */
export function fromStore(stored: Response, head: boolean, state: string): Response {
  const headers = new Headers(stored.headers);
  const cc = headers.get(ORIGINAL_CC);
  if (cc) headers.set('cache-control', cc); else headers.delete('cache-control');
  headers.delete(ORIGINAL_CC);
  headers.delete(STORED_AT);
  headers.set('x-mimipip-edge', state);
  return new Response(head ? null : stored.body, { status: stored.status, headers });
}

export function storedAt(stored: Response): number { return Number(stored.headers.get(STORED_AT)); }

type Ctx = { waitUntil(p: Promise<unknown>): void };
type EdgeCache = { match(key: string): Promise<Response | undefined>; put(key: string, response: Response): Promise<void> };

/**
 * Serve a public page from the edge cache, building it with `build` when there is no usable copy.
 * A cache that cannot be read or written never stops the page: it is built as before.
 */
export async function withEdgeCache(
  request: Request, ctx: Ctx, key: string | null, build: () => Promise<Response>,
  cache: EdgeCache | undefined = (globalThis as { caches?: { default?: EdgeCache } }).caches?.default,
  now: () => number = Date.now,
): Promise<Response> {
  if (!key || !cache) return build();
  const head = request.method === 'HEAD';
  const store = async (response: Response) => {
    if (!storable(response)) return response;
    const [mine, kept] = response.body!.tee();
    ctx.waitUntil(cache.put(key, forStore(response, kept, now())).catch(() => console.error('mimipip_edge_cache_put')));
    return new Response(mine, response);
  };
  let stored: Response | undefined;
  try { stored = await cache.match(key); } catch { stored = undefined; }
  if (stored) {
    const age = ageOf(storedAt(stored), now());
    if (age === 'fresh') return fromStore(stored, head, 'hit');
    if (age === 'stale') {
      // Shown now; the next shopper gets the page built afresh.
      ctx.waitUntil((async () => {
        const fresh = await build();
        if (!storable(fresh)) { await fresh.body?.cancel(); return; }
        await cache.put(key, forStore(fresh, await fresh.text(), now()));
      })().catch(() => console.error('mimipip_edge_cache_refresh')));
      return fromStore(stored, head, 'stale');
    }
  }
  const built = await store(await build());
  const out = new Response(head ? null : built.body, built);
  out.headers.set('x-mimipip-edge', 'miss');
  return out;
}
