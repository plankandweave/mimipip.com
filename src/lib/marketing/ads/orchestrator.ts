// The paid-campaign orchestrator: consume founder-approved ad decisions and
// monitor what is running.
//
// LAUNCHING IS RETIRED HERE (30 Sep 2026). This file used to turn an approved
// decision into an LLM-planned CampaignPlan and hand it to meta.launchCampaign().
// That path could never produce a working ad — empty geo (= all of India), no
// pixel event, no creative, no ad — and two plans prepared on 5 September
// (₹20k and ₹10k caps) were queued to be retried automatically, committing
// ₹20k to the ledger, the moment Meta credentials and the budget key lined up.
// Both of those are now true, so the retry was one cron tick away.
//
// Meta spend now starts in exactly one place: ads/retarget.ts, a deterministic
// plan launched by a signed-in staff click on the marketing desk (Ads tab).
// consumeAdDecisions() still consumes the ad decisions — so they do not sit in
// the queue forever reading "waiting on credentials" in the Monday report — but
// it closes them instead of launching:
//   - any 'prepared' campaign row for the decision → 'skipped', with the reason,
//     so even a revert of this file cannot find a plan to retry;
//   - if it had one, the decision → 'blocked' with a note pointing at the
//     launcher ('blocked' drops it out of the consumable set, so this runs
//     once). A decision with no Meta plan behind it is left open, untouched.
// Monitoring below is unchanged in spirit and now also watches paused rows.

import { serviceClient, hasServiceRole } from "../db";
import { approvedMarketingDecisions, classify, markDecision, type Decision } from "../intel";
import { recordSpend } from "../budget";
import { campaignInsights, pauseCampaign, metaConfigured, type CampaignPlan } from "./meta";

export type AdConsumeOutcome = {
  decisionId: string;
  title: string;
  action: "launched" | "prepared" | "skipped" | "failed";
  campaignId?: string;
  status?: string;
  detail: string;
};

/** Kept for readers of stored rows; nothing new is written with this shape. */
export type StoredCampaignRow = { id: string; status: string; plan: CampaignPlan | null };

const RETIRED_REASON =
  "not launched: the engine no longer launches LLM-planned Meta campaigns (they could not produce a valid ad — no city targeting, no pixel event, no creative). Meta spend now goes through the retargeting launcher on the marketing desk (Ads tab, src/lib/marketing/ads/retarget.ts), which needs a staff click.";

async function retireOne(decision: Decision): Promise<AdConsumeOutcome> {
  const base = { decisionId: decision.id, title: decision.title };
  const sb = serviceClient();

  // Close any plan that was waiting to be retried. Only 'prepared' rows: a row
  // that actually reached Meta (live/paused/failed) keeps its history.
  const { data: closed, error } = await sb
    .from("marketing_campaigns")
    .update({ status: "skipped", error: RETIRED_REASON })
    .eq("decision_id", decision.id)
    .eq("status", "prepared")
    .select("id, name");
  if (error) {
    // Leave the decision alone so the next tick tries again — the launch path
    // is gone either way, so retrying the tidy-up is all this can cost.
    console.error(`[ads] could not retire prepared campaigns for decision ${decision.id}: ${error.message}`);
    return { ...base, action: "skipped", detail: `retire failed: ${error.message}` };
  }

  const names = (closed ?? []).map((r) => `"${r.name}"`).join(", ");
  // Close the decision only when it demonstrably WAS a Meta plan (a prepared
  // row existed). classify() calls anything mentioning "campaign" an ads
  // decision, Google ones included, and those are not this file's to close —
  // they stay open for the founder, and this logs once an hour at most.
  if (!closed?.length) {
    console.warn(`[ads] decision ${decision.id} (${decision.title}): no Meta plan to launch here — ${RETIRED_REASON}`);
    return { ...base, action: "skipped", detail: "no Meta plan — left open" };
  }
  console.warn(`[ads] decision ${decision.id} (${decision.title}) ${RETIRED_REASON}${names ? ` Closed prepared: ${names}.` : ""}`);
  await markDecision(
    decision.id,
    "blocked",
    `Marketing engine: ${RETIRED_REASON}${` Prepared plan${closed.length > 1 ? "s" : ""} ${names} closed without spend.`} Anything in this decision that is not a Meta campaign is yours to action.`,
  );
  return { ...base, action: "skipped", detail: "Meta launch retired — use the retargeting launcher" };
}

/** Consume all pending founder-approved ad decisions — by closing them (see header). */
export async function consumeAdDecisions(): Promise<AdConsumeOutcome[]> {
  if (!hasServiceRole()) return [];
  const decisions = (await approvedMarketingDecisions()).filter((d) => classify(d) === "ads");
  const out: AdConsumeOutcome[] = [];
  for (const d of decisions) {
    try {
      out.push(await retireOne(d));
    } catch (e) {
      out.push({ decisionId: d.id, title: d.title, action: "failed", detail: (e as Error).message });
    }
  }
  return out;
}

// ---- Monitoring loop --------------------------------------------------------

/**
 * Pull performance for live campaigns, store it, feed the weekly report, and
 * apply a simple kill rule: if a campaign has spent a meaningful amount with a
 * very poor click-through, pause it. Scale decisions are left to the Monday
 * report (which computes ROAS and proposes scale/fix/kill back to Roheena).
 */
export async function monitorCampaigns(): Promise<{ checked: number; paused: number }> {
  if (!hasServiceRole() || !metaConfigured()) return { checked: 0, paused: 0 };
  const sb = serviceClient();
  // 'paused' rows are watched too. The retargeting launcher creates campaigns
  // PAUSED for review, and the natural next step is someone pressing "Publish"
  // in Ads Manager — which this table never hears about. Filtering on 'live'
  // alone would leave exactly that campaign, the one spending money nobody
  // clicked "Launch live" for, outside the kill rule. Reading insights for a
  // campaign that really is paused costs one GET and reports zero.
  const { data: rows } = await sb
    .from("marketing_campaigns")
    .select("id, external_id, name, decision_id, plan, status")
    .in("status", ["live", "paused"])
    .not("external_id", "is", null);

  let checked = 0;
  let paused = 0;
  for (const c of rows ?? []) {
    try {
      const m = await campaignInsights(c.external_id as string);
      await sb
        .from("marketing_campaigns")
        .update({ last_metrics: m, metrics_at: new Date().toISOString() })
        .eq("id", c.id);
      // Record matured spend/results into the governance ledger — for a row we
      // believe is paused, only once it has actually spent, so a campaign sitting
      // in review does not append a zero row every tick.
      if (c.status === "live" || m.spend > 0) await recordSpend({
        channel: "meta",
        campaign: c.name as string,
        amount: 0, // 0 delta — we store cumulative results, not double-count spend
        decisionId: c.decision_id as string | undefined,
        results: m,
      }).catch(() => {});
      checked++;

      // Kill rule: spent >= ₹2,000 and CTR < 0.3% → pause (clearly not working).
      if (m.spend >= 2000 && m.ctr > 0 && m.ctr < 0.3) {
        if (await pauseCampaign(c.external_id as string)) {
          await sb.from("marketing_campaigns").update({ status: "paused", paused_at: new Date().toISOString() }).eq("id", c.id);
          if (c.decision_id)
            await markDecision(c.decision_id as string, "done", `Marketing engine: auto-paused "${c.name}" — ₹${m.spend} spent at ${m.ctr}% CTR, below the kill threshold. Flagged for the weekly review.`);
          paused++;
        }
      }
    } catch {
      // best-effort per campaign
    }
  }
  return { checked, paused };
}
