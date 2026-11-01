// Cross-request cache for catalogue reads.
//
// Why this exists: the Header calls `connection()` (through hiddenConceptSlugs)
// on every page, which opts the whole site out of the page cache — every
// request, 404s included, renders from scratch. Before this, that meant a dozen
// Supabase round-trips for the nav menu alone, and the homepage another
// fifteen, several of them sequential. pg_stat_statements on 17 Sep 2026:
// populated_collection_tags() called 11.5 million times (5.5 days of database
// time), the collections lookup 38 million times, and 20–300 statements an
// hour dying on the 3 s statement timeout — which is the "Something went wrong"
// page. The `revalidate = 3600` those routes declare was never taking effect.
//
// So the hour of staleness the pages already declared is applied at the query
// layer instead, in two tiers: a per-isolate memory map, then the
// VINEXT_KV_CACHE KV binding (already on the Worker), reached through
// `cloudflare:workers` the way r2-media.ts reaches R2. Deliberately NOT
// `unstable_cache`: #382 pulled that off the product page this morning for a
// runtime error on Cloudflare, and a plain KV get/put has no framework in it.
// Off workerd (next dev, scripts) it is memory-only and still correct.
//
// Invalidation is a VERSION, not a tag: every key carries the catalogue
// version, and `bumpCatalogueVersion()` (called by the studio API after a
// publish, delete or rename) writes a new one, orphaning every old key at once.
// KV is eventually consistent, so a publish shows everywhere within about a
// minute rather than instantly; the page-level revalidatePath calls beside it
// still fire.
//
// Constraints callers must respect:
//  - Arguments are part of the key and JSON-serialised: plain values only (no
//    functions, no Dates — derive a day index first).
//  - Return values round-trip through JSON: no Set/Map/Date (wrap afterwards).
//  - A thrown error is not cached.

export const CATALOGUE_REVALIDATE = 3600;

type KVNamespace = {
  get(key: string, type: "text"): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
};
type Env = { VINEXT_KV_CACHE?: KVNamespace };

async function kv(): Promise<KVNamespace | null> {
  try {
    const mod = (await import(/* @vite-ignore */ "cloudflare:workers")) as { env?: Env };
    return mod.env?.VINEXT_KV_CACHE ?? null;
  } catch {
    return null;
  }
}

const VERSION_KEY = "catalogue:version";

// Workers KV refuses a key over 512 bytes (414), and a read that cannot be
// keyed is a read that goes to Supabase every time: on 30 Sep 2026 the
// Worker log showed "KV GET failed: 414 … length of 583" on the readers that
// take a list of handles. Keys that fit stay exactly as they were (so no warm
// entry is orphaned); longer ones become the prefix plus a SHA-256 of the
// arguments — same arguments, same key, and nothing else shares it.
const KV_KEY_BUDGET = 480;
const encoder = new TextEncoder();

