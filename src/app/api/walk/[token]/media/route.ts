import { NextResponse } from "next/server";
import { CACHE_MUTABLE } from "@/lib/storage-body";
import { caDownload, caRemove, caSignedUploadUrl, caUpload } from "@/lib/corporate-art-store";
import { normalizePhotoRemote } from "@/lib/media-client";
import {
  MAX_AUDIO_BYTES, MAX_STILL_BYTES, MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS, UPLOAD_TTL_S,
  prospectWalkPath, walkAudioExt, walkVideoExt,
} from "@/lib/prospect-walk";
import { guardWalkRequest, walkOfLink } from "@/lib/prospect-walk-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// A walk's files: the video, the narration beside it, and a still per tap.
// The same two-step as the partner walkthrough — sign, PUT straight to the
// store, commit — because a three-minute video is tens of megabytes and the
// bytes must never pass through a function. Thirty minutes to sign: this is
// the one upload that is genuinely large, on whatever signal the space has.
//
// Every path is built from the resolved link's ref and a walk id that link
// owns; the body chooses only the kind and a content type from an allow-list.
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const b = await req.json().catch(() => ({})) as {
    action?: string; kind?: string; id?: string; seq?: number;
    bytes?: number; contentType?: string; seconds?: number;
  };
  const action = String(b.action ?? "");
  const kind = String(b.kind ?? "");
  if ((action !== "sign" && action !== "commit") || (kind !== "video" && kind !== "audio" && kind !== "still")) {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }

  const g = await guardWalkRequest(req, token, action);
  if (!g.ok) return NextResponse.json({ ok: false, error: g.error, state: g.state }, { status: g.status });
  const { sb, link } = g.ctx;

  const walk = await walkOfLink(sb, link.id, b.id);
  if (!walk) return NextResponse.json({ ok: false, error: "That walk isn't on this link." }, { status: 404 });
  if (walk.submitted_at) return NextResponse.json({ ok: false, error: "That walk has already been sent." }, { status: 409 });

  let path: string;
  let cap: number;
  let seq = 0;
  if (kind === "video") {
    const ext = walkVideoExt(String(b.contentType ?? ""));
    if (!ext) return NextResponse.json({ ok: false, error: "That video format isn't one we can accept." }, { status: 400 });
    path = prospectWalkPath.video(link.ref, walk.id, ext);
    cap = MAX_VIDEO_BYTES;
  } else if (kind === "audio") {
    const ext = walkAudioExt(String(b.contentType ?? ""));
    if (!ext) return NextResponse.json({ ok: false, error: "That audio format isn't one we can accept." }, { status: 400 });
    path = prospectWalkPath.audio(link.ref, walk.id, ext);
    cap = MAX_AUDIO_BYTES;
  } else {
    const { data: mark } = await sb.from("prospect_walk_marks")
      .select("seq").eq("walk_id", walk.id).eq("seq", Number(b.seq)).maybeSingle();
    if (!mark) return NextResponse.json({ ok: false, error: "That wall isn't in this walk." }, { status: 404 });
    seq = mark.seq as number;
    path = prospectWalkPath.still(link.ref, walk.id, seq);
    cap = MAX_STILL_BYTES;
  }

  if (action === "sign") {
    if ((Number(b.bytes) || 0) > cap) {
      return NextResponse.json({
        ok: false,
        error: kind === "video"
          ? `That recording is too large. Keep a walk under ${MAX_VIDEO_SECONDS / 60} minutes and record the rest as another walk.`
          : "That file is too large.",
      }, { status: 413 });
    }
    try {
      const signed = caSignedUploadUrl(path, { upsert: true, ttlSeconds: UPLOAD_TTL_S });
      return NextResponse.json({ ok: true, signedUrl: signed.signedUrl, expiresInSeconds: UPLOAD_TTL_S });
    } catch (e) {
      console.error("[walk/media] sign failed:", (e as Error)?.message);
      return NextResponse.json({ ok: false, error: "Could not prepare the upload." }, { status: 500 });
    }
  }

  // ── commit: confirm what actually landed ──────────────────────────────────
  const { data: file, error: dlErr } = await caDownload(path);
  if (dlErr || !file) {
    if (kind === "video") {
      await sb.from("prospect_walks").update({ video_error: "the recording did not arrive" }).eq("id", walk.id);
    }
    return NextResponse.json({ ok: false, error: "That didn't arrive. Try again." }, { status: 400 });
  }
  const raw = await file.arrayBuffer();
  if (raw.byteLength === 0 || raw.byteLength > cap) {
    await caRemove([path]);
    return NextResponse.json({ ok: false, error: raw.byteLength ? "That file is too large." : "That recording was empty." }, { status: 413 });
  }

  if (kind === "still") {
    const norm = await normalizePhotoRemote(raw);
    if ("error" in norm) {
      await caRemove([path]);
      await sb.from("prospect_walk_marks").update({ still_path: null, still_error: "unreadable image" })
        .eq("walk_id", walk.id).eq("seq", seq);
      return NextResponse.json({ ok: false, error: "That frame could not be read." }, { status: 400 });
    }
    const up = await caUpload(path, Buffer.from(norm.jpeg), { contentType: "image/jpeg", upsert: true, cacheControl: CACHE_MUTABLE });
    if (up.error) {
      console.error("[walk/media] still re-upload failed:", up.error.message);
      return NextResponse.json({ ok: false, error: "Could not save that frame." }, { status: 500 });
    }
    await sb.from("prospect_walk_marks").update({ still_path: path, still_error: null })
      .eq("walk_id", walk.id).eq("seq", seq);
    return NextResponse.json({ ok: true });
  }

  // Video and audio are kept exactly as recorded: never re-encoded, because the
  // recording is the one thing that cannot be captured again.
  if (kind === "video") {
    const seconds = Number.isFinite(Number(b.seconds))
      ? Math.max(0, Math.min(MAX_VIDEO_SECONDS * 2, Math.round(Number(b.seconds)))) : null;
    await sb.from("prospect_walks").update({ video_path: path, video_seconds: seconds, video_error: null }).eq("id", walk.id);
    return NextResponse.json({ ok: true });
  }
  await sb.from("prospect_walks").update({ audio_path: path }).eq("id", walk.id);
  return NextResponse.json({ ok: true });
}
