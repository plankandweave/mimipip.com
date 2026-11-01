import { loadProposalCart } from "@/lib/proposal-cart";
import { NextResponse } from "next/server";
import { DAY, signArt } from "@/lib/corporate-files";
import { caUpload, caDownload } from "@/lib/corporate-art-store";
import { guardCapture } from "@/lib/portfolio-capture";
import { areaLabel } from "@/lib/portfolio";
import { istDateKey } from "@/lib/ist";
import { renderStudyBook, type WallForPdf } from "@/lib/study-pdf";

export const dynamic = "force-dynamic";
/** A dozen walls of embedded images: inside a minute, nowhere near ten seconds. */
export const maxDuration = 60;

/**
 * POST → build the space's wall studies as a PDF, store it, hand back a link.
 *
 * The link is long-lived on purpose. Whoever this gets forwarded to — a head of
 * design, a landlord, a board — will never hold a portal session, and a document
 * that dies in fifteen minutes is not something anyone can circulate.
 *
 * Overwritten on every build, one file per space. The studies it reports move
 * as directions are added and approved, so keeping revisions would mean handing
 * someone a link that is confidently out of date. It is a current view, not a
 * numbered offer — a quotation is the thing that gets frozen, and this is not
 * one. Purchasable proposals include their current checkout breakdown.
 */
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({})) as { areaId?: string; approvedOnly?: boolean };

  const g = await guardCapture(String(b.areaId ?? ""));
  if (!g.ok) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  const { sb, area, store, session } = g.ctx;

  const { data: batch } = await sb.from("corporate_site_batches")
    .select("id").eq("area_id", area.id).eq("status", "collecting").maybeSingle();
  if (!batch) {
    return NextResponse.json({ ok: false, error: "There are no walls in this space yet." }, { status: 404 });
  }

  const { data: wallRows } = await sb.from("corporate_site_batch_walls")
    .select("id, seq, name, width_mm, height_mm, photo_path, brief, voice_transcript")
    .eq("batch_id", batch.id).order("seq");
  if (!wallRows?.length) {
    return NextResponse.json({ ok: false, error: "There are no walls in this space yet." }, { status: 404 });
  }

  const ids = wallRows.map((w) => w.id as string);
  const { data: studyRows } = await sb.from("corporate_wall_studies")
    .select("id, wall_id, design_id, status, note, render_path, configuration, product_handle")
    .in("wall_id", ids).eq("account_id", session.account.id)
    .order("sort").order("created_at");

  if ((studyRows ?? []).some(s => (!b.approvedOnly || s.status === "approved") && s.configuration && !s.render_path)) {
    return NextResponse.json({ ok: false, error: "The latest design preview is still saving. Keep the proposal open, then try the PDF again." }, { status: 409 });
  }

  // Titles for the designs actually studied here, in one read.
  const designIds = [...new Set((studyRows ?? []).map((s) => s.design_id as string))];
  const { data: designs } = designIds.length
    ? await sb.from("corporate_designs").select("id, title, design_code").in("id", designIds)
    : { data: [] as { id: string; title: string; design_code: string | null }[] };
  const byDesign = new Map((designs ?? []).map((d) => [d.id as string, d]));

  const approvedOnly = Boolean(b.approvedOnly);

  const carts = new Map<string, {wallpaper:number;customisation:number;total:number}>();
  for (const s of studyRows ?? []) {
    if (!s.product_handle || (approvedOnly && s.status !== "approved")) continue;
    const priced = await loadProposalCart(area.id, s.id);
    if ("error" in priced) return NextResponse.json({ok:false,error:priced.error},{status:priced.status});
    carts.set(s.id, (priced.order?.service_breakdown ?? priced.breakdown) as {wallpaper:number;customisation:number;total:number});
  }

  // Worker self-fetch cannot serve its own private image URLs. Read the bucket
  // directly; do not publish a PDF with silently missing customer pictures.
  async function storedImage(path:string|null):Promise<Uint8Array|undefined> {
    if (!path) return undefined;
    const {data,error} = await caDownload(path);
    if (error || !data) throw new Error("A proposal image could not be loaded. Please try again.");
    return new Uint8Array(await data.arrayBuffer());
  }

  const walls: WallForPdf[] = await Promise.all(wallRows.map(async (w) => {
    const mine = (studyRows ?? []).filter((s) => s.wall_id === w.id)
      .filter((s) => !approvedOnly || s.status === "approved");
    return {
      seq: w.seq as number,
      name: w.name as string,
      widthMm: w.width_mm as number,
      heightMm: w.height_mm as number,
      brief: (w.brief as string | null) ?? null,
      spoken: (w.voice_transcript as string | null) ?? null,
      photoUrl: null,
      photoBytes: await storedImage(w.photo_path as string|null),
      studies: await Promise.all(mine.map(async (s) => {
        const d = byDesign.get(s.design_id as string);
        return {
          checkout: carts.get(s.id),
          designTitle: d?.title ?? "Design",
          designCode: d?.design_code ?? null,
          approved: s.status === "approved",
          // Signed for the length of the build, not the life of the link: the
          // bytes are embedded into the PDF here and the URL is never shared.
          renderUrl: null,
          renderBytes: await storedImage(s.render_path as string|null),
          note: [s.configuration ? `Proposed size: ${s.configuration.widthMm} x ${s.configuration.heightMm} mm` : null, s.note].filter(Boolean).join(" · ") || null,
        };
      })),
    };
  }));

  // Asking for approved-only and getting nothing back is worth saying plainly,
  // rather than handing over a document of empty cells.
  if (approvedOnly && walls.every((w) => w.studies.length === 0)) {
    return NextResponse.json({
      ok: false, error: "Nothing has been approved in this space yet.",
    }, { status: 409 });
  }

  let bytes: Uint8Array;
  try {
    bytes = await renderStudyBook({
      accountName: session.account.name,
      buildingName: store.name,
      areaLabel: areaLabel(area),
      dateLabel: istDateKey(),
      walls,
    });
  } catch (e) {
    console.error("[studies/pdf] render failed:", e);
    return NextResponse.json({ ok: false, error: "Could not build the document. Please try again." }, { status: 500 });
  }

  const safe = `${store.name} ${areaLabel(area)}`
    .replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").slice(0, 60);
  const filename = `Proposal-${safe || "space"}.pdf`;
  const path = `studies/${session.account.slug}/${area.id}.pdf`;

  const up = await caUpload(
    path, Buffer.from(bytes),
    { contentType: "application/pdf", upsert: true },
  );
  if (up.error) {
    console.error("[studies/pdf] upload failed:", up.error.message);
    return NextResponse.json({ ok: false, error: "Could not save the document." }, { status: 500 });
  }

  const url = await signArt(sb, path, DAY * 90);
  if (!url) return NextResponse.json({ ok: false, error: "Could not link the document." }, { status: 500 });

  return NextResponse.json({ ok: true, url, filename });
}
