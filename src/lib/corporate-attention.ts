import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OsOrderStatus } from "./corporate-os";
import { settledStatus } from "./partner-stage-label";

/**
 * What "needs attention" actually MEANS on a partner order, in one place.
 *
 * The dashboard read and the 24 h escalation sweep both classify the same rows,
 * and if they disagreed a partner would be told one thing while Roheena was
 * mailed another. So the judgement lives here and both call it.
 *
 * Genuinely different situations used to share one label:
 *
 *   · OUR push to the OS failed — the order never reached the printer at all.
 *     Nothing is happening and nothing will until we retry. Owed by us.
 *   · The OS reports needs_input but the job was never approved — auto-print is
 *     off, so it is simply parked awaiting our tick. Nobody is asking anything.
 *     Owed by us.
 *   · The OS reports needs_input on a job that HAD started — production is
 *     genuinely asking a question (artwork, spec, a size that won't fit the
 *     media). Owed by whoever can answer, which is us for a desk-placed order.
 *
 * Telling a partner "our team is on it" without saying which of those, or how
 * long it has been true, is what let VS-000039/40 sit from 6 Aug untouched.
 * Calling the parked case "a question" was worse still: it implied production
 * had inspected the order and found a problem with it, when in fact nobody had
 * looked at it at all.
 */

/**
 * How long something may sit before Roheena is told (Roheena 2026-08-11:
 * "if Savita isn't responding to something, it should have escalated to me
 * within 24 hours"). Shared so the badge that says "overdue" and the sweep that
 * actually mails her can never disagree about what overdue means.
 */
export const ESCALATE_AFTER_HOURS = 24;

/** Re-mail her this often while an order stays stuck, so a long-running problem
 *  doesn't fall silent after one notice. */
export const RE_ESCALATE_AFTER_HOURS = 24;

export type AttentionParty = "zyvorah" | "production";

export type Attention = {
  party: AttentionParty;
  /** One sentence a partner can act on, or at least understand. */
  reason: string;
  /** Short label for the badge. */
  headline: string;
};

/**
 * The OS's status contract (OsOrderStatus) has no reason field — it reports
 * WHAT state a job is in, not why. If it ever starts sending one under any of
 * these keys we surface it verbatim rather than paraphrasing production to a
 * customer. Best-effort by design: absent, we fall back to naming the state.
 */
const REASON_KEYS = ["needsInputReason", "holdReason", "reason", "note", "message"] as const;

