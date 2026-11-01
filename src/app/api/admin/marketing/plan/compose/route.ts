import { PERSONAL_PLAN_PREFIX } from "@/lib/marketing/profiles";
import { NextResponse } from "next/server";
import { requireStaff, notStaff } from "@/lib/staff-access";
import { hasServiceRole } from "@/lib/marketing/db";
import { composePlanSlot, composeReadyIdeas, composeWeekAhead, surveyCompose } from "@/lib/marketing/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Compose on demand, from the desk.
//   { id }    — one plan slot, now. The founder should not have to wait for
//               the hourly run to see what a day will look like.
//   { days }  — the next N days (capped), the same as the scheduled run.
// Composing is not approving: every result lands queued and unapproved.

type Body = { id?: unknown; days?: unknown; all?: unknown; ideas?: unknown; recompose?: unknown; survey?: unknown };

export async function POST(req: Request) {
  const staff = await requireStaff(req);
  if (!staff) return notStaff();
  if (!hasServiceRole()) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set — nothing can be composed" }, { status: 503 });
  }
  const body = (await req.json().catch(() => null)) as Body | null;

  try {
    if (typeof body?.id === "string" && body.id) {
      const outcome = await composePlanSlot(body.id);
      return NextResponse.json({ ok: outcome.status !== "failed", outcome });
    }
    // { recompose: true } — retire every UNAPPROVED queued frame whose slot is
    // still planned, so the next compose rebuilds it with the current house
    // style. An approved frame is never touched: the founder signed exactly
    // that picture, and publishing reads the approval, not this.
    if (body?.recompose === true) {
      const sb = (await import("@/lib/marketing/db")).serviceClient();
      const { data: planned } = await sb
        .from("marketing_plan_slots")
        .select("day_key, seq")
        .eq("status", "planned")
        .not("plan_key", "like", `${PERSONAL_PLAN_PREFIX}%`);
      const keys = (planned ?? []).map((r) => `${r.day_key}#${r.seq}`);
      let retired = 0;
      for (let i = 0; i < keys.length; i += 100) {
        const { data } = await sb
          .from("marketing_posts")
          .update({ status: "superseded" })
          .in("slot_key", keys.slice(i, i + 100))
          .eq("status", "queued")
          .is("approved_at", null)
          .select("id");
        retired += data?.length ?? 0;
      }
      return NextResponse.json({ ok: true, retired });
    }

    // { survey: true } — what a run WOULD do, and roughly how long, without
    // doing any of it. Days the founder has already approved are excluded:
    // those are settled, and a run starts past them rather than over them.
    // Finished ideas count too: "Compose everything" composes them after the
    // planned slots (see composeReadyIdeas).
    if (body?.survey === true) {
      const [{ todo, estimateSeconds }, ideas] = await Promise.all([surveyCompose(), composeReadyIdeas({ survey: true })]);
      const byFormat: Record<string, number> = {};
      for (const t of todo) byFormat[t.format] = (byFormat[t.format] ?? 0) + 1;
      return NextResponse.json({
        ok: true,
        count: todo.length + ideas.ideas.length,
        ideas: ideas.ideas.length,
        estimateSeconds: estimateSeconds + ideas.ideas.length * 45,
        byFormat,
        firstDay: todo[0]?.slotKey.split("#")[0] ?? null,
        lastDay: todo[todo.length - 1]?.slotKey.split("#")[0] ?? null,
      });
    }

    // { ideas: true } — every finished Instagram idea from today on, promoted
    // and composed for review. Loops like { all: true } until `complete`.
    if (body?.ideas === true) {
      const result = await composeReadyIdeas({ budgetMs: 240_000 });
      return NextResponse.json({
        ok: true,
        complete: result.complete,
        composed: result.composed.map((o) => ({ slot: o.slotKey, status: o.status, error: o.error })),
        remaining: result.remaining,
      });
    }

    // { all: true } composes to the end of the live plan window rather than a
    // fortnight — the desk button loops this route until `complete`, so the
    // founder presses once and the whole calendar fills.
    const horizon =
      body?.all === true ? 92 : Math.min(Math.max(Number(body?.days ?? 14), 1), 21);
    const result = await composeWeekAhead(horizon, { budgetMs: 240_000 });
    return NextResponse.json({
      ok: true,
      days: horizon,
      complete: result.complete,
      composed: result.composed.map((o) => ({ slot: o.slotKey, status: o.status, error: o.error })),
      remaining: result.remaining,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
