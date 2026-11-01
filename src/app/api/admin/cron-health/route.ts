import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { staffKey } from "@/lib/staff-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// S1.10 — the alerting half of the cron heartbeat.
//
// cron_runs records every tick; this turns that into an answer to the only
// question that matters: "has anything quietly stopped working?" The engine
// failed silently for 29 days on ffmpeg, was fixed, then died again at module
// load for two more days. Both times the data to notice existed somewhere and
// nothing looked at it.
//
// Each job declares how often it SHOULD succeed. Silence beyond that is an
// alert, not a gap in a chart. Read-only, staff-gated like every other
// admin surface.

// Expected cadence per job, from vercel.json. A job absent from this map still
// reports, but cannot raise a staleness alert — better to under-alert on an
// unknown job than to invent a threshold for it.
// Every cadence here must match cron-worker/wrangler.jsonc + worker.mjs.
// A job MISSING from this map can never be flagged stale (see `expected !==
// undefined` below), so cron-heartbeat.test.ts asserts the map covers every
// job the worker schedules.
const EXPECTED_INTERVAL_HOURS: Record<string, number> = {
  // The LONGEST normal gap between two runs, not the average: twice-a-day
  // jobs (founder, 9 Oct 2026) wait 18h overnight from 14:00 to 08:00.
  // every 2 minutes ("*/2 * * * *")
  "studio-drain": 2 / 60,
  // every 10 minutes ("*/10 * * * *")
  "site-batch-drive": 10 / 60,
  "partner-release": 10 / 60,
  "sentinel": 10 / 60, // a failing tick here IS the alert: the engine or the OS is down
  // hourly 09:30–18:30 IST ("0 4-13 * * *"): 18:30 → 09:30 overnight
  "stalled-checkouts": 15,
  "cart-followups": 15,
  "launch-mail": 15,
  // posting times 11:30, 17:30 ("0 6,12 * * *") and 20:30 ("0 15 * * *")
  "marketing": 18, // 17:30 → 11:30
  "marketing-publish": 24, // once, 20:30
  // marketing-week: retired 26 Sep 2026 (marketing composes on demand only),
  // so it is deliberately absent — listing it here raised a permanent alert.
  // 08:00 and 14:00 IST ("30 2 * * *", "30 8 * * *"): 14:00 → 08:00 overnight
  "corporate-attention": 18,
  "portfolio-attention": 18,
  "trade-payouts": 18,
  "outreach-inbox": 18,
  "site-films": 18,
  "instagram-daily": 18,
  "voice-followups": 18, // dials only inside Mon–Sat 10:30–19:30 IST
  // 14:00 IST Monday–Saturday ("30 8 * * MON-SAT"): Saturday → Monday
  "review-request": 48,
  "execute-decisions": 48,
  "ads-invite": 48,
  "optin-notice": 48,
  "sample-nurture": 48,
  // daily, 08:00 IST
  "daily-report": 24,
  // quotation-desk: on demand only since 11 Oct 2026, so deliberately absent —
  // an expected interval here would raise a permanent alert.
  "link-check": 24,
  "linkedin": 24,
  // weekly
  "newsletter": 24 * 7,
  "weekly-intel": 24 * 7,
  // Not fired by the cron worker — the analytics-snapshot GitHub Action calls
  // it at 08:10 IST. Listed here anyway: the failure mode is silence, and the
  // agent that reads the file it produces will happily read a stale one.
  "analytics-snapshot": 24,
};

// How many missed cycles before it counts as broken. Generous by design: a
// single skipped tick is noise, three in a row is a fault.
const TOLERANCE = 3;

type HealthRow = {
  job: string;
  last_start: string | null;
  last_success: string | null;
  hours_since_success: number | null;
  runs_7d: number;
  failures_7d: number;
  last_error: string | null;
};

export async function GET(req: Request) {
  const key = await staffKey(req);
  if (!key) return NextResponse.json({ error: "missing_key" }, { status: 400 });

  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ error: "service_unavailable" }, { status: 503 });

  const { data: ok, error: authErr } = await admin.rpc("admin_key_ok", { p_key: key });
  if (authErr || !ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await admin.from("cron_health").select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const seen = new Set((data ?? []).map((r: HealthRow) => r.job));
  const jobs = (data ?? []).map((r: HealthRow) => {
    const expected = EXPECTED_INTERVAL_HOURS[r.job];
    const hrs = r.hours_since_success;
    // Never succeeded at all is its own state — an unknown "hours since" must
    // not read as healthy.
    const neverSucceeded = r.last_success === null;
    const stale =
      expected !== undefined &&
      (neverSucceeded || (hrs !== null && hrs > expected * TOLERANCE));
    return {
      ...r,
      expectedIntervalHours: expected ?? null,
      neverSucceeded,
      stale,
      state: stale ? "alert" : r.failures_7d > 0 ? "degraded" : "ok",
    };
  });

  // A job that has NEVER written a run row is invisible to the view entirely —
  // the most dangerous case, and exactly what marketing looked like this
  // morning. Report it explicitly rather than letting absence read as silence.
  const missing = Object.keys(EXPECTED_INTERVAL_HOURS)
    .filter((j) => !seen.has(j))
    .map((job) => ({
      job,
      state: "alert" as const,
      neverSucceeded: true,
      note: "no run row ever recorded — the route may be failing at module load",
    }));

  const alerts = [...jobs.filter((j) => j.stale), ...missing];

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    healthy: alerts.length === 0,
    alertCount: alerts.length,
    alerts,
    jobs: [...jobs].sort((a, b) => a.job.localeCompare(b.job)),
    missing,
  });
}
