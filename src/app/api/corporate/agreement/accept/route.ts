import { NextResponse } from "next/server";
import { currentCorporateSession, isAccountAdmin, recordAudit } from "@/lib/corporate-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isValidGstin } from "@/lib/gst";

export const dynamic = "force-dynamic";

// Web signature of the reseller agreement (migration 0095). This is the one
// write path into corporate_agreements: it validates that the session's
// account actually owes an acceptance, that the person accepting is an
// account ADMIN (staff cannot sign for a partner, and a plain member cannot
// bind the entity), and then records the execution evidence clause 15 of the
// agreement promises — name, business, email, GSTIN if given, timestamp, IP,
// user agent, version.
//
// Idempotent by construction: unique (account_id, version) means a
// double-click or a stale second tab inserts nothing and is told ok.

export async function POST(req: Request) {
  const session = await currentCorporateSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const version = session.account.agreement_required;
  if (!version) {
    return NextResponse.json({ error: "No agreement is required on this account." }, { status: 400 });
  }
  if (!session.agreementPending) {
    // Someone on the account already signed this version — a second acceptance
    // adds nothing, so the second signer just proceeds.
    return NextResponse.json({ ok: true, alreadyAccepted: true });
  }
  if (!isAccountAdmin(session)) {
    return NextResponse.json({
      error: "Only an account admin can accept the agreement for this business.",
    }, { status: 403 });
  }

  let body: { signatoryName?: string; businessName?: string; gstin?: string; accepted?: boolean } = {};
  try { body = await req.json(); } catch { /* handled below */ }

  const signatoryName = (body.signatoryName ?? "").trim();
  const businessName = (body.businessName ?? "").trim();
  const gstin = (body.gstin ?? "").trim().toUpperCase();

  if (body.accepted !== true) {
    return NextResponse.json({ error: "Tick the acceptance box to continue." }, { status: 400 });
  }
  if (!signatoryName) {
    return NextResponse.json({ error: "Your name is required — it is the signature." }, { status: 400 });
  }
  if (!businessName) {
    return NextResponse.json({ error: "The business name is required — it is who the agreement binds." }, { status: 400 });
  }
  if (gstin && !isValidGstin(gstin)) {
    return NextResponse.json({ error: "That GSTIN doesn't look right — 15 characters, e.g. 27AAAAA0000A1Z5. Leave it blank to add later." }, { status: 400 });
  }

  // Vercel terminates TLS in front of us, so the caller's address arrives in
  // x-forwarded-for; the first hop is the client.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip") || null;
  const userAgent = req.headers.get("user-agent")?.slice(0, 512) || null;

  const { data: row, error } = await sb.from("corporate_agreements").insert({
    account_id: session.account.id,
    version,
    signatory_name: signatoryName,
    signatory_email: session.email,
    business_name: businessName,
    gstin: gstin || null,
    ip,
    user_agent: userAgent,
  }).select("id").maybeSingle();

  if (error) {
    // 23505 = unique violation: this version was accepted between the check
    // above and the insert. That is the outcome the caller wanted.
    if (error.code === "23505") return NextResponse.json({ ok: true, alreadyAccepted: true });
    console.error("[corporate/agreement] insert failed:", error.message);
    return NextResponse.json({ error: "Could not record the acceptance. Please try again." }, { status: 500 });
  }

  await recordAudit(session, "agreement.accept", { type: "agreement", id: row?.id ?? version }, {
    version, signatoryName, businessName, gstin: gstin || null,
  });

  return NextResponse.json({ ok: true });
}
