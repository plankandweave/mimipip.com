import { NextResponse } from "next/server";
import { requireGatedUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { namesLooselyMatch } from "@/lib/kyc";
import { sendEmail } from "@/lib/email";
import { tradeWelcomeEmail, tradeRejectedEmail } from "@/lib/email-templates";
import { SITE_URL } from "@/lib/seo";
import { resolveCustomerId, getTradePartnerRow, logKycEvent, notifyTradeApplication } from "@/lib/trade-apply";

export const runtime = "nodejs";

// Final step: self-billing consent + T&C acceptance, then the ONE place that
// decides active vs rejected — every earlier step only records a result,
// never flips status itself (spec: "Approval is 100% automatic ... no human
// verification step, ever", decided from everything on file at once, not
// step by step). Every hard-fail reason is returned so the UI can send the
// applicant back to fix exactly that step.
export async function POST(req: Request) {
  const { user, blocked } = await requireGatedUser();
  if (blocked) return blocked;

  let body: { selfBillingConsent?: boolean; tcAccepted?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (body.selfBillingConsent !== true || body.tcAccepted !== true) {
    return NextResponse.json({ error: "consent_required" }, { status: 400 });
  }

  const customerId = await resolveCustomerId(user);
  if (!customerId) return NextResponse.json({ error: "customer_link_failed" }, { status: 500 });

  const partner = await getTradePartnerRow(customerId);
  if (!partner) return NextResponse.json({ error: "no_application" }, { status: 400 });
  if (partner.status === "active") {
    return NextResponse.json({ ok: true, status: "active", already: true });
  }

  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ error: "service_unavailable" }, { status: 503 });

  const now = new Date().toISOString();
  await admin
    .from("trade_partners")
    .update({ self_billing_consent_at: now, tc_accepted_at: now, status: "verifying", updated_at: now })
    .eq("id", partner.id);

  // Evaluate every check against what's on file. Collect ALL failures rather
  // than short-circuiting on the first, so the rejection reason is specific
  // and the partner can fix everything in one pass before re-applying.
  const failures: string[] = [];

  if (!partner.pan_verified_at) failures.push("PAN not verified");

  if (!partner.gstin_verified_at) {
    failures.push("GST status not verified");
  }

  if (partner.entity_type !== "individual" && (partner.entity_docs?.length ?? 0) === 0) {
    failures.push("Entity documents (incorporation/partnership deed) not uploaded");
  }

  if (!partner.proof_verdict?.passed) {
    failures.push("Proof of trade did not pass automated review");
  }

  const bankNameMatch =
    !!partner.penny_drop_verified_name &&
    namesLooselyMatch(partner.penny_drop_verified_name, partner.pan_name || partner.legal_name);
  if (partner.penny_drop_status !== "completed") {
    failures.push("Bank account penny-drop verification did not complete");
  } else if (!bankNameMatch) {
    failures.push("Bank account registered name does not match your PAN name");
  }

  const passed = failures.length === 0;
  const reason = passed ? null : failures.join("; ");

  await logKycEvent(partner.id, "apply_decision", passed, { passed, failures });
  await notifyTradeApplication({
    tradePartnerId: partner.id,
    kind: "decided",
    legalName: partner.legal_name,
    applicantEmail: user.email,
    summary: passed
      ? "Submitted and APPROVED automatically — every check passed. They are active on trade pricing now. No action needed."
      : `Submitted and REJECTED automatically. Reasons: ${reason}`,
  });

  if (passed) {
    await admin
      .from("trade_partners")
      .update({ status: "active", rejection_reason: null, updated_at: new Date().toISOString() })
      .eq("id", partner.id);
    await admin
      .from("customers")
      .update({ segment: "trade", updated_at: new Date().toISOString() })
      .eq("id", customerId);

    await sendEmail({
      to: user.email,
      ...tradeWelcomeEmail({
        legalName: partner.legal_name,
        dashboardUrl: `${SITE_URL}/account/trade`,
      }),
    });

    return NextResponse.json({ ok: true, status: "active" });
  }

  await admin
    .from("trade_partners")
    .update({ status: "rejected", rejection_reason: reason, updated_at: new Date().toISOString() })
    .eq("id", partner.id);

  await sendEmail({
    to: user.email,
    ...tradeRejectedEmail({
      legalName: partner.legal_name,
      reason: reason!,
      applyUrl: `${SITE_URL}/account/trade/apply`,
    }),
  });

  return NextResponse.json({ ok: false, status: "rejected", reason });
}
