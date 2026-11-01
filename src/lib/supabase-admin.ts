import "server-only";
import { serviceAvailable } from "../brand/services";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-ONLY Supabase client (service role). Bypasses RLS, so it must never be
// imported into a Client Component or any browser bundle.
//
// The line above ENFORCES that: "server-only" fails the build if this module is
// ever pulled into a browser bundle, instead of shipping the service-role key to
// every visitor. Until now the rule was a comment, which is not a mechanism —
// and the exposure grew when the launch teaser began calling supabaseAdmin()
// from a Server Component rather than a route handler. Components are precisely
// where an added "use client", or a shared helper imported by one, turns a
// server module into a client one silently. A failed build is the cheap version
// of that mistake. Used by the corporate
// portal, whose tables are RLS-enabled with no policies: the anon key cannot
// touch login codes or sessions, which is what stops anyone minting a session
// for an @vijaysales.com address they do not own.

let cached: SupabaseClient | null = null;

/** Returns the service-role client, or null when the key is not configured
 *  (local dev without secrets) so callers can degrade instead of crashing. */
export function supabaseAdmin(): SupabaseClient | null {
  if (!serviceAvailable("database")) return null;
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn("[supabase-admin] SUPABASE_SERVICE_ROLE_KEY not set — corporate portal disabled");
    return null;
  }
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}