function osReason(os: OsOrderStatus | null | undefined): string | null {
  if (!os) return null;
  const bag = os as unknown as Record<string, unknown>;
  for (const k of REASON_KEYS) {
    const v = bag[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/**
 * Has the OS itself already answered a pending cancellation request?
 *
 * 'cancelled' — a director cancelled it (Print Desk or elsewhere on the OS);
 * exactly the outcome the "Stopped it" button on /admin/orders records.
 * 'declined'  — it dispatched anyway; exactly what "Too late — it prints"
 * records. Anything else means the OS hasn't said anything conclusive yet,
 * so the request genuinely is still unanswered.
 */
function osCancelOutcome(os: OsOrderStatus | null | undefined): "cancelled" | "declined" | null {
  if (!os) return null;
  if (os.printStatus === "cancelled") return "cancelled";
  if (os.dispatchedAt) return "declined";
  return null;
}

/**
 * Classify one order. Returns null when nothing is wrong — the caller uses that
 * to CLEAR attention_since, so a resolved order stops reporting a stale age.
 *
 * `row` is the corporate_orders row; only the fields read here are required.
 */
export function classifyAttention(
  row: {
    status?: string | null;
    push_error?: string | null;
    cancel_requested_at?: string | null;
    cancel_resolved_at?: string | null;
  },
  os: OsOrderStatus | null | undefined,
): Attention | null {
  // 1. Never reached production. The most urgent case and the one a partner can
  //    do nothing about — say so plainly instead of implying it is in a queue.
  if (row.status === "push_failed") {
    return {
      party: "zyvorah",
      headline: "Not yet sent to production",
      reason:
        "This did not reach our production system, so nothing is printing yet. " +
        "Our team has to re-send it" +
        (row.push_error ? ` (technical reason: ${row.push_error})` : "") +
        ". You do not need to do anything.",
    };
  }

  // 2. A cancellation nobody has answered. It is on us to confirm or refuse,
  //    and until we do the partner is genuinely in the dark about whether the
  //    piece is still coming.
  //    An ANSWERED request is not attention, whichever way it went: "yes, we
  //    stopped it" and "no, it was already printing" both close the question.
  //    0128 gave the desk a button for that on /admin/orders — but a director
  //    cancelling straight from the OS Print Desk (or the order simply
  //    finishing dispatch) answers exactly the same question, on a different
  //    surface. The OS is the production system of record, so its own
  //    printStatus IS an answer, not merely evidence pointing at one — see
  //    osCancelOutcome(). SHAD-000098 was cancelled at the Print Desk and kept
  //    mailing daily anyway, because this check only recognised dispatchedAt.
  if (row.cancel_requested_at && !row.cancel_resolved_at && !osCancelOutcome(os)) {
    return {
      party: "zyvorah",
      headline: "Cancellation awaiting confirmation",
      reason:
        "You asked us to cancel this. Our team has to confirm whether it can still be stopped — " +
        "it may already be on the printer.",
    };
  }

  // 3. The OS says needs_input. Two very different situations wear that one
  //    status, and they owe the partner opposite things:
  //
  //      · Never approved — auto-print is off, so EVERY portal-placed order
  //        lands here the moment it arrives and waits for one of us to tick
  //        "Approve & print". Production is not asking anything; we simply
  //        have not released it yet.
  //      · Approved, then held — production actually started on it and has
  //        stopped mid-job needing an answer.
  //
  //    Both used to read "Production has a question", which told a partner we
  //    were waiting on THEM when the ball had never left our desk.
  if (os?.printStatus === "needs_input") {
    // Same "did this ever move" test firstStuckAt() uses, so the badge and the
    // clock can never disagree about whether an order has progressed.
    const everStarted = Boolean(os.approvedAt || os.printingAt || os.printedAt);

    if (!everStarted) {
      // Deliberately does NOT surface osReason() here. The OS's own wording for
      // this state names the internal flag ("Auto-print is OFF
      // (zyvorah.website.auto_print=false) — parked for a human tick"), which is
      // meaningless to a partner and leaks config. The state is fully described
      // without it.
      return {
        party: "zyvorah",
        headline: "Waiting for approval in portal to print",
        reason:
          "Production is waiting for confirmation on the portal before this can print. " +
          "Our team has to approve it — you do not need to do anything.",
      };
    }

    // Genuinely held mid-job. Quote production if they told us why; otherwise be
    // honest that we know it is held but not the detail.
    const said = osReason(os);
    return {
      party: "production",
      headline: "Production has a question",
      reason: said
        ? `Production has paused this and asked: ${said}`
        : "Production has paused this and needs something confirmed before it can print — " +
          "usually the artwork, or a size against the media width. Our team is chasing the detail.",
    };
  }

  return null;
}

/** Whole hours an order has been waiting, or null if it isn't. */
export function hoursWaiting(attentionSince: string | null | undefined, now = Date.now()): number | null {
  if (!attentionSince) return null;
  const t = Date.parse(attentionSince);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now - t) / 3_600_000));
}

