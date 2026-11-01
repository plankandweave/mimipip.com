/**
 * What the Instagram post ledger means, as sentences the brief can say.
 *
 * Database-free so the claims can be tested directly — the repo splits this way
 * for the marketing digest (digest-web.ts) and the approval rules (approval.ts),
 * for the same reason. `brief-blocks.ts` does the reading and calls in here.
 *
 * Two of the claims are strong enough to need a test behind them, because both
 * assert something about the FUTURE in an email a founder will act on:
 * "Instagram will stay quiet" and "this channel has never published a post".
 */

/* ────────────────────────────── instagram ───────────────────────────────── */

export type SocialBlock = {
  available: boolean;
  publishedYesterday: number;
  /** Composed, passed the safety gate, and waiting for a human to say yes.
   *  This is the number that quietly becomes a stalled channel. */
  awaitingReview: number;
  /** Approved and simply waiting for its day to come round. Healthy. */
  approvedWaiting: number;
  /** Failed the brand-safety gate. These cannot be approved at all — they can
   *  only be rewritten — so they never drain on their own. */
  blocked: number;
  /** Unapproved posts whose day has already gone. No check can pass them (a
   *  post needs a current date) and nothing will publish them, so they are not
   *  "blocked by production work" — they are days that went by. */
  missedDays: number;
  /** Publishing failures from yesterday onward. An older failure cannot be
   *  retried (the publisher retries a slot on its own day only), so counting
   *  it reported the same 28 September Story as "1 failed" every morning. */
  failed: number;
  /** The oldest thing waiting for review, in days. A queue is only a problem
   *  once it is old. */
  oldestWaitingDays: number | null;
  /** Slots turned down. This is the one the brief must not report as a bare
   *  zero somewhere else: a declined day still OCCUPIES its slot, because the
   *  ledger allows one live row per slot, so the engine can never compose a
   *  replacement for it. Decline a week and Instagram is dark for that week
   *  with nothing left to approve and no error anywhere. */
  declined: number;
  /** Declined slots that are still in the future — the days that will pass
   *  silently unless something changes. */
  declinedAhead: number;
  /** True when every remaining day the engine plans for has been declined, so
   *  there is nothing queued, nothing waiting, and nothing coming. */
  horizonFullyDeclined: boolean;
  /** Has this channel ever published, once? A queue that has never produced a
   *  single post means the publishing path itself is unproven. */
  everPublished: boolean;
  /** Creator/press pitches on the Collabs tab of the desk, undecided. They no
   *  longer email her one by one (27 Sep 2026); this line is how she hears. */
  collabsWaiting: number;
  error: string | null;
};

/** A marketing_posts row as PostgREST hands it back. */
export type RawPostRow = {
  review_ready?: boolean;
  review_hold?: string | null;
  status?: unknown;
  safety_passed?: unknown;
  approved_at?: unknown;
  regenerate_requested_at?: unknown;
  published_at?: unknown;
  slot_key?: unknown;
  created_at?: unknown;
};

const slotDayOf = (slotKey: unknown) => String(slotKey ?? "").split("#")[0];

/**
 * Turn the post ledger into the sentences the brief can say, as a pure function
 * so the claims can be tested. Two of them are strong enough to deserve that:
 * "Instagram will stay quiet" and "this channel has never published".
 */
export function summariseSocial(rows: RawPostRow[], dateKey: string): SocialBlock {
  const publishedYesterday = rows.filter(
    (r) => r.status === "published" && String(r.published_at ?? "").slice(0, 10) === dateKey,
  ).length;

  const waiting = rows.filter(
    (r) => r.review_ready === true && r.status === "queued" && r.safety_passed && !r.approved_at && !r.regenerate_requested_at,
  );
  const approvedWaiting = rows.filter((r) => r.status !== "published" && r.approved_at).length;
  const unapproved = rows.filter((r) => r.status === "queued" && !r.approved_at && !r.regenerate_requested_at);
  const blocked = unapproved.filter((r) => slotDayOf(r.slot_key) > dateKey && (r.safety_passed === false || !!r.review_hold)).length;
  const missedDays = unapproved.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(slotDayOf(r.slot_key)) && slotDayOf(r.slot_key) <= dateKey).length;
  const failed = rows.filter((r) => r.status === "failed" && slotDayOf(r.slot_key) >= dateKey).length;
  const everPublished = rows.some((r) => r.status === "published");

  // A declined slot is not a no-op. The ledger permits one live row per slot, so
  // a declined day keeps its place and the engine cannot compose anything to
  // replace it. Declining is a decision about that DAY, not about that post, and
  // it is invisible unless the brief names it.
  const declinedRows = rows.filter((r) => r.status === "skipped");
  const declinedAhead = declinedRows.filter((r) => slotDayOf(r.slot_key) >= dateKey).length;

  // Nothing published, nothing approved, nothing awaiting — and days ahead
  // already spoken for by declines. A channel that will stay silent with no
  // error anywhere to say so.
  const horizonFullyDeclined = declinedAhead > 0 && waiting.length === 0 && approvedWaiting === 0;

  let oldest: number | null = null;
  for (const r of waiting) {
    const day = slotDayOf(r.slot_key) || String(r.created_at ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const age = Math.floor((Date.parse(`${dateKey}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000);
    if (age >= 0 && (oldest == null || age > oldest)) oldest = age;
  }

  return {
    available: true,
    publishedYesterday,
    awaitingReview: waiting.length,
    approvedWaiting,
    blocked,
    missedDays,
    failed,
    oldestWaitingDays: oldest,
    declined: declinedRows.length,
    declinedAhead,
    horizonFullyDeclined,
    everPublished,
    collabsWaiting: 0,
    error: null,
  };
}

