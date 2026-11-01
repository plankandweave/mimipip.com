import { NextResponse } from "next/server";
import { requireGatedUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createRzpxContact, createRzpxFundAccount, validateFundAccount } from "@/lib/razorpay";
import { namesLooselyMatch } from "@/lib/kyc";
import { resolveCustomerId, getTradePartnerRow, logKycEvent, verificationUnavailable } from "@/lib/trade-apply";

export const runtime = "nodejs";
export const maxDuration = 30;

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

// Step 5: bank account penny-drop verification via RazorpayX (spec: "Bank
// account penny-drop verification at onboarding"). NEVER store the full
// account number — only the last 4 (bank_masked) plus the RazorpayX ids the
// account is referenced by from then on; the number itself goes to Razorpay
// only, once, in this request body.
export async function POST(req: Request) {
  const { user, blocked } = await requireGatedUser();
  if (blocked) return blocked;

  let body: { accountHolderName?: string; accountNumber?: string; ifsc?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const accountHolderName = (body.accountHolderName ?? "").trim();
  const accountNumber = (body.accountNumber ?? "").replace(/\s/g, "");
  const ifsc = (body.ifsc ?? "").trim().toUpperCase();

  if (accountHolderName.length < 2) {
    return NextResponse.json({ error: "invalid_account_holder_name" }, { status: 400 });
  }
  if (!/^[0-9]{6,20}$/.test(accountNumber)) {
    return NextResponse.json({ error: "invalid_account_number" }, { status: 400 });
  }
  if (!IFSC_RE.test(ifsc)) {
    return NextResponse.json({ error: "invalid_ifsc" }, { status: 400 });
  }

  const customerId = await resolveCustomerId(user);
  if (!customerId) return NextResponse.json({ error: "customer_link_failed" }, { status: 500 });

  const partner = await getTradePartnerRow(customerId);
  if (!partner) return NextResponse.json({ error: "no_application" }, { status: 400 });
  if (!partner.pan_verified_at) {
    return NextResponse.json({ error: "pan_not_verified" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ error: "service_unavailable" }, { status: 503 });

  let contactId = partner.rzpx_contact_id;
  if (!contactId) {
    contactId = await createRzpxContact({
      name: accountHolderName,
      email: user.email,
      referenceId: partner.id,
    });
    await logKycEvent(partner.id, "rzpx_contact", contactId != null, { contactId });
    if (!contactId) return verificationUnavailable(partner, user.email, "bank (RazorpayX contact)");
  }

  const fundAccountId = await createRzpxFundAccount(contactId, {
    name: accountHolderName,
    ifsc,
    accountNumber,
  });
  await logKycEvent(partner.id, "rzpx_fund_account", fundAccountId != null, { fundAccountId });
  if (!fundAccountId) return verificationUnavailable(partner, user.email, "bank (fund account)");

  const validation = await validateFundAccount(fundAccountId);
  await logKycEvent(partner.id, "rzpx_penny_drop", validation != null, validation ?? { unavailable: true });
  if (!validation) return verificationUnavailable(partner, user.email, "bank (penny drop)");

  const referenceName = partner.pan_name || partner.legal_name;
  const nameMatched =
    !!validation.registeredName && namesLooselyMatch(validation.registeredName, referenceName);

  await admin
    .from("trade_partners")
    .update({
      bank_masked: accountNumber.slice(-4),
      rzpx_contact_id: contactId,
      rzpx_fund_account_id: fundAccountId,
      penny_drop_status: validation.status,
      penny_drop_verified_name: validation.registeredName,
      updated_at: new Date().toISOString(),
    })
    .eq("id", partner.id);

  return NextResponse.json({
    ok: validation.status === "completed" && nameMatched,
    status: validation.status,
    registeredName: validation.registeredName,
    nameMatched,
  });
}
