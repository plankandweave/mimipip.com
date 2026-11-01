// The weekly letter's sender: bounded, resumable, never twice.
//
// On 8 October 2026 the Thursday run mailed the audience one by one inside a
// single request, wrote each ledger row AFTER the mail, and was killed 76
// seconds in — 215 of 563 sent, nobody to pick it up, and no way to re-run it
// safely (a mail sent in the instant before the kill had no row). 16 September
// died the same way at 247.
//
// So, per request:
//   1. claim a small batch in the database first (`newsletter_claim_batch`
//      writes a 'sending' row per person under a lock — two runs can never
//      hold the same person);
//   2. send each with a Resend Idempotency-Key per issue and address, so the
//      retry of a claim a dead run left behind cannot deliver a second copy;
//   3. record 'sent' / 'failed' on the claimed row;
//   4. stop at the time budget, or the moment the mail window closes, and let
//      the ten-minute cron (`?resume=1`) carry on where this stopped.
// This module is the loop; the route supplies the database and the mailer.

import { inShopperMailWindow } from "./lead-rules";

export type Claimed = { email: string; name: string | null; unsubscribe_token: string; retry: boolean };

export type SendDeps = {
  claim: (limit: number) => Promise<Claimed[]>;
  send: (r: Claimed, idempotencyKey: string) => Promise<{ ok: boolean; id: string | null }>;
  record: (email: string, ok: boolean, resendId: string | null) => Promise<void>;
  now?: () => number;
};

export type BatchResult = {
  sent: number;
  failed: number;
  /** Why the loop ended: nobody left, out of time, or outside working hours. */
  stopped: "done" | "budget" | "window";
};

/** People claimed per database round-trip. Small, so a killed request strands
 *  at most this many claims (and those are retried ten minutes later). */
export const CLAIM_BATCH = 25;
/** Wall-clock a single request may spend sending. Well inside anything the
 *  Worker or the cron dispatcher allows; 568 people take ~3½ minutes, so a
 *  full issue finishes over a few ticks rather than in one long request. */
export const SEND_BUDGET_MS = 60_000;

/** One key per issue and address: Resend returns the original send for a
 *  repeated key (24 h), which is what makes a retry safe. */
export function newsletterIdempotencyKey(issueId: string, email: string): string {
  return `newsletter/${issueId}/${email.trim().toLowerCase()}`;
}

export async function sendInBatches(
  deps: SendDeps,
  opts: { budgetMs?: number; batch?: number; inWindow?: (now: Date) => boolean; issueId: string },
): Promise<BatchResult> {
  const now = deps.now ?? Date.now;
  const inWindow = opts.inWindow ?? inShopperMailWindow;
  const budget = opts.budgetMs ?? SEND_BUDGET_MS;
  const started = now();
  let sent = 0;
  let failed = 0;

  for (;;) {
    if (!inWindow(new Date(now()))) return { sent, failed, stopped: "window" };
    if (now() - started >= budget) return { sent, failed, stopped: "budget" };
    const claimed = await deps.claim(opts.batch ?? CLAIM_BATCH);
    if (!claimed.length) return { sent, failed, stopped: "done" };
    for (const r of claimed) {
      // A claim not sent here stays 'sending' and is retried by the next
      // tick under the same key — never lost, never doubled.
      if (!inWindow(new Date(now()))) return { sent, failed, stopped: "window" };
      const { ok, id } = await deps.send(r, newsletterIdempotencyKey(opts.issueId, r.email));
      if (ok) sent += 1;
      else failed += 1;
      await deps.record(r.email, ok, id);
    }
  }
}

/** Render the letter ONCE and stamp each person's unsubscribe token into it:
 *  the template is the same for everyone but that link, and rendering it per
 *  recipient spent the request's CPU on 568 identical documents. */
export const UNSUB_PLACEHOLDER = "ZYVORAH_UNSUBSCRIBE_TOKEN";

export function personalise(rendered: string, token: string): string {
  return rendered.split(UNSUB_PLACEHOLDER).join(encodeURIComponent(token));
}
