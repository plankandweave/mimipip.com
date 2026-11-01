import { NextRequest, NextResponse } from "next/server";
import { partnerCapabilities } from "@/lib/partner-capabilities";
import { currentCorporateSession } from "@/lib/corporate-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { DAY, canonicalArtUrl, signArt } from "@/lib/corporate-files";
import { caSignedUrl, caUpload } from "@/lib/corporate-art-store";
import { privateBucket, type R2UploadedPart } from "@/lib/r2-media";
import { imageMetaRemote, thumbnailRemote } from "@/lib/media-client";
import {
  ART_PART_BYTES, MAX_ART_BYTES, artContentType, artExt, artPathBelongsTo, largeArtRejection, validPart,
} from "@/lib/large-art-upload-rules";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Artwork too big for /api/corporate/upload's one request (print masters run
// to hundreds of MB; Cloudflare refuses any request over 100 MB). The browser
// starts an R2 multipart upload here, PUTs 20 MB parts, then completes it.
// The bytes never sit whole in a Worker: the media container reads the pixel
// size and draws the preview from a signed link. The answer has the same shape
// as the one-request route, so the order form treats both alike.

const PREVIEW_EDGE = 2400;

async function partnerSession() {
  const session = await currentCorporateSession();
  if (!session) return { error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  if (partnerCapabilities(session.account).poRequiredRelease) {
    return { error: NextResponse.json({ error: "Use the private customer workspace. PO acceptance is required." }, { status: 403 }) };
  }
  if (session.agreementPending) return { error: NextResponse.json({ error: "agreement_required" }, { status: 403 }) };
  return { session };
}

const key = (path: string) => `corporate-art/${path}`;

export async function POST(req: NextRequest) {
  const { session, error } = await partnerSession();
  if (!session) return error;
  const bucket = await privateBucket();
  const sb = supabaseAdmin();
  if (!bucket || !sb) return NextResponse.json({ error: "Storage not configured" }, { status: 503 });

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const action = String(b.action ?? "");

  if (action === "start") {
    const name = String(b.name ?? "");
    const size = Number(b.size);
    const rejection = largeArtRejection(name, size);
    if (rejection) return NextResponse.json({ error: rejection }, { status: 400 });
    const path = `${session.account.slug}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${artExt(name)}`;
    const upload = await bucket.createMultipartUpload(key(path), {
      httpMetadata: { contentType: artContentType(name)! },
    });
    return NextResponse.json({ ok: true, path, uploadId: upload.uploadId, partBytes: ART_PART_BYTES });
  }

  const path = String(b.path ?? "");
  const uploadId = String(b.uploadId ?? "");
  if (!uploadId || !artPathBelongsTo(path, session.account.slug)) {
    return NextResponse.json({ error: "Not your upload." }, { status: 403 });
  }
  const upload = bucket.resumeMultipartUpload(key(path), uploadId);

  if (action === "abort") {
    await upload.abort().catch(() => {});
    return NextResponse.json({ ok: true });
  }
  if (action !== "complete") return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const parts = (Array.isArray(b.parts) ? b.parts : [])
    .map((p) => ({ partNumber: Number((p as R2UploadedPart).partNumber), etag: String((p as R2UploadedPart).etag ?? "") }))
    .filter((p) => validPart(p.partNumber, MAX_ART_BYTES) && p.etag)
    .sort((x, y) => x.partNumber - y.partNumber);
  if (!parts.length) return NextResponse.json({ error: "No parts uploaded." }, { status: 400 });
  try {
    await upload.complete(parts);
  } catch (e) {
    console.error("[corporate/upload/large] complete failed:", path, (e as Error)?.message);
    return NextResponse.json({ error: "Upload did not finish — please try again." }, { status: 502 });
  }

  const head = await bucket.head(key(path));
  if (!head || head.size > MAX_ART_BYTES) {
    await bucket.delete(key(path)).catch(() => {});
    return NextResponse.json({ error: "That file is over 2 GB — please send a smaller export." }, { status: 413 });
  }

  // The container fetches the file itself; 15 minutes covers a slow read.
  const source = await caSignedUrl(path, 15 * 60);
  let width: number | null = null, height: number | null = null;
  try {
    if (!source) throw new Error("unsigned");
    const meta = await imageMetaRemote({ url: source });
    width = meta.width ?? null;
    height = meta.height ?? null;
  } catch (e) {
    console.error("[corporate/upload/large] image-meta failed:", path, (e as Error)?.message);
  }
  if (!width || !height) {
    await bucket.delete(key(path)).catch(() => {});
    return NextResponse.json({ error: "That file could not be read as an image." }, { status: 400 });
  }

  // A browser cannot show a TIFF, and a 300 MB PNG would stall the visualiser:
  // the form previews a JPEG drawn by the container. The original is what prints.
  let previewUrl: string | null = null;
  try {
    const jpeg = await thumbnailRemote(source!, PREVIEW_EDGE, 82);
    const previewPath = `${path}.preview.jpg`;
    const up = await caUpload(previewPath, jpeg, { contentType: "image/jpeg", upsert: true });
    if (!up.error) previewUrl = await signArt(sb, previewPath, DAY);
  } catch (e) {
    console.error("[corporate/upload/large] preview failed:", path, (e as Error)?.message);
  }

  return NextResponse.json({
    ok: true,
    url: canonicalArtUrl(sb, path),
    path,
    previewUrl,
    width, height, name: String(b.name ?? path),
  });
}

/** One part: ?path=&uploadId=&part=n, the raw bytes as the body. */
export async function PUT(req: NextRequest) {
  const { session, error } = await partnerSession();
  if (!session) return error;
  const bucket = await privateBucket();
  if (!bucket) return NextResponse.json({ error: "Storage not configured" }, { status: 503 });

  const q = req.nextUrl.searchParams;
  const path = q.get("path") ?? "";
  const uploadId = q.get("uploadId") ?? "";
  const part = Number(q.get("part"));
  if (!uploadId || !artPathBelongsTo(path, session.account.slug)) {
    return NextResponse.json({ error: "Not your upload." }, { status: 403 });
  }
  if (!validPart(part, MAX_ART_BYTES)) return NextResponse.json({ error: "Bad part." }, { status: 400 });
  if (Number(req.headers.get("content-length") ?? 0) > ART_PART_BYTES) {
    return NextResponse.json({ error: "Part too large." }, { status: 413 });
  }
  const bytes = await req.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > ART_PART_BYTES) {
    return NextResponse.json({ error: "Bad part." }, { status: 400 });
  }
  try {
    const done = await bucket.resumeMultipartUpload(key(path), uploadId).uploadPart(part, bytes);
    return NextResponse.json({ ok: true, partNumber: done.partNumber, etag: done.etag });
  } catch (e) {
    console.error("[corporate/upload/large] part failed:", path, part, (e as Error)?.message);
    return NextResponse.json({ error: "Part did not upload." }, { status: 502 });
  }
}