export async function kvKey(prefix: string, args: unknown[]): Promise<string> {
  const raw = `${prefix}${JSON.stringify(args)}`;
  if (encoder.encode(raw).length <= KV_KEY_BUDGET) return raw;
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(JSON.stringify(args)));
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}sha256:${hex}`;
}
// How long an isolate trusts the version it last read before asking KV again.
// Bounds how stale an isolate can be after a bump; a KV read is a few ms.
const VERSION_TTL_MS = 10_000;
// Memory entries live at most this long, so an isolate that missed a bump (or
// a value KV has since dropped) still converges quickly.
const MEMORY_TTL_MS = 60_000;

// Every catalogue read answers within this, or throws. A healthy read is well
// under a second (KV, or one PostgREST round trip); this is only the ceiling
// that keeps a stalled read from holding a page open until Cloudflare's 100 s
// edge limit turns it into a 524. A thrown read is not cached, so the next
// request simply tries again.
export const CATALOGUE_READ_DEADLINE_MS = 8_000;

type Entry = { value: unknown; expires: number };
// RESOLVED VALUES only. Never put a Promise in module scope that a second
// request will await: see the note on cachedCatalogue below.
const memory = new Map<string, Entry>();
let version: { value: string; readAt: number } | null = null;

function withDeadline<T>(name: string, ms: number, work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    work,
    new Promise<T>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`[catalogue-cache] ${name} did not answer within ${ms}ms`)),
        ms,
      );
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function currentVersion(): Promise<string> {
  const now = Date.now();
  if (version && now - version.readAt < VERSION_TTL_MS) return version.value;
  const store = await kv();
  let value = "0";
  if (store) {
    try {
      value = (await store.get(VERSION_KEY, "text")) ?? "0";
    } catch (err) {
      console.error("[catalogue-cache] version read failed:", err);
      value = version?.value ?? "0";
    }
  }
  version = { value, readAt: now };
  return value;
}

/** Drop every cached catalogue read. Safe to call anywhere; never throws. */
export async function bumpCatalogueVersion(): Promise<void> {
  memory.clear();
  version = null;
  const store = await kv();
  if (!store) return;
  try {
    await store.put(VERSION_KEY, String(Date.now()));
  } catch (err) {
    console.error("[catalogue-cache] version bump failed:", err);
  }
}

/** Per-read overrides. Both default to the behaviour every existing caller has. */
export type CatalogueCacheOptions = {
  /** Ceiling for this read instead of CATALOGUE_READ_DEADLINE_MS — for the
   *  rare whole-catalogue read (the sitemap) that legitimately takes longer. */
  deadlineMs?: number;
  /** Keep the last successful value for this many seconds, OUTSIDE the
   *  catalogue version, and serve it when a fresh read fails. For surfaces
   *  where a slightly old answer beats an error (the sitemap: a 500 there is a
   *  crawler told the whole site is gone). A read with no copy yet still
   *  throws. */
  staleFallbackTtl?: number;
};

// Last-good copies for `staleFallbackTtl` reads, per isolate (KV is the
// cross-isolate tier). Resolved values only, like `memory`.
const staleMemory = new Map<string, unknown>();

async function readStale(key: string): Promise<{ value: unknown } | null> {
  if (staleMemory.has(key)) return { value: staleMemory.get(key) };
  const store = await kv();
  if (!store) return null;
  try {
    const raw = await withDeadline(key, 2_000, store.get(key, "text"));
    return raw === null ? null : { value: JSON.parse(raw) as unknown };
  } catch (err) {
    console.error("[catalogue-cache] stale read failed:", err);
    return null;
  }
}

export function cachedCatalogue<F extends (...args: any[]) => Promise<unknown>>( // eslint-disable-line @typescript-eslint/no-explicit-any -- generic over any async signature; the wrapper preserves it exactly
  name: string,
  fn: F,
  revalidate: number = CATALOGUE_REVALIDATE,
  options: CatalogueCacheOptions = {},
): F {
  const deadline = options.deadlineMs ?? CATALOGUE_READ_DEADLINE_MS;
  const staleTtl = options.staleFallbackTtl;
  const cached = async (...args: unknown[]): Promise<unknown> => {
    if (!staleTtl) return read(args);
    const staleKey = await kvKey(`catalogue-stale:religion-discovery-v2:${name}:`, args);
    try {
      const value = await read(args, staleKey);
      return value;
    } catch (err) {
      const stale = await readStale(staleKey);
      if (!stale) throw err;
      console.error(`[catalogue-cache] ${name} failed; serving last good copy:`, err instanceof Error ? err.message : err);
      return stale.value;
    }
  };
  const read = async (args: unknown[], staleKey?: string): Promise<unknown> => {
    const ver = await currentVersion();
    const key = await kvKey(`catalogue:religion-discovery-v2:${ver}:${name}:`, args);
    const now = Date.now();

    const hit = memory.get(key);
    if (hit && hit.expires > now) return hit.value;

    // Each request does its OWN read on a memory miss. This used to be
    // "single-flight": a module-level Map of in-flight promises, so concurrent
    // visitors on one isolate awaited whichever request asked first. On
    // Cloudflare Workers that is a production outage waiting to happen. When
    // the first request is cancelled (the visitor closes the tab or navigates
    // away mid-load), the runtime cancels its I/O and its promise NEVER
    // settles. Every visitor waiting on it hung until Cloudflare's 100 s limit
    // and got a 524, and the `finally` that removed the entry never ran either,
    // so that key stayed poisoned for the life of the isolate. On 28 September
    // 2026 that was 20–50 page loads an hour across the homepage, product
    // pages and every partner portal (the Header reads through here on every
    // page); Homelane could not open theirs. Cloudflare's own rule is: never
    // share a promise or any I/O object across requests.
    //
    // What single-flight saved is small: a memory miss now costs one KV read
    // per concurrent request, and Supabase is still only reached on a KV miss.
    const work = (async () => {
      const store = await kv();
      if (store) {
        try {
          const raw = await store.get(key, "text");
          if (raw !== null) {
            const value = JSON.parse(raw) as unknown;
            memory.set(key, { value, expires: Date.now() + Math.min(MEMORY_TTL_MS, revalidate * 1000) });
            if (staleKey) staleMemory.set(staleKey, value);
            return value;
          }
        } catch (err) {
          console.error("[catalogue-cache] KV read failed:", err);
        }
      }
      const value = await fn(...args);
      memory.set(key, { value, expires: Date.now() + Math.min(MEMORY_TTL_MS, revalidate * 1000) });
      if (staleKey) staleMemory.set(staleKey, value);
      if (store) {
        try {
          // KV's floor for expirationTtl is 60 s.
          const body = JSON.stringify(value);
          await store.put(key, body, { expirationTtl: Math.max(60, revalidate) });
          if (staleKey && staleTtl) await store.put(staleKey, body, { expirationTtl: Math.max(60, staleTtl) });
        } catch (err) {
          console.error("[catalogue-cache] KV write failed:", err);
        }
      }
      return value;
    })();
    return withDeadline(name, deadline, work);
  };
  return cached as unknown as F;
}
