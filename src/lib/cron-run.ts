import { backendUrl, MIMIPIP_SCHEMA } from "@/brand/backend";
import { serviceAvailable } from "../brand/services";
// S1.10 heartbeat — wraps a cron route handler so every tick writes a run row
// (start, finish, ok/status/error). The lesson behind it: this repo's marketing
// cron failed silently for 29 days, was fixed, then went silent again for two
// days — both times nothing recorded that the job had stopped succeeding.
//
// Invariants:
//  - The heartbeat must NEVER break the job. Every ledger write is best-effort;
//    if the service role is absent or an insert fails, the job still runs.
//  - A throw inside the handler is recorded (ok=false, the message) and
//    surfaced as a 500, so Vercel's own log shows it too.
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@/brand/database-types";

let cached: SupabaseClient | null = null;
function db(): SupabaseClient | null {
  if (!serviceAvailable("database")) return null;
  const url = backendUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  cached ??= createClient(url, key, { auth: { persistSession: false }, db: { schema: MIMIPIP_SCHEMA } });
  return cached;
}

export function withCronRun(
  job: string,
  handler: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const client = db();
    let runId: string | null = null;
    if (client) {
      try {
        const { data } = await client.from("cron_runs").insert({ job }).select("id").single();
        runId = data?.id ?? null;
      } catch {
        /* heartbeat must never break the job */
      }
      // Opportunistic prune, ~1% of ticks — keeps the minutely jobs from
      // growing the table without a dedicated cleanup cron.
      if (Math.random() < 0.01) void client.rpc("prune_cron_runs").then(() => {}, () => {});
    }
    const finish = async (ok: boolean, status: number, error?: string) => {
      console.info(JSON.stringify({ event: "cron.finish", job, runId, ok, status }));
      if (!client || !runId) return;
      try {
        await client
          .from("cron_runs")
          .update({ finished_at: new Date().toISOString(), ok, status, error: error ?? null })
          .eq("id", runId)
          .is("finished_at", null);
      } catch {
        /* best-effort */
      }
    };
    console.info(JSON.stringify({ event: "cron.start", job, runId }));
    try {
      const res = await handler(req);
      await finish(res.status < 400, res.status);
      return res;
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      await finish(false, 500, msg.slice(0, 2000));
      return new Response(JSON.stringify({ error: "cron failed", job }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
  };
}
