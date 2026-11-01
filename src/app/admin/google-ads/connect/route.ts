import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { requireStaff } from "@/lib/staff-access";
import { credentials } from "@/lib/google-ads/api";
import { authorizationUrl } from "@/lib/google-ads/spec";

// The Ads tab's "Connect Google Ads" button. Sends the signed-in staff member
// to Google's own consent screen for the Ads API; Google sends them back to
// ./callback. Under /admin, so Cloudflare Access fronts it.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_COOKIE = "gads_oauth_state";

function back(req: NextRequest, status: string, msg: string) {
  const u = new URL("/admin/marketing", req.url);
  u.searchParams.set("tab", "ads");
  u.searchParams.set("gads", status);
  u.searchParams.set("msg", msg);
  return NextResponse.redirect(u);
}

export async function GET(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.redirect(new URL("/admin/staff-session?next=/admin/google-ads/connect", req.url));
  const c = await credentials();
  if (!c.clientId || !c.clientSecret) return back(req, "needs-app", "Enter the Google OAuth client's ID and secret on the Ads tab, then press Connect Google Ads again.");
  const state = randomBytes(18).toString("hex");
  const redirect = new URL("/admin/google-ads/callback", req.url).toString();
  const res = NextResponse.redirect(authorizationUrl(c.clientId, redirect, state));
  res.cookies.set(STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: "lax", path: "/admin/google-ads", maxAge: 600 });
  return res;
}
