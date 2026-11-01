import { NextResponse } from "next/server";
import {
  canManageMembers, currentCorporateSession, normaliseEmail, recordAudit,
} from "@/lib/corporate-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { rulesFor } from "@/lib/account-types";

export const dynamic = "force-dynamic";

/**
 * The account's own record: what it is, who to contact, and what it was signed
 * up on.
 *
 * Two rules decide who sees what, and they are not the same rule:
 *
 *   · COMMERCIAL TERMS — the rate or discount, the credit limit and its ageing
 *     terms, the payment gate, the minimum order — are for the account's
 *     OWNERS only. A member who can place orders has no business reading what
 *     their employer negotiated, and the number is genuinely sensitive: at
 *     Vijay Sales the counter staff placing orders are not the people who
 *     agreed the discount. Non-owners get `terms: null` — the fields never
 *     enter the payload, so the answer is not merely hidden in the UI.
 *   · CONTACTS — who receives bills, who to call about an installation — are
 *     ordinary working information, readable by anyone on the account.
 *
 * Nobody in the portal EDITS the terms, owners included. They are what we
 * agreed with the entity; a partner changing their own discount at 9pm is the
 * one thing this page must never allow. Only the contact fields are writable,
 * and only by an owner (or our own desk).
 */

/** Fields the partner may change themselves. Deliberately short — everything
 *  absent from this list is ours, and POST cannot reach it. */
type Editable = {
  install_contact_name: string | null;
  install_contact_phone: string | null;
  followup_email: string | null;
  bill_cc_emails: string[] | null;
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function GET() {
  const session = await currentCorporateSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const { data, error } = await sb.from("corporate_accounts")
    .select("*").eq("id", session.account.id).single();
  if (error || !data) {
    console.error("[corporate/account] load failed:", error?.message);
    return NextResponse.json({ error: "Could not load the account." }, { status: 500 });
  }

  // Owners (and our staff) see the commercial terms. Everyone else gets a
  // payload that does not contain them at all.
  const owner = canManageMembers(session);

  return NextResponse.json({
    ok: true,
    canEdit: owner,
    canSeeTerms: owner,
    account: {
      slug: data.slug,
      name: data.name,
      legal_name: data.legal_name,
      email_domain: data.email_domain,
      logo_path: data.logo_path,
      channel_kind: data.channel_kind,
      ship_states: data.ship_states,
    },
    contacts: {
      install_contact_name: data.install_contact_name,
      install_contact_phone: data.install_contact_phone,
      followup_email: data.followup_email,
      bill_cc_emails: data.bill_cc_emails,
    },
    terms: owner ? {
      account_type: data.account_type,
      account_type_label: rulesFor(data.account_type).label,
      credit_limit_waived: !!data.credit_limit_waived,
      pricing_mode: data.pricing_mode,
      rate_per_sqft: Number(data.rate_per_sqft),
      discount_pct: Number(data.discount_pct),
      gst_pct: Number(data.gst_pct),
      print_gate: data.print_gate,
      credit_limit_inr: data.credit_limit_inr === null ? null : Number(data.credit_limit_inr),
      credit_terms_days: data.credit_terms_days,
      min_order_value_inr: data.min_order_value_inr === null ? null : Number(data.min_order_value_inr),
      proposal_validity_days: data.proposal_validity_days,
      agreement_required: data.agreement_required,
      agreement_signed_on: data.agreement_signed_on,
    } : null,
  });
}

export async function POST(req: Request) {
  const session = await currentCorporateSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (session.agreementPending) {
    return NextResponse.json({ error: "agreement_required" }, { status: 403 });
  }
  if (!canManageMembers(session)) {
    return NextResponse.json({
      error: "Only an account admin can change these details.",
    }, { status: 403 });
  }
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const patch: Partial<Editable> = {};

  if (body.install_contact_name !== undefined) {
    patch.install_contact_name = String(body.install_contact_name).trim().slice(0, 80) || null;
  }
  if (body.install_contact_phone !== undefined) {
    patch.install_contact_phone = String(body.install_contact_phone).trim().slice(0, 30) || null;
  }
  if (body.followup_email !== undefined) {
    const v = normaliseEmail(String(body.followup_email));
    if (v && !EMAIL_RE.test(v)) {
      return NextResponse.json({ error: "Enter a valid email address for accounts payable." }, { status: 400 });
    }
    patch.followup_email = v || null;
  }
  if (body.bill_cc_emails !== undefined) {
    // Accepts a comma- or newline-separated string, or an array. Any one bad
    // address refuses the whole edit rather than silently dropping it — a
    // billing contact the partner believes is saved but isn't is worse than
    // an error they can see.
    const raw = Array.isArray(body.bill_cc_emails)
      ? body.bill_cc_emails.map(String)
      : String(body.bill_cc_emails).split(/[,\n;]/);
    const list = raw.map(s => normaliseEmail(s)).filter(Boolean);
    const bad = list.find(v => !EMAIL_RE.test(v));
    if (bad) return NextResponse.json({ error: `"${bad}" is not a valid email address.` }, { status: 400 });
    patch.bill_cc_emails = list.length ? Array.from(new Set(list)).slice(0, 10) : null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  const { error } = await sb.from("corporate_accounts")
    .update(patch).eq("id", session.account.id);
  if (error) {
    console.error("[corporate/account] save failed:", error.message);
    return NextResponse.json({ error: "Could not save that." }, { status: 500 });
  }

  await recordAudit(session, "account.update",
    { type: "account", id: session.account.id }, patch as Record<string, unknown>);

  return NextResponse.json({ ok: true });
}
