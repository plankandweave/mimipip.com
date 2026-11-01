import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/corporate-auth";
import { caRemove } from "@/lib/corporate-art-store";
import { signArt, DAY } from "@/lib/corporate-files";
import { guardCapture } from "@/lib/portfolio-capture";
import {
  MAX_MARKS, walkthroughInArea, type MarkRow, type WalkthroughRow,
} from "@/lib/walkthrough";

export const dynamic = "force-dynamic";

/**
 * Walkthroughs of one space.
 *
 * GET  ?areaId=…            → every walk of this space, with its marks
 * POST { action: "start" }  → open one, before recording begins
 * POST { action: "mark" }   → record a tap: which wall, and when in the walk
 * POST { action: "edit" }   → correct a drafted name, brief or size by hand
 * POST { action: "delete" } → drop a walk and its files
 *
 * Media upload lives next door (walkthrough/media) because it is a two-step
 * signed upload; drafting and confirmation each have their own route too.
 *
 * The row is created BEFORE recording starts, and that ordering is the whole
 * crash-safety story: every mark and every file is addressed by a walkthrough
 * id that already exists, so a phone that dies mid-walk has still saved
 * everything it had marked up to that second.
 */

const PREVIEW_TTL_S = 900;

export async function GET(req: Request) {
  const areaId = new URL(req.url).searchParams.get("areaId") ?? "";
  const g = await guardCapture(areaId);
  if (!g.ok) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  const { sb, area, session } = g.ctx;

  const { data: rows } = await sb.from("corporate_walkthroughs")
    .select("*").eq("area_id", area.id).eq("account_id", session.account.id)
    .order("created_at", { ascending: false });

  const walks = (rows ?? []) as WalkthroughRow[];
  const ids = walks.map((w) => w.id);
  const { data: markRows } = ids.length
    ? await sb.from("corporate_walkthrough_marks")
        .select("*").in("walkthrough_id", ids).order("seq")
    : { data: [] as MarkRow[] };

  const out = await Promise.all(walks.map(async (w) => ({
    id: w.id,
    title: w.title,
    createdAt: w.created_at,
    createdBy: w.created_by_email,
    seconds: w.video_seconds,
    // A walk is watched, so the video link outlives a page that sits open.
    videoUrl: w.video_path ? await signArt(sb, w.video_path, DAY) : null,
    videoError: w.video_error,
    audioUrl: w.audio_path ? await signArt(sb, w.audio_path, DAY) : null,
    transcript: w.transcript,
    transcriptError: w.transcript_error,
    draftedAt: w.drafted_at,
    draftError: w.draft_error,
    marks: await Promise.all(
      ((markRows ?? []) as MarkRow[])
        .filter((m) => m.walkthrough_id === w.id)
        .map(async (m) => ({
          id: m.id,
          seq: m.seq,
          atSeconds: Number(m.at_seconds),
          stillUrl: m.still_path ? await signArt(sb, m.still_path, PREVIEW_TTL_S) : null,
          stillError: m.still_error,
          name: m.draft_name,
          brief: m.draft_brief,
          widthMm: m.draft_width_mm,
          heightMm: m.draft_height_mm,
          sizeEstimated: m.size_estimated,
          confirmedWallSeq: m.confirmed_wall_seq,
        })),
    ),
  })));

  return NextResponse.json({ ok: true, walkthroughs: out });
}

