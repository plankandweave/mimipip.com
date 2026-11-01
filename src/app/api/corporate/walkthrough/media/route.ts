import { NextResponse } from "next/server";
import { signArt, DAY } from "@/lib/corporate-files";
import { CACHE_MUTABLE } from "@/lib/storage-body";
import { caDownload, caRemove, caSignedUploadUrl, caUpload } from "@/lib/corporate-art-store";
import { normalizePhotoRemote } from "@/lib/media-client";
import { guardCapture } from "@/lib/portfolio-capture";
import {
  audioExtension, MAX_AUDIO_BYTES, MAX_STILL_BYTES, MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS, videoExtension, walkthroughInArea, walkthroughPath,
} from "@/lib/walkthrough";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UPLOAD_TTL_S = 1800;

// The walk's files: the video, the narration beside it, and a still per tap.
//
// Same two-step as every other upload here — sign, PUT straight to storage,
// commit — and here it is not an optimisation but the only way it works at all:
// a three-minute phone video is tens of megabytes and a serverless request is
// capped near four and a half. The bytes never touch a function.
//
// A LONGER SIGNING WINDOW THAN ELSEWHERE. Thirty minutes rather than fifteen,
// because this is the one upload that is genuinely large and is happening on
// whatever signal exists in a basement lift lobby. A photo that fails is
// retaken in seconds; a walk that fails cannot be.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({})) as {
    action?: string; kind?: string; areaId?: string; id?: string;
    markId?: string; bytes?: number; contentType?: string; seconds?: number;
  };
  const action = String(b.action ?? "");
  const kind = String(b.kind ?? "");
  if (action !== "sign" && action !== "commit") {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }
  if (kind !== "video" && kind !== "audio" && kind !== "still") {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }

  const g = await guardCapture(String(b.areaId ?? ""));
  if (!g.ok) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  const { sb, area, session } = g.ctx;

  const walk = await walkthroughInArea(sb, area.id, session.account.id, String(b.id ?? ""));
  if (!walk) return NextResponse.json({ ok: false, error: "That walkthrough isn't in this space." }, { status: 404 });

  const slug = session.account.slug;

  // Resolve the path and the ceiling for whichever kind this is. Everything is
  // derived from ids we have already checked; nothing comes from the body but
  // the container type, and that is an allow-list.
  let path: string;
  let cap: number;
  if (kind === "video") {
    const ext = videoExtension(String(b.contentType ?? ""));
    if (!ext) return NextResponse.json({ ok: false, error: "That video format isn't one we can accept." }, { status: 400 });
    path = walkthroughPath.video(slug, walk.id, ext);
    cap = MAX_VIDEO_BYTES;
  } else if (kind === "audio") {
    const ext = audioExtension(String(b.contentType ?? ""));
    if (!ext) return NextResponse.json({ ok: false, error: "That audio format isn't one we can accept." }, { status: 400 });
    path = walkthroughPath.audio(slug, walk.id, ext);
    cap = MAX_AUDIO_BYTES;
  } else {
    const { data: mark } = await sb.from("corporate_walkthrough_marks")
      .select("id, seq").eq("id", String(b.markId ?? ""))
      .eq("walkthrough_id", walk.id).maybeSingle();
    if (!mark) return NextResponse.json({ ok: false, error: "That wall isn't in this walkthrough." }, { status: 404 });
    path = walkthroughPath.still(slug, walk.id, mark.seq as number);
    cap = MAX_STILL_BYTES;
  }

  if (action === "sign") {
    if ((Number(b.bytes) || 0) > cap) {
      return NextResponse.json({
        ok: false,
        error: kind === "video"
          ? `That recording is too large. Keep a walk under ${MAX_VIDEO_SECONDS / 60} minutes — record the rest as a second walk.`
          : "That file is too large.",
      }, { status: 413 });
    }
    let signed;
    try {
      signed = caSignedUploadUrl(path, { upsert: true, ttlSeconds: UPLOAD_TTL_S });
    } catch (e) {
      console.error("[walkthrough/media] sign failed:", path, (e as Error)?.message);
      return NextResponse.json({ ok: false, error: "Could not prepare the upload." }, { status: 500 });
    }
    return NextResponse.json({
      ok: true, path, signedUrl: signed.signedUrl, token: signed.token,
      expiresInSeconds: UPLOAD_TTL_S,
    });
  }

  // ── commit ────────────────────────────────────────────────────────────────
  const { data: file, error: dlErr } = await caDownload(path);
  if (dlErr || !file) {
    if (kind === "video") {
      await sb.from("corporate_walkthroughs")
        .update({ video_error: "the recording did not arrive" }).eq("id", walk.id);
    }
    return NextResponse.json({ ok: false, error: "That didn't arrive. Try again." }, { status: 400 });
  }

  const raw = await file.arrayBuffer();
  if (raw.byteLength === 0 || raw.byteLength > cap) {
    await caRemove([path]);
    return NextResponse.json({
      ok: false, error: raw.byteLength ? "That file is too large." : "That recording was empty.",
    }, { status: 413 });
  }

  if (kind === "still") {
    // Normalised like every other photograph, because a confirmed mark becomes
    // a wall and its still becomes that wall's photo — which is then warped
    // under a design and embedded in a PDF.
    const norm = await normalizePhotoRemote(raw);
    if ("error" in norm) {
      await caRemove([path]);
      await sb.from("corporate_walkthrough_marks")
        .update({ still_path: null, still_error: "unreadable image" })
        .eq("id", String(b.markId ?? ""));
      return NextResponse.json({ ok: false, error: "That frame could not be read." }, { status: 400 });
    }
    const up = await caUpload(path, Buffer.from(norm.jpeg), {
      contentType: "image/jpeg", upsert: true, cacheControl: CACHE_MUTABLE,
    });
    if (up.error) {
      console.error("[walkthrough/media] still re-upload failed:", up.error.message);
      return NextResponse.json({ ok: false, error: "Could not save that frame." }, { status: 500 });
    }
    await sb.from("corporate_walkthrough_marks")
      .update({ still_path: path, still_error: null }).eq("id", String(b.markId ?? ""));
    return NextResponse.json({ ok: true, stillUrl: await signArt(sb, path, 900) });
  }

  // Video and audio are stored exactly as recorded. Deliberately NOT
  // re-encoded: workerd cannot, the container would have to, and every
  // transcode is a chance to lose the one artefact that cannot be recaptured.
  if (kind === "video") {
    const seconds = Number.isFinite(Number(b.seconds))
      ? Math.max(0, Math.min(MAX_VIDEO_SECONDS * 2, Math.round(Number(b.seconds)))) : null;
    await sb.from("corporate_walkthroughs").update({
      video_path: path, video_seconds: seconds, video_bytes: raw.byteLength,
      video_error: null, updated_at: new Date().toISOString(),
    }).eq("id", walk.id);
    return NextResponse.json({ ok: true, videoUrl: await signArt(sb, path, DAY) });
  }

  await sb.from("corporate_walkthroughs").update({
    audio_path: path, updated_at: new Date().toISOString(),
  }).eq("id", walk.id);
  return NextResponse.json({ ok: true });
}
