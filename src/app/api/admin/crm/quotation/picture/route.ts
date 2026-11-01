import { NextResponse } from "next/server";
import { requireStaff, notStaff } from "@/lib/staff-access";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { caSignedUrl, caUpload } from "@/lib/corporate-art-store";
import { normalizePhotoRemote, thumbnailBytesRemote } from "@/lib/media-client";
import { fetchQuotation, linePicturePath } from "@/lib/quotation/store";
import { lineAmount, lineSize, type LinePicture, type QuotationLine } from "@/lib/quotation/model";
import { requireMaterialSpec } from "@/lib/quotation/material-specs";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * The picture each wall of a quotation is shown with (Roheena, 6 October
 * 2026: "we add an image, then the measurement, then the quotation" — the
 * Vijay Sales sequence, for every quotation).
 *
 *   GET    ?id=<quotation id>
 *          → the walls with their pictures (signed, short-lived URLs).
 *   POST   multipart: quotation_id, seq, and EITHER file (an image) OR url
 *          (a link the server fetches — a Drive share link, a site photo);
 *          optional kind (proposed|site), caption, width_mm, height_mm.
 *          → the picture is normalised to a JPEG no wider than 1400px, put
 *            in the private store, and recorded on that line of the row.
 *   DELETE { quotation_id, seq } → the line's picture is removed.
 *
 * Only a DRAFT quotation can change: a sent revision is an offer someone
 * may hold us to, and its pictures are part of it. Staff only.
 */

const MAX_BYTES = 25 * 1024 * 1024;
const STORE_WIDTH = 1400;

type LineOut = {
  seq: number; location: string; basis: string; material: string; materialName: string; sqft: number;
  widthMm: number | null; heightMm: number | null; size: string | null;
  productHandle: string | null; pricingIssue: string | null;
  supplyAmount: number | null; installAmount: number | null;
  picture: (LinePicture & { url: string | null }) | null;
};

async function linesOut(q: NonNullable<Awaited<ReturnType<typeof fetchQuotation>>>): Promise<LineOut[]> {
  return Promise.all(q.document.lines.map(async (l) => ({
    seq: l.seq, location: l.location, basis: l.basis, material: l.material,
    materialName: requireMaterialSpec(l.material).shortName, sqft: l.sqft,
    widthMm: l.widthMm ?? null, heightMm: l.heightMm ?? null, size: lineSize(l),
    productHandle: l.productHandle ?? null, pricingIssue: q.pricingIssue ?? null,
    supplyAmount: q.pricingIssue ? null : lineAmount(q.document, l, "supply") ?? 0,
    installAmount: lineAmount(q.document, l, "install"),
    picture: l.picture ? { ...l.picture, url: await caSignedUrl(l.picture.path, 3600, { maxEdge: 640 }) } : null,
  })));
}

export async function GET(req: Request) {
  if (!(await requireStaff(req))) return notStaff();
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  const q = await fetchQuotation(id);
  if (!q) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, status: q.status, lines: await linesOut(q) });
}

/** A file from the form, or the bytes behind a link the server fetches.
 *  A Google Drive share link is turned into its download form. */
async function readImage(form: FormData): Promise<{ bytes: ArrayBuffer; error?: never } | { error: string; bytes?: never }> {
  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) return { error: "That picture is over 25 MB." };
    if (file.type && !file.type.startsWith("image/")) return { error: "Only an image can be a wall's picture." };
    return { bytes: await file.arrayBuffer() };
  }
  const raw = String(form.get("url") ?? "").trim();
  if (!raw) return { error: "Choose a picture or paste a link to one." };
  let url: URL;
  try { url = new URL(raw); } catch { return { error: "That link is not a web address." }; }
  if (url.protocol !== "https:") return { error: "Only https links can be fetched." };
  const drive = /^(?:drive|docs)\.google\.com$/.test(url.hostname)
    ? (/\/d\/([\w-]+)/.exec(url.pathname)?.[1] ?? url.searchParams.get("id"))
    : null;
  const target = drive ? `https://drive.google.com/uc?export=download&id=${drive}` : url.toString();
  const res = await fetch(target, { redirect: "follow", headers: { accept: "image/*,*/*;q=0.5" } });
  if (!res.ok) return { error: `The link could not be fetched (${res.status}). A Drive link must be shared with "anyone with the link".` };
  const type = res.headers.get("content-type") ?? "";
  if (!type.startsWith("image/")) return { error: `The link did not return a picture (${type.split(";")[0] || "unknown type"}).` };
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) return { error: "That picture is over 25 MB." };
  return { bytes };
}

