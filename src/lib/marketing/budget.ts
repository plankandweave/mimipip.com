// Spend governance. Every rupee the engine spends passes through the
// intelligence layer's cap-enforced ledger — never around it. This is what makes
// "Roheena only recharges the card" safe: the DB itself refuses over-cap spends,
// and every spend + result is recorded where her Monday report reads it.
//
// marketing_record_spend RAISES over_weekly_cap / over_campaign_cap /
// budget_paused when a spend would breach the caps or the budget is paused — so
// the guarantee is enforced server-side, not by trusting this client.
//
// Every RPC here is keyed with intelKeyLive(), the key read from the database
// that validates it — NOT intelKey(), the environment copy. The env copy is the
// one intel.ts documents drifting out of step with admin_config and returning
// 401 in silence; here that silence would read as "budget status unavailable",
// which canSpend() turns into "no headroom", which holds every launch forever
// with a reason that points at the wrong thing.

import { serviceClient, hasServiceRole } from "./db";
import { intelKeyLive } from "./intel";

export type BudgetStatus = {
  weekly_cap: number;
  per_campaign_cap: number;
  active: boolean;
  spent_this_week: number;
  remaining_this_week: number;
  [k: string]: unknown;
};

export async function budgetStatus(): Promise<BudgetStatus | null> {
  const key = await intelKeyLive();
  if (!key || !hasServiceRole()) return null;
  const sb = serviceClient();
  const { data, error } = await sb.rpc("marketing_budget_status", { p_key: key });
  if (error) return null;
  return (data ?? null) as BudgetStatus | null;
}

/** True only when we may spend at all: budget exists, is active, has headroom. */
export async function canSpend(min = 1): Promise<{ ok: boolean; reason?: string; status?: BudgetStatus }> {
  const status = await budgetStatus();
  if (!status) return { ok: false, reason: "budget status unavailable (no key/service role)" };
  if (!status.active) return { ok: false, reason: "budget paused (marketing_budget.active = false)", status };
  if ((status.remaining_this_week ?? 0) < min)
    return { ok: false, reason: "no weekly headroom remaining", status };
  return { ok: true, status };
}

export type SpendResult = { ok: boolean; error?: string; blocked?: boolean };

/**
 * Record a spend. The RPC enforces the caps and raises on breach; we surface
 * that as a non-throwing result the caller can act on (skip/pause).
 */
export async function recordSpend(args: {
  channel: string;
  campaign: string;
  amount: number;
  results?: Record<string, unknown>;
  decisionId?: string;
}): Promise<SpendResult> {
  const key = await intelKeyLive();
  if (!key || !hasServiceRole()) return { ok: false, error: "no key/service role" };
  const sb = serviceClient();
  const { error } = await sb.rpc("marketing_record_spend", {
    p_key: key,
    p_channel: args.channel,
    p_campaign: args.campaign,
    p_amount: args.amount,
    p_results: args.results ?? null,
    p_decision_id: args.decisionId ?? null,
    p_recorded_by: "marketing-engine",
  });
  if (error) {
    const blocked = /over_weekly_cap|over_campaign_cap|budget_paused/.test(error.message);
    return { ok: false, error: error.message, blocked };
  }
  return { ok: true };
}

/** Update matured results (impressions/clicks/carts/orders/…) for a spend row. */
export async function updateResults(spendId: string, results: Record<string, unknown>): Promise<boolean> {
  const key = await intelKeyLive();
  if (!key || !hasServiceRole()) return false;
  const sb = serviceClient();
  const { error } = await sb.rpc("marketing_update_results", {
    p_key: key,
    p_id: spendId,
    p_results: results,
  });
  return !error;
}
