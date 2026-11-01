import { NextResponse } from "next/server";
import { signArt } from "@/lib/corporate-files";
import { CACHE_MUTABLE } from "@/lib/storage-body";
import { caDownload, caRemove, caSignedUploadUrl, caUpload } from "@/lib/corporate-art-store";
import { audioExtension, videoExtension } from "@/lib/walkthrough";
import { MAX_PIECE_AUDIO_BYTES, MAX_PIECE_VIDEO_BYTES, MAX_STILL_BYTES, PIECE_SECONDS } from "@/lib/trace";
import { guardTraceRequest, tracePath, walkOnLink } from "@/lib/trace-link";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Thirty minutes: the one upload here that is large, on whatever signal a
 *  campus corridor has. */
const UPLOAD_TTL_S = 1800;

// A walk's files: each piece's video, its narration beside it, and a still per
// tap. Two steps — sign, PUT straight to the store, commit — because a piece
// is tens of megabytes and must never pass through a function body.
//
// Nothing in the body decides a path: the walk and the piece are ids already
// proven to belong to the link, and the container type is an allow-list.
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const b = await req.json().catch(() => ({})) as {
    action?: string; kind?: string; walkId?: string; seq?: number; markId?: string;
    bytes?: number; contentType?: string; seconds?: number;
  };
  const action = String(b.action ?? "");
  const kind = String(b.kind ?? "");
  if (action !== "sign" && action !== "commit") return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  if (kind !== "video" && kind !== "audio" && kind !== "still") return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });

  const g = await guardTraceRequest(req, token, action);
  if (!g.ok) return NextResponse.json({ ok: false, state: g.state, error: g.error }, { status: g.status });
  const { account, sb } = g.ctx;

  const walk = await walkOnLink(sb, g.ctx, String(b.walkId ?? ""));
  if (!walk) return NextResponse.json({ ok: false, error: "That walk isn't on this link." }, { status: 404 });
  const slug = account.slug;

  let path: string;
  let cap: number;
  let segmentId: string | null = null;
  let markId: string | null = null;
  if (kind === "still") {
    const { data: mark } = await sb.from("trace_marks").select("id, seq")
      .eq("id", String(b.markId ?? "")).eq("walk_id", walk.id).maybeSingle();
    if (!mark) return NextResponse.json({ ok: false, error: "That wall isn't in this walk." }, { status: 404 });
    markId = mark.id as string;
    path = tracePath.still(slug, walk.id, mark.seq as number);
    cap = MAX_STILL_BYTES;
  } else {
    const seq = Math.round(Number(b.seq));
    const { data: seg } = await sb.from("trace_segments").select("id, seq")
      .eq("walk_id", walk.id).eq("seq", seq).maybeSingle();
    if (!seg) return NextResponse.json({ ok: false, error: "That piece isn't in this walk." }, { status: 404 });
    segmentId = seg.id as string;
    const ext = kind === "video" ? videoExtension(String(b.contentType ?? "")) : audioExtension(String(b.contentType ?? ""));
    if (!ext) return NextResponse.json({ ok: false, error: "That recording format isn't one we can accept." }, { status: 400 });
    path = kind === "video" ? tracePath.video(slug, walk.id, seq, ext) : tracePath.audio(slug, walk.id, seq, ext);
    cap = kind === "video" ? MAX_PIECE_VIDEO_BYTES : MAX_PIECE_AUDIO_BYTES;
  }

  if (action === "sign") {
    if ((Number(b.bytes) || 0) > cap) return NextResponse.json({ ok: false, error: "That file is too large." }, { status: 413 });
    try {
      const signed = caSignedUploadUrl(path, { upsert: true, ttlSeconds: UPLOAD_TTL_S });
      return NextResponse.json({ ok: true, path, signedUrl: signed.signedUrl, token: signed.token, expiresInSeconds: UPLOAD_TTL_S });
    } catch (e) {
      console.error("[trace/media] sign failed:", path, (e as Error)?.message);
      return NextResponse.json({ ok: false, error: "Could not prepare the upload." }, { status: 500 });
    }
  }

  // ── commit: prove the bytes landed, then record them ──────────────────────
  const { data: file, error: dlErr } = await caDownload(path);
  if (dlErr || !file) {
    if (kind === "video" && segmentId) {
      await sb.from("trace_segments").update({ video_error: "the recording did not arrive" }).eq("id", segmentId);
    }
    return NextResponse.json({ ok: false, error: "That didn't arrive. Try again." }, { status: 400 });
  }
  const raw = await file.arrayBuffer();
  if (raw.byteLength === 0 || raw.byteLength > cap) {
    await caRemove([path]);
    return NextResponse.json({ ok: false, error: raw.byteLength ? "That file is too large." : "That recording was empty." }, { status: 413 });
  }

  if (kind === "still") {
    // The frame was drawn from the live camera at phone size and encoded as
    // JPEG on the phone, so it is stored as it came. If the browser sent
    // something else, it is re-labelled rather than refused.
    if (!file.type.startsWith("image/jpeg")) {
      const up = await caUpload(path, raw, { contentType: "image/jpeg", upsert: true, cacheControl: CACHE_MUTABLE });
      if (up.error) return NextResponse.json({ ok: false, error: "Could not save that frame." }, { status: 500 });
    }
    const { error } = await sb.from("trace_marks").update({ still_path: path, still_error: null }).eq("id", markId!);
    if (error) return NextResponse.json({ ok: false, error: "The photo arrived but its receipt could not be saved. Retry." }, { status: 500 });
    return NextResponse.json({ ok: true, stillUrl: await signArt(sb, path, 900) });
  }

  if (kind === "video") {
    const seconds = Number.isFinite(Number(b.seconds))
      ? Math.max(0, Math.min(PIECE_SECONDS * 2, Math.round(Number(b.seconds)))) : null;
    const { error } = await sb.from("trace_segments").update({
      video_path: path, video_bytes: raw.byteLength, video_error: null, seconds,
    }).eq("id", segmentId!);
    if (error) return NextResponse.json({ ok: false, error: "The video arrived but its receipt could not be saved. Retry." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const { error } = await sb.from("trace_segments").update({ audio_path: path, audio_bytes: raw.byteLength }).eq("id", segmentId!);
  if (error) return NextResponse.json({ ok: false, error: "The audio arrived but its receipt could not be saved. Retry." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
