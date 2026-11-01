import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireGatedUser } from "@/lib/auth-server";
import { CACHE_IMMUTABLE } from "@/lib/storage-body";
import { mintUploadToken } from "@/lib/upload-token";
import { getProductImage, putProductImage } from "@/lib/product-images-store";
import { bakeRotationRemote } from "@/lib/media-client";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 25 * 1024 * 1024; // 25MB — customer camera/phone uploads can be large
// Below this longest-edge, a wall-sized print would look soft; we still allow
// it (the customer consents to variation) but flag it so the UI can warn.
const SOFT_PRINT_MAX_EDGE = 1600;

// Persist a customer's own artwork for the "Print Your Own" flow and return a
// durable public URL. That URL becomes the design in the configurator, so the
// crop — and therefore the print file — is the customer's image.
//
// Two entry modes:
// - JSON {objectKey}: the browser has ALREADY uploaded the file straight to
//   storage (bypassing Vercel's ~4.5MB request-body cap, which used to
//   silently kill any normal phone photo) — we download it server-side,
//   validate/rotate, and overwrite it in place.
// - multipart form (legacy): small files posted through this function.
/** Long enough for a big phone photo on a weak connection, short enough that a
 *  leaked URL is not a standing write hole. */
const UPLOAD_TTL_S = 60 * 60;
const EXT_RE = /^[a-z0-9]{1,5}$/;

export async function POST(req: Request) {
  // Accepts up to 25 MB into our storage bucket — verified customers only.
  const { blocked } = await requireGatedUser();
  if (blocked) return blocked;

  let raw: Buffer;
  let objectKey: string | null = null;

  const isJson = (req.headers.get("content-type") ?? "").includes("application/json");
  if (isJson) {
    let body: { objectKey?: string; action?: string; ext?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "invalid json" }, { status: 400 });
    }

    // Step 0: hand back a one-path signed URL so the browser can PUT the file
    // straight to storage without the bucket granting write access to anon.
    // The gate above is what authorises this, and the KEY IS OURS TO CHOOSE —
    // a caller-supplied path is how you would sign a write over a live
    // catalogue image. Everything below is unchanged: the same objectKey then
    // comes back for validation and EXIF rotation.
    if (body.action === "sign") {
      const ext = typeof body.ext === "string" ? body.ext.toLowerCase() : "";
      if (!EXT_RE.test(ext)) return NextResponse.json({ error: "bad_ext" }, { status: 400 });
      const key = `custom-uploads/${randomUUID()}.${ext}`;
      // upsert:true — this same key is deliberately overwritten below with
      // the validated, rotation-baked bytes.
      let token: string;
      try {
        token = mintUploadToken(key, { upsert: true, ttlSeconds: UPLOAD_TTL_S });
      } catch {
        return NextResponse.json({ error: "sign_failed" }, { status: 500 });
      }
      return NextResponse.json({
        objectKey: key,
        token,
        expiresInSeconds: UPLOAD_TTL_S,
      });
    }
    // Only files the browser flow itself placed under custom-uploads/ — never
    // an arbitrary storage path.
    if (
      typeof body.objectKey !== "string" ||
      !/^custom-uploads\/[A-Za-z0-9-]+\.[a-z0-9]+$/.test(body.objectKey)
    ) {
      return NextResponse.json({ error: "bad object key" }, { status: 400 });
    }
    objectKey = body.objectKey;
    const dl = await getProductImage(objectKey);
    if (!dl) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    raw = dl;
    if (raw.length > MAX_BYTES) {
      return NextResponse.json({ error: "too_large", maxMB: 25 }, { status: 400 });
    }
  } else {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ error: "expected multipart/form-data" }, { status: 400 });
    }
    const file = form.get("image");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "no image" }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "not_an_image" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "too_large", maxMB: 25 }, { status: 400 });
    }
    raw = Buffer.from(await file.arrayBuffer());
  }

  // Read real dimensions (and normalise orientation) in the media container;
  // a corrupt or non-decodable file is rejected here rather than failing later
  // at print. The container KEEPS the original format — this is the customer's
  // print artwork, and a lossy re-encode here would degrade the print.
  let width = 0, height = 0;
  let out = raw;
  let contentType = "image/jpeg";
  try {
    const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
    const baked = await bakeRotationRemote(ab);
    if ("error" in baked) throw new Error("unreadable");
    width = baked.width;
    height = baked.height;
    out = Buffer.from(baked.bytes);
    contentType = baked.contentType;
  } catch {
    return NextResponse.json({ error: "unreadable_image" }, { status: 400 });
  }

  const ext = (contentType.split("/")[1] || "jpg").replace("jpeg", "jpg");
  const finalKey = objectKey ?? `custom-uploads/${randomUUID()}.${ext}`;
  let url: string;
  try {
    ({ publicUrl: url } = await putProductImage(finalKey, out, { contentType, cacheControl: CACHE_IMMUTABLE }));
  } catch (e) {
    console.error("custom-upload storage error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "upload_failed" }, { status: 502 });
  }

  return NextResponse.json({
    url,
    width,
    height,
    lowRes: Math.max(width, height) < SOFT_PRINT_MAX_EDGE,
  });
}
