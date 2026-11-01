import { NextResponse } from "next/server";
import { requireGatedUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyPan } from "@/lib/kyc";
import { resolveCustomerId, getTradePartnerRow, logKycEvent, verificationUnavailable } from "@/lib/trade-apply";

export const runtime = "nodejs";

// Step 2: PAN verification. Requires apply/start to have run first (the PAN
// and legal name it saved are what get verified here — this route doesn't
// accept a PAN of its own, so a caller can't verify a different PAN than the
// one on file). pan_verified_at is set ONLY when the vendor confirms both
// PAN validity AND a name match — a mismatch must be fixed via apply/start
// (correct the legal name or PAN) and re-verified, never waved through here.
export async function POST() {
  const { user, blocked } = await requireGatedUser();
  if (blocked) return blocked;

  const customerId = await resolveCustomerId(user);
  if (!customerId) return NextResponse.json({ error: "customer_link_failed" }, { status: 500 });

  const partner = await getTradePartnerRow(customerId);
  if (!partner) return NextResponse.json({ error: "no_application" }, { status: 400 });
  if (!partner.pan) return NextResponse.json({ error: "no_pan_on_file" }, { status: 400 });

  const result = await verifyPan(partner.pan, partner.legal_name);
  await logKycEvent(partner.id, "pan_verify", result != null, result ?? { unavailable: true });

  if (!result) return verificationUnavailable(partner, user.email, "PAN");

  const passed = result.valid && result.nameMatched;
  const admin = supabaseAdmin();
  if (admin && passed) {
    await admin
      .from("trade_partners")
      .update({
        pan_name: result.registeredName,
        pan_verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", partner.id);
  }

  return NextResponse.json({
    ok: passed,
    valid: result.valid,
    nameMatched: result.nameMatched,
    registeredName: result.registeredName,
    ...(passed
      ? {}
      : {
          error: !result.valid
            ? "pan_invalid"
            : "name_mismatch",
        }),
  });
}
