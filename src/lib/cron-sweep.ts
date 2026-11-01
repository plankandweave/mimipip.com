import type { SupabaseClient } from "@supabase/supabase-js";

export const CRON_STALE_MS = 30 * 60 * 1000;
export const CRON_DIED_STATUS = 504;

/** Atomic conditional update: a completed run is never rewritten. A late
 * completion also cannot erase the timeout recorded here (see cron-run.ts).
 * Runs on every authenticated sentinel tick, independent of random pruning.
 */
export async function sweepCronRuns(client: SupabaseClient, now = new Date()): Promise<number> {
  const { count, error } = await client.from("cron_runs")
    .update({
      finished_at: now.toISOString(),
      ok: false,
      status: CRON_DIED_STATUS,
      error: "DIED: no completion recorded within 30 minutes (runtime kill or timeout suspected)",
    }, { count: "exact" })
    .is("finished_at", null)
    .is("ok", null)
    .lt("started_at", new Date(now.getTime() - CRON_STALE_MS).toISOString());
  if (error) throw new Error(`cron sweep failed: ${error.message}`);
  return count ?? 0;
}
