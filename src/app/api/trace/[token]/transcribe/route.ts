import { NextResponse } from "next/server";
import { caDownload } from "@/lib/corporate-art-store";
import { audioExtension, transcribeAudio } from "@/lib/transcribe";
import { guardTraceRequest, walkOnLink, type TraceSegmentRow } from "@/lib/trace-link";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// One piece's words. Called by the phone once a piece's narration has landed,
// while the next piece is still being recorded — so by the time the walk ends
// most of it already reads. Fails SOFT, always: the recording is the record
// and the transcript is a view of it; a piece that cannot be transcribed now
// keeps its audio and says why, and the Vault can ask again later.
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const b = await req.json().catch(() => ({})) as { walkId?: string; seq?: number };
  const g = await guardTraceRequest(req, token, "transcribe");
  if (!g.ok) return NextResponse.json({ ok: false, state: g.state, error: g.error }, { status: g.status });
  const { sb, blueprint } = g.ctx;

  const walk = await walkOnLink(sb, g.ctx, String(b.walkId ?? ""));
  if (!walk) return NextResponse.json({ ok: false, error: "That walk isn't on this link." }, { status: 404 });
  const { data: seg } = await sb.from("trace_segments").select("*")
    .eq("walk_id", walk.id).eq("seq", Math.round(Number(b.seq))).maybeSingle();
  const segment = seg as TraceSegmentRow | null;
  if (!segment) return NextResponse.json({ ok: false, error: "That piece isn't in this walk." }, { status: 404 });
  if (segment.transcript) return NextResponse.json({ ok: true, already: true });
  if (!segment.audio_path) return NextResponse.json({ ok: false, error: "No narration for that piece yet." }, { status: 409 });

  const { data: file } = await caDownload(segment.audio_path);
  if (!file) {
    await sb.from("trace_segments").update({ transcript_error: "narration could not be read back" }).eq("id", segment.id);
    return NextResponse.json({ ok: false, error: "Could not read the narration." }, { status: 500 });
  }
  const bytes = await file.arrayBuffer();
  const type = file.type || "audio/webm";
  const result = await transcribeAudio(bytes, `piece.${audioExtension(type) ?? "webm"}`, type, {
    segments: true,
    prompt: `A walk through ${blueprint.name}${blueprint.city ? `, ${blueprint.city}` : ""}, describing walls, corridors, blocks and buildings for wall art. Indian English.`,
  });
  if (!result.ok) {
    await sb.from("trace_segments").update({ transcript_error: result.error }).eq("id", segment.id);
    return NextResponse.json({ ok: false, error: result.error }, { status: 503 });
  }
  await sb.from("trace_segments").update({
    transcript: result.text, transcript_json: result.segments ?? null,
    transcript_error: null, transcribed_at: new Date().toISOString(),
  }).eq("id", segment.id);
  return NextResponse.json({ ok: true });
}
