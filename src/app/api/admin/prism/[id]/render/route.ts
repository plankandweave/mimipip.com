import { NextResponse } from "next/server";
import { requireStaff, notStaff } from "@/lib/staff-access";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { caDownload, caRemove, caSignedUploadUrl, caUpload } from "@/lib/corporate-art-store";
import { CACHE_MUTABLE } from "@/lib/storage-body";
import { signArt, DAY } from "@/lib/corporate-files";
import { prismRenderPath, type PreviewRow } from "@/lib/prism";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;

// A preview's render: drawn in the browser (WallMockup warps the design onto
// the photograph), exported once, uploaded through the same sign → PUT →
// commit path as a wall study. The path is fixed by the preview id; nothing
// from the body decides it.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!(await requireStaff(req))) return notStaff();
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "The desk is unavailable." }, { status: 503 });
  const b = await req.json().catch(() => ({})) as { action?: string; previewId?: string; bytes?: number };
  const { data: prevRow } = await sb.from("prism_wall_previews").select("*, prism_proposals!inner(blueprint_id, account_id)")
    .eq("id", String(b.previewId ?? "")).maybeSingle();
  const preview = prevRow as (PreviewRow & { prism_proposals: { blueprint_id: string; account_id: string } }) | null;
  if (!preview || preview.prism_proposals.blueprint_id !== id) return NextResponse.json({ error: "No such preview." }, { status: 404 });
  const { data: acc } = await sb.from("corporate_accounts").select("slug").eq("id", preview.prism_proposals.account_id).maybeSingle();
  const path = prismRenderPath((acc?.slug as string | undefined) ?? "unknown", preview.id);

  if (b.action === "sign") {
    if ((Number(b.bytes) || 0) > MAX_BYTES) return NextResponse.json({ error: "That render is too large." }, { status: 413 });
    const signed = caSignedUploadUrl(path, { upsert: true, ttlSeconds: 900 });
    return NextResponse.json({ ok: true, signedUrl: signed.signedUrl, path });
  }
  if (b.action === "commit") {
    const { data: file } = await caDownload(path);
    const raw = file ? await file.arrayBuffer() : null;
    if (!raw || raw.byteLength === 0 || raw.byteLength > MAX_BYTES) {
      if (raw) await caRemove([path]);
      await sb.from("prism_wall_previews").update({ render_error: "the render did not arrive" }).eq("id", preview.id);
      return NextResponse.json({ error: "That didn't arrive." }, { status: 400 });
    }
    if (file && !file.type.startsWith("image/jpeg")) {
      await caUpload(path, raw, { contentType: "image/jpeg", upsert: true, cacheControl: CACHE_MUTABLE });
    }
    await sb.from("prism_wall_previews").update({ render_path: path, render_error: null }).eq("id", preview.id);
    return NextResponse.json({ ok: true, renderUrl: await signArt(sb, path, DAY) });
  }
  return NextResponse.json({ error: "Bad request" }, { status: 400 });
}
