import { NextResponse } from "next/server";
import { staffKey } from "@/lib/staff-key";
import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/supabase";
import { executeDecision, type ExecDecision } from "@/lib/intel-executor";
import { anthropicKeyFor } from "@/lib/ai-keys";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Board-native actions from /decide — the click IS the trigger, nothing waits
// for the daily cron. Staff-only: authorised by the Google sign-in, and the key
// that stands for is re-checked in the DB by every RPC this calls. The public
// "Go ahead / Skip" links mailed with the report do NOT come here — they carry a
// per-decision token and go to /api/decide.
//
// POST { id, action }
//   action "approve" → approved, then the executor runs on it IMMEDIATELY
//   action "skip"    → rejected
//   action "run"     → (re)run the executor now (approved or blocked decisions)
//   action "mark_done" → the founder confirms she did her remaining step
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const key = await staffKey(req);
  const id = typeof body?.id === "string" ? body.id : "";
  const action = String(body?.action ?? "");
  if (!key || !/^[0-9a-f-]{36}$/i.test(id) || !["approve", "skip", "run", "mark_done"].includes(action)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  if (action === "skip") {
    const { data, error } = await supabase.rpc("intel_decide_by_id", { p_key: key, p_id: id, p_approve: false });
    if (error) return unauthorizedOr500(error.message);
    return NextResponse.json(data ?? { error: "not_found" }, { status: data ? 200 : 404 });
  }

  if (action === "mark_done") {
    const { error } = await supabase.rpc("intel_mark_decision", {
      p_key: key,
      p_id: id,
      p_status: "done",
      p_notes: null,
    });
    if (error) return unauthorizedOr500(error.message);
    return NextResponse.json({ ok: true, status: "done" });
  }

  // approve / run → flip to approved, then execute right now.
  const { data: flipped, error: flipErr } = await supabase.rpc("intel_decide_by_id", {
    p_key: key,
    p_id: id,
    p_approve: true,
  });
  if (flipErr) return unauthorizedOr500(flipErr.message);
  if (!flipped) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (!anthropicKeyFor("founder")) {
    // Approved but can't execute here — the daily cron will pick it up.
    return NextResponse.json({ ok: true, status: "approved", executed: false });
  }

  const { data: decision, error: getErr } = await supabase.rpc("intel_decision_by_id", { p_key: key, p_id: id });
  if (getErr || !decision) return unauthorizedOr500(getErr?.message ?? "not_found");

  await supabase.rpc("intel_mark_decision", { p_key: key, p_id: id, p_status: "in_progress" });
  try {
    const outcome = await executeDecision(
      new Anthropic({ apiKey: anthropicKeyFor("founder") }),
      decision as ExecDecision,
      key,
      process.env.INTEL_REPORT_TO || "roheena@plankandweave.com",
    );
    return NextResponse.json({ ok: true, executed: true, ...outcome });
  } catch (e) {
    console.error("[decide/act] execution failed:", e);
    const notes = `Executor error: ${e instanceof Error ? e.message : "unknown"} — approved; the daily run will retry.`;
    await supabase.rpc("intel_mark_decision", { p_key: key, p_id: id, p_status: "approved", p_notes: notes });
    return NextResponse.json({ ok: true, executed: false, status: "approved", notes });
  }
}

function unauthorizedOr500(msg: string) {
  const status = msg.includes("unauthorized") ? 401 : 500;
  return NextResponse.json({ error: msg }, { status });
}
