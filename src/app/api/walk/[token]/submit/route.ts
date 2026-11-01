import { NextResponse } from "next/server";
import { caDownload } from "@/lib/corporate-art-store";
import { audioExtension, transcribeAudio } from "@/lib/transcribe";
import { guardWalkRequest, type ProspectWalkRow } from "@/lib/prospect-walk-server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST → the prospect is done: "Send to Zyvorah".
//
// The submit is written FIRST and on its own — the link and every recorded
// walk get submitted_at — so nothing after it can lose it. Only then is each
// walk's narration transcribed, best effort: the recording is the record and
// the transcript a view of it, so a failure is written to transcript_error
// and the OS still files the walk. Single-use, decided by the database: two
// taps on a slow connection claim the link once.
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const g = await guardWalkRequest(req, token, "submit");
  if (!g.ok) return NextResponse.json({ ok: false, error: g.error, state: g.state }, { status: g.status });
  const { sb, link } = g.ctx;

  const { data: rows } = await sb.from("prospect_walks").select("*").eq("link_id", link.id).order("created_at");
  const recorded = ((rows ?? []) as ProspectWalkRow[]).filter((w) => w.video_path || w.audio_path);
  if (!recorded.length) {
    return NextResponse.json({ ok: false, error: "Record at least one walk before sending." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { data: claimed } = await sb.from("prospect_walk_links")
    .update({ submitted_at: now, last_seen_at: now })
    .eq("id", link.id).is("submitted_at", null).select("id").maybeSingle();
  if (!claimed) return NextResponse.json({ ok: true, already: true });

  await sb.from("prospect_walks").update({ submitted_at: now })
    .in("id", recorded.map((w) => w.id)).is("submitted_at", null);

  const prompt = `${link.company_name} walking their own space and describing the walls they want designed: rooms, corridors, reception, cabins. Indian English.`;
  await Promise.all(recorded.filter((w) => w.audio_path && !w.transcript).map(async (w) => {
    try {
      const { data: file } = await caDownload(w.audio_path!);
      if (!file) {
        await sb.from("prospect_walks").update({ transcript_error: "narration could not be read back" }).eq("id", w.id);
        return;
      }
      const type = file.type || "audio/webm";
      const r = await transcribeAudio(await file.arrayBuffer(), `narration.${audioExtension(type) ?? "webm"}`, type, { prompt });
      await sb.from("prospect_walks").update(r.ok
        ? { transcript: r.text, transcript_error: null, transcribed_at: new Date().toISOString() }
        : { transcript_error: r.error }).eq("id", w.id);
    } catch (e) {
      await sb.from("prospect_walks")
        .update({ transcript_error: String((e as Error)?.message ?? e).slice(0, 300) }).eq("id", w.id);
    }
  }));

  return NextResponse.json({ ok: true, walks: recorded.length });
}
