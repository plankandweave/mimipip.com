// Bridge to the intelligence layer's decision loop (shared Supabase project).
//
// The intelligence layer's weekly report proposes decisions; Roheena approves
// them one-tap; its executor runs what it can and HANDS social/content/ad
// decisions to this engine. We consume ONLY founder-approved work and write
// outcomes back so her Monday report closes the loop.
//
// Authorisation model (important): we act only on a decision that carries
// Roheena's approval — either status 'approved', or status 'done' with
// execution_notes marking it "handed to the marketing engine" (the executor
// only reaches that state for decisions she approved). We NEVER act on
// 'proposed' or 'blocked'. Her one-tap approval is the human authorisation for
// any spend/send; the budget ledger bounds the amount. See budget.ts.

import { serviceClient, hasServiceRole } from "./db";

/** The key the intel-layer RPCs are gated by (intel_key_ok). Vercel env. */
export function intelKey(): string | undefined {
  return process.env.INTEL_RPC_KEY || process.env.ADMIN_KEY || undefined;
}

/**
 * The same key, but read from the DATABASE that validates it.
 *
 * Prefer this anywhere a service role is available. The environment copy above
 * drifted out of step with admin_config and silently returned 401 on every run
 * of this job — see lib/elevated-key for the full account. Falls back to the
 * environment so a runtime without a service role behaves as it always did.
 */
export async function intelKeyLive(): Promise<string | undefined> {
  const { elevatedKey } = await import("@/lib/elevated-key");
  return (await elevatedKey()) ?? intelKey();
}

export function intelReady(): boolean {
  return hasServiceRole() && !!intelKey();
}

export type Decision = {
  id: string;
  title: string;
  context: string | null;
  recommendation: string | null;
  impact: string | null;
  urgency: string | null;
  status: string;
  execution_notes: string | null;
};

export const HANDED = "handed to the marketing engine";

// When the engine still has work to do on a decision (a campaign prepared but
// not yet launchable, drafts staged awaiting the arm switch), it marks the
// decision in_progress but MUST keep it in the consumable set so a later tick —
// once credentials/headroom arrive — finishes the job. Re-consumption is keyed
// off the HANDED phrase surviving in the notes, so any "still mine" writeback
// preserves it; terminal writebacks (done/blocked) drop it and the decision
// falls out of the set.
export function stillMineNote(note: string): string {
  return note.toLowerCase().includes(HANDED) ? note : `${note} [${HANDED}]`;
}

// Rough classifiers over the decision text — is this an ADS decision or an
// OUTREACH (customer-send) decision? Kept deliberately conservative.
const ADS_RE = /\b(ad|ads|paid|meta|instagram ad|campaign|traffic test|boost|retarget)/i;
const OUTREACH_RE = /\b(email|whatsapp|outreach|cart[- ]recovery|contact|reach out|message|personally (call|email))/i;

export type DecisionKind = "ads" | "outreach" | "content" | "other";

export function classify(d: Decision): DecisionKind {
  const t = `${d.title} ${d.recommendation ?? ""}`;
  if (ADS_RE.test(t)) return "ads";
  if (OUTREACH_RE.test(t)) return "outreach";
  return "content";
}

/**
 * Founder-approved marketing decisions waiting for this engine. Read via the
 * service-role client (bypasses RLS); we filter to approved/handed only.
 */
export async function approvedMarketingDecisions(): Promise<Decision[]> {
  if (!hasServiceRole()) return [];
  const sb = serviceClient();
  // Consumable = founder-approved, OR handed to us (done/in_progress) with the
  // HANDED phrase still present. Including in_progress lets a decision the engine
  // has captured but not finished (prepared-not-launched, staged-not-sent) be
  // re-attempted each tick until it reaches a terminal state.
  const { data, error } = await sb
    .from("intel_decisions")
    .select("id, title, context, recommendation, impact, urgency, status, execution_notes")
    .or(
      `status.eq.approved,and(status.in.(done,in_progress),execution_notes.ilike.%${HANDED}%)`,
    )
    .order("created_at", { ascending: false })
    .limit(25);
  if (error) return [];
  return (data ?? []) as Decision[];
}

/** Write an outcome back to the decision (via the key-gated RPC). */
export async function markDecision(
  id: string,
  status: "in_progress" | "done" | "blocked",
  notes: string,
): Promise<boolean> {
  const key = await intelKeyLive();
  if (!key || !hasServiceRole()) return false;
  const sb = serviceClient();
  const { error } = await sb.rpc("intel_mark_decision", {
    p_key: key,
    p_id: id,
    p_status: status,
    p_notes: notes,
  });
  return !error;
}

/** Abandoned-cart contacts (with captured email/phone) for outreach decisions. */
/**
 * Claim the right to send outreach to one address, atomically.
 *
 * abandonedCartContacts() returns every open cart, not the carts belonging to
 * one decision — so without this the same person is emailed once per approved
 * decision, twice in a single tick when two are approved. Returns false when
 * they've already been contacted inside the cooldown.
 *
 * Fails CLOSED: if the claim can't be made, we don't send. A missed nudge is
 * cheaper than nagging a customer twice.
 */
export async function claimOutreachSend(email: string, cooldownDays = 30): Promise<boolean> {
  if (!email?.trim() || !hasServiceRole()) return false;
  try {
    const sb = serviceClient();
    const { data, error } = await sb.rpc("claim_outreach_send", {
      p_email: email,
      p_cooldown_days: cooldownDays,
    });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

export async function abandonedCartContacts(): Promise<any[]> {
  const key = await intelKeyLive();
  if (!key || !hasServiceRole()) return [];
  const sb = serviceClient();
  const { data, error } = await sb.rpc("intel_abandoned_cart_contacts", { p_key: key });
  if (error) return [];
  return Array.isArray(data) ? data : [];
}
