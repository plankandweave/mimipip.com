import { NextResponse } from "next/server";
import { signArt } from "@/lib/corporate-files";
import { CACHE_MUTABLE } from "@/lib/storage-body";
import { caDownload, caRemove, caSignedUploadUrl, caUpload } from "@/lib/corporate-art-store";
import { normalizePhotoRemote } from "@/lib/media-client";
import { guardCapture } from "@/lib/portfolio-capture";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** A composed 1400px study is a few hundred KB. Generous, but not a host. */
const MAX_BYTES = 8 * 1024 * 1024;
const UPLOAD_TTL_S = 900;
const PREVIEW_TTL_S = 900;

// Storing the picture the client actually saw.
//
// The mockup is drawn in the BROWSER — WallMockup warps the artwork onto the
// wall photograph on a canvas — and on screen that is all it needs to be. But
// the PDF is assembled on a server that has no canvas and cannot run sharp, so
// it cannot redraw the warp for itself.
//
// Rather than build a second, server-side renderer that would drift from the
// first and quietly produce a PDF showing something slightly different from the
// screen, the browser that drew it exports its own canvas and uploads it. The
// PDF then embeds exactly what was approved.
//
// Same two-step as every other upload here: sign, PUT straight to storage,
// commit and re-read what actually landed.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({})) as {
    action?: string; areaId?: string; studyId?: string; bytes?: number; revision?: number;
  };
  const action = String(b.action ?? "");
  if (action !== "sign" && action !== "commit") {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }

  const g = await guardCapture(String(b.areaId ?? ""));
  if (!g.ok) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  const { sb, session } = g.ctx;

  const studyId = String(b.studyId ?? "");
  const { data: study } = await sb.from("corporate_wall_studies")
    .select("id, wall_id, revision").eq("id", studyId).eq("account_id", session.account.id).maybeSingle();
  if (!study) {
    return NextResponse.json({ ok: false, error: "That study isn't on your account." }, { status: 404 });
  }

  const { data: wall } = await sb.from("corporate_site_batch_walls").select("batch_id").eq("id", study.wall_id).maybeSingle();
  const { data: batch } = wall ? await sb.from("corporate_site_batches").select("id")
    .eq("id", wall.batch_id).eq("area_id", g.ctx.area.id).eq("status", "collecting").maybeSingle() : { data: null };
  if (!batch) return NextResponse.json({ ok: false, error: "That proposal isn't in this space." }, { status: 404 });
  if (!Number.isInteger(b.revision) || b.revision !== study.revision) {
    return NextResponse.json({ ok: false, error: "The proposal changed. Reload before saving its preview." }, { status: 409 });
  }

  // Derived from the study id, never taken from the caller — a path in a
  // request body is a traversal primitive into a bucket holding every partner's
  // artwork.
  const path = `studies/${session.account.slug}/${studyId}-r${study.revision}.jpg`;

  if (action === "sign") {
    if ((Number(b.bytes) || 0) > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "That image is too large." }, { status: 413 });
    }
    let signed;
    try {
      signed = caSignedUploadUrl(path, { upsert: true, ttlSeconds: UPLOAD_TTL_S });
    } catch (e) {
      console.error("[studies/render] sign failed:", path, (e as Error)?.message);
      return NextResponse.json({ ok: false, error: "Could not prepare the upload." }, { status: 500 });
    }
    return NextResponse.json({
      ok: true, path, signedUrl: signed.signedUrl, token: signed.token,
      expiresInSeconds: UPLOAD_TTL_S, contentType: "image/jpeg",
    });
  }

  // ── commit ────────────────────────────────────────────────────────────────
  const fail = async (reason: string, message: string, status: number) => {
    await caRemove([path]).catch(() => {});
    await sb.from("corporate_wall_studies")
      .update({ render_path: null, render_error: reason, updated_at: new Date().toISOString() })
      .eq("id", studyId).eq("revision", study.revision);
    return NextResponse.json({ ok: false, error: message }, { status });
  };

  const { data: file, error: dlErr } = await caDownload(path);
  if (dlErr || !file) return fail("the image did not arrive", "That didn't arrive. Try again.", 400);

  const raw = await file.arrayBuffer();
  if (raw.byteLength > MAX_BYTES) return fail("image too large", "That image is too large.", 413);

  // Normalised for the same reason a wall photo is: the PDF embeds this, and
  // pdf-lib takes JPEG or PNG and nothing else.
  const norm = await normalizePhotoRemote(raw);
  if ("error" in norm) return fail("unreadable image", "That image could not be read.", 400);

  const up = await caUpload(path, Buffer.from(norm.jpeg), {
    contentType: "image/jpeg", upsert: true, cacheControl: CACHE_MUTABLE,
  });
  if (up.error) {
    console.error("[studies/render] re-upload failed:", path, up.error.message);
    return fail(up.error.message.slice(0, 200), "Could not save that image.", 500);
  }

  const { data: saved, error } = await sb.from("corporate_wall_studies").update({
    render_path: path, render_error: null, updated_at: new Date().toISOString(),
  }).eq("id", studyId).eq("revision", study.revision).select("id").maybeSingle();
  if (error || !saved) return NextResponse.json({ ok: false, error: "The proposal changed before the preview saved." }, { status: 409 });

  return NextResponse.json({
    ok: true, renderUrl: await signArt(sb, path, PREVIEW_TTL_S),
  });
}
