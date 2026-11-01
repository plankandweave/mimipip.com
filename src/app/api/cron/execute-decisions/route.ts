import { NextResponse } from "next/server";
import { elevatedKey, intelKeyOk } from "@/lib/elevated-key";
import { withCronRun } from "@/lib/cron-run";
import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/supabase";
import { executeDecision, type ExecDecision, type ExecOutcome } from "@/lib/intel-executor";
import { anthropicKeyFor } from "@/lib/ai-keys";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// The daily decision-executor sweep (vercel.json crons — fully cloud, no
// desktop). Picks up everything the founder approved and runs the shared
// executor engine on each. Single decisions can also be run instantly from
// the /decide board via /api/decide/act — this cron is the safety net that
// catches anything approved by email and not yet executed.
//
// Auth: Authorization: Bearer <CRON_SECRET> (Vercel cron) or an x-intel-key
// header (manual) compared against the key the database accepts.
async function tick(req: Request) {
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const viaCron = !!cronSecret && auth === `Bearer ${cronSecret}`;
  // The key the DATABASE accepts, not a second copy of it in the environment.
  // The two drifted and silently 401'd this job on every run — see
  // lib/elevated-key.
  const manualKey = req.headers.get("x-intel-key");
  if (!viaCron && !(await intelKeyOk(manualKey))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Narrows to string, and covers the one case the gate above cannot: a cron
  // run on a deployment where no elevated key is configured at all.
  const rpcKey = viaCron ? await elevatedKey() : manualKey;
  if (!rpcKey) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!anthropicKeyFor("founder")) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const { data: pending, error } = await supabase.rpc("intel_pending_decisions", { p_key: rpcKey });
  if (error) {
    const status = error.message?.includes("unauthorized") ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  const queue = (pending as ExecDecision[] | null) ?? [];
  if (!queue.length) return NextResponse.json({ ok: true, executed: [], message: "queue empty" });

  const client = new Anthropic({ apiKey: anthropicKeyFor("founder") });
  const recipient = process.env.INTEL_REPORT_TO || "roheena@plankandweave.com";
  const started = Date.now();
  const TIME_BUDGET_MS = 240_000; // headroom under maxDuration for writes
  const executed: ExecOutcome[] = [];

  for (const d of queue) {
    if (Date.now() - started > TIME_BUDGET_MS) break; // rest run tomorrow
    await supabase.rpc("intel_mark_decision", { p_key: rpcKey, p_id: d.id, p_status: "in_progress" });
    try {
      executed.push(await executeDecision(client, d, rpcKey, recipient));
    } catch (e) {
      console.error("[executor] decision failed:", d.title, e);
      const notes = `Executor error: ${e instanceof Error ? e.message : "unknown"} — will retry on the next run.`;
      await supabase.rpc("intel_mark_decision", { p_key: rpcKey, p_id: d.id, p_status: "approved", p_notes: notes });
      executed.push({ id: d.id, title: d.title, status: "approved", notes });
    }
  }

  return NextResponse.json({ ok: true, executed, remaining: queue.length - executed.length });
}

export const GET = withCronRun("execute-decisions", tick);
