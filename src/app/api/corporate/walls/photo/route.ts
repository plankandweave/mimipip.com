import { NextResponse } from "next/server";
import { signArt } from "@/lib/corporate-files";
import { CACHE_MUTABLE } from "@/lib/storage-body";
import { caDownload, caRemove, caSignedUploadUrl, caUpload } from "@/lib/corporate-art-store";
import { normalizePhotoRemote } from "@/lib/media-client";
import { ensureAreaBatch, guardCapture } from "@/lib/portfolio-capture";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;
const UPLOAD_TTL_S = 900;
const PREVIEW_TTL_S = 900;

// The two-step photo path, exactly as the measurement link does it — the same
// reasoning applies and the same reasoning is worth restating:
//
//   1. "sign"   → a signed upload URL for a path WE derive
//   2. the phone PUTs the JPEG straight to *.supabase.co
//   3. "commit" → we re-read what actually landed, measure it, and record it
//
// The bytes never touch a function. A serverless request is capped around
// 4.5 MB and a lobby wall photographed on a modern phone is several MB before
// the client shrinks it; routing forty of those through JSON would describe a
// payload that is never delivered.
//
// Step 3 is not ceremony: a signed URL cannot enforce a length, and the
// client's claimed size proves nothing about what it then uploaded.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({})) as {
    action?: string; areaId?: string; seq?: number; bytes?: number; contentType?: string;
  };
  const action = String(b.action ?? "");
  if (action !== "sign" && action !== "commit") {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }

  const g = await guardCapture(String(b.areaId ?? ""));
  if (!g.ok) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  const { sb } = g.ctx;

  const seq = Math.round(Number(b.seq));
  if (!Number.isFinite(seq) || seq < 1) {
    return NextResponse.json({ ok: false, error: "Which wall is this photo of?" }, { status: 400 });
  }

  const batchId = await ensureAreaBatch(g.ctx);
  if (!batchId) {
    return NextResponse.json({ ok: false, error: "Could not open a survey for this space." }, { status: 500 });
  }

  // The wall must already exist. Saving the measurements first and attaching the
  // photo second is what makes a failed upload a retry rather than a lost wall.
  const { data: wall } = await sb.from("corporate_site_batch_walls")
    .select("id").eq("batch_id", batchId).eq("seq", seq).maybeSingle();
  if (!wall) {
    return NextResponse.json({ ok: false, error: "Save the wall before adding its photo." }, { status: 404 });
  }

  // Derived here, never accepted from the caller — otherwise the path is a
  // traversal primitive into a bucket holding every partner's artwork.
  const path = `site/${batchId}/w${String(seq).padStart(2, "0")}.jpg`;

  if (action === "sign") {
    if ((Number(b.bytes) || 0) > MAX_BYTES) {
      return NextResponse.json({
        ok: false,
        error: "That photo is too large. Take it again — the app shrinks photos before sending.",
      }, { status: 413 });
    }
    const type = String(b.contentType ?? "");
    if (type && !type.startsWith("image/")) {
      return NextResponse.json({ ok: false, error: "Only photos can be attached to a wall." }, { status: 400 });
    }

    let signed;
    try {
      signed = caSignedUploadUrl(path, { upsert: true, ttlSeconds: UPLOAD_TTL_S });
    } catch (e) {
      console.error("[walls/photo] sign failed:", path, (e as Error)?.message);
      return NextResponse.json({ ok: false, error: "Could not prepare the upload." }, { status: 500 });
    }
    return NextResponse.json({
      ok: true, path, signedUrl: signed.signedUrl, token: signed.token,
      expiresInSeconds: UPLOAD_TTL_S, contentType: "image/jpeg",
    });
  }

  // ── commit ────────────────────────────────────────────────────────────────
  // Measure what landed rather than trusting the caller. A dropped or unreadable
  // photo has to become a VISIBLE per-wall failure: the allocator judges a wall
  // from its photograph, so a silent "no photo" is a degraded design on a chain
  // that ends at a printer.
  const fail = async (reason: string, message: string, status: number) => {
    await caRemove([path]).catch(() => {});
    await sb.from("corporate_site_batch_walls")
      .update({ photo_path: null, photo_error: reason })
      .eq("batch_id", batchId).eq("seq", seq);
    return NextResponse.json({ ok: false, error: message }, { status });
  };

  const { data: file, error: dlErr } = await caDownload(path);
  if (dlErr || !file) {
    await sb.from("corporate_site_batch_walls")
      .update({ photo_path: null, photo_error: "the photo did not arrive" })
      .eq("batch_id", batchId).eq("seq", seq);
    return NextResponse.json({ ok: false, error: "That photo didn't arrive. Try again." }, { status: 400 });
  }

  const raw = await file.arrayBuffer();
  if (raw.byteLength > MAX_BYTES) {
    // Enforced where it can actually be enforced, and the oversized object is
    // taken back out rather than left parked in the bucket.
    return fail("photo too large", "That photo is too large. Take it again.", 413);
  }

  // Normalised in the media container (workerd cannot run sharp): EXIF-rotate
  // and re-encode to JPEG, so what reaches the composer and the model is a known
  // format the right way up. An iPhone hands over HEIC otherwise.
  const norm = await normalizePhotoRemote(raw);
  if ("error" in norm) {
    console.error("[walls/photo] unreadable:", path);
    return fail("unreadable image", "That file isn't a photo we can read. Take the picture again.", 400);
  }

  const up = await caUpload(path, Buffer.from(norm.jpeg), {
    contentType: "image/jpeg", upsert: true, cacheControl: CACHE_MUTABLE,
  });
  if (up.error) {
    console.error("[walls/photo] re-upload failed:", path, up.error.message);
    await sb.from("corporate_site_batch_walls")
      .update({ photo_path: null, photo_error: up.error.message.slice(0, 300) })
      .eq("batch_id", batchId).eq("seq", seq);
    return NextResponse.json({ ok: false, error: "Could not save that photo. Try again." }, { status: 500 });
  }

  const { error: wErr } = await sb.from("corporate_site_batch_walls")
    .update({ photo_path: path, photo_error: null })
    .eq("batch_id", batchId).eq("seq", seq);
  if (wErr) {
    console.error("[walls/photo] attach failed:", batchId, seq, wErr.message);
    return NextResponse.json({ ok: false, error: "Could not attach that photo to the wall." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true, seq, width: norm.width, height: norm.height,
    photoUrl: await signArt(sb, path, PREVIEW_TTL_S),
  });
}
