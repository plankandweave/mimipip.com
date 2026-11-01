import "server-only";

import { supabaseAdmin } from "./supabase-admin";

/**
 * The elevated key the DATABASE will actually accept.
 *
 * Several SECURITY DEFINER functions — newsletter_get_issue,
 * newsletter_recipients, the intel RPCs — begin with intel_key_ok(p_key). That
 * gate exists so a browser can call them safely, and the key it checks lives in
 * admin_config. Server routes were passing INTEL_RPC_KEY from the environment
 * instead, which is a second copy of the same secret in a second place.
 *
 * The two copies drifted, and nothing said so. Between 25 August and
 * 5 September FOUR scheduled jobs returned 401 on every single run — the weekly
 * newsletter (3/3), execute-decisions (11/11), weekly-intel and marketing — and
 * the only visible symptom was silence: no letter arrived, no error was raised,
 * and cron_runs recorded a status nobody was reading. The 5 September TAASH
 * teaser failed the same way, mid-send, after claiming its ledger row.
 *
 * So the key is read from the database that validates it. There is now one copy
 * and it cannot disagree with itself. This grants nothing new: any caller of
 * this function already holds the service role, which can read admin_config
 * anyway — it only stops the two from falling out of step.
 *
 * The environment variable remains as a fallback for a runtime with no service
 * role configured, so nothing that works today stops working.
 */
type Keys = { intel: string | null; admin: string | null };

/**
 * How long a read of admin_config is reused.
 *
 * This cache USED to be permanent — read once per isolate, kept for the life of
 * that isolate. That is fine until the day someone rotates a key, which is the
 * day it stops being fine: the database starts refusing the value every running
 * instance is still holding, every admin screen answers "unauthorized", and the
 * only reliable cure is a deploy. A credential you cannot change without an
 * outage is one nobody changes, which defeats the point of being able to.
 *
 * A minute of staleness costs one extra query per isolate per minute and makes
 * rotation a database edit that heals itself.
 */
const TTL_MS = 60_000;

let cached: { at: number; keys: Keys } | undefined;

async function readKeys(): Promise<Keys> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.keys;

  const admin = supabaseAdmin();
  if (!admin) {
    cached = { at: Date.now(), keys: { intel: null, admin: null } };
    return cached.keys;
  }

  const { data, error } = await admin
    .from("admin_config")
    .select("k, v")
    .in("k", ["intel_key", "admin_key"]);

  if (error) {
    console.error("[elevated-key] could not read admin_config:", error.message);
    // Keep serving the last good read rather than going dark on a blip: a
    // transient database error should not log every staff screen out.
    if (cached) return cached.keys;
    cached = { at: Date.now(), keys: { intel: null, admin: null } };
    return cached.keys;
  }

  const rows = (data ?? []) as { k: string; v: string | null }[];
  cached = {
    at: Date.now(),
    keys: {
      intel: rows.find((r) => r.k === "intel_key")?.v || null,
      admin: rows.find((r) => r.k === "admin_key")?.v || null,
    },
  };
  return cached.keys;
}

/** Drop the cached read. Exported for tests; production relies on the TTL. */
export function forgetElevatedKeys(): void {
  cached = undefined;
}

/**
 * The key to PRESENT to a key-gated RPC. intel_key first, admin_key second —
 * intel_key_ok() accepts either, and the dedicated one should be preferred
 * where it exists.
 */
export async function elevatedKey(): Promise<string | undefined> {
  const keys = await readKeys();
  return keys.intel || keys.admin || process.env.INTEL_RPC_KEY || undefined;
}

/**
 * The key to present to an ADMIN-gated RPC — specifically the `admin_key` row,
 * never the intel one.
 *
 * The distinction is not cosmetic and the two rows do not hold the same value.
 * admin_key_ok() matches `k = 'admin_key'` alone, while intel_key_ok() matches
 * either row. So admin_key opens both gates and intel_key opens only one:
 * handing elevatedKey() to an admin_* RPC returns the intel key and every admin
 * surface answers 401. This is the key for anything acting on behalf of a
 * signed-in staff member, which is all of them.
 */
export async function adminRpcKey(): Promise<string | undefined> {
  const keys = await readKeys();
  return keys.admin || process.env.ADMIN_RPC_KEY || undefined;
}

/**
 * Does a caller-supplied x-intel-key match a key this deployment accepts?
 *
 * WHY THIS EXISTS. Every cron route reads x-intel-key, and most of them then
 * hand it to an RPC whose first line is intel_key_ok(p_key) — so the database
 * was the real gate and a route-level `if (!key) 401` was enough there.
 * launch-mail is the exception: since its recipient list moved to the service
 * role, the key travels nowhere, and "non-empty" was the only thing standing
 * between an unauthenticated GET and publishing a collection plus mailing the
 * whole subscriber list. `x-intel-key: x` was a valid key.
 *
 * Checking here rather than only in the database also stops a bogus key from
 * reaching the work a route does BEFORE its first RPC — Google Analytics
 * calls, an Anthropic client, a whole newsletter issue generated by Claude.
 *
 * BOTH keys are accepted, exactly as intel_key_ok does. /admin sends the admin
 * key in this header (the "generate the report now" button) while the
 * newsletter bridge sends the intel key; narrowing this to one of them would
 * 401 a screen that works today.
 */
export async function intelKeyOk(supplied: string | null | undefined): Promise<boolean> {
  if (!supplied) return false;

  const keys = await readKeys();
  const accepted = [keys.intel, keys.admin, process.env.INTEL_RPC_KEY || null].filter(
    (k): k is string => !!k,
  );

  // Every candidate is compared, with no early return, so how long this takes
  // says nothing about which key was the near miss.
  let ok = false;
  for (const candidate of accepted) if (sameKey(supplied, candidate)) ok = true;
  return ok;
}

/**
 * Constant-time-ish comparison. These keys are short and these routes are not
 * realistic timing-attack targets, but a plain `===` against a shared secret is
 * the kind of line that gets copied into somewhere it does matter.
 */
export function sameKey(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
