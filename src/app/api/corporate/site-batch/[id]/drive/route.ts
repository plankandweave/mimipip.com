import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { internalTokenOk, loadBatch } from "@/lib/site-batch";
import { autoProposes } from "@/lib/site-batch-rules";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** How long one step may hold the batch. Long enough for an allocate call on a
 *  40-wall store, short enough that a crashed step frees the batch soon. */
const LEASE_MS = 300_000;
/** A doomed batch must stop costing money. Each attempt is at most one compose
 *  or one allocate, so this is generous for a 40-wall store with retries and
 *  still finite. */
const DRIVE_MAX_ATTEMPTS = 150;
/** One call keeps stepping for as long as its budget allows, never past the
 *  lease — but only a FEW steps per call. A Worker invocation may make at
 *  most 1,000 subrequests, and every compose step spends a hundred-odd of
 *  them (database reads and writes, the media service, storage); the call
 *  that tried to compose all fifteen Nelamangala walls in one go was killed
 *  at wall 7 with no catch, no log and the lease still held (14 October
 *  2026, twice). Speed comes from the cron worker instead: it calls the
 *  drive cron again while this call answers `more: true`, each call a fresh
 *  invocation with its own budget, so a fifteen-wall store still composes
 *  inside one ten-minute cron slot (Roheena: "it shouldn't take so long"). */
const TICK_BUDGET_MS = 240_000;
const MAX_STEPS_PER_TICK = 4;

function driveAuthOk(req: Request): boolean {
  if (internalTokenOk(req)) return true;
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
}

// POST → advance a bounded number of pipeline steps.
//
// Never a session route. The pipeline spends money, and this is the one caller
// that runs without a human watching, so it authenticates as a machine.
//
// The site is a Cloudflare Worker. Fetching its own public hostname from inside
// the Worker is rejected as a Worker-to-Worker public fetch, so delegation must
// stay in-process. The compose route no longer loads native sharp: it calls the
// media service, which makes these route imports safe while retaining every
// route's existing guards and response contract.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!driveAuthOk(req)) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  const loaded = await loadBatch(sb, id);
  if (!loaded) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { batch, walls } = loaded;

  const bridgeToken = process.env.ZYVORAH_WEBHOOK_TOKEN;
  if (!bridgeToken) {
    // Without this the delegated calls 401 silently and the batch sits at
    // 'collecting' for ever while the release button claims it is in hand. Say
    // so on the row rather than looping quietly.
    const msg = "ZYVORAH_WEBHOOK_TOKEN is not set — the pipeline cannot drive itself.";
    await sb.from("corporate_site_batches").update({ error: msg }).eq("id", id);
    return NextResponse.json({ error: msg }, { status: 503 });
  }


  // Nothing runs before a human at the partner has released it.
  if (!batch.released_at) {
    return NextResponse.json({ ok: true, done: true, reason: "awaiting_release" });
  }
  if (batch.drive_attempts >= DRIVE_MAX_ATTEMPTS) {
    return NextResponse.json({ ok: false, done: true, reason: "attempts_exhausted" });
  }

  const step = nextStep(batch, walls.length);
  if (!step) return NextResponse.json({ ok: true, done: true, reason: `nothing_to_do:${batch.status}` });

  // Claim the batch. A conditional UPDATE is the only lock available here, and
  // it is what stops two overlapping ticks both calling allocate and paying for
  // it twice.
  const now = Date.now();
  const { data: claimed } = await sb.from("corporate_site_batches")
    .update({
      drive_lease_until: new Date(now + LEASE_MS).toISOString(),
      drive_attempts: batch.drive_attempts + 1,
    })
    .eq("id", id)
    .or(`drive_lease_until.is.null,drive_lease_until.lt.${new Date(now).toISOString()}`)
    .select("id").maybeSingle();
  if (!claimed) return NextResponse.json({ ok: true, skipped: "leased" });

  const origin = new URL(req.url).origin;
  const results: { step: "allocate" | "compose" | "propose"; status: number; body: Record<string, unknown> }[] = [];
  try {
    for (let i = 0; i < MAX_STEPS_PER_TICK && Date.now() - now < TICK_BUDGET_MS; i++) {
      const current = await loadBatch(sb, id);
      if (!current) break;
      const wanted = nextStep(current.batch, current.walls.length);
      if (!wanted) break;
      const res = await invokeStep(wanted, id, origin, bridgeToken);
      const result = { step: wanted, status: res.status, body: await res.json().catch(() => ({})) };
      results.push(result);
      if (res.status < 200 || res.status >= 300 || wanted === "propose") break;
      // Every wall is with the artwork service: nothing to do until it saves
      // them, so stop rather than spin (the next tick finds them composed).
      if ((result.body as { waiting?: boolean }).waiting) break;
    }
  } catch (e) {
    await releaseLease(sb, id);
    console.error("[drive] step failed:", id, e);
    return NextResponse.json({ ok: false, step, error: "step_unreachable", results }, { status: 502 });
  }

  await releaseLease(sb, id);
  const ok = results.every((r) => r.status >= 200 && r.status < 300);
  const current = await loadBatch(sb, id);
  const done = current ? nextStep(current.batch, current.walls.length) == null : true;
  const waiting = Boolean((results[results.length - 1]?.body as { waiting?: boolean } | undefined)?.waiting);
  return NextResponse.json({ ok, done, waiting, results });
}

async function invokeStep(
  step: "allocate" | "compose" | "propose", id: string, origin: string, token: string,
): Promise<Response> {
  const request = new Request(`${origin}/api/corporate/site-batch/${id}/${step}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-zyvorah-token": token },
    body: "{}",
  });
  const ctx = { params: Promise.resolve({ id }) };
  if (step === "allocate") return (await import("../allocate/route")).POST(request, ctx);
  if (step === "compose") return (await import("../compose/route")).POST(request, ctx);
  return (await import("../propose/route")).POST(request, ctx);
}

/** Which single step this batch needs next, or null when it needs none. */
function nextStep(
  batch: { status: string; revision: number; proposed_at: string | null; proposed_revision: number | null; email_error: string | null; hold_proposal?: boolean | null },
  wallCount: number,
): "allocate" | "compose" | "propose" | null {
  if (batch.status === "collecting") return wallCount > 0 ? "allocate" : null;
  if (batch.status === "allocated") return "compose";
  if (batch.status === "composed") {
    // Re-propose when a revision has moved past what was last sent, or when the
    // last send failed. Both are how a batch gets un-stuck without a human.
    // A batch the founder holds is never sent from here (site-batch-rules.ts).
    return autoProposes(batch) ? "propose" : null;
  }
  // needs_attention: walls failed to compose and a person must look.
  // proposed / ordered / cancelled: the pipeline's work is done.
  return null;
}

async function releaseLease(sb: NonNullable<ReturnType<typeof supabaseAdmin>>, id: string) {
  await sb.from("corporate_site_batches").update({ drive_lease_until: null }).eq("id", id);
}
