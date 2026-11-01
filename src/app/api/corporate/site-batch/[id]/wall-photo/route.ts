import { NextResponse } from "next/server";
import { currentCorporateSession, recordAudit } from "@/lib/corporate-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizePhotoRemote } from "@/lib/media-client";
import { caUpload } from "@/lib/corporate-art-store";
import { CACHE_MUTABLE } from "@/lib/storage-body";
import { detectWallQuad } from "@/lib/wall-quad";
import { partnerWorkflow } from "@/lib/ai-keys";

export const dynamic = "force-dynamic";

const MAX_PHOTO = 15 * 1024 * 1024;

// POST (multipart: seq, photo) → attach a site photograph to ONE wall of a
// batch that was measured before anyone could photograph it (Nelamangala,
// 13 October 2026: sizes on WhatsApp, the store not yet walked). The person
// on site opens the review page on a phone and takes the picture on the
// wall's own row. Any signed-in member of the account may add one: a
// photograph is evidence, not sign-off.
//
// The wall's designs are NOT re-chosen. A photo arriving after composition
// only lets the page draw the composed creative onto the wall (the quad);
// re-allocating from the photograph is a separate, deliberate recompose.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await currentCorporateSession();
  if (!session) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const { data: batch } = await sb.from("corporate_site_batches")
    .select("id, account_id").eq("id", id).maybeSingle();
  if (!batch || batch.account_id !== session.account.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let form: FormData;
  try { form = await req.formData(); } catch {
    return NextResponse.json({ error: "Attach a photograph." }, { status: 400 });
  }
  const seq = Number(form.get("seq"));
  const photo = form.get("photo");
  if (!Number.isInteger(seq) || seq < 1) return NextResponse.json({ error: "Which wall?" }, { status: 400 });
  if (!(photo instanceof File) || photo.size === 0 || !photo.type.startsWith("image/")) {
    return NextResponse.json({ error: "Attach a photograph." }, { status: 400 });
  }
  if (photo.size > MAX_PHOTO) return NextResponse.json({ error: "That photograph is over 15 MB." }, { status: 413 });

  const { data: wall } = await sb.from("corporate_site_batch_walls")
    .select("id, name, art_json").eq("batch_id", id).eq("seq", seq).maybeSingle();
  if (!wall) return NextResponse.json({ error: `There is no wall ${seq} in this store.` }, { status: 404 });

  // Phones hand over HEIC, rotated, 12-megapixel files; the media container
  // makes every one an upright JPEG of sensible size, as the intake does.
  const normal = await normalizePhotoRemote(await photo.arrayBuffer());
  if ("error" in normal) return NextResponse.json({ error: "That file could not be read as a photograph." }, { status: 400 });

  // A fresh name per upload: a replaced photo must never be served from cache.
  const path = `site/${id}/w${String(seq).padStart(2, "0")}-${Date.now()}.jpg`;
  const up = await caUpload(path, Buffer.from(normal.jpeg), {
    contentType: "image/jpeg", upsert: true, cacheControl: CACHE_MUTABLE,
  });
  if (up.error) return NextResponse.json({ error: "The photograph could not be saved. Please try again." }, { status: 502 });

  // Already composed → find the wall in the picture now, so the row shows the
  // creative on the wall straight away. Fails soft to side-by-side.
  const composed = Array.isArray(wall.art_json) && wall.art_json.length > 0;
  const quad = composed
    ? await detectWallQuad(sb, path, String(wall.name), "retail", partnerWorkflow(session.account.slug))
    : null;

  const { error } = await sb.from("corporate_site_batch_walls")
    .update({ photo_path: path, photo_error: null, quad_json: quad })
    .eq("id", wall.id);
  if (error) return NextResponse.json({ error: "The photograph could not be attached." }, { status: 500 });

  await recordAudit(session, "site_batch.wall_photo", { type: "site_batch", id }, { seq });
  return NextResponse.json({ ok: true, seq, onWall: quad != null });
}
