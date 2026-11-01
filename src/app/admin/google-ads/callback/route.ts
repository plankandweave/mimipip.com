import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/staff-access";
import { exchangeCode, listCampaigns, saveRefreshToken } from "@/lib/google-ads/api";

// Where Google returns the staff member after the Ads consent screen:
// code → refresh token → admin_config, then a live read of the campaigns,
// then back to the Ads tab saying what happened. Must be listed on the OAuth
// client as https://zyvorah.com/admin/google-ads/callback.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_COOKIE = "gads_oauth_state";

function back(req: NextRequest, status: string, msg: string) {
  const u = new URL("/admin/marketing", req.url);
  u.searchParams.set("tab", "ads");
  u.searchParams.set("gads", status);
  u.searchParams.set("msg", msg.slice(0, 400));
  const res = NextResponse.redirect(u);
  res.cookies.set(STATE_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/admin/google-ads", maxAge: 0 });
  return res;
}

export async function GET(req: NextRequest) {
  const staff = await requireStaff(req);
  if (!staff) return back(req, "problem", "Sign in to the admin first, then press Connect Google Ads again.");
  const q = req.nextUrl.searchParams;
  if (q.get("error")) return back(req, "problem", `Google did not connect: ${q.get("error_description") ?? q.get("error")}.`);
  const code = q.get("code");
  const state = q.get("state");
  if (!code || !state || state !== req.cookies.get(STATE_COOKIE)?.value) {
    return back(req, "problem", "That sign-in had expired or did not start here. Press Connect Google Ads again.");
  }
  try {
    const t = await exchangeCode(code, new URL("/admin/google-ads/callback", req.url).toString());
    if (!t.refreshToken) return back(req, "problem", "Google did not return a lasting connection. Press Connect Google Ads again and approve every permission.");
    await saveRefreshToken(t.refreshToken, staff.email);
    try {
      const campaigns = await listCampaigns();
      return back(req, "connected", `Connected: ${campaigns.length} campaigns found, ${campaigns.filter((c) => c.status === "ENABLED").length} running.`);
    } catch (e) {
      return back(req, "problem", `Signed in, but reading the account failed: ${(e as Error).message}`);
    }
  } catch (e) {
    return back(req, "problem", (e as Error).message);
  }
}
