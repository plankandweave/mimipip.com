import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/corporate-auth";
import { caDownload } from "@/lib/corporate-art-store";
import { guardCapture } from "@/lib/portfolio-capture";
import { areaLabel } from "@/lib/portfolio";
import { transcribeAudio } from "@/lib/transcribe";
import { draftWallsFromWalkthrough } from "@/lib/walkthrough-draft";
import { audioExtension, walkthroughInArea, type MarkRow } from "@/lib/walkthrough";
import { partnerWorkflow } from "@/lib/ai-keys";

export const dynamic = "force-dynamic";
/** Transcribing three minutes and then reading it back takes real time. */
export const maxDuration = 300;

/**
 * Read the walk: transcribe the narration, then draft one wall per tap.
 *
 * Two derived steps, run in order, and BOTH are allowed to fail without costing
 * anything that was recorded:
 *
 *   1. transcription — needs the paid speech service. When it is unavailable,
 *      the walk keeps its video, its audio and its stills, and the marks can be
 *      named by hand. That is not a degraded mode bolted on afterwards; it is
 *      how the feature is meant to work when the clever half is missing.
 *
 *   2. drafting — reads the transcript and attaches what was said to the tap it
 *      was said next to. Anthropic, so it is not affected by the image account
 *      that transcription depends on.
 *
 * Re-runnable. Nothing here is destructive to a mark somebody has already
 * confirmed into a wall, and re-drafting deliberately leaves those alone: their
 * wording now belongs to the wall, not to this pass.
 */
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({})) as { areaId?: string; id?: string };

  const g = await guardCapture(String(b.areaId ?? ""));
  if (!g.ok) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  const { sb, area, session, store } = g.ctx;

  const walk = await walkthroughInArea(sb, area.id, session.account.id, String(b.id ?? ""));
  if (!walk) return NextResponse.json({ ok: false, error: "That walkthrough isn't in this space." }, { status: 404 });

  const { data: markRows } = await sb.from("corporate_walkthrough_marks")
    .select("*").eq("walkthrough_id", walk.id).order("seq");
  const marks = (markRows ?? []) as MarkRow[];
  if (marks.length === 0) {
    return NextResponse.json({
      ok: false, error: "No walls were marked during this walk, so there is nothing to draft.",
    }, { status: 409 });
  }

  // ── 1. Transcribe, unless we already have one ────────────────────────────
  let transcript = walk.transcript ?? "";
  let segments: { start: number; end: number; text: string }[] | undefined;
  let transcriptError: string | null = walk.transcript_error;

  if (!transcript) {
    if (!walk.audio_path) {
      return NextResponse.json({
        ok: false, error: "This walk has no narration to read.",
      }, { status: 409 });
    }
    const { data: file } = await caDownload(walk.audio_path);
    if (!file) {
      return NextResponse.json({ ok: false, error: "The narration could not be read back." }, { status: 500 });
    }
    const bytes = await file.arrayBuffer();
    const ext = walk.audio_path.split(".").pop() ?? "webm";
    const type = Object.entries({ webm: "audio/webm", ogg: "audio/ogg", m4a: "audio/mp4", mp3: "audio/mpeg" })
      .find(([e]) => e === ext)?.[1] ?? "audio/webm";

    const result = await transcribeAudio(bytes, `walk.${audioExtension(type) ?? "webm"}`, type, {
      segments: true,
      prompt: `A walkthrough of ${areaLabel(area)} in ${store.name}, describing walls for wallpaper.`,
    });

    if (result.ok) {
      transcript = result.text;
      segments = result.segments;
      transcriptError = null;
    } else {
      transcriptError = result.error.slice(0, 300);
    }
    await sb.from("corporate_walkthroughs").update({
      transcript: result.ok ? transcript : null,
      transcript_error: transcriptError,
      transcribed_at: result.ok ? new Date().toISOString() : null,
    }).eq("id", walk.id);
  }

  if (!transcript) {
    // Said as what it is: the walk is intact, one derived step could not run.
    return NextResponse.json({
      ok: false,
      error: `The narration could not be written out — ${transcriptError ?? "unavailable"}. The walk, the stills and the marks are all saved; name the walls yourself, or try again later.`,
    }, { status: 503 });
  }

  // ── 2. Draft ─────────────────────────────────────────────────────────────
  const drafted = await draftWallsFromWalkthrough({
    buildingName: store.name,
    areaLabel: areaLabel(area),
    transcript,
    segments,
    marks: marks.map((m) => ({ seq: m.seq, atSeconds: Number(m.at_seconds) })),
    workflow: partnerWorkflow(session.account.slug),
  });

  if (!drafted.ok) {
    await sb.from("corporate_walkthroughs")
      .update({ draft_error: drafted.error.slice(0, 300) }).eq("id", walk.id);
    return NextResponse.json({
      ok: false,
      error: `${drafted.error}. The transcript is saved — you can name the walls yourself.`,
    }, { status: 503 });
  }

  // Written onto the marks, EXCEPT any already confirmed into a wall: that
  // wording belongs to the wall now, and a re-draft must not reach back and
  // change what somebody already accepted.
  const open = new Map(marks.filter((m) => m.confirmed_wall_seq == null).map((m) => [m.seq, m]));
  let written = 0;
  for (const d of drafted.marks) {
    const mark = open.get(d.seq);
    if (!mark) continue;
    await sb.from("corporate_walkthrough_marks").update({
      draft_name: d.name,
      draft_brief: d.brief,
      draft_width_mm: d.widthMm,
      draft_height_mm: d.heightMm,
      size_estimated: d.sizeEstimated,
    }).eq("id", mark.id);
    written++;
  }

  await sb.from("corporate_walkthroughs").update({
    draft_json: drafted.marks,
    drafted_at: new Date().toISOString(),
    draft_error: null,
  }).eq("id", walk.id);

  await recordAudit(session, "walkthrough.draft", { type: "area", id: area.id },
    { id: walk.id, walls: written });

  return NextResponse.json({
    ok: true,
    drafted: written,
    skipped: marks.length - written,
    transcript,
  });
}
