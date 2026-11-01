import { NextResponse } from "next/server";
import { signArt } from "@/lib/corporate-files";
import { CACHE_MUTABLE } from "@/lib/storage-body";
import { caDownload, caRemove, caSignedUploadUrl, caUpload } from "@/lib/corporate-art-store";
import { ensureDraftBatch, guardMeasureRequest, touchLink } from "@/lib/measure-link";
import { normalizePhotoRemote } from "@/lib/media-client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Generous for a phone photo after client-side downscaling, mean enough that
 *  the bucket cannot be used as free hosting. */
const MAX_BYTES = 8 * 1024 * 1024;
/** One slot, one short window. A signed upload URL with upsert is a standing
 *  write hole for its whole lifetime. */
const UPLOAD_TTL_S = 900;
const PREVIEW_TTL_S = 900;

// POST → the two-step photo path, and the reason the whole feature works.
//
// The existing ingest takes every wall's photo as base64 inside one JSON body,
// with a per-wall cap of 16,000,000 base64 characters — describing a payload
// Vercel will never deliver, because the whole request is capped around 4.5 MB.
// Ten walls of phone photos is an order of magnitude over that, let alone forty.
//
// So the bytes never touch a Vercel function at all:
//   1. "sign"   → we mint a signed upload URL for a path WE derive
//   2. the phone PUTs the JPEG straight to *.supabase.co
//   3. "commit" → we re-read what actually landed, measure it, and record it
//
// Every zyvorah.com request in the flow is a few hundred bytes of JSON, at any
// wall count. Step 3 exists because a signed URL cannot enforce a length and the
// client's claimed size proves nothing.
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const b = await req.json().catch(() => ({})) as {
    action?: string; seq?: number; bytes?: number; contentType?: string;
  };
  const action = String(b.action ?? "");
  if (action !== "sign" && action !== "commit") {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }

  const g = await guardMeasureRequest(req, token, action === "sign" ? "sign" : "commit");
  if (!g.ok) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  const { link, store, account, sb } = g.ctx;

  const seq = Math.round(Number(b.seq));
  if (!Number.isFinite(seq) || seq < 1) {
    return NextResponse.json({ ok: false, error: "Which wall is this photo of?" }, { status: 400 });
  }

  const batchId = await ensureDraftBatch(sb, link, store, account);
  if (!batchId) return NextResponse.json({ ok: false, error: "Could not start this survey." }, { status: 500 });

  // Derived here, never accepted from the caller — otherwise the path is a
  // traversal primitive into a bucket holding every partner's artwork.
  const path = `site/${batchId}/w${String(seq).padStart(2, "0")}.jpg`;

  if (action === "sign") {
    const claimed = Number(b.bytes) || 0;
    if (claimed > MAX_BYTES) {
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
      console.error("[measure] sign-upload failed:", path, (e as Error)?.message);
      return NextResponse.json({ ok: false, error: "Could not prepare the upload." }, { status: 500 });
    }
    await sb.from("corporate_measure_links")
      .update({ photo_uploads: link.photo_uploads + 1 })
      .eq("id", link.id);
    return NextResponse.json({
      ok: true, path, signedUrl: signed.signedUrl, token: signed.token,
      expiresInSeconds: UPLOAD_TTL_S, contentType: "image/jpeg",
    });
  }

  // ── commit ────────────────────────────────────────────────────────────────
  // Measure what landed rather than trusting the caller. A dropped or unreadable
  // photo has to become a visible per-wall failure, because the allocator judges
  // a wall from its photograph and a silent "no photo" produces a degraded
  // allocation on a chain that ends at a printer.
  const { data: file, error: dlErr } = await caDownload(path);
  if (dlErr || !file) {
    await sb.from("corporate_site_batch_walls")
      .update({ photo_path: null, photo_error: "the photo did not arrive" })
      .eq("batch_id", batchId).eq("seq", seq);
    return NextResponse.json({ ok: false, error: "That photo didn't arrive. Try again." }, { status: 400 });
  }

  const raw = await file.arrayBuffer();
  if (raw.byteLength > MAX_BYTES) {
    // Enforce the cap where it can actually be enforced, and take the oversized
    // object back out rather than leaving it parked in the bucket.
    await caRemove([path]);
    await sb.from("corporate_site_batch_walls")
      .update({ photo_path: null, photo_error: "photo too large" })
      .eq("batch_id", batchId).eq("seq", seq);
    return NextResponse.json({ ok: false, error: "That photo is too large. Take it again." }, { status: 413 });
  }

  // Normalised in the media container (workerd cannot run sharp): EXIF-rotate
  // and re-encode to JPEG so what reaches the composer and the model is a known
  // format the right way up. A phone that hands over HEIC would otherwise be
  // stored as-is and then fail the Anthropic call — and because every wall
  // rides in ONE request, one bad file fails allocation for the whole store.
  const norm = await normalizePhotoRemote(raw);
  if ("error" in norm) {
    await caRemove([path]);
    await sb.from("corporate_site_batch_walls")
      .update({ photo_path: null, photo_error: "unreadable image" })
      .eq("batch_id", batchId).eq("seq", seq);
    console.error("[measure] photo unreadable:", path);
    return NextResponse.json({
      ok: false, error: "That file isn't a photo we can read. Take the picture again.",
    }, { status: 400 });
  }
  const normalised = Buffer.from(norm.jpeg);
  const width = norm.width, height = norm.height;

  const up = await caUpload(path, normalised, {
    contentType: "image/jpeg", upsert: true, cacheControl: CACHE_MUTABLE,
  });
  if (up.error) {
    await sb.from("corporate_site_batch_walls")
      .update({ photo_path: null, photo_error: up.error.message.slice(0, 300) })
      .eq("batch_id", batchId).eq("seq", seq);
    console.error("[measure] photo re-upload failed:", path, up.error.message);
    return NextResponse.json({ ok: false, error: "Could not save that photo. Try again." }, { status: 500 });
  }

  const { error: wErr } = await sb.from("corporate_site_batch_walls")
    .update({ photo_path: path, photo_error: null })
    .eq("batch_id", batchId).eq("seq", seq);
  if (wErr) {
    console.error("[measure] photo attach failed:", batchId, seq, wErr.message);
    return NextResponse.json({ ok: false, error: "Could not attach that photo to the wall." }, { status: 500 });
  }

  void touchLink(link.id, { wrote: true });
  return NextResponse.json({
    ok: true, seq, width, height,
    previewUrl: await signArt(sb, path, PREVIEW_TTL_S),
  });
}
