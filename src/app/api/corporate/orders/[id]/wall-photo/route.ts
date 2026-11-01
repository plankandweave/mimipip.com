import { NextResponse } from "next/server";
import { currentCorporateSession } from "@/lib/corporate-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { CACHE_MUTABLE } from "@/lib/storage-body";
import { caDownload, caRemove, caSignedUploadUrl, caUpload } from "@/lib/corporate-art-store";
import { normalizePhotoRemote } from "@/lib/media-client";
import { orderWallPhotoPath, orderWallPhotoUploadPath } from "@/lib/order-wall-photo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;
const UPLOAD_TTL_S = 900;

// The photograph of the wall an order is for — the reception wall with the
// print's area boxed in red that ZVY-20522 had nowhere to carry (26 Oct 2026).
// It goes on the installer's sheet beside the design, so the fitter sees where
// on the wall the print starts and stops.
//
// The same two-step path the survey photos take (walls/photo/route.ts):
// "sign" hands back a signed upload URL for a path WE derive, the browser PUTs
// the JPEG straight to storage, and "commit" re-reads what actually landed,
// normalises it and only then records it on the order. A signed URL cannot
// enforce a length, and the client's claimed size proves nothing.

async function ownOrder(id: string) {
  const session = await currentCorporateSession();
  if (!session) return { error: NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 }) };
  const sb = supabaseAdmin();
  if (!sb) return { error: NextResponse.json({ ok: false, error: "Unavailable" }, { status: 503 }) };
  const { data: order } = await sb.from("corporate_orders")
    .select("id, wall_photo_path").eq("id", id).eq("account_id", session.account.id).maybeSingle();
  if (!order) return { error: NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 }) };
  return { session, sb, order: order as { id: string; wall_photo_path: string | null } };
}

/** The photo itself, streamed: it sits in the private bucket. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await ownOrder(id);
  if ("error" in g) return g.error;
  if (!g.order.wall_photo_path) return new NextResponse("No wall photo", { status: 404 });
  const img = await caDownload(g.order.wall_photo_path);
  if (img.error || !img.data) return new NextResponse("Photo unavailable", { status: 502 });
  return new NextResponse(new Uint8Array(await img.data.arrayBuffer()), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, no-cache",
      "X-Robots-Tag": "noindex",
    },
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = await req.json().catch(() => ({})) as { action?: string; bytes?: number; contentType?: string };
  const action = String(b.action ?? "");
  if (action !== "sign" && action !== "commit") {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }
  const g = await ownOrder(id);
  if ("error" in g) return g.error;
  // Agreement gate (0095): no mutations on an account that has not signed.
  if (g.session.agreementPending) {
    return NextResponse.json({ ok: false, error: "agreement_required" }, { status: 403 });
  }
  const { sb } = g;

  // Derived here, never accepted from the caller: the bucket holds every
  // partner's artwork.
  const path = orderWallPhotoPath(id);
  const staged = orderWallPhotoUploadPath(id);

  if (action === "sign") {
    if ((Number(b.bytes) || 0) > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "That photo is too large. Take it again." }, { status: 413 });
    }
    const type = String(b.contentType ?? "");
    if (type && !type.startsWith("image/")) {
      return NextResponse.json({ ok: false, error: "Only a photo can be attached here." }, { status: 400 });
    }
    let signed;
    try {
      signed = caSignedUploadUrl(staged, { upsert: true, ttlSeconds: UPLOAD_TTL_S });
    } catch (e) {
      console.error("[orders/wall-photo] sign failed:", path, (e as Error)?.message);
      return NextResponse.json({ ok: false, error: "Could not prepare the upload." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, signedUrl: signed.signedUrl, contentType: "image/jpeg" });
  }

  // ── commit ────────────────────────────────────────────────────────────────
  // The upload sits at its own key; the order's photo is written only from a
  // file that was read and re-encoded, so a failed replacement leaves the
  // previous photo exactly as it was.
  const { data: file, error: dlErr } = await caDownload(staged);
  if (dlErr || !file) {
    return NextResponse.json({ ok: false, error: "That photo didn't arrive. Try again." }, { status: 400 });
  }
  const raw = await file.arrayBuffer();
  if (raw.byteLength > MAX_BYTES) {
    await caRemove([staged]).catch(() => {});
    return NextResponse.json({ ok: false, error: "That photo is too large. Take it again." }, { status: 413 });
  }
  // EXIF-rotated and re-encoded in the media container (no sharp on workerd):
  // an iPhone hands over HEIC otherwise, and the sheet needs a JPEG.
  const norm = await normalizePhotoRemote(raw);
  if ("error" in norm) {
    await caRemove([staged]).catch(() => {});
    return NextResponse.json({ ok: false, error: "That file isn't a photo we can read. Try another." }, { status: 400 });
  }
  const up = await caUpload(path, Buffer.from(norm.jpeg), {
    contentType: "image/jpeg", upsert: true, cacheControl: CACHE_MUTABLE,
  });
  if (up.error) {
    console.error("[orders/wall-photo] re-upload failed:", path, up.error.message);
    return NextResponse.json({ ok: false, error: "Could not save that photo. Try again." }, { status: 500 });
  }
  const { error: wErr } = await sb.from("corporate_orders")
    .update({ wall_photo_path: path, wall_photo_at: new Date().toISOString() })
    .eq("id", id);
  if (wErr) {
    console.error("[orders/wall-photo] attach failed:", id, wErr.message);
    return NextResponse.json({ ok: false, error: "Could not attach that photo to the order." }, { status: 500 });
  }
  await caRemove([staged]).catch(() => {});
  return NextResponse.json({ ok: true, width: norm.width, height: norm.height });
}
