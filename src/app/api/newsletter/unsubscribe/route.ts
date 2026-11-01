import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { SITE_URL } from "@/lib/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One-click unsubscribe. The token itself is the credential (per-customer,
// unguessable), so no auth is needed. Honours both the email link (GET, then
// redirect to a friendly page) and RFC 8058 one-click POST from mail clients.
async function unsubscribe(token: string | null): Promise<boolean> {
  if (!token || token === "preview") return false;
  const { error } = await supabase.rpc("newsletter_unsubscribe", { p_token: token });
  // Someone who says "stop" to our email hasn't agreed to be followed by our
  // ads either: withdraw Customer Match consent too. Best-effort — the email
  // unsubscribe above is the part the reader asked for.
  if (/^[0-9a-f-]{36}$/i.test(token)) {
    const { error: adsErr } = await supabase.rpc("withdraw_ads_consent", { p_token: token });
    if (adsErr) console.error("[unsubscribe] withdraw_ads_consent failed:", adsErr.message);
  }
  return !error;
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  await unsubscribe(token);
  // Always land the reader on the confirmation page (don't leak token validity).
  return NextResponse.redirect(`${SITE_URL}/newsletter/unsubscribed`);
}

export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  const ok = await unsubscribe(token);
  return NextResponse.json({ ok });
}
