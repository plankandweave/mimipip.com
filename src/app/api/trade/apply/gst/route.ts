import { NextResponse } from "next/server";
import { requireGatedUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyGstin, gstinsByPan } from "@/lib/kyc";
import { resolveCustomerId, getTradePartnerRow, logKycEvent, verificationUnavailable } from "@/lib/trade-apply";

export const runtime = "nodejs";

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

// Step 3: either verify a supplied GSTIN, or — for a "not GST-registered"
// declaration — run GST-search-by-PAN first and auto-reject the declaration
// if a GSTIN actually exists against the PAN (spec: "Nice automation: run
// GST-search-by-PAN on every applicant"). Requires PAN verification to have
// completed (pan_verified_at set) since gstin-by-pan needs a confirmed PAN.
export async function POST(req: Request) {
  const { user, blocked } = await requireGatedUser();
  if (blocked) return blocked;

  let body: { gstin?: string; declareNone?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
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

  if (body.declareNone) {
    const found = await gstinsByPan(partner.pan!);
    await logKycEvent(partner.id, "gst_search_by_pan", found != null, { found });
    if (found == null) {
      return verificationUnavailable(partner, user.email, "GST (no-GST declaration)");
    }
    if (found.length > 0) {
      // Auto-reject the declaration — the applicant must enter one of these
      // (or another) GSTIN instead of declaring none.
      return NextResponse.json(
        { ok: false, error: "gstin_exists_for_pan", existingGstins: found },
        { status: 409 },
      );
    }
    await admin
      .from("trade_partners")
      .update({
        gstin: null,
        gst_declared_none: true,
        gstin_verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", partner.id);
    return NextResponse.json({ ok: true, declaredNone: true });
  }

  const gstin = (body.gstin ?? "").trim().toUpperCase();
  if (!GSTIN_RE.test(gstin)) {
    return NextResponse.json({ error: "invalid_gstin_format" }, { status: 400 });
  }

  const result = await verifyGstin(gstin);
  await logKycEvent(partner.id, "gstin_verify", result != null, result ?? { unavailable: true });
  if (!result) return verificationUnavailable(partner, user.email, "GSTIN");
  if (!result.valid) {
    return NextResponse.json({ ok: false, error: "gstin_not_active", status: result.status });
  }

  await admin
    .from("trade_partners")
    .update({
      gstin,
      gst_declared_none: false,
      gstin_verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", partner.id);

  return NextResponse.json({ ok: true, legalName: result.legalName, status: result.status });
}
