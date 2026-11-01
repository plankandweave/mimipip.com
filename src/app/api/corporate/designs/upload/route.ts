import { partnerCapabilities } from "@/lib/partner-capabilities";
import { NextResponse } from "next/server";
import { imageMetaRemote } from "@/lib/media-client";
import { can, currentCorporateSession, recordAudit } from "@/lib/corporate-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { canonicalArtUrl } from "@/lib/corporate-files";
import { caSignedUrl, caUpload } from "@/lib/corporate-art-store";
import { privateBucket } from "@/lib/r2-media";
import { artPathBelongsTo } from "@/lib/large-art-upload-rules";
import { duplicateMessage, fingerprintStored, liveDuplicate, sha256Hex } from "@/lib/design-fingerprint";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The partner puts their OWN artwork into their OWN library.
 *
 * Nothing here waits on us. Their files are theirs — we have no verdict to
 * pass on a design Vijay Sales commissioned — so a row lands ready to print
 * the moment it uploads, and shows up on the new-order pick-list immediately.
 *
 * Distinct from /api/corporate/upload, which parks a single file against ONE
 * order being drafted and never joins the library. This one is the library.
 *
 * Everything is attributed: `uploaded_by` carries the person's email, not the
 * word "studio", and the audit log carries a line per file. Someone will ask
 * who put a design in months from now, and there is an answer.
 */

const MAX_BYTES = 60 * 1024 * 1024;  // per file — corporate art is deliberately big
const MAX_FILES = 25;                // one drag-and-drop of a folder, not a migration

type Result =
  | { ok: true; id: string; title: string; code: string | null; width: number; height: number }
  | { ok: false; name: string; error: string };

