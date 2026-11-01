import { partnerCapabilities } from "@/lib/partner-capabilities";
import { NextResponse } from "next/server";
import { canAdministerAccount, currentCorporateSession, recordAudit } from "@/lib/corporate-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizePhotoRemote } from "@/lib/media-client";
import { readSiteBatchIntake } from "@/lib/site-batch-intake";
import { CACHE_MUTABLE } from "@/lib/storage-body";
import { caRemove, caUpload } from "@/lib/corporate-art-store";
import { istDateKey } from "@/lib/ist";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_PDF = 8 * 1024 * 1024;
const MAX_PHOTO = 8 * 1024 * 1024;
const MAX_VIDEO = 25 * 1024 * 1024;
const MAX_TOTAL = 45 * 1024 * 1024;
const MAX_WALLS = 40;

const extOf = (name: string, fallback: string) => {
  const ext = name.toLowerCase().match(/\.([a-z0-9]{2,5})$/)?.[1];
  return ext && /^[a-z0-9]+$/.test(ext) ? ext : fallback;
};

export async function POST(req: Request) {
  const session = await currentCorporateSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (partnerCapabilities(session.account).poRequiredRelease) return NextResponse.json({ error: "Use the private customer workspace. PO acceptance is required." }, { status: 403 });
  if (session.agreementPending) return NextResponse.json({ error: "agreement_required" }, { status: 403 });
  if (!canAdministerAccount(session)) {
    return NextResponse.json({ error: "Only an account admin can create a measured order." }, { status: 403 });
  }
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  let form: FormData;
  try { form = await req.formData(); } catch {
    return NextResponse.json({ error: "Attach a PDF and the wall photographs." }, { status: 400 });
  }
  const storeId = String(form.get("storeId") ?? "");
  const pdf = form.get("measurements");
  const photos = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  const videoValue = form.get("video");
  const video = videoValue instanceof File && videoValue.size > 0 ? videoValue : null;
  const brief = String(form.get("brief") ?? "").trim().slice(0, 4000);
  // Zyvorah's own additions to the client's drawing, in the uploader's words.
  // Read from the same PDF by the intake, flagged, and carried through the
  // proposal as optional walls (site-batch-rules.ts).
  const suggestions = String(form.get("suggestions") ?? "").trim().slice(0, 2000);
  // Who at the partner sent this order, when it came by WhatsApp or email and
  // the uploader is only keying it in ("Amit, Vijay Sales"). The proposal
  // names them instead of the uploader (site-batch-rules.ts `orderOrigin`).
  const receivedFrom = String(form.get("receivedFrom") ?? "").trim().slice(0, 160) || null;
  // Where the survey starts. The form sends "no" for a survey of interior
  // walls; anything else keeps the whole-floor default, in which wall 1 and
  // the last wall are the entrance walls and lead with the city collection.
  const entranceInScope = String(form.get("entrance") ?? "yes").trim().toLowerCase() !== "no";
  const seriesNames = String(form.get("seriesNames") ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean).slice(0, 8);

  if (!(pdf instanceof File) || pdf.type !== "application/pdf") {
    return NextResponse.json({ error: "Attach the measurement drawing as a PDF." }, { status: 400 });
  }
  if (!photos.length || photos.length > MAX_WALLS) {
    return NextResponse.json({ error: `Attach between 1 and ${MAX_WALLS} wall photographs.` }, { status: 400 });
  }
  if (pdf.size > MAX_PDF || photos.some((p) => p.size > MAX_PHOTO) || (video && video.size > MAX_VIDEO)) {
    return NextResponse.json({ error: "A file is too large: PDF 8 MB, each photo 8 MB, video 25 MB." }, { status: 413 });
  }
  const totalBytes = pdf.size + photos.reduce((sum, p) => sum + p.size, 0) + (video?.size ?? 0);
  if (totalBytes > MAX_TOTAL) {
    return NextResponse.json({ error: "This intake is over 45 MB. Compress the walkthrough video and try again." }, { status: 413 });
  }

  const { data: store } = await sb.from("corporate_stores")
    .select("*").eq("id", storeId).eq("account_id", session.account.id).eq("active", true).maybeSingle();
  if (!store) return NextResponse.json({ error: "Pick a store on this account." }, { status: 400 });

  const normalized = [] as { name: string; jpeg: ArrayBuffer }[];
  for (const photo of photos) {
    if (!photo.type.startsWith("image/")) {
      return NextResponse.json({ error: `${photo.name} is not an image.` }, { status: 400 });
    }
    const result = await normalizePhotoRemote(await photo.arrayBuffer());
    if ("error" in result) {
      return NextResponse.json({ error: `${photo.name} could not be read as a photograph.` }, { status: 400 });
    }
    normalized.push({ name: photo.name, jpeg: result.jpeg });
  }

  let intake;
  try {
    intake = await readSiteBatchIntake({
      storeName: String(store.name),
      brief,
      measurementPdf: new Uint8Array(await pdf.arrayBuffer()),
      photos: normalized,
      suggestions,
      entranceInScope,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "The measurement intake could not be read.";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  const now = new Date().toISOString();
  const title = `${session.account.name} · ${store.name} · ${istDateKey()}`;
  const { data: batch, error: batchError } = await sb.from("corporate_site_batches").insert({
    account_id: session.account.id,
    store_id: store.id,
    title,
    status: "collecting",
    series_names: seriesNames.length ? seriesNames : (store.series_names ?? []),
    state: store.state,
    ship_address: store.address_line,
    ship_city: store.city,
    gps: store.gps,
    notes: [brief ? `Head office brief: ${brief}` : "", intake.summary].filter(Boolean).join("\n\n") || null,
    source: "staff_import",
    source_ref: pdf.name.slice(0, 240),
    created_by: session.email,
    received_from: receivedFrom,
    released_at: now,
    released_by_email: session.email,
    entrance_in_scope: entranceInScope,
    allocation_json: intake.warnings.length ? { warnings: intake.warnings } : null,
  }).select("id").single();
  if (batchError || !batch) {
    console.error("[site-batch/import] batch insert failed:", batchError?.message);
    return NextResponse.json({ error: "Could not create the survey." }, { status: 500 });
  }

  const batchId = batch.id as string;
  const uploaded: string[] = [];
  try {
    const pdfPath = `site/${batchId}/source/measurements.pdf`;
    const pdfUp = await caUpload(
      pdfPath, Buffer.from(await pdf.arrayBuffer()),
      { contentType: "application/pdf", upsert: true, cacheControl: CACHE_MUTABLE },
    );
    if (pdfUp.error) throw pdfUp.error;
    uploaded.push(pdfPath);

    // One stored photograph per uploaded file; walls point at it by path.
    // Five header bands over one refrigerator run share one photograph, and
    // a suggested wall may have none.
    const photoPathByIndex = new Map<number, string>();
    for (let i = 0; i < normalized.length; i++) {
      const path = `site/${batchId}/p${String(i + 1).padStart(2, "0")}.jpg`;
      const up = await caUpload(
        path, Buffer.from(normalized[i]!.jpeg),
        { contentType: "image/jpeg", upsert: true, cacheControl: CACHE_MUTABLE },
      );
      if (up.error) throw up.error;
      uploaded.push(path); photoPathByIndex.set(i + 1, path);
    }
    const photoPaths: (string | null)[] = intake.walls.map((wall) =>
      wall.photoIndex == null ? null : photoPathByIndex.get(wall.photoIndex) ?? null);

    let videoPath: string | null = null;
    if (video) {
      videoPath = `site/${batchId}/source/walkthrough.${extOf(video.name, "mp4")}`;
      const up = await caUpload(
        videoPath, Buffer.from(await video.arrayBuffer()),
        { contentType: video.type || "video/mp4", upsert: true, cacheControl: CACHE_MUTABLE },
      );
      if (up.error) throw up.error;
      uploaded.push(videoPath);
    }

    const rows = intake.walls.map((wall, i) => ({
      batch_id: batchId,
      seq: wall.seq,
      name: wall.name,
      room: wall.room,
      width_mm: wall.widthMm,
      height_mm: wall.heightMm,
      photo_path: photoPaths[i],
      notes: wall.note,
      status: "measured",
      suggested: wall.suggested,
      suggestion_reason: wall.suggestionReason,
      turns_into_next: wall.turnsIntoNext,
    }));
    const { error: wallError } = await sb.from("corporate_site_batch_walls").insert(rows);
    if (wallError) throw wallError;

    await sb.from("corporate_site_batches").update({
      intake_files: {
        measurements: { path: pdfPath, name: pdf.name },
        photos: intake.walls.filter((wall) => wall.photoIndex != null).map((wall) => ({
          path: photoPathByIndex.get(wall.photoIndex!) ?? null,
          name: photos[wall.photoIndex! - 1]!.name,
          photoIndex: wall.photoIndex,
          wallSeq: wall.seq,
        })),
        ...(videoPath && video ? { walkthrough: { path: videoPath, name: video.name } } : {}),
      },
    }).eq("id", batchId);
  } catch (e) {
    console.error("[site-batch/import] persistence failed:", e);
    if (uploaded.length) await caRemove(uploaded).catch(() => {});
    await sb.from("corporate_site_batches").delete().eq("id", batchId);
    return NextResponse.json({ error: "The files could not be saved. Nothing was released." }, { status: 500 });
  }

  await recordAudit(session, "site_batch.import", { type: "site_batch", id: batchId }, {
    store: store.name, walls: intake.walls.length, seriesNames, measurementFile: pdf.name, receivedFrom,
    entranceInScope, suggestedWalls: intake.walls.filter((w) => w.suggested).length,
  });
  return NextResponse.json({
    ok: true,
    batchId,
    title,
    walls: intake.walls.length,
    message: "Created and released. The AI is choosing designs and composing the proposal now.",
  });
}