/** "3 days" / "31 hours" / "just now" — for both the card and the mail. */
export function waitingLabel(hours: number | null): string | null {
  if (hours == null) return null;
  if (hours < 1) return "just now";
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${Math.floor(hours / 24)} days`;
}

/**
 * When did this order ACTUALLY start being stuck?
 *
 * Normally "first time we noticed" is the honest answer. But an order for which
 * production has recorded no milestone at all — not approved, not printing, not
 * printed, never dispatched — has been waiting since it was placed, and stamping
 * it with `now` on our first sweep would restart a clock that has really been
 * running for days. That is not academic: VS-000039/40 sat needing attention
 * from 6 Aug, and because their reason lives in the OS (not in our row) migration
 * 0088's backfill could not see them. Seeding from `now` would have deferred
 * Roheena's escalation by a further 24 h on orders already four days late.
 *
 * Once ANY milestone exists the order demonstrably progressed, so a later stall
 * is genuinely new and is measured from when we saw it.
 */
export function firstStuckAt(
  row: { created_at?: string | null },
  os: OsOrderStatus | null | undefined,
  nowIso: string,
): string {
  const progressed = os?.approvedAt || os?.printingAt || os?.printedAt || os?.labelReleasedAt || os?.dispatchedAt;
  if (progressed) return nowIso;
  return row.created_at || nowIso;
}

/**
 * Persist the classification for a batch of rows: stamp attention_since on
 * first sight, refresh the reason, and clear everything when it resolves.
 *
 * `attention_since` is only ever SET when previously null, never bumped — the
 * age has to reflect when the problem started, not when we last looked, or the
 * escalation could be deferred forever by frequent polling.
 *
 * Never throws: a dashboard read must not fail because a bookkeeping write did.
 */
export async function syncAttention(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: SupabaseClient<any, "public", any>,
  rows: Array<{
    id: string;
    status?: string | null;
    push_error?: string | null;
    cancel_requested_at?: string | null;
    cancel_resolved_at?: string | null;
    created_at?: string | null;
    attention_since?: string | null;
    attention_reason?: string | null;
    attention_party?: string | null;
  }>,
  statuses: Record<number, OsOrderStatus>,
  osIdOf: (row: { id: string }) => number | null,
): Promise<void> {
  const nowIso = new Date().toISOString();
  await Promise.all(
    rows.map(async (row) => {
      const osId = osIdOf(row);
      const os = osId != null ? statuses[osId] : null;
      const a = classifyAttention(row, os);
      try {
        // The OS may have already answered a still-open cancellation request
        // on its own surface — a director cancelling at the Print Desk, or the
        // order simply dispatching — without anyone touching the "Cancellation
        // requests" queue on /admin/orders. That queue (admin_cancellations_list,
        // 0128) lists any row with cancel_requested_at set and cancel_resolved_at
        // still null, so leaving this unwritten would keep the row sitting
        // there "unanswered" forever even once the mail stops. Record it the
        // same way admin_resolve_cancellation would, so both surfaces agree the
        // question is closed.
        if (row.cancel_requested_at && !row.cancel_resolved_at) {
          const outcome = osCancelOutcome(os);
          if (outcome) {
            await sb.from("corporate_orders").update({
              cancel_resolved_at: nowIso,
              cancel_outcome: outcome,
              cancel_resolved_by: "OS (auto)",
              attention_since: null,
              attention_party: null,
              attention_reason: null,
              escalated_at: null,
            }).eq("id", row.id);
            return;
          }
        }
        if (a) {
          // Same problem, same wording, already stamped → nothing to write.
          if (row.attention_since && row.attention_reason === a.reason && row.attention_party === a.party) return;
          await sb.from("corporate_orders").update({
            attention_since: row.attention_since ?? firstStuckAt(row, os, nowIso),
            attention_party: a.party,
            attention_reason: a.reason,
          }).eq("id", row.id);
        } else if (row.attention_since) {
          // Resolved — drop the clock AND the escalation stamp, so if it ever
          // goes wrong again it escalates afresh rather than staying silent.
          await sb.from("corporate_orders").update({
            attention_since: null,
            attention_party: null,
            attention_reason: null,
            escalated_at: null,
          }).eq("id", row.id);
        }
      } catch {
        /* bookkeeping only — never break the caller */
      }
    }),
  );
}

/**
 * Remember on our own row every wall the OS has finished (dispatched, closed,
 * archived or cancelled), written once when it changes. The dashboard and the
 * attention sweep both call it with the statuses they just fetched, so a
 * finished wall leaves the live statuses even if nobody opens the portal.
 */
export async function rememberSettled(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: SupabaseClient<any, "public", any>,
  rows: Array<{ id: string; status?: string | null; os_order_id?: unknown }>,
  statuses: Record<number, OsOrderStatus>,
): Promise<Map<string, string>> {
  const changed = new Map<string, string>();
  for (const row of rows) {
    const os = typeof row.os_order_id === "number" ? statuses[row.os_order_id] : null;
    const next = settledStatus(os);
    if (next && row.status !== next && row.status !== "draft") changed.set(row.id, next);
  }
  await Promise.all([...changed].map(async ([id, status]) => {
    const { error } = await sb.from("corporate_orders").update({ status }).eq("id", id);
    if (error) {
      changed.delete(id);
      console.error("[corporate] could not remember a finished wall:", id, error.message);
    }
  }));
  return changed;
}
