import { offlineDatabaseFetch } from "../brand/offline-database";
import { createClient } from "@supabase/supabase-js";

// The appliance-wraps catalogue's own reads.
//
// The wrap range does not live in the store's `public` schema. Since the
// September 2026 org consolidation its products, images, collections, formats
// (wrap_formats), fridge models (wrap_models) and photographic stages
// (wrap_scenes) sit in the `wraps` schema of this same Supabase project — a
// separate catalogue, so a wrap design never appears in a wallpaper grid and a
// wallpaper never appears on an appliance page. Every wraps read goes through
// THIS client, never src/lib/supabase.ts: the shared client reads `public`,
// where none of these rows exist, and an unpinned read answers with an empty
// list rather than an error — the blank-grid failure the wraps health check
// (scripts/check-wrap-pages.mjs) exists to catch.
//
// Lazy for the same reason as src/lib/supabase.ts: Cloudflare's deploy-time
// validation evaluates module scope with no env, and an eager createClient
// fails the deploy.
const make = () =>
  createClient("https://database.invalid", "offline-public-placeholder", {
    auth: { persistSession: false },
    db: { schema: "wraps" },
    global: {
      fetch: offlineDatabaseFetch,
      headers: process.env.SSR_GATE_SECRET ? { "x-zyv-ssr": process.env.SSR_GATE_SECRET } : {},
    },
  });
type Client = ReturnType<typeof make>;
let cached: Client | null = null;

function client(): Client {
  cached ??= make();
  return cached;
}

export const supabaseWraps: Client = new Proxy({} as Client, {
  get(_target, prop) {
    const c = client() as unknown as Record<PropertyKey, unknown>;
    const value = c[prop];
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(c) : value;
  },
});
