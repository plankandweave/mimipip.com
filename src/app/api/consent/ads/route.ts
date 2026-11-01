import { NextResponse } from "next/server";
import { supabaseServerAuth } from "@/lib/auth-server";
import { ADS_CONSENT_POLICY_VERSION } from "@/lib/ads-consent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Ads-personalisation consent (Customer Match) for the SIGNED-IN customer.
//
//   GET  /api/consent/ads                      → { granted: boolean }
//   POST /api/consent/ads { granted, source }  → { granted }
//
// Deliberately session-only: set_ads_consent writes against auth.uid(), so a
// consent row can only ever belong to someone who proved the address by OTP.
// There is no way to opt in a third party's email through this route.

export async function GET() {
  const supabase = await supabaseServerAuth();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data, error } = await supabase.rpc("my_ads_consent");
  if (error) return NextResponse.json({ error: "unavailable" }, { status: 500 });
  return NextResponse.json({ granted: data === true });
}

export async function POST(req: Request) {
  const supabase = await supabaseServerAuth();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { granted?: unknown; source?: unknown } | null;
  if (typeof body?.granted !== "boolean") return NextResponse.json({ error: "granted must be true or false" }, { status: 400 });
  const source = typeof body.source === "string" ? body.source.slice(0, 60) : "unknown";

  const { data, error } = await supabase.rpc("set_ads_consent", {
    p_granted: body.granted,
    p_source: source,
    p_policy_version: ADS_CONSENT_POLICY_VERSION,
    p_user_agent: req.headers.get("user-agent"),
  });
  if (error) {
    console.error("[consent/ads] set_ads_consent failed:", error.message);
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }
  if (data === null) return NextResponse.json({ error: "no_customer" }, { status: 409 });
  return NextResponse.json({ granted: data === true });
}
