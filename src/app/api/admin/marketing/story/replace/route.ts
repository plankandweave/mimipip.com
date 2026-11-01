import { createHash } from "node:crypto";
import sharp from "sharp";
import { NextResponse } from "next/server";
import { requireStaff, notStaff } from "@/lib/staff-access";
import { hasServiceRole, serviceClient, uploadMedia } from "@/lib/marketing/db";
import { composeMeasuredStoryRemote } from "@/lib/media-client";
import { storyFramePath } from "@/lib/marketing/story-frame";
import { LAYOUT_VERSION, type LayoutFrame } from "@/lib/marketing/layout-check";
import { canReplaceStory, guardStoryReplacement, storyFrameRefusal, storyLayoutReceipt, storyReplacementKicker, storyReplacementReviewState } from "@/lib/marketing/story-replacement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Staff can correct a rendered Story without altering its plan or changing a
// published post. The old media URL remains immutable; approval is withdrawn
// because the new pixels have a different digest and must be reviewed again.
export async function POST(req: Request) {
  const staff = await requireStaff(req);
  if (!staff) return notStaff();
  if (!hasServiceRole()) return NextResponse.json({ error: "Marketing storage is unavailable" }, { status: 503 });

  const json = req.headers.get("content-type")?.includes("application/json")
    ? await req.json().catch(() => null) as Record<string, unknown> | null
    : null;
  const form = json ? null : await req.formData().catch(() => null);
  const id = json?.id ?? form?.get("id");
  const expectedUrl = json?.expectedUrl ?? form?.get("expectedUrl");
  const file = form?.get("image");
  if (typeof id !== "string" || typeof expectedUrl !== "string") {
    return NextResponse.json({ error: "Story id and current image URL are required" }, { status: 400 });
  }
  const sb = serviceClient();
  const { data: row, error } = await sb.from("marketing_posts")
    .select("id, plan_slot_id, slot_key, status, format, channel, product_handle, media_urls, caption, published_at, external_id, error, approved_at, approved_by, approved_digest, regenerate_requested_at, regenerate_requested_by, regenerate_reason")
    .eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!canReplaceStory(row) || !row) {
    return NextResponse.json({ error: "Only an unpublished Story can be replaced" }, { status: 409 });
  }
  if (row.media_urls?.[0] !== expectedUrl) {
    return NextResponse.json({ error: "This Story changed. Refresh the desk before replacing it." }, { status: 409 });
  }
  // Both doors end in the same measured composer: a catalogue scene, or a
  // photograph staff upload, is the SOURCE; the Story is drawn in the measured
  // portrait frame and refused before anything is stored if it fails a check.
  const rawTitle = json?.title ?? form?.get("title");
  const rawLine = json?.line ?? form?.get("line");
  const title = typeof rawTitle === "string" ? rawTitle.trim().slice(0, 120) : "";
  const line = typeof rawLine === "string" ? rawLine.trim().slice(0, 180) : "";
  if (!title) return NextResponse.json({ error: "Enter a headline for the Story" }, { status: 400 });
  let sourceUrl: string;
  if (json) {
    sourceUrl = typeof json.sourceUrl === "string" ? json.sourceUrl.trim() : "";
    let source: URL;
    try { source = new URL(sourceUrl); } catch { return NextResponse.json({ error: "Enter a catalogue scene URL" }, { status: 400 }); }
    const storefrontSource = source.hostname === "zyvorah.com" && source.pathname.startsWith("/media/product-images/");
    const firstPartyMediaSource = source.hostname === "media.zyvorah.com" && source.pathname.startsWith("/ahimsa/");
    if (source.protocol !== "https:" || (!storefrontSource && !firstPartyMediaSource)) {
      return NextResponse.json({ error: "Use an exact Zyvorah catalogue scene and a headline" }, { status: 400 });
    }
  } else {
    // An upload is a room photograph, not a finished frame: a pre-drawn Story
    // cannot be measured, so it is no longer accepted as-is.
    if (!(file instanceof File) || file.size === 0 || file.size > 8_000_000) {
      return NextResponse.json({ error: "Upload a room photograph under 8 MB" }, { status: 400 });
    }
    const raw = Buffer.from(await file.arrayBuffer());
    const meta = await sharp(raw).metadata().catch(() => null);
    if (!meta?.format || !["jpeg", "png", "webp"].includes(meta.format) || (meta.width ?? 0) < 1080 || (meta.height ?? 0) < 1080) {
      return NextResponse.json({ error: "Upload a JPEG, PNG or WebP room photograph at least 1080 px on each side" }, { status: 400 });
    }
    const photo = await sharp(raw).rotate().jpeg({ quality: 92 }).toBuffer();
    const photoHash = createHash("sha256").update(photo).digest("hex").slice(0, 20);
    // Kept, not deleted: it is the record of what staff supplied.
    sourceUrl = await uploadMedia(`story-sources/${id}-${photoHash}.jpg`, photo, "image/jpeg");
  }
  let bytes: Buffer;
  let frame: LayoutFrame;
  try {
    ({ bytes, frame } = await composeMeasuredStoryRemote(sourceUrl, {
      title, sub: line || undefined, kicker: storyReplacementKicker(sourceUrl),
    }));
  } catch (e) {
    return NextResponse.json({ error: `The Story could not be drawn in the measured frame: ${e instanceof Error ? e.message : String(e)}` }, { status: 422 });
  }
  const refusal = storyFrameRefusal(frame);
  if (refusal) return NextResponse.json({ error: refusal }, { status: 422 });

  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 20);
  const url = await uploadMedia(storyFramePath(`corrected/${id}-${hash}.jpg`), bytes, "image/jpeg");
  // Rotation posts created before plan pointers were introduced still appear
  // on the correct desk card through their day/sequence slot_key. Resolve and
  // persist that pointer while rebuilding so approval and publication read the
  // same measured plan slot as the desk.
  let planSlotId = typeof row.plan_slot_id === "string" ? row.plan_slot_id : null;
  if (!planSlotId && typeof row.slot_key === "string") {
    const [dayKey, sequence] = row.slot_key.split("#");
    const seq = Number.parseInt(sequence ?? "", 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(dayKey ?? "") && Number.isInteger(seq)) {
      const { data: legacySlot, error: legacySlotError } = await sb.from("marketing_plan_slots")
        .select("id")
        .eq("day_key", dayKey)
        .eq("seq", seq)
        .eq("channel", "instagram")
        .eq("kind", "story")
        .neq("status", "removed")
        .maybeSingle();
      if (legacySlotError) return NextResponse.json({ error: legacySlotError.message }, { status: 500 });
      planSlotId = typeof legacySlot?.id === "string" ? legacySlot.id : null;
    }
  }

  const update = sb.from("marketing_posts")
    .update({
      ...storyReplacementReviewState(row),
      ...(planSlotId ? { plan_slot_id: planSlotId } : {}),
      media_urls: [url],
      caption: typeof row.caption === "string"
        ? row.caption.replace(/\s*Wallpaper only\.(?=\s|$)/gi, "").replace(/([?!])\./g, "$1").trim()
        : row.caption,
      thumbnail_url: null,
      regenerate_requested_at: null,
      regenerate_requested_by: null,
      regenerate_reason: null,
    });
  const { data: updated, error: writeError } = await guardStoryReplacement(update, row)
    .select("id")
    .maybeSingle();
  if (writeError) return NextResponse.json({ error: writeError.message }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "This Story changed while the replacement uploaded. Refresh the desk before correcting it." }, { status: 409 });

  // The receipt is the frame the media container measured for these exact
  // bytes. Clear only the preview-era blockers this rebuild has resolved. The
  // Link sticker is optional (story-link.ts).
  if (planSlotId) {
    const { data: planned, error: planReadError } = await sb.from("marketing_plan_slots").select("art").eq("id", planSlotId).single();
    if (planReadError) return NextResponse.json({ error: planReadError.message }, { status: 500 });
    const art = { ...((planned?.art as Record<string, unknown> | null) ?? {}) };
    const blockers = Array.isArray(art.blockers) ? art.blockers.filter((b): b is string =>
      typeof b === "string" && !/link sticker|automatic Story publishing remains held|footer frame not yet exported|catalogue source preview|final publishable creative not exported/i.test(b)
    ) : [];
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    art.blockers = blockers;
    art.story_link_required = false;
    art.brand_layout = LAYOUT_VERSION;
    art.layout_receipt = storyLayoutReceipt(url, sha256, frame);
    const { error: planWriteError } = await sb.from("marketing_plan_slots").update({ art }).eq("id", planSlotId);
    if (planWriteError) return NextResponse.json({ error: planWriteError.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, url, approvalCleared: true });
}
