import { NextResponse } from "next/server";
import { requireGatedUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolveCustomerId, logKycEvent, notifyTradeApplication } from "@/lib/trade-apply";

export const runtime = "nodejs";

const ENTITY_TYPES = new Set(["individual", "company", "partnership"]);

// Step 1 of the apply flow: create or update the draft trade_partners row.
// Safe to call repeatedly — an existing draft/rejected row is updated in
// place rather than duplicated (customer_id is unique). A partner who is
// already active/verifying/suspended can't restart the flow through here.
export async function POST(req: Request) {
  const { user, blocked } = await requireGatedUser();
  if (blocked) return blocked;

  let body: { entityType?: string; legalName?: string; pan?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const entityType = (body.entityType ?? "").trim();
  const legalName = (body.legalName ?? "").trim();
  const pan = (body.pan ?? "").trim().toUpperCase();

  if (!ENTITY_TYPES.has(entityType)) {
    return NextResponse.json({ error: "invalid_entity_type" }, { status: 400 });
  }
  if (legalName.length < 2) {
    return NextResponse.json({ error: "invalid_legal_name" }, { status: 400 });
  }
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
    return NextResponse.json({ error: "invalid_pan_format" }, { status: 400 });
  }

  const customerId = await resolveCustomerId(user);
  if (!customerId) {
    return NextResponse.json({ error: "customer_link_failed" }, { status: 500 });
  }

  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ error: "service_unavailable" }, { status: 503 });

  const { data: existing } = await admin
    .from("trade_partners")
    .select("id, status")
    .eq("customer_id", customerId)
    .maybeSingle();

  if (existing && !["draft", "rejected"].includes(existing.status)) {
    return NextResponse.json(
      { error: "already_applied", status: existing.status },
      { status: 409 },
    );
  }

  // A PAN change on a rejected re-application clears everything downstream
  // of PAN — otherwise a stale pan_verified_at from a previous PAN would let
  // the submit step skip re-verifying the new one.
  const panChanged = existing != null && (await admin
    .from("trade_partners")
    .select("pan")
    .eq("id", existing.id)
    .single()).data?.pan !== pan;

  const row = {
    customer_id: customerId,
    entity_type: entityType,
    legal_name: legalName,
    pan,
    status: "draft" as const,
    rejection_reason: null,
    ...(panChanged
      ? {
          pan_name: null,
          pan_verified_at: null,
          gstin: null,
          gst_declared_none: false,
          gstin_verified_at: null,
        }
      : {}),
    updated_at: new Date().toISOString(),
  };

  const { data: saved, error } = existing
    ? await admin.from("trade_partners").update(row).eq("id", existing.id).select("id").single()
    : await admin.from("trade_partners").insert(row).select("id").single();

  if (error || !saved) {
    console.error("trade/apply/start: save failed", error?.message);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  await logKycEvent(saved.id, "apply_start", true, { entityType, legalName });
  await notifyTradeApplication({
    tradePartnerId: saved.id,
    kind: "started",
    legalName,
    applicantEmail: user.email,
    summary: `Started a trade application (${entityType}). Nothing to do yet — you'll get a second email if they get stuck or reach a decision.`,
  });

  return NextResponse.json({ ok: true, tradePartnerId: saved.id });
}
