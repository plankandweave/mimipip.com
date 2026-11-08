import { isolatedStorage } from "@/brand/storage";
import { backendUrl, backendPublicKey, MIMIPIP_SCHEMA } from "../brand/backend";
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
    backendUrl(),
    backendPublicKey(),
    {
      auth: { persistSession: false },
      db: { schema: MIMIPIP_SCHEMA },
      global: {
        headers: {
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
    if (prop === "storage") return isolatedStorage(client().storage);
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
