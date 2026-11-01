import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireGatedUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { toUploadBody } from "@/lib/storage-body";
import { reviewProofDocument, reviewInstagramHandle } from "@/lib/trade-proof";
import { resolveCustomerId, getTradePartnerRow, logKycEvent, verificationUnavailable } from "@/lib/trade-apply";

export const runtime = "nodejs";
export const maxDuration = 60; // the AI review + (for Instagram) an outbound fetch

const BUCKET = "trade-kyc";
const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

// Step 4b: proof-of-trade — a bill the applicant issued a customer, another
// trade document, or their Instagram handle (spec: exactly one of these,
// reviewed automatically, no admin in the loop). Two entry modes on this one
// route, mirroring custom-upload's JSON-vs-multipart split:
//   - multipart with a `file` field -> proof_type 'bill' or 'document'
//     (`kind` field distinguishes them for the audit log; both are reviewed
//     identically) — uploaded to trade-kyc, then reviewed by Claude.
//   - JSON { instagramHandle } -> proof_type 'instagram', no upload, the
//     public profile page is fetched server-side and reviewed.
// The verdict is stored either way; it does NOT by itself flip the
// application's status — that happens at apply/submit, which is what
// actually evaluates pass/fail across every check together.
export async function POST(req: Request) {
  const { user, blocked } = await requireGatedUser();
  if (blocked) return blocked;

  const customerId = await resolveCustomerId(user);
  if (!customerId) return NextResponse.json({ error: "customer_link_failed" }, { status: 500 });

  const partner = await getTradePartnerRow(customerId);
  if (!partner) return NextResponse.json({ error: "no_application" }, { status: 400 });

  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ error: "service_unavailable" }, { status: 503 });

  const isJson = (req.headers.get("content-type") ?? "").includes("application/json");

  if (isJson) {
    let body: { instagramHandle?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }
    const handle = (body.instagramHandle ?? "").trim();
    if (!handle) return NextResponse.json({ error: "no_handle" }, { status: 400 });

    const result = await reviewInstagramHandle(handle);
    await logKycEvent(partner.id, "proof_review", result != null, {
      type: "instagram",
      handle,
      verdict: result?.verdict ?? null,
    });
    if (!result) return verificationUnavailable(partner, user.email, "proof of trade (Instagram)");

    await admin
      .from("trade_partners")
      .update({
        proof_type: "instagram",
        proof_ref: handle,
        proof_verdict: { passed: result.passed, verdict: result.verdict },
        updated_at: new Date().toISOString(),
      })
      .eq("id", partner.id);

    return NextResponse.json({ ok: true, passed: result.passed, verdict: result.verdict });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "expected_multipart_or_json" }, { status: 400 });
  }
  const file = form.get("file");
  const kind = form.get("kind") === "bill" ? "bill" : "document";
  if (!(file instanceof File)) return NextResponse.json({ error: "no_file" }, { status: 400 });
  if (!ALLOWED.has(file.type)) return NextResponse.json({ error: "unsupported_type" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "too_large", maxMB: 15 }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const base64 = buf.toString("base64");

  const result = await reviewProofDocument(base64, file.type);
  await logKycEvent(partner.id, "proof_review", result != null, {
    type: kind,
    verdict: result?.verdict ?? null,
  });
  if (!result) return verificationUnavailable(partner, user.email, "proof of trade (document)");

  const ext = (file.type.split("/")[1] || "bin").replace("jpeg", "jpg");
  const path = `${customerId}/proof/${randomUUID()}.${ext}`;
  const up = await admin.storage
    .from(BUCKET)
    .upload(path, toUploadBody(buf, file.type), { contentType: file.type, upsert: false });
  if (up.error) {
    console.error("trade/apply/proof: upload failed", up.error.message);
    return NextResponse.json({ error: "upload_failed" }, { status: 502 });
  }

  await admin
    .from("trade_partners")
    .update({
      proof_type: kind,
      proof_ref: path,
      proof_verdict: { passed: result.passed, verdict: result.verdict },
      updated_at: new Date().toISOString(),
    })
    .eq("id", partner.id);

  return NextResponse.json({ ok: true, passed: result.passed, verdict: result.verdict });
}
