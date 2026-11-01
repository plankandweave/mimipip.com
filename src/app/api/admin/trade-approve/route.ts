import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email";
import { tradeWelcomeEmail } from "@/lib/email-templates";
import { SITE_URL } from "@/lib/seo";
import { logKycEvent } from "@/lib/trade-apply";
import { staffKey } from "@/lib/staff-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Manual, admin-only approval of a trade partner — the escape hatch the
// "approval is 100% automatic, no human verification step, ever" design
// deliberately left out, and which the program has needed since day one:
// with no vendor credentials in the environment every automated check
// degrades to "verification unavailable", so NO application can reach active,
// however good the applicant is.
//
// This route does not fake a vendor result. It never touches pan_verified_at,
// gstin_verified_at or penny_drop_status — those stay null so the record keeps
// saying, truthfully, that nothing was machine-verified. It records who
// approved and why in trade_kyc_events instead.
//
// Once the vendor credentials are configured this route should stay, but as
// the exception, not the path.
export async function POST(req: Request) {
  const key = await staffKey(req);
  if (!key) return NextResponse.json({ error: "missing_key" }, { status: 400 });

  let body: { partnerId?: string; approvedBy?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.partnerId) return NextResponse.json({ error: "partner_id_required" }, { status: 400 });
  // An override with no named approver and no stated reason is not an audit
  // trail, it is a hole in one.
  if (!body.approvedBy || !body.reason) {
    return NextResponse.json({ error: "approved_by_and_reason_required" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ error: "service_unavailable" }, { status: 503 });

  const { data: ok, error: keyError } = await admin.rpc("admin_key_ok", { p_key: key });
  if (keyError || !ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: partner } = await admin
    .from("trade_partners")
    .select("id, customer_id, legal_name, status")
    .eq("id", body.partnerId)
    .maybeSingle();
  if (!partner) return NextResponse.json({ error: "no_such_partner" }, { status: 404 });
  if (partner.status === "active") {
    return NextResponse.json({ ok: true, status: "active", already: true });
  }

  const { data: customer } = await admin
    .from("customers")
    .select("id, email")
    .eq("id", partner.customer_id)
    .maybeSingle();

  const now = new Date().toISOString();
  await admin
    .from("trade_partners")
    .update({ status: "active", rejection_reason: null, updated_at: now })
    .eq("id", partner.id);
  await admin
    .from("customers")
    .update({ segment: "trade", updated_at: now })
    .eq("id", partner.customer_id);

  await logKycEvent(partner.id, "manual_approval", true, {
    approvedBy: body.approvedBy,
    reason: body.reason,
    previousStatus: partner.status,
    automatedChecksPassed: false,
  });

  if (customer?.email) {
    await sendEmail({
      to: customer.email,
      ...tradeWelcomeEmail({
        legalName: partner.legal_name,
        dashboardUrl: `${SITE_URL}/account/trade`,
      }),
    });
  }

  return NextResponse.json({ ok: true, status: "active", emailedTo: customer?.email ?? null });
}
