import { NextResponse } from "next/server";
import { withCronRun } from "@/lib/cron-run";
import { sendEmail } from "@/lib/email";
import {
  AI_ACCOUNT_WINDOW_MS,
  aiAccountMail,
  decide,
  downLine,
  mailsFor,
  probe,
  SENTINEL_TICK_STATUSES,
  TARGETS,
  type FailedRun,
  type PastTick,
} from "@/lib/health-sentinel";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sweepCronRuns } from "@/lib/cron-sweep";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Every ten minutes: are the print engine and the Magnitude OS answering?
 * The rules for what reaches Roheena are in src/lib/health-sentinel.ts.
 *
 * A tick that finds something down THROWS "DOWN: engine". withCronRun writes
 * that to cron_runs.error — which is both this job's memory (the next tick
 * reads it back) and what makes an outage show on /api/admin/cron-health.
 *
 * Auth: the cron worker sends `Authorization: Bearer <CRON_SECRET>`.
 */
// One approver, one inbox. Deliberately not configurable.
const ALERT_TO = "roheena@plankandweave.com";

async function handler(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  const admin = supabaseAdmin();
  // Sweep before slow network probes: a killed probe must not starve cleanup.
  // Keep probing services if cleanup fails, but record the failure on this tick.
  let died = 0;
  let sweepError: unknown;
  try {
    if (!admin) throw new Error("cron sweep failed: ledger unavailable");
    died = await sweepCronRuns(admin);
  } catch (error) {
    sweepError = error;
    console.error("sentinel cron sweep failed", error);
  }
  const results = await Promise.all(TARGETS.map((t) => probe(t, fetch)));
  const down = results.filter((r) => !r.ok).map((r) => r.key);

  // This job's finished ticks, newest first. Without the ledger there is no
  // memory, so nothing can be called "two ticks running": say so and stop
  // rather than mail her every ten minutes.
  let past: PastTick[] | null = null;
  if (admin) {
    const { data, error } = await admin
      .from("cron_runs")
      .select("started_at,error")
      .eq("job", "sentinel")
      .not("finished_at", "is", null)
      // Only ticks that actually probed: 200 (all up) or 500 (the DOWN throw).
      // withCronRun also records a 401 for anyone who hits this URL without
      // the secret; read as "it was up", a stray request would reset a
      // down-streak and silence the alert.
      .in("status", SENTINEL_TICK_STATUSES)
      .order("started_at", { ascending: false })
      .limit(200);
    if (!error) past = (data ?? []) as PastTick[];
  }

  let mailed = 0;
  if (past) {
    const now = new Date().toISOString();
    for (const m of mailsFor(decide(down, past, now), results, now)) {
      if (await sendEmail({ to: ALERT_TO, subject: m.subject, html: m.html, idempotencyKey: m.idempotencyKey })) mailed++;
    }
  }

  // The AI account: any other job's failed run in the last half hour whose
  // reason is the key or the credit, not the item (see health-sentinel.ts).
  if (admin) {
    const since = new Date(Date.now() - AI_ACCOUNT_WINDOW_MS).toISOString();
    const { data, error } = await admin
      .from("cron_runs")
      .select("job,started_at,error")
      .neq("job", "sentinel")
      .eq("status", 500)
      .gte("started_at", since)
      .order("started_at", { ascending: false })
      .limit(100);
    if (error) console.error("sentinel could not read failed runs", error);
    const m = aiAccountMail((data ?? []) as FailedRun[], new Date().toISOString());
    if (m && (await sendEmail({ to: ALERT_TO, subject: m.subject, html: m.html, idempotencyKey: m.idempotencyKey }))) mailed++;
  }

  if (down.length) throw new Error(downLine(down));
  if (sweepError) throw sweepError;
  return NextResponse.json({ ok: true, checked: results.length, mailed, died, memory: past !== null });
}

export const GET = withCronRun("sentinel", handler);
