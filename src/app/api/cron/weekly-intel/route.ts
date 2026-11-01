import { NextResponse } from "next/server";
import { elevatedKey, intelKeyOk } from "@/lib/elevated-key";
import { currentStaff } from "@/lib/staff-access";
import { withCronRun } from "@/lib/cron-run";
import { supabase } from "@/lib/supabase";
import { sendEmail } from "@/lib/email";
import {
  computeMetrics,
  analyzeWeek,
  fallbackAnalysis,
  reportMarkdown,
  reportEmailHtml,
  type DecisionTokens,
  type FilmWeek,
  type Snapshot,
} from "@/lib/intel";
import { hasServiceRole, serviceClient } from "@/lib/marketing/db";
import { filmHeadline } from "@/lib/site-films";

export const runtime = "nodejs";

async function filmsThisWeek(days: number): Promise<FilmWeek[]> {
  if (!hasServiceRole()) return [];
  try {
    const db = serviceClient();
    const { data: stats, error } = await db.rpc("marketing_film_stats", { p_days: days });
    if (error || !stats?.length) return [];
    type Stat = { film_id: string; plays: number; sound: number; completes: number; carts: number };
    const { data: films } = await db.from("marketing_asset_library").select("id,title,site_kind,site_handle").in("id", (stats as Stat[]).map((s) => s.film_id));
    const byId = new Map(((films ?? []) as { id: string; title: string; site_kind: string | null; site_handle: string | null }[]).map((f) => [f.id, f]));
    return (stats as Stat[])
      .map((s) => {
        const f = byId.get(s.film_id);
        return {
          title: f ? filmHeadline(f.title) : s.film_id,
          page: f?.site_kind && f.site_handle ? `${f.site_kind}/${f.site_handle}` : null,
          plays: Number(s.plays), sound: Number(s.sound), completes: Number(s.completes), carts: Number(s.carts),
        };
      })
      .sort((a, b) => b.plays - a.plays);
  } catch (e) {
    console.error("[intel] film stats failed:", (e as Error).message);
    return [];
  }
}
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// The weekly intelligence run (Mondays, vercel.json crons): pull the last 7
// days of everything the store observed, have Claude turn it into insight and
// founder decisions, store the report, and email it.
//
// Auth, either of:
//   - Authorization: Bearer <CRON_SECRET>   (Vercel cron) — then INTEL_RPC_KEY
//     env is used as the DB key
//   - x-intel-key: <key>                    (machine run) — COMPARED against
//     the key admin_config holds before any work starts, and gated again by
//     intel_key_ok() inside every RPC below
//   - a staff Google sign-in                (the "generate it now" button on
//     /admin). That button used to send the admin key from the browser; there
//     is no key in the browser any more, so the sign-in is what authorises it.
// Optional: ?email=0 skips the email (dry run), ?days=N changes the window.
async function tick(req: Request) {
  const url = new URL(req.url);
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const viaCron = !!cronSecret && auth === `Bearer ${cronSecret}`;
  const manualKey = req.headers.get("x-intel-key");
  const byStaff = !viaCron && !manualKey ? !!(await currentStaff(req)) : false;

  // The key the DATABASE accepts, not a second copy of it in the environment.
  // The two drifted and silently 401'd this job on every run — see
  // lib/elevated-key.
  if (!viaCron && !byStaff && !(await intelKeyOk(manualKey))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Narrows to string, and covers the one case the gate above cannot: a cron
  // run on a deployment where no elevated key is configured at all.
  const rpcKey = viaCron || byStaff ? await elevatedKey() : manualKey;
  if (!rpcKey) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 7, 1), 31);
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 3600 * 1000);

  const { data: snap, error } = await supabase.rpc("intel_snapshot", {
    p_key: rpcKey,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  if (error || !snap) {
    // "unauthorized" from the DB covers a bad manual key too.
    console.error("[intel] snapshot failed:", error?.message);
    const status = error?.message?.includes("unauthorized") ? 401 : 500;
    return NextResponse.json({ error: error?.message ?? "snapshot_failed" }, { status });
  }

  // Operations snapshot (dispatch queue, procurement flags, margins, top
  // SKUs/sizes). Non-fatal: the report still goes out without it.
  const { data: osSnap, error: osErr } = await supabase.rpc("os_snapshot", {
    p_key: rpcKey,
    p_days: days,
  });
  if (osErr) console.error("[intel] os_snapshot failed:", osErr.message);
  (snap as Snapshot).os = osSnap ?? null;

  const metrics = computeMetrics(snap as Snapshot, from, to);
  // Which Library films people played, heard, finished and bought after.
  // Non-fatal: the report goes out without it.
  metrics.films = await filmsThisWeek(days);

  // Decisions already proposed/executed — so the analyst never re-proposes
  // something the founder already acted on.
  const { data: history } = await supabase.rpc("admin_intel_decisions", { p_key: rpcKey });

  // Save the metrics-only report BEFORE the AI call: if the function dies
  // mid-analysis (platform timeout, crash), the week still has a report — the
  // save below upserts the full analysis over this one on success.
  const preliminary = fallbackAnalysis(metrics);
  const { error: preSaveErr } = await supabase.rpc("intel_save_report", {
    p_key: rpcKey,
    p_week_start: metrics.week_start,
    p_week_end: metrics.week_end,
    p_metrics: metrics,
    p_report_md: reportMarkdown(metrics, preliminary),
    p_decisions: [],
    p_emailed_to: null,
  });
  if (preSaveErr) console.error("[intel] pre-save failed:", preSaveErr.message);

  let analysis = null;
  try {
    analysis = await analyzeWeek(metrics, snap as Snapshot, history ?? []);
  } catch (e) {
    console.error("[intel] analysis failed:", e);
  }
  const finalAnalysis = analysis ?? fallbackAnalysis(metrics);

  const md = reportMarkdown(metrics, finalAnalysis);
  const recipients = (process.env.INTEL_REPORT_TO || "roheena@plankandweave.com")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const wantEmail = url.searchParams.get("email") !== "0";

  // Save first: the email's Go ahead / Skip buttons need the per-decision
  // capability tokens minted by intel_insert_decisions.
  const { data: reportId, error: saveErr } = await supabase.rpc("intel_save_report", {
    p_key: rpcKey,
    p_week_start: metrics.week_start,
    p_week_end: metrics.week_end,
    p_metrics: metrics,
    p_report_md: md,
    p_decisions: finalAnalysis.decisions,
    p_emailed_to: null,
  });
  if (saveErr) console.error("[intel] save failed:", saveErr.message);

  const decisionTokens: DecisionTokens = {};
  if (reportId && finalAnalysis.decisions.length) {
    const { data: rows, error: decErr } = await supabase.rpc("intel_insert_decisions", {
      p_key: rpcKey,
      p_report_id: reportId,
      p_decisions: finalAnalysis.decisions,
    });
    if (decErr) console.error("[intel] decisions insert failed:", decErr.message);
    for (const r of (rows as { position: number; token: string }[] | null) ?? []) {
      decisionTokens[r.position] = r.token;
    }
  }

  let emailed = false;
  if (wantEmail) {
    emailed = await sendEmail({
      to: recipients,
      subject: `Zyvorah Intelligence · Week ${metrics.week_number} · ${finalAnalysis.headline.slice(0, 80)}`,
      html: reportEmailHtml(metrics, finalAnalysis, decisionTokens),
      replyTo: "hello@zyvorah.com",
    });
    if (emailed && reportId) {
      // Same upsert, now recording where the report went.
      await supabase.rpc("intel_save_report", {
        p_key: rpcKey,
        p_week_start: metrics.week_start,
        p_week_end: metrics.week_end,
        p_metrics: metrics,
        p_report_md: md,
        p_decisions: finalAnalysis.decisions,
        p_emailed_to: recipients.join(", "),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    reportId: reportId ?? null,
    emailed,
    aiAnalysis: !!analysis,
    metrics,
    analysis: finalAnalysis,
  });
}

export const GET = withCronRun("weekly-intel", tick);
