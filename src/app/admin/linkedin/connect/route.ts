import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { requireStaff } from "@/lib/staff-access";
import { linkedInApp } from "@/lib/marketing/publish/linkedin";
import { authorizationUrl, chooseScopes, problemText } from "@/lib/marketing/publish/linkedin-connect";

// The desk's "Connect LinkedIn" button. Sends the founder to LinkedIn's own
// sign-in for the Zyvorah page; LinkedIn sends her back to ./callback. Under
// /admin, so Cloudflare Access fronts it. See lib/marketing/publish/linkedin-connect.ts.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_COOKIE = "li_oauth_state";

function back(req: NextRequest, status: string, msg?: string) {
  const u = new URL("/admin/marketing", req.url);
  u.searchParams.set("tab", "linkedin");
  u.searchParams.set("linkedin", status);
  if (msg) u.searchParams.set("msg", msg);
  return NextResponse.redirect(u);
}

export async function GET(req: NextRequest) {
  if (!(await requireStaff(req))) {
    return NextResponse.redirect(new URL("/admin/staff-session?next=/admin/linkedin/connect", req.url));
  }
  const { clientId, clientSecret } = await linkedInApp();
  if (!clientId || !clientSecret) {
    return back(req, "needs-app", "Enter the LinkedIn app's Client ID and Client Secret once, then press Connect LinkedIn again.");
  }
  const chosen = await chooseScopes(clientId);
  if ("problem" in chosen) return back(req, "problem", problemText(chosen.problem));

  const state = randomBytes(18).toString("hex");
  const res = NextResponse.redirect(authorizationUrl(clientId, chosen.scopes, state));
  res.cookies.set(STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: "lax", path: "/admin/linkedin", maxAge: 600 });
  return res;
}
