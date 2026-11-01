import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireStaff, notStaff } from "@/lib/staff-access";
import { hasServiceRole, serviceClient, uploadMedia } from "@/lib/marketing/db";
import { renderReel } from "@/lib/marketing/media/reel";
import { composeStillRemote } from "@/lib/media-client";
import { CANVAS } from "@/lib/marketing/media/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const staff = await requireStaff(req);
  if (!staff) return notStaff();
  if (!hasServiceRole()) return NextResponse.json({ error: "Marketing storage is unavailable" }, { status: 503 });

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const id = body?.id;
  const expectedUrl = body?.expectedUrl;
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 120) : "";
  const sub = typeof body?.sub === "string" ? body.sub.trim().slice(0, 180) : "";
  const sceneUrls = body?.sceneUrls;
  if (typeof id !== "string" || typeof expectedUrl !== "string" || !title ||
    !Array.isArray(sceneUrls) || sceneUrls.length < 2 || sceneUrls.length > 5 ||
    !sceneUrls.every((scene) => {
      if (typeof scene !== "string") return false;
      try {
        const url = new URL(scene);
        return url.protocol === "https:" && url.hostname === "zyvorah.com" &&
          url.pathname.startsWith("/media/product-images/");
      } catch { return false; }
    })) {
    return NextResponse.json({ error: "Choose two to five exact Zyvorah catalogue scenes and a title" }, { status: 400 });
  }

  const sb = serviceClient();
  const { data: row, error } = await sb.from("marketing_posts")
    .select("id, status, format, media_urls, caption, published_at")
    .eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row || !["reel", "story"].includes(row.format) || !["queued", "approved"].includes(row.status) || row.published_at) {
    return NextResponse.json({ error: "Only an unpublished Reel or Story can be replaced" }, { status: 409 });
  }
  if (row.media_urls?.[0] !== expectedUrl) {
    return NextResponse.json({ error: "This Reel changed. Refresh the desk before replacing it." }, { status: 409 });
  }

  const video = await renderReel(sceneUrls as string[], { title, sub, secondsPerScene: 2.5 });
  const hash = createHash("sha256").update(video).digest("hex").slice(0, 20);
  const base = `${row.format === "story" ? "stories" : "reels"}/corrected/${id}-${hash}`;
  // Instagram supplies the username and controls over a video cover. The
  // portrait poster is photo-only so a second brand mark cannot sit beneath it.
  const poster = await composeStillRemote(sceneUrls[0] as string, CANVAS.story.w, CANVAS.story.h, {
    layout: "editorial-story",
  });
  const posterHash = createHash("sha256").update(poster).digest("hex").slice(0, 20);
  const [url, posterUrl] = await Promise.all([
    uploadMedia(`${base}.mp4`, video, "video/mp4"),
    uploadMedia(`${base}-poster-${posterHash}.jpg`, poster, "image/jpeg"),
  ]);
  const { data: updated, error: writeError } = await sb.from("marketing_posts")
    .update({
      status: "queued",
      media_urls: [url],
      thumbnail_url: posterUrl,
      caption: typeof row.caption === "string"
        ? row.caption.replace(/\s*Wallpaper only\.(?=\s|$)/gi, "").trim()
        : row.caption,
      approved_at: null,
      approved_by: null,
      approved_digest: null,
      regenerate_requested_at: null,
      regenerate_requested_by: null,
      regenerate_reason: null,
      error: null,
    })
    .eq("id", id)
    .in("status", ["queued", "approved"])
    .is("published_at", null)
    .select("id")
    .maybeSingle();
  if (writeError) return NextResponse.json({ error: writeError.message }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "Reel was published while its replacement uploaded" }, { status: 409 });
  return NextResponse.json({ ok: true, url, approvalCleared: true });
}
