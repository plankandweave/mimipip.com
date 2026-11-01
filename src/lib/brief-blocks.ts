import { fetchReviewLedger } from "@/lib/marketing/review-queue";
/**
 * The two marketing channels the morning brief could not see, and the list of
 * things waiting on the founder.
 *
 * The 08:00 mail already reported PAID traffic well (lib/ad-channels.ts: Google
 * Ads, Meta, ChatGPT, other). It reported nothing about the two channels that
 * cost no money and carry the brand:
 *
 *   - ORGANIC SEARCH — what Google sends us for free. It is the slowest and
 *     most durable channel, so it is read over a week, never a day: one day's
 *     organic number is noise and inviting a founder to react to it is a
 *     disservice.
 *   - INSTAGRAM — what the marketing engine actually posted, and what it is
 *     holding. The engine can compose a perfect week and publish none of it,
 *     because nothing publishes without approval. That silence was invisible
 *     from the inbox, which is exactly how a queue grows for a month unnoticed.
 *
 * And WAITING ON YOU: the engine's queue plus anything else that stops until a
 * human decides. It is deliberately a count with a link, not a list — the
 * decision is made on the desk, where the picture is.
 *
 * Every function here fails soft and says so. A GA outage must degrade one
 * block of the brief, never stop the brief being sent.
 */

import { supabaseAdmin } from "@/lib/supabase-admin";
import { summariseSocial, type RawPostRow, type SocialBlock } from "@/lib/social-summary";
import { fetchGaSeoWindow, gaReportingConfigured, type GaSeoWindow } from "@/lib/ga-data";
import { fetchSearchWindow, searchConsoleConfigured, type SearchConsoleWindow } from "@/lib/search-console";

/* ───────────────────────────── organic search ───────────────────────────── */

export type OrganicBlock = {
  configured: boolean;
  /** null when GA is configured but the call failed — distinct from "no data". */
  window: GaSeoWindow | null;
  organicSessions: number;
  /** Trailing 7 days before the reported week. Derived by subtracting the 7-day
   *  window from the 14-day window, which is exact for totals. */
  priorOrganicSessions: number | null;
  topLanding: { path: string; sessions: number; bounceRate: number }[];
  /** The words people typed, from Search Console. null means we could not read
   *  it — which the brief must present as "not read", never as zero. A real
   *  zero would say nobody found us on Google, a very different and much more
   *  alarming thing to tell a founder. */
  search: SearchConsoleWindow | null;
  searchConfigured: boolean;
  error: string | null;
};

const ORGANIC_CHANNELS = ["organic search", "organic shopping"];

function organicOf(w: GaSeoWindow | null): number {
  if (!w) return 0;
  return w.channels
    .filter((c) => ORGANIC_CHANNELS.includes(c.channel.trim().toLowerCase()))
    .reduce((n, c) => n + c.sessions, 0);
}

/**
 * Organic search over the last 7 days, with the 7 before it for direction.
 *
 * NOTE ON WHAT THIS IS NOT: these are SESSIONS, not search queries. Google
 * Search Console is the only source of the words people typed, and nothing in
 * this codebase talks to it — the Analytics service account has no Search
 * Console grant. Until it does, the brief reports how much organic traffic
 * arrived and where it landed, and says plainly that the queries are unknown
 * rather than implying these numbers are search terms.
 */
export async function fetchOrganic(): Promise<OrganicBlock> {
  if (!gaReportingConfigured()) {
    return {
      configured: false,
      window: null,
      organicSessions: 0,
      priorOrganicSessions: null,
      topLanding: [],
      search: null,
      searchConfigured: searchConsoleConfigured(),
      error: null,
    };
  }
  try {
    // Search Console runs beside Analytics, not after it: it is a separate
    // Google API on a separate scope, and one being down must not hide the
    // other's numbers.
    const [week, fortnight, search] = await Promise.all([
      fetchGaSeoWindow(7),
      fetchGaSeoWindow(14),
      fetchSearchWindow(7, 8),
    ]);
    const organic = organicOf(week);
    const both = organicOf(fortnight);
    // Exact for totals: the 14-day window contains the 7-day one.
    const prior = fortnight && week ? Math.max(0, both - organic) : null;
    return {
      configured: true,
      window: week,
      organicSessions: organic,
      priorOrganicSessions: prior,
      topLanding: (week?.landingPages ?? []).slice(0, 5),
      search,
      searchConfigured: searchConsoleConfigured(),
      error: week ? null : "Google Analytics did not answer the organic query",
    };
  } catch (e) {
    return {
      configured: true,
      window: null,
      organicSessions: 0,
      priorOrganicSessions: null,
      topLanding: [],
      search: null,
      searchConfigured: searchConsoleConfigured(),
      error: e instanceof Error ? e.message : "unknown error",
    };
  }
}

export type { SocialBlock } from "@/lib/social-summary";
export { summariseSocial, type RawPostRow } from "@/lib/social-summary";

export async function fetchSocial(dateKey: string): Promise<SocialBlock> {
  const db = supabaseAdmin();
  const empty: SocialBlock = {
    available: false,
    publishedYesterday: 0,
    awaitingReview: 0,
    approvedWaiting: 0,
    blocked: 0,
    missedDays: 0,
    failed: 0,
    oldestWaitingDays: null,
    declined: 0,
    declinedAhead: 0,
    horizonFullyDeclined: false,
    everPublished: false,
    collabsWaiting: 0,
    error: null,
  };
  if (!db) return { ...empty, error: "no service-role key configured" };

  try {
    const data = await fetchReviewLedger(db);
    const summary = summariseSocial(data, dateKey);
    // Best-effort: a failure here must not cost the Instagram numbers.
    const { count } = await db
      .from("outreach_inquiries")
      .select("id", { count: "exact", head: true })
      .in("status", ["new", "checked"]);
    return { ...summary, collabsWaiting: count ?? 0 };
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : "unknown error" };
  }
}
