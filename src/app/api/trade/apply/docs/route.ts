import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireGatedUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { toUploadBody } from "@/lib/storage-body";
import { resolveCustomerId, getTradePartnerRow, logKycEvent } from "@/lib/trade-apply";

export const runtime = "nodejs";
export const maxDuration = 30;

const BUCKET = "trade-kyc";
const MAX_BYTES = 20 * 1024 * 1024; // 20MB — scans of incorporation/deed PDFs
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

// Step 4a: entity documents (incorporation certificate / partnership deed),
// required for company/partnership applicants only. Multipart upload straight
// to the private trade-kyc bucket via the service role — never a public URL,
// unlike custom-upload's product-images bucket. Appends to entity_docs
// (jsonb array) rather than replacing, so multiple documents can be uploaded
// across calls.
export async function POST(req: Request) {
  const { user, blocked } = await requireGatedUser();
  if (blocked) return blocked;

  const customerId = await resolveCustomerId(user);
  if (!customerId) return NextResponse.json({ error: "customer_link_failed" }, { status: 500 });

  const partner = await getTradePartnerRow(customerId);
  if (!partner) return NextResponse.json({ error: "no_application" }, { status: 400 });
  if (partner.entity_type === "individual") {
    return NextResponse.json({ error: "not_applicable_for_individual" }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "expected_multipart" }, { status: 400 });
  }
  const file = form.get("file");
  const label = String(form.get("label") ?? "").slice(0, 80) || null;
  if (!(file instanceof File)) return NextResponse.json({ error: "no_file" }, { status: 400 });
  if (!ALLOWED.has(file.type)) return NextResponse.json({ error: "unsupported_type" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "too_large", maxMB: 20 }, { status: 400 });

  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ error: "service_unavailable" }, { status: 503 });

  const buf = Buffer.from(await file.arrayBuffer());
  const ext = (file.type.split("/")[1] || "bin").replace("jpeg", "jpg");
  const path = `${customerId}/entity-docs/${randomUUID()}.${ext}`;

  const up = await admin.storage
    .from(BUCKET)
    .upload(path, toUploadBody(buf, file.type), { contentType: file.type, upsert: false });
  if (up.error) {
    console.error("trade/apply/docs: upload failed", up.error.message);
    await logKycEvent(partner.id, "entity_doc_upload", false, { error: up.error.message });
    return NextResponse.json({ error: "upload_failed" }, { status: 502 });
  }

  const nextDocs = [...(partner.entity_docs ?? []), { path, label }];
  await admin
    .from("trade_partners")
    .update({ entity_docs: nextDocs, updated_at: new Date().toISOString() })
    .eq("id", partner.id);

  await logKycEvent(partner.id, "entity_doc_upload", true, { path, label });

  return NextResponse.json({ ok: true, path, count: nextDocs.length });
}
