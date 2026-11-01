// Promote a published Instagram reel to a named neighbourhood: the reel as it
// already sits on @zyvorah (its likes and comments travel with it), shown to
// people who LIVE in a fixed set of postcodes, at a fixed daily budget.
//
// First use (Roheena, 8 Oct 2026): The Lives Within — a 10,000 sq ft family
// apartment in Gurgaon — to the luxury residential belts of Gurgaon at
// ₹1,000 a day. "Push it to all rich people there": Meta offers no income
// targeting in India, so the fence is WHERE people live. Each PIN below is a
// belt of high-end housing (DLF's Golf Course Road towers, the DLF Phases,
// Golf Course Extension Road, Nirvana Country), and location_types is
// ["home"] so a commuter passing through does not count.
//
// Same safety model as ads/retarget.ts, whose header explains each piece:
//   - runs only from a signed-in staff click (/api/admin/marketing/reel-boost);
//   - every object is CREATED PAUSED; going live needs `activate: true`, budget
//     headroom, and the week committed to the cap-enforced ledger FIRST;
//   - geography fails closed: postcodes are resolved to Meta keys by exact
//     code in the expected state, and too few resolved means no launch — there
//     is no path to an empty geo_locations (which Meta reads as all of India);
//   - one marketing_campaigns row per boost holds every id created, written
//     before the first POST and after each one, so a retry resumes.
//
// The reel has to be ON Instagram first: the boost reads its media id from
// the published post of the plan slot that carried the Library film. Until
// the reel is approved and out, the preview says so and nothing is created.

/* eslint-disable @typescript-eslint/no-explicit-any -- Graph API responses are untyped JSON, read defensively (as meta.ts does). */
import { metaAdAccountId, metaIgAccountId } from "@/lib/meta-env";
import { serviceClient, hasServiceRole } from "../db";
import { canSpend, recordSpend, budgetStatus } from "../budget";
import { graphGet, graphPost, metaConfigured, resolveMetaPageId } from "./meta";
import { scrub, LEDGER_DAYS } from "./retarget";
import { SITE } from "./tracking";
import {
  BOOSTS, FREQUENCY, OBJECTIVE, OPTIMIZATION_GOAL, adSetParams, creativeParams, geoFor, matchPin,
  type BoostKey, type BoostSpec, type PinKey,
} from "./reel-boost-spec";

export { BOOSTS, isBoostKey, type BoostKey } from "./reel-boost-spec";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function enc(params: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    out[k] = typeof v === "string" ? v : JSON.stringify(v);
  }
  return out;
}

async function resolvePins(spec: BoostSpec): Promise<PinKey[]> {
  const out: PinKey[] = [];
  for (const p of spec.pins) {
    try {
      const res = await graphGet("search", {
        type: "adgeolocation",
        location_types: JSON.stringify(["zip"]),
        country_code: "IN",
        q: p.code,
        limit: "10",
      });
      const hit = matchPin(res?.data ?? [], p.code, spec.region);
      out.push(hit ? { ...p, key: hit.key } : { ...p, error: `no ${p.code} in ${spec.region}` });
    } catch (e) {
      out.push({ ...p, error: scrub((e as Error).message) });
    }
  }
  return out;
}

function campaignParams(spec: BoostSpec): Record<string, unknown> {
  return { name: spec.key, objective: OBJECTIVE, status: "PAUSED", special_ad_categories: [], buying_type: "AUCTION" };
}


/* ── the reel ──────────────────────────────────────────────────────────── */

/** The Instagram media id of the published reel carrying this Library film. */
async function publishedReel(libraryId: string): Promise<{ mediaId: string; publishedAt: string | null } | null> {
  const sb = serviceClient();
  const { data: slots } = await sb.from("marketing_plan_slots").select("id").eq("channel", "instagram").filter("art->>library_id", "eq", libraryId);
  const ids = (slots ?? []).map((s: { id: string }) => s.id);
  if (!ids.length) return null;
  const { data: posts } = await sb
    .from("marketing_posts")
    .select("external_id, published_at")
    .in("plan_slot_id", ids)
    .eq("channel", "instagram")
    .eq("status", "published")
    .not("external_id", "is", null)
    .order("published_at", { ascending: false })
    .limit(1);
  const p = posts?.[0] as { external_id: string; published_at: string | null } | undefined;
  return p ? { mediaId: p.external_id, publishedAt: p.published_at } : null;
}

/* ── the stored record ─────────────────────────────────────────────────── */

type Rec = {
  kind: "meta-reel-boost-v1";
  boost: string;
  mediaId?: string;
  zipKeys?: string[];
  campaignId?: string;
  adSetId?: string;
  creativeId?: string;
  adId?: string;
  status: "PAUSED" | "ACTIVE";
  activatedAt?: string;
  committedInr?: number;
  lastError?: string;
};
type Row = { id: string; status: string; plan: any };

async function loadRow(spec: BoostSpec): Promise<Row | null> {
  const { data, error } = await serviceClient()
    .from("marketing_campaigns")
    .select("id, status, plan")
    .eq("channel", "meta")
    .eq("name", spec.key)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw new Error(`marketing_campaigns read: ${error.message}`);
  return (data?.[0] as Row) ?? null;
}

