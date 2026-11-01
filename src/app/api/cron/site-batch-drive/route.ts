import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { POST as driveBatch } from "@/app/api/corporate/site-batch/[id]/drive/route";
import { withCronRun } from "@/lib/cron-run";
import { backfillFingerprints } from "@/lib/design-fingerprint";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Nudges any released site batch that still has work outstanding.
//
// The drive worker chains itself with after(), which is fast when it survives,
// but on Vercel it occasionally drops between steps — a cold start, an after()
// that does not fire, a deploy landing mid-chain. Without this, a store's
// proposal would silently never arrive and the promise that nobody at Zyvorah
// touches it would be false. With it, a dropped chain self-heals in a couple of
// minutes. Cheap no-op when there is nothing outstanding.
//
// Auth: Vercel cron sends `Authorization: Bearer <CRON_SECRET>`. The bridge
// token is read from the environment server-side and never taken from the
// request, so this cannot be used to drive the pipeline without cron auth.
async function tick(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const viaCron = Boolean(cronSecret) && req.headers.get("authorization") === `Bearer ${cronSecret}`;
  if (!viaCron) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "no_service_role" }, { status: 503 });
  const bridgeToken = process.env.ZYVORAH_WEBHOOK_TOKEN;
  if (!bridgeToken) return NextResponse.json({ error: "no_bridge_token" }, { status: 503 });

  // Outstanding = released, mid-pipeline, and not currently leased by a live
  // step. needs_attention is excluded on purpose: a person has to look at it.
  // Library designs added before fingerprints existed get theirs here, a few
  // per tick, until none are left (design-fingerprint.ts). Never blocks the
  // drive: a failure is logged and the next tick tries again.
  await backfillFingerprints(sb, 10).catch((e) => console.error("[site-batch-drive] fingerprint backfill:", e));

  const nowIso = new Date().toISOString();
  const { data: due, error } = await sb.from("corporate_site_batches")
    .select("id, status, drive_attempts")
    .not("released_at", "is", null)
    .in("status", ["collecting", "allocated", "composed"])
    .lt("drive_attempts", 150)
    .or(`drive_lease_until.is.null,drive_lease_until.lt.${nowIso}`)
    .order("created_at")
    .limit(5);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!due?.length) return NextResponse.json({ ok: true, pending: 0 });

  // IN-PROCESS, not over HTTP. A Worker fetching its own zone is fragile (the
  // approve route died that way — PR #356); the drive route is built to run
  // in-process and still gates on the bridge token it is handed. Each drive
  // tick is bounded (TICK_BUDGET_MS, four minutes) and idempotent, so what this
  // cron does not finish inside its own budget the next ten-minute run picks up.
  // Each drive call takes a FEW steps only (a Worker invocation's subrequest
  // budget: the call that tried all fifteen Nelamangala walls died at wall 7,
  // 14 October 2026), and answers `done: false` while the batch has more.
  // `more` here tells the cron worker to call this route again at once —
  // a fresh invocation, a fresh budget — so a store composes in minutes,
  // not a wall-batch per ten-minute tick.
  let nudged = 0;
  let more = false;
  for (const b of due) {
    try {
      const dreq = new Request(new URL(`/api/corporate/site-batch/${b.id}/drive`, req.url), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-zyvorah-token": bridgeToken },
      });
      const res = await driveBatch(dreq, { params: Promise.resolve({ id: b.id }) });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; done?: boolean; skipped?: string; waiting?: boolean };
      // `waiting`: every wall is with the artwork service; calling again now
      // would only spin. The next ten-minute tick finds them saved.
      if (body.ok !== false && body.done === false && !body.skipped && !body.waiting) more = true;
      nudged++;
    } catch (e) {
      // Swallowed: the next run retries. A nudge that fails must not stop the
      // other batches from being nudged.
      console.error("[site-batch-drive] nudge failed:", b.id, e);
    }
  }
  return NextResponse.json({ ok: true, pending: due.length, nudged, more });
}

export const GET = withCronRun("site-batch-drive", tick);