export async function POST(req: Request) {
  const session = await currentCorporateSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (partnerCapabilities(session.account).poRequiredRelease || !partnerCapabilities(session.account).customLibrary) return NextResponse.json({ error: "Use the private customer workspace. PO acceptance is required." }, { status: 403 });
  // Agreement gate (0095): no mutations on an account that has not signed.
  if (session.agreementPending) {
    return NextResponse.json({ error: "agreement_required" }, { status: 403 });
  }
  if (!can(session, "upload")) {
    return NextResponse.json({
      error: "You don't have permission to add designs. Ask one of your account admins.",
    }, { status: 403 });
  }
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Storage not configured" }, { status: 503 });

  const results: Result[] = [];

  /** One file already in the store → one library row, attributed. */
  const addToLibrary = async (
    path: string, name: string, width: number, height: number, series: string | null, note: string | null,
    fp: { sha256: string; size: number },
  ) => {
    // Title from the filename, extension stripped. It is what they recognise
    // the file by, and they can't rename it here — so don't invent something
    // they'd have to decode.
    const title = name.replace(/\.[^.]+$/, "").trim().slice(0, 200) || "Untitled design";

    const { data: row, error } = await sb.from("corporate_designs").insert({
      account_id: session.account.id,
      title,
      design_url: canonicalArtUrl(sb, path),
      design_w_px: width,
      design_h_px: height,
      // Ready to print. No approval exists to wait for (migration 0084).
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by_email: session.email,
      uploaded_by: session.email,
      series_name: series,
      concept_note: note,
      content_sha256: fp.sha256,
      byte_size: fp.size,
    }).select("id, design_code").single();

    if (error || !row) {
      console.error("[corporate/designs/upload] insert failed:", error?.message);
      results.push({ ok: false, name, error: "could not be saved to the library" });
      return;
    }

    await recordAudit(session, "design.upload", { type: "design", id: row.id as string }, {
      title, series, code: row.design_code, filename: name,
    });
    results.push({
      ok: true, id: row.id as string, title,
      code: (row.design_code as string | null) ?? null, width, height,
    });
  };

  if ((req.headers.get("content-type") ?? "").startsWith("application/json")) {
    // Files too big for one request arrive in parts through
    // /api/corporate/upload/large; this registers them. The pixel size is read
    // again from the stored file — never taken from the browser.
    const b = await req.json().catch(() => null) as
      { uploaded?: { path?: string; name?: string }[]; series?: string; note?: string } | null;
    const uploaded = Array.isArray(b?.uploaded) ? b!.uploaded!.slice(0, MAX_FILES) : [];
    if (uploaded.length === 0) return NextResponse.json({ error: "No files" }, { status: 400 });
    const series = String(b?.series ?? "").trim().slice(0, 120) || null;
    const note = String(b?.note ?? "").trim().slice(0, 2000) || null;
    const bucket = await privateBucket();
    for (const u of uploaded) {
      const path = String(u.path ?? "");
      const name = String(u.name ?? "design");
      if (!artPathBelongsTo(path, session.account.slug) || !(await bucket?.head(`corporate-art/${path}`))) {
        results.push({ ok: false, name, error: "upload not found — please try again" });
        continue;
      }
      let width: number | null = null, height: number | null = null;
      try {
        const source = await caSignedUrl(path, 15 * 60);
        if (!source) throw new Error("unsigned");
        const meta = await imageMetaRemote({ url: source });
        width = meta.width ?? null;
        height = meta.height ?? null;
      } catch {
        results.push({ ok: false, name, error: "could not be read as an image" });
        continue;
      }
      if (!width || !height) {
        results.push({ ok: false, name, error: "unknown image dimensions" });
        continue;
      }
      const fp = await fingerprintStored(path).catch(() => null);
      if (!fp) {
        results.push({ ok: false, name, error: "upload not found — please try again" });
        continue;
      }
      const dup = await liveDuplicate(sb, session.account.id, fp.sha256);
      if (dup) {
        results.push({ ok: false, name, error: duplicateMessage(dup) });
        continue;
      }
      await addToLibrary(path, name, width, height, series, note, fp);
    }
  } else {
    const form = await req.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: "Bad request" }, { status: 400 });

    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0) return NextResponse.json({ error: "No files" }, { status: 400 });
    if (files.length > MAX_FILES) {
      return NextResponse.json({
        error: `That's ${files.length} files — please upload ${MAX_FILES} or fewer at a time.`,
      }, { status: 413 });
    }

    // The collection these belong to. Blank is fine: they land in the loose pile
    // the library shows as "Individual designs".
    const series = String(form.get("series") ?? "").trim().slice(0, 120) || null;
    const note = String(form.get("note") ?? "").trim().slice(0, 2000) || null;

    for (const file of files) {
      const name = file.name || "design";
      if (file.size > MAX_BYTES) {
        results.push({ ok: false, name, error: "over 60 MB in one request — please try again" });
        continue;
      }

      const ab = await file.arrayBuffer();
      const buf = Buffer.from(ab);
      // Before anything is stored: the same bytes already live in this
      // library would be a second row of one picture.
      const fp = { sha256: await sha256Hex(ab), size: ab.byteLength };
      const dup = await liveDuplicate(sb, session.account.id, fp.sha256);
      if (dup) {
        results.push({ ok: false, name, error: duplicateMessage(dup) });
        continue;
      }
      let width: number | null = null, height: number | null = null;
      try {
        const meta = await imageMetaRemote(ab);
        width = meta.width ?? null;
        height = meta.height ?? null;
      } catch {
        results.push({ ok: false, name, error: "could not be read as an image" });
        continue;
      }
      if (!width || !height) {
        results.push({ ok: false, name, error: "unknown image dimensions" });
        continue;
      }

      const ext = (name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);
      const path = `${session.account.slug}/library/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const up = await caUpload(path, buf, {
        contentType: file.type || "image/png",
        upsert: false,
      });
      if (up.error) {
        console.error("[corporate/designs/upload]", up.error.message);
        results.push({ ok: false, name, error: "upload failed — please try again" });
        continue;
      }
      await addToLibrary(path, name, width, height, series, note, fp);
    }
  }

  const added = results.filter((r): r is Extract<Result, { ok: true }> => r.ok);
  return NextResponse.json({
    ok: added.length > 0,
    added: added.length,
    failed: results.length - added.length,
    results,
  }, { status: added.length > 0 ? 200 : 400 });
}
