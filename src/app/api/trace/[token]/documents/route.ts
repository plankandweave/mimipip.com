import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { NextResponse } from "next/server";
import { guardTraceRequest } from "@/lib/trace-link";
import { traceRequestId } from "@/lib/trace-request-id";
import { MAX_TRACE_PLAN_BYTES, tracePlansEnabled } from "@/lib/trace-plan";
import { privateBucket } from "@/lib/r2-media";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Upload-only. No document list or read route. PDF is small enough for the
 * existing Worker body transport; its credential is rechecked on every retry.
 * The durable Vault row/object have no link-expiry lifecycle. */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const g = await guardTraceRequest(req, token, "commit");
  if (!g.ok) return NextResponse.json({ ok: false, error: g.error, state: g.state }, { status: g.status });
  const { account, blueprint, link, sb } = g.ctx;
  if (!tracePlansEnabled(account)) return NextResponse.json({ ok: false, error: "Plan uploads are not enabled on this link." }, { status: 403 });
  let id: string | null;
  try { id = traceRequestId(link.id, "plan", req.headers.get("x-trace-request-id")); }
  catch { id = null; }
  if (!id) return NextResponse.json({ ok: false, error: "A valid upload retry key is required." }, { status: 400 });
  if (req.headers.get("content-type")?.split(";")[0] !== "application/pdf") return NextResponse.json({ ok: false, error: "Choose a PDF plan." }, { status: 415 });
  if (Number(req.headers.get("content-length")) > MAX_TRACE_PLAN_BYTES) return NextResponse.json({ ok: false, error: "PDF plans must be at most 20 MiB." }, { status: 413 });
  const bytes = await req.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > MAX_TRACE_PLAN_BYTES) return NextResponse.json({ ok: false, error: "Choose a nonempty PDF of at most 20 MiB." }, { status: 413 });
  try {
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error("not PDF");
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    if (!pdf.getPageCount()) throw new Error("empty PDF");
  } catch { return NextResponse.json({ ok: false, error: "This PDF could not be read. Export an unlocked PDF and try again." }, { status: 415 }); }
  const digest = createHash("sha256").update(new Uint8Array(bytes)).digest("hex");
  const path = `trace-plans/${account.slug}/${id}-${digest}.pdf`;
  let title = "Site plan";
  try { title = decodeURIComponent(req.headers.get("x-file-name") ?? "Site plan").trim().slice(0, 140) || title; } catch { /* safe fallback */ }
  const lookup = async () => sb.from("vault_documents").select("id, path, deleted_at, bytes")
    .eq("id", id).eq("account_id", account.id).eq("blueprint_id", blueprint.id).eq("kind", "plan").maybeSingle();
  let { data: row, error } = await lookup();
  if (error) return NextResponse.json({ ok: false, error: "Could not check the upload. Retry." }, { status: 503 });
  if (!row) {
    const inserted = await sb.from("vault_documents").insert({
      id, account_id: account.id, blueprint_id: blueprint.id, kind: "plan", title,
      path, content_type: "application/pdf", source: "upload",
      uploaded_by_email: link.recipient_email, uploaded_by_name: link.recipient_name,
      deleted_at: new Date().toISOString(),
    }).select("id, path, deleted_at, bytes").single();
    row = inserted.data;
    if (!row) ({ data: row, error } = await lookup()); // concurrent/lost-response insert
    if (error || !row) return NextResponse.json({ ok: false, error: "Could not prepare the plan. Retry." }, { status: 503 });
  }
  if (row.path !== path) return NextResponse.json({ ok: false, error: "That retry belongs to a different file. Choose the file again." }, { status: 409 });
  if (row.deleted_at && row.bytes) return NextResponse.json({ ok: false, error: "This plan was removed by Zyvorah. Contact us before uploading it again." }, { status: 410 });
  if (!row.deleted_at && row.bytes) return NextResponse.json({ ok: true, id: row.id });
  const bucket = await privateBucket();
  if (!bucket) return NextResponse.json({ ok: false, error: "Private storage is unavailable. Retry." }, { status: 503 });
  try {
    // Atomic create-only: a duplicate/replayed request cannot change saved bytes.
    const stored = await bucket.put(`corporate-art/${path}`, bytes, {
      onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: { contentType: "application/pdf", cacheControl: "private, no-store" },
    });
    if (!stored) {
      const existing = await bucket.head(`corporate-art/${path}`);
      if (!existing || existing.size !== bytes.byteLength) throw new Error("incomplete upload");
    }
  } catch { return NextResponse.json({ ok: false, error: "The plan did not save. Keep this page open and retry." }, { status: 502 }); }
  const saved = await sb.from("vault_documents").update({ bytes: bytes.byteLength, deleted_at: null })
    .eq("id", id).eq("account_id", account.id).eq("blueprint_id", blueprint.id).eq("path", path).select("id").maybeSingle();
  if (saved.error || !saved.data) return NextResponse.json({ ok: false, error: "The file arrived but its receipt did not save. Retry." }, { status: 503 });
  return NextResponse.json({ ok: true, id });
}