export async function POST(req: Request) {
  if (!(await requireStaff(req))) return notStaff();
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "no_db" }, { status: 503 });
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "bad_form" }, { status: 400 });
  const id = String(form.get("quotation_id") ?? "");
  const seq = Math.round(Number(form.get("seq")));
  if (!/^[0-9a-f-]{36}$/i.test(id) || !(seq >= 1)) return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  const q = await fetchQuotation(id);
  if (!q) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (q.status !== "draft") return NextResponse.json({ error: "not_draft", detail: "Only a draft can change. Prepare a revision first." }, { status: 409 });
  const idx = q.document.lines.findIndex((l) => l.seq === seq);
  if (idx < 0) return NextResponse.json({ error: "no_such_wall" }, { status: 404 });

  const kindRaw = String(form.get("kind") ?? "proposed");
  const kind: LinePicture["kind"] = kindRaw === "site" ? "site" : "proposed";
  const caption = String(form.get("caption") ?? "").trim().slice(0, 120) || null;
  const widthMm = Math.round(Number(form.get("width_mm"))) || null;
  const heightMm = Math.round(Number(form.get("height_mm"))) || null;
  const hasImage = (form.get("file") instanceof File && (form.get("file") as File).size > 0) || String(form.get("url") ?? "").trim();

  const lines: QuotationLine[] = q.document.lines.map((l) => ({ ...l }));
  if (hasImage) {
    const read = await readImage(form);
    if (read.error !== undefined) return NextResponse.json({ error: "bad_picture", detail: read.error }, { status: 400 });
    // EXIF-rotated JPEG at a width that prints crisply at the document's
    // 200-point picture column and keeps a seven-wall quotation small enough
    // to email.
    let jpeg: ArrayBuffer;
    try {
      const norm = await normalizePhotoRemote(read.bytes);
      if ("error" in norm) return NextResponse.json({ error: "bad_picture", detail: "That file could not be read as a picture." }, { status: 400 });
      jpeg = (await thumbnailBytesRemote(norm.jpeg, { width: STORE_WIDTH, quality: 82, widthOnly: true })).buffer as ArrayBuffer;
    } catch (e) {
      console.error("[crm/quotation/picture] media failed:", e);
      return NextResponse.json({ error: "media_failed" }, { status: 502 });
    }
    const path = linePicturePath(q.id, seq);
    const up = await caUpload(path, jpeg, { contentType: "image/jpeg", upsert: true });
    if (up.error) return NextResponse.json({ error: "store_failed", detail: up.error.message }, { status: 502 });
    lines[idx].picture = { path, kind, caption };
  } else if (caption !== null || form.has("kind")) {
    if (lines[idx].picture) lines[idx].picture = { ...lines[idx].picture!, kind, caption: caption ?? lines[idx].picture!.caption };
  }
  if (form.has("width_mm") || form.has("height_mm")) {
    lines[idx].widthMm = widthMm;
    lines[idx].heightMm = heightMm;
  }
  const { error } = await sb.from("crm_quotations").update({ document: { ...q.document, lines } }).eq("id", q.id).eq("status", "draft");
  if (error) return NextResponse.json({ error: "save_failed", detail: error.message }, { status: 502 });
  const fresh = await fetchQuotation(id);
  return NextResponse.json({ ok: true, lines: fresh ? await linesOut(fresh) : [] });
}

export async function DELETE(req: Request) {
  if (!(await requireStaff(req))) return notStaff();
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "no_db" }, { status: 503 });
  const body = await req.json().catch(() => null) as { quotation_id?: string; seq?: number } | null;
  const id = String(body?.quotation_id ?? "");
  const seq = Math.round(Number(body?.seq));
  if (!/^[0-9a-f-]{36}$/i.test(id) || !(seq >= 1)) return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  const q = await fetchQuotation(id);
  if (!q) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (q.status !== "draft") return NextResponse.json({ error: "not_draft" }, { status: 409 });
  const lines = q.document.lines.map((l) => (l.seq === seq ? { ...l, picture: null } : l));
  const { error } = await sb.from("crm_quotations").update({ document: { ...q.document, lines } }).eq("id", q.id).eq("status", "draft");
  if (error) return NextResponse.json({ error: "save_failed", detail: error.message }, { status: 502 });
  const fresh = await fetchQuotation(id);
  return NextResponse.json({ ok: true, lines: fresh ? await linesOut(fresh) : [] });
}

/** Bind a quotation wall to its actual catalogue design, independently of its picture. */
export async function PATCH(req: Request) {
  if (!(await requireStaff(req))) return notStaff();
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  const b = await req.json();
  const q = await fetchQuotation(String(b.quotation_id ?? ""));
  if (!q || q.status !== "draft") return NextResponse.json({ error: "Only a draft quotation can change." }, { status: 409 });
  const line = q.document.lines.find((l) => l.seq === Number(b.seq));
  if (!line) return NextResponse.json({ error: "Wall not found." }, { status: 404 });
  const input = String(b.productHandle ?? "").trim();
  const handle = input.startsWith("https://zyvorah.com/products/") ? new URL(input).pathname.split("/").filter(Boolean).pop()! : input;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(handle)) return NextResponse.json({ error: "Enter the website design link or handle." }, { status: 400 });
  try {
    const { refreshQuotationCatalogue } = await import("@/lib/quotation/catalogue-server");
    const checked = await refreshQuotationCatalogue({ ...q.document, lines: [{ ...line, productHandle: handle, commissioned: false }] });
    const lines = q.document.lines.map((l) => l.seq === line.seq ? checked.lines[0] : l);
    const rates = [...q.document.rates.filter((r) => !checked.rates.some((c) => c.material === r.material)), ...checked.rates];
    const { error } = await sb.from("crm_quotations").update({ document: { ...q.document, lines, rates } }).eq("id", q.id).eq("status", "draft");
    if (error) throw error;
    const fresh = await fetchQuotation(q.id);
    return NextResponse.json({ lines: fresh ? await linesOut(fresh) : [] });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 409 });
  }
}
