import "server-only";
import { partnerCapabilities } from "./partner-capabilities";
import type { SupabaseClient } from "@/brand/database-types";
import { istDateKey } from "@/lib/ist";
import { supabaseAdmin } from "./supabase-admin";
import { can, currentCorporateSession, type CorporateSession } from "./corporate-auth";
import type { AreaRow } from "./portfolio";

// ─── Capturing walls from inside the portal ─────────────────────────────────
//
// The measurement-link flow (lib/measure-link.ts) proves who you are with an
// unguessable token because the person walking a store has no login and never
// will. A portfolio account is the other case: its people DO sign in — by
// mobile — and they capture their own buildings from the dashboard.
//
// So the guard is different, but the rule it enforces is the same one, and it
// is the important line in this file:
//
//   THE ACCOUNT COMES FROM THE SESSION AND THE PLACE COMES FROM THE RESOLVED
//   AREA. Never from the request body.
//
// A caller supplies an area id and nothing else that decides authority. That id
// is looked up scoped to the session's own account, so naming another tenant's
// area returns "not on your account" rather than reaching it.

/** Same ceiling as a measurement link. A survey is one space, not a tower. */
export const MAX_WALLS = 40;

export type CaptureContext = {
  session: CorporateSession;
  area: AreaRow;
  store: { id: string; name: string; state: string; address_line: string | null; city: string | null; gps: string | null; series_names: string[] };
  sb: SupabaseClient;
};

export type CaptureGuard =
  | { ok: true; ctx: CaptureContext }
  | { ok: false; status: number; error: string };

/**
 * The preamble every capture route needs, in one place: session, agreement
 * gate, capability, and an area that belongs to this account.
 *
 * `capability` is "build" — the right to size and draft a wall. Deliberately
 * not "order": capturing a wall spends nothing, and gating it on the
 * money-spending right would lock out exactly the facilities staff the feature
 * is for. (can() returns true for our own staff and for a domain-open account
 * with no member rows, as it does everywhere else.)
 */
export async function guardCapture(areaId: string): Promise<CaptureGuard> {
  const session = await currentCorporateSession();
  if (!session) return { ok: false, status: 401, error: "Not signed in" };
  if (partnerCapabilities(session.account).poRequiredRelease) {
    return { ok: false, status: 403, error: "Use the private customer workspace." };
  }
  if (session.agreementPending) {
    return { ok: false, status: 403, error: "agreement_required" };
  }
  if (!can(session, "build")) {
    return { ok: false, status: 403, error: "You don't have permission to add walls on this account." };
  }
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, status: 503, error: "Unavailable" };

  const id = String(areaId ?? "").trim();
  if (!id) return { ok: false, status: 400, error: "Which space is this wall in?" };

  // Scoped to the session's account, so an id from another tenant simply is not
  // found. This is the whole authorisation check.
  const { data: area } = await sb.from("corporate_site_areas")
    .select("*").eq("id", id).eq("account_id", session.account.id)
    .eq("active", true).maybeSingle();
  if (!area) return { ok: false, status: 404, error: "That space isn't on your account." };

  const { data: store } = await sb.from("corporate_stores")
    .select("id, name, state, address_line, city, gps, series_names")
    .eq("id", (area as AreaRow).store_id).eq("active", true).maybeSingle();
  if (!store) return { ok: false, status: 404, error: "That building is no longer active." };

  return {
    ok: true,
    ctx: {
      session,
      area: area as AreaRow,
      store: store as CaptureContext["store"],
      sb,
    },
  };
}

/**
 * The open survey for a space, created on the FIRST wall rather than when the
 * space is added — so laying out a tower's forty floors does not litter the
 * board with forty empty surveys.
 *
 * Race-safe by constraint, not by hope: corporate_site_batches has a partial
 * unique index on (area_id) where status = 'collecting' (migration 0157), so
 * two people adding the first wall to the same lobby at the same moment cannot
 * end up with two half-filled surveys. The loser of the insert adopts the
 * winner's batch.
 *
 * Everything the survey knows about WHERE it is comes from the store and the
 * area, which is why nobody on site ever retypes an address.
 */
export async function ensureAreaBatch(ctx: CaptureContext): Promise<string | null> {
  const { sb, area, store, session } = ctx;

  const open = async () => {
    const { data } = await sb.from("corporate_site_batches")
      .select("id").eq("area_id", area.id).eq("status", "collecting").maybeSingle();
    return (data?.id as string | undefined) ?? null;
  };

  const existing = await open();
  if (existing) return existing;

  const where = area.floor ? `${area.floor} · ${area.name}` : area.name;
  const { data: created, error } = await sb.from("corporate_site_batches").insert({
    account_id: session.account.id,
    store_id: store.id,
    area_id: area.id,
    title: `${store.name} · ${where} · ${istDateKey()}`,
    status: "collecting",
    // The space's standing brief if it has one, else the building's.
    series_names: store.series_names ?? [],
    state: store.state,
    ship_address: store.address_line,
    ship_city: store.city,
    gps: store.gps,
    source: "portfolio",
    source_ref: area.code,
    created_by: session.email,
  }).select("id").maybeSingle();

  if (created?.id) return created.id as string;

  // Either the unique index rejected us (someone else got there first) or the
  // insert genuinely failed. Re-reading distinguishes them without guessing.
  const adopted = await open();
  if (adopted) return adopted;

  console.error("[portfolio-capture] could not open a survey:", area.id, error?.message);
  return null;
}

/** The next wall number in a survey.
 *
 *  seq is the allocator's walking order and is unique per batch, so it is
 *  assigned HERE rather than accepted from the caller — two phones adding a
 *  wall at once must not both claim wall 7. A survey is capped at MAX_WALLS, so
 *  this reads at most forty rows and the PostgREST range cap cannot bite. */
export async function nextSeq(sb: SupabaseClient, batchId: string): Promise<number> {
  const { data } = await sb.from("corporate_site_batch_walls")
    .select("seq").eq("batch_id", batchId)
    .order("seq", { ascending: false }).limit(1);
  const highest = (data?.[0]?.seq as number | undefined) ?? 0;
  return highest + 1;
}
