import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { SITE_URL } from "@/lib/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One-click withdrawal of ads-personalisation consent from an email link:
//   GET /api/consent/ads/withdraw?token=<customers.unsubscribe_token>
// The token is the credential, exactly as for the newsletter unsubscribe. This
// route can only ever WITHDRAW; granting needs a signed-in session or the
// button on /ads-consent/yes (a POST to ../grant). A link scanner that
// pre-fetches this errs in the safe direction.
async function withdraw(token: string | null): Promise<boolean> {
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) return false;
  const { error } = await supabase.rpc("withdraw_ads_consent", { p_token: token });
  if (error) console.error("[consent/ads/withdraw] failed:", error.message);
  return !error;
}

export async function GET(req: Request) {
  await withdraw(new URL(req.url).searchParams.get("token"));
  // Always the same page, so the response never reveals whether a token exists.
  return NextResponse.redirect(`${SITE_URL}/ads-consent/withdrawn`);
}

export async function POST(req: Request) {
  const ok = await withdraw(new URL(req.url).searchParams.get("token"));
  return NextResponse.json({ ok });
}
