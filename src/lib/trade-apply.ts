import { supabase } from "./supabase";
import "server-only";

import { NextResponse } from "next/server";

import type { GatedUser } from "./auth-server";
import { supabaseServerAuth } from "./auth-server";
import { supabaseAdmin } from "./supabase-admin";

// Shared helpers for the /api/trade/apply/* routes — every step needs the
// caller's customers.id and their (possibly draft) trade_partners row, and
// every vendor call needs to land in trade_kyc_events. Centralised here so
// the six apply routes don't each reinvent it.

/** Resolve the caller's customers.id via the SAME RPC the client uses
 *  (AuthProvider.ensureCustomerId -> link_auth_customer). Reusing it here —
 *  rather than reimplementing the create-or-link logic server-side — means
 *  there is exactly one place that decides how an auth user maps to a
 *  customers row. */
export async function resolveCustomerId(user: GatedUser): Promise<string | null> {
  const supabase = await supabaseServerAuth();
  const { data, error } = await supabase.rpc("link_auth_customer");
  if (error) {
    console.error("trade-apply: link_auth_customer failed:", error.message, "for", user.email);
    return null;
  }
  return (data as string | null) ?? null;
}

export type TradePartnerRow = {
  id: string;
  customer_id: string;
  status: string;
  entity_type: string;
  legal_name: string;
  pan: string | null;
  pan_name: string | null;
  pan_verified_at: string | null;
  gstin: string | null;
  gst_declared_none: boolean;
  gstin_verified_at: string | null;
  entity_docs: { path: string; label?: string }[];
  bank_masked: string | null;
  rzpx_contact_id: string | null;
  rzpx_fund_account_id: string | null;
  penny_drop_status: string | null;
  penny_drop_verified_name: string | null;
  proof_type: string | null;
  proof_ref: string | null;
  proof_verdict: { passed?: boolean; verdict?: unknown } | null;
  self_billing_consent_at: string | null;
  tc_accepted_at: string | null;
  commission_pct: number;
  markup_cap_pct: number;
  tds_pct: number;
  rejection_reason: string | null;
};

/** Fetch the caller's trade_partners row (service role — RLS only grants
 *  self-SELECT to the anon/authenticated roles, not the write paths these
 *  routes need). Null if they haven't started an application yet. */
export async function getTradePartnerRow(customerId: string): Promise<TradePartnerRow | null> {
  const admin = supabaseAdmin();
  if (!admin) return null;
  const { data } = await admin
    .from("trade_partners")
    .select("*")
    .eq("customer_id", customerId)
    .maybeSingle();
  return (data as TradePartnerRow) ?? null;
}

/** Append one row to the KYC audit trail. Never throws — a logging failure
 *  must never block the apply flow itself. */
export async function logKycEvent(
  tradePartnerId: string | null,
  eventType: string,
  ok: boolean,
  detail: unknown,
): Promise<void> {
  const admin = supabaseAdmin();
  if (!admin) return;
  const { error } = await admin.from("trade_kyc_events").insert({
    trade_partner_id: tradePartnerId,
    event_type: eventType,
    ok,
    detail: detail as never,
  });
  if (error) console.error("trade-apply: failed to log kyc event", eventType, error.message);
}

// ── Internal alerts ───────────────────────────────────────────────────────
// Until this was added a trade application landed nowhere a human would see:
// the flow is automatic-only, so a stuck applicant showed up as rows in
// trade_kyc_events and nothing else. One partner retried the PAN step eight
// times over three days before anyone found out, and only because they sent a
// WhatsApp. These alerts are the "somebody is applying" signal.
const ALERT_TO = process.env.TRADE_ALERTS_TO || "hello@zyvorah.com";

export type TradeAlertKind = "started" | "stuck" | "decided";

/** True when an alert of this kind already went out for this partner inside
 *  the window — so eight retries of a broken step are one email, not eight. */
async function alertAlreadySent(
  tradePartnerId: string,
  kind: TradeAlertKind,
  withinHours: number,
): Promise<boolean> {
  const admin = supabaseAdmin();
  if (!admin) return false;
  const since = new Date(Date.now() - withinHours * 3600_000).toISOString();
  const { data } = await admin
    .from("trade_kyc_events")
    .select("id")
    .eq("trade_partner_id", tradePartnerId)
    .eq("event_type", "alert_sent")
    .eq("detail->>kind", kind)
    .gte("created_at", since)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

/** Email the trade desk about an application. Never throws and never blocks
 *  the applicant's own request — a failed alert must not fail their apply. */
export async function notifyTradeApplication(input: {
  tradePartnerId: string;
  kind: TradeAlertKind;
  legalName: string;
  applicantEmail: string | null;
  /** Short human line: which step, which outcome, which failure. */
  summary: string;
}): Promise<void> {
  try {
    // "started" and "stuck" repeat as the applicant retries; a decision is
    // once per application and always worth sending.
    if (input.kind !== "decided" && (await alertAlreadySent(input.tradePartnerId, input.kind, 24))) {
      return;
    }

    const subjects: Record<TradeAlertKind, string> = {
      started: `Trade application started — ${input.legalName}`,
      stuck: `Trade application STUCK — ${input.legalName}`,
      decided: `Trade application decided — ${input.legalName}`,
    };

    const { sendEmail } = await import("./email");
    const { SITE_URL } = await import("./seo");
    await sendEmail({
      to: ALERT_TO,
      subject: subjects[input.kind],
      replyTo: input.applicantEmail || undefined,
      html: `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111;">
        <p><strong>${escapeHtml(input.legalName)}</strong></p>
        <p>${escapeHtml(input.summary)}</p>
        <p>Applicant: ${input.applicantEmail ? `<a href="mailto:${escapeHtml(input.applicantEmail)}">${escapeHtml(input.applicantEmail)}</a>` : "(email not on file)"}<br>
        Partner id: <code>${escapeHtml(input.tradePartnerId)}</code></p>
        <p style="color:#666;font-size:13px;">Trade desk alert from ${SITE_URL}. Reply to this email to reach the applicant directly.</p>
      </div>`,
    });

    await logKycEvent(input.tradePartnerId, "alert_sent", true, {
      kind: input.kind,
      to: ALERT_TO,
      summary: input.summary,
    });
  } catch (e) {
    console.error("trade-apply: alert failed", input.kind, e);
  }
}

/** The single "this step's vendor didn't answer" exit, shared by every apply
 *  route: alerts the desk (deduped) and returns the 503 the UI knows. */
export async function verificationUnavailable(
  partner: { id: string; legal_name: string },
  applicantEmail: string | null,
  step: string,
): Promise<NextResponse> {
  await notifyTradeApplication({
    tradePartnerId: partner.id,
    kind: "stuck",
    legalName: partner.legal_name,
    applicantEmail,
    summary: `Stuck at the ${step} step — automatic verification is unavailable, so they cannot get past it however many times they retry. Approve them manually or contact them.`,
  });
  return NextResponse.json({ ok: false, error: "verification_unavailable" }, { status: 503 });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