export async function POST(req: Request) {
  let b: {
    action?: string; areaId?: string; id?: string; markId?: string;
    title?: string; seq?: number; atSeconds?: number;
    name?: string; brief?: string; widthMm?: number; heightMm?: number;
  };
  try { b = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }

  const g = await guardCapture(String(b.areaId ?? ""));
  if (!g.ok) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  const { sb, area, session, store } = g.ctx;
  const action = String(b.action ?? "");

  // ── Start ────────────────────────────────────────────────────────────────
  if (action === "start") {
    const { data, error } = await sb.from("corporate_walkthroughs").insert({
      account_id: session.account.id,
      area_id: area.id,
      title: String(b.title ?? "").trim().slice(0, 160) || null,
      created_by_email: session.email,
    }).select("id").single();
    if (error || !data) {
      console.error("[walkthrough] start failed:", error?.message);
      return NextResponse.json({ ok: false, error: "Could not start a walkthrough." }, { status: 500 });
    }
    await recordAudit(session, "walkthrough.start", { type: "area", id: area.id },
      { building: store.name });
    return NextResponse.json({ ok: true, id: data.id as string });
  }

  const walk = await walkthroughInArea(sb, area.id, session.account.id, String(b.id ?? ""));
  if (!walk) return NextResponse.json({ ok: false, error: "That walkthrough isn't in this space." }, { status: 404 });

  // ── Delete ───────────────────────────────────────────────────────────────
  if (action === "delete") {
    // Take the objects out too — the video is the largest thing this account
    // stores, and an orphan in a shared bucket is space nobody reclaims.
    const { data: marks } = await sb.from("corporate_walkthrough_marks")
      .select("still_path").eq("walkthrough_id", walk.id);
    const paths = [
      walk.video_path, walk.audio_path,
      ...((marks ?? []).map((m) => m.still_path as string | null)),
    ].filter(Boolean) as string[];
    if (paths.length) await caRemove(paths);

    await sb.from("corporate_walkthroughs").delete().eq("id", walk.id);
    await recordAudit(session, "walkthrough.delete", { type: "area", id: area.id }, { id: walk.id });
    return NextResponse.json({ ok: true, deleted: walk.id });
  }

  // ── Mark ─────────────────────────────────────────────────────────────────
  // Written the instant the walker taps, not batched at the end: the point of
  // marking as you walk is that the walk survives the phone.
  if (action === "mark") {
    const { count } = await sb.from("corporate_walkthrough_marks")
      .select("id", { count: "exact", head: true }).eq("walkthrough_id", walk.id);
    if ((count ?? 0) >= MAX_MARKS) {
      return NextResponse.json({
        ok: false, error: `A walkthrough holds ${MAX_MARKS} walls. Start another for the rest.`,
      }, { status: 409 });
    }

    const atSeconds = Math.max(0, Number(b.atSeconds) || 0);
    // seq assigned here, never taken from the caller, and retried on collision
    // — the unique index is what actually decides.
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data: last } = await sb.from("corporate_walkthrough_marks")
        .select("seq").eq("walkthrough_id", walk.id)
        .order("seq", { ascending: false }).limit(1);
      const seq = ((last?.[0]?.seq as number | undefined) ?? 0) + 1;

      const { data: created, error } = await sb.from("corporate_walkthrough_marks").insert({
        walkthrough_id: walk.id, seq, at_seconds: atSeconds,
      }).select("id, seq").maybeSingle();
      if (created) {
        return NextResponse.json({ ok: true, markId: created.id as string, seq: created.seq as number });
      }
      if (error && !/duplicate key/i.test(error.message)) {
        console.error("[walkthrough] mark failed:", error.message);
        return NextResponse.json({ ok: false, error: "Could not mark that wall." }, { status: 500 });
      }
    }
    return NextResponse.json({ ok: false, error: "Could not mark that wall — try again." }, { status: 409 });
  }

  // ── Edit a drafted mark by hand ──────────────────────────────────────────
  // The drafting pass proposes; a person decides. Anything typed here replaces
  // what was drafted, and a size typed by hand is no longer an estimate.
  if (action === "edit") {
    const markId = String(b.markId ?? "");
    const { data: mark } = await sb.from("corporate_walkthrough_marks")
      .select("id, confirmed_wall_seq").eq("id", markId)
      .eq("walkthrough_id", walk.id).maybeSingle();
    if (!mark) return NextResponse.json({ ok: false, error: "That wall isn't in this walkthrough." }, { status: 404 });
    if (mark.confirmed_wall_seq != null) {
      return NextResponse.json({
        ok: false, error: "That wall has already been added. Edit it under Buildings instead.",
      }, { status: 409 });
    }

    const text = (v: unknown, max: number) => {
      const s = String(v ?? "").trim();
      return s ? s.slice(0, max) : null;
    };
    const w = Math.round(Number(b.widthMm));
    const h = Math.round(Number(b.heightMm));
    const sized = Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0;

    await sb.from("corporate_walkthrough_marks").update({
      draft_name: text(b.name, 160),
      draft_brief: text(b.brief, 4000),
      draft_width_mm: sized ? w : null,
      draft_height_mm: sized ? h : null,
      // Typed by a human standing behind it: no longer something we overheard.
      size_estimated: false,
    }).eq("id", markId);

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
}
