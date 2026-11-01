import { NextResponse } from "next/server";
import { withCronRun } from "@/lib/cron-run";
import { composeWeekAhead } from "@/lib/marketing/pipeline";
import { hasServiceRole } from "@/lib/marketing/db";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Compose the week ahead, so the Monday review has a week in it.
//
// The doctrine (D32) is a weekly batch approval: the founder reviews on Monday
// and approves the week. The engine composed one slot on the morning of the day
// it was for, so the review could only ever offer today — the surface promised a
// batch and the pipeline could not supply one.
//
// This runs BEFORE the Monday review and fills the window. It changes nothing
// about approval or publishing: every slot still lands unapproved, still passes
// the safety gate on its own merits, and still cannot publish without a named
// approval. Composing earlier is not approving earlier.
//
// Scheduled more than once because seven slots — some of them reels — do not fit
// in one invocation. Each run resumes where the last stopped, because slot_key
// idempotency makes a finished day a cheap read rather than repeated work.
//
// Auth: the same Bearer scheme as every other cron here.
async function tick(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const url = new URL(req.url);
  // Capped: this composes real media and writes real rows. An unbounded `days`
  // from a query string would let one request queue a month of posts.
  // Two weeks, so the desk always shows the next fortnight composed.
  const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? 14), 1), 21);

  const result = await composeWeekAhead(days);

  return NextResponse.json({
    ok: true,
    serviceRole: hasServiceRole(),
    days,
    complete: result.complete,
    composed: result.composed.map((o) => ({
      slot: o.slotKey,
      handle: o.handle,
      pillar: o.pillar,
      format: o.format,
      status: o.status,
      safety: o.safetyPassed,
      error: o.error,
    })),
    // Named, not counted: "3 remaining" tells you nothing on Monday morning.
    remaining: result.remaining,
  });
}

export const GET = withCronRun("marketing-week", tick);