function recOf(row: Row | null, boost: string): Rec {
  const m = row?.plan?.meta;
  return m?.kind === "meta-reel-boost-v1" ? { ...m } : { kind: "meta-reel-boost-v1", boost, status: "PAUSED" };
}

/* ── preview ───────────────────────────────────────────────────────────── */

export type BoostPreview = {
  boost: string;
  label: string;
  dailyBudgetInr: number;
  weeklyInr: number;
  link: string;
  objective: string;
  pins: PinKey[];
  reel: { mediaId: string; publishedAt: string | null } | null;
  existing: { status: string; campaignId?: string; adStatus: "PAUSED" | "ACTIVE"; lastError?: string } | null;
  /** Block creating anything. */
  blockers: string[];
  /** Block going live. */
  liveBlockers: string[];
};

export async function previewBoost(boost: BoostKey): Promise<BoostPreview> {
  const spec = BOOSTS[boost];
  const blockers: string[] = [];
  const liveBlockers: string[] = [];
  const configured = metaConfigured();
  if (!configured) blockers.push("META_ADS_TOKEN / META_AD_ACCOUNT_ID not set");
  if (!metaIgAccountId()) blockers.push("the Instagram account id is not set, so the reel cannot be found to promote");
  if (!hasServiceRole()) blockers.push("no service role — the launch cannot be recorded");

  const reel = hasServiceRole() ? await publishedReel(spec.libraryId).catch(() => null) : null;
  if (!reel) blockers.push("the reel is not on Instagram yet — compose and approve it on the desk; it can be promoted once it is out");

  let pins: PinKey[] = spec.pins.map((p) => ({ ...p, error: "not looked up (Meta not configured)" }));
  if (configured) {
    pins = await resolvePins(spec);
    const geo = geoFor(spec, pins);
    if ("error" in geo) blockers.push(geo.error);
  }

  const status = await budgetStatus().catch(() => null);
  const weeklyInr = spec.dailyBudgetInr * LEDGER_DAYS;
  if (!status) liveBlockers.push("budget status unavailable");
  else if (!status.active) liveBlockers.push("engine ad budget is paused");
  else if ((status.remaining_this_week ?? 0) < weeklyInr) liveBlockers.push(`only ${inr(status.remaining_this_week)} left in this week's cap; a week of this boost is ${inr(weeklyInr)}`);

  let row: Row | null = null;
  try {
    row = hasServiceRole() ? await loadRow(spec) : null;
  } catch {
    /* shown as not existing */
  }
  const rec = recOf(row, boost);
  return {
    boost,
    label: spec.label,
    dailyBudgetInr: spec.dailyBudgetInr,
    weeklyInr,
    link: `${SITE}${spec.path}`,
    objective: `${OBJECTIVE} · ${OPTIMIZATION_GOAL} · at most ${FREQUENCY.max_frequency} views a person a week`,
    pins,
    reel,
    existing: row ? { status: row.status, campaignId: rec.campaignId, adStatus: rec.status, lastError: rec.lastError } : null,
    blockers,
    liveBlockers,
  };
}

/* ── launch ────────────────────────────────────────────────────────────── */

export type BoostOutcome = {
  ok: boolean;
  state: "paused" | "live" | "refused" | "failed";
  campaignId?: string;
  committedInr: number;
  failedStep?: string;
  error?: string;
  notes: string[];
};

