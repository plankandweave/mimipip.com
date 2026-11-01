import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { ADS_CONSENT_POLICY_VERSION } from "@/lib/ads-consent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Ads-personalisation consent given from the invitation email:
//   POST /api/consent/ads/grant  { token }  → { ok }
//
// POST only, and only from /ads-consent/yes itself (its script records the
// yes once the page is open on a real screen — see YesButton.tsx for the
// checks). There is deliberately no GET: mail scanners open every link in a
// message, and a link that granted on open would let a scanner consent for
// the customer. The token is the customer's own unsubscribe_token, so only
// the inbox owner holds it.
export async function POST(req: Request) {
  // Browsers stamp this on every fetch; a request that did not come from a
  // page of ours (a scanner replaying the URL, a cross-site form) is refused.
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return NextResponse.json({ ok: false }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  if (!/^[0-9a-f-]{36}$/i.test(token)) return NextResponse.json({ ok: false }, { status: 400 });
  const { data, error } = await supabase.rpc("grant_ads_consent_by_token", {
    p_token: token,
    p_policy_version: ADS_CONSENT_POLICY_VERSION,
    p_user_agent: req.headers.get("user-agent"),
  });
  if (error) {
    console.error("[consent/ads/grant] failed:", error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: data !== null });
}
