import { NextResponse } from "next/server";
import { requireGatedUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normaliseEmail } from "@/lib/corporate-auth";

export const runtime = "nodejs";

// Read-only status for /account/trade and /account/trade/apply — lets both
// client pages resume an in-progress application or show the live account
// state without duplicating the trade_partners shape into a public RPC.
// (The anon-role RLS self-read policy from 0069 would work for a browser
// client too, but going through the service role here keeps every trade
// route on one consistent auth path and avoids a second Supabase client
// config just for this read.)
export async function GET() {
  const { user, blocked } = await requireGatedUser();
  if (blocked) return blocked;

  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ error: "service_unavailable" }, { status: 503 });

  const { data: customer } = await admin
    .from("customers")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!customer) return NextResponse.json({ partner: null });

  const { data: partner } = await admin
    .from("trade_partners")
    .select(
      "id, status, entity_type, legal_name, pan, pan_verified_at, gstin, gst_declared_none, " +
        "gstin_verified_at, entity_docs, bank_masked, penny_drop_status, proof_type, proof_verdict, " +
        "self_billing_consent_at, tc_accepted_at, commission_pct, markup_cap_pct, tds_pct, rejection_reason, created_at",
    )
    .eq("customer_id", customer.id)
    .maybeSingle();

  // Where a partner has been moved off this program rather than turned away,
  // this page is the last thing she has a link to — and "Suspended. Contact
  // hello@zyvorah.com." is all it could tell her. Shades read that as her
  // account being cut off, while the corporate portal she had actually been
  // moved to sat there working. So: if this same email opens a live corporate
  // account, say where it is instead of where it isn't.
  //
  // accountForEmail resolves by exact membership first and email DOMAIN second;
  // only the exact-membership half may be used here. A domain match would tell
  // every colleague on a shared company domain that the *partner's* suspended
  // account has moved, which is a different person's account state.
  let movedTo: { slug: string; name: string } | null = null;
  const partnerStatus = (partner as { status?: string } | null)?.status;
  if (partnerStatus === "suspended") {
    const { data: member } = await admin
      .from("corporate_members")
      .select("account_id")
      .eq("email", normaliseEmail(user.email))
      .eq("active", true)
      .limit(1);
    const accountId = member?.[0]?.account_id as string | undefined;
    if (accountId) {
      const { data: account } = await admin
        .from("corporate_accounts")
        .select("slug, name")
        .eq("id", accountId)
        .eq("active", true)
        .maybeSingle();
      if (account) movedTo = { slug: account.slug as string, name: account.name as string };
    }
  }

  return NextResponse.json({ partner: partner ?? null, movedTo });
}