export async function launchBoost(boost: BoostKey, opts: { activate: boolean; staff?: string | null }): Promise<BoostOutcome> {
  const spec = BOOSTS[boost];
  const notes: string[] = [];
  const refuse = (error: string, failedStep?: string): BoostOutcome => ({ ok: false, state: "refused", committedInr: 0, error, failedStep, notes });
  if (!metaConfigured()) return refuse("META_ADS_TOKEN / META_AD_ACCOUNT_ID not set");
  if (!hasServiceRole()) return refuse("no service role — cannot record the launch");
  const igId = metaIgAccountId();
  if (!igId) return refuse("the Instagram account id is not set");
  const page = await resolveMetaPageId();
  if (!page.id) return refuse(page.error ?? "META_PAGE_ID not set");
  const account = metaAdAccountId()!;

  let row: Row | null;
  try {
    row = await loadRow(spec);
  } catch (e) {
    return refuse((e as Error).message, "record");
  }
  const rec = recOf(row, boost);

  const reel = await publishedReel(spec.libraryId).catch(() => null);
  if (!reel) return refuse("the reel is not on Instagram yet — approve it on the desk first", "reel");
  if (rec.mediaId && rec.mediaId !== reel.mediaId) notes.push(`the boost keeps promoting media ${rec.mediaId}, the reel it was built on`);
  rec.mediaId = rec.mediaId ?? reel.mediaId;

  if (!rec.zipKeys?.length) {
    const geo = geoFor(spec, await resolvePins(spec));
    if ("error" in geo) return refuse(geo.error, "geography");
    rec.zipKeys = geo.keys;
  }

  const weeklyInr = spec.dailyBudgetInr * LEDGER_DAYS;
  const goingLive = opts.activate && rec.status !== "ACTIVE";
  if (goingLive) {
    const spend = await canSpend(weeklyInr);
    if (!spend.ok) return refuse(`${spend.reason} (needs ${inr(weeklyInr)} for the week)`, "budget");
  }

  const sb = serviceClient();
  const save = async (status?: string) => {
    const patch: Record<string, unknown> = {
      plan: { source: "ads/reel-boost.ts", boost, pins: spec.pins, meta: rec },
      external_id: rec.campaignId ?? null,
      daily_budget: spec.dailyBudgetInr,
      lifetime_cap: rec.committedInr ?? 0,
      error: rec.lastError ?? null,
    };
    if (status) patch.status = status;
    if (!row) {
      const { data, error } = await sb
        .from("marketing_campaigns")
        .insert({ channel: "meta", objective: OBJECTIVE, name: spec.key, status: status ?? "prepared", ...patch })
        .select("id, status, plan")
        .single();
      if (error || !data) throw new Error(`marketing_campaigns insert: ${error?.message ?? "no row"}`);
      row = data as Row;
    } else {
      const { error } = await sb.from("marketing_campaigns").update(patch).eq("id", row.id);
      if (error) throw new Error(`marketing_campaigns update: ${error.message}`);
    }
  };

  let step = "record";
  try {
    rec.lastError = undefined;
    await save();
    if (!rec.campaignId) {
      step = "campaign";
      rec.campaignId = String((await graphPost(`${account}/campaigns`, enc(campaignParams(spec)))).id);
      await save("paused");
    }
    if (!rec.adSetId) {
      step = "ad set";
      rec.adSetId = String((await graphPost(`${account}/adsets`, enc(adSetParams(spec, rec.campaignId!, rec.zipKeys!)))).id);
      await save();
    }
    if (!rec.creativeId) {
      step = "creative";
      rec.creativeId = String((await graphPost(`${account}/adcreatives`, enc(creativeParams(spec, rec.mediaId!, page.id, igId)))).id);
      await save();
    }
    if (!rec.adId) {
      step = "ad";
      rec.adId = String(
        (await graphPost(`${account}/ads`, enc({ name: spec.adName, adset_id: rec.adSetId, creative: { creative_id: rec.creativeId }, status: "PAUSED" }))).id,
      );
      await save();
    }
  } catch (e) {
    rec.lastError = `${step}: ${scrub((e as Error).message)}`;
    await save(rec.status === "ACTIVE" ? "live" : rec.campaignId ? "paused" : "failed").catch(() => {});
    return { ok: false, state: "failed", campaignId: rec.campaignId, committedInr: 0, failedStep: step, error: rec.lastError, notes: [...notes, "everything created so far is PAUSED"] };
  }

  if (!goingLive) {
    await save(rec.status === "ACTIVE" ? "live" : "paused").catch(() => {});
    notes.push(rec.status === "ACTIVE" ? "already live — nothing new committed" : "created PAUSED — nothing spends until “Launch live”");
    return { ok: true, state: rec.status === "ACTIVE" ? "live" : "paused", campaignId: rec.campaignId, committedInr: 0, notes };
  }

  step = "ledger";
  const ledger = await recordSpend({
    channel: "meta",
    campaign: spec.key,
    amount: weeklyInr,
    results: { stage: "committed", days: LEDGER_DAYS, by: opts.staff ?? "staff", campaign_id: rec.campaignId, boost },
  });
  if (!ledger.ok) {
    await save("paused").catch(() => {});
    return { ok: false, state: "refused", campaignId: rec.campaignId, committedInr: 0, failedStep: "ledger", error: `ledger refused ${inr(weeklyInr)}: ${ledger.error}`, notes: [...notes, "everything is created and PAUSED"] };
  }

  try {
    for (const [s, id] of [["activate ad", rec.adId], ["activate ad set", rec.adSetId], ["activate campaign", rec.campaignId]] as const) {
      step = s;
      await graphPost(id!, { status: "ACTIVE" });
    }
    rec.status = "ACTIVE";
    rec.activatedAt = new Date().toISOString();
    rec.committedInr = (rec.committedInr ?? 0) + weeklyInr;
    await save("live");
    await sb.from("marketing_campaigns").update({ launched_at: rec.activatedAt }).eq("id", row!.id);
  } catch (e) {
    rec.lastError = `${step}: ${scrub((e as Error).message)}`;
    try {
      await graphPost(rec.adSetId!, { status: "PAUSED" });
    } catch {
      notes.push("the ad set could NOT be re-paused — check Ads Manager");
    }
    await save("paused").catch(() => {});
    return { ok: false, state: "failed", campaignId: rec.campaignId, committedInr: weeklyInr, failedStep: step, error: rec.lastError, notes: [...notes, `${inr(weeklyInr)} was already committed to this week's ledger`] };
  }

  notes.push(`live: ${spec.label} at ${inr(spec.dailyBudgetInr)}/day — ${inr(weeklyInr)} committed for the week`);
  return { ok: true, state: "live", campaignId: rec.campaignId, committedInr: weeklyInr, notes };
}
