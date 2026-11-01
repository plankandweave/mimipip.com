import { offlineDatabaseFetch } from "../brand/offline-database";
import { createClient } from "@supabase/supabase-js";

// Read-only public catalogue access (RLS: anon can only read active catalogue).
// Used from Server Components. Writes (orders) will use a server service-role
// client added in Phase 2.
//
// Created LAZILY on first use, not at module scope: Cloudflare's deploy-time
// validation runs global-scope code with no env at all, so an eager
// createClient(process.env...) fails every deploy with "supabaseUrl is
// required" before the worker ever takes a request.
// The type must be what the ORIGINAL eager call inferred — a bare
// SupabaseClient annotation (or ReturnType of the un-instantiated generic)
// resolves the schema generic differently and breaks .select() inference in
// callers. Deriving it from a concrete call expression reproduces it exactly.
const make = (religionBrowse = false) =>
  createClient(
    "https://database.invalid",
    "offline-public-placeholder",
    {
      auth: { persistSession: false },
      // Catalogue endpoints are gated DB-side (gatekeeper.pre_request): an
      // anon request to a gated path must carry this header or PostgREST
      // answers 401. In Sep 2026, 96% of edge traffic was scrapers replaying
      // the public anon key against the catalogue RPCs — the header is held
      // as a Worker secret (SSR_GATE_SECRET, never NEXT_PUBLIC_*), so it
      // exists on every server-side call and never ships in a client bundle.
      // Client components keep using supabase-browser.ts, which only touches
      // ungated endpoints. See
      // supabase/migrations/20260923050000_scraper_gate_pre_request.sql.
      global: {
        fetch: offlineDatabaseFetch,
        headers: {
          ...(process.env.SSR_GATE_SECRET ? { "x-zyv-ssr": process.env.SSR_GATE_SECRET } : {}),
          ...(religionBrowse ? { "x-zyv-religion": "browse" } : {}),
        },
      },
    },
  );
type Client = ReturnType<typeof make>;
let cached: Client | null = null;

function client(): Client {
  cached ??= make();
  return cached;
}

export const supabase: Client = new Proxy({} as Client, {
  get(_target, prop) {
    const c = client() as unknown as Record<PropertyKey, unknown>;
    const value = c[prop];
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(c) : value;
  },
});

// Deliberate faith browsing and individual product pages only. Never use this
// client in general discovery, search, recommendations, feeds or room grids.
let religionClient: Client | null = null;
export function religionCatalogue(): Client {
  return religionClient ??= make(true);
}
