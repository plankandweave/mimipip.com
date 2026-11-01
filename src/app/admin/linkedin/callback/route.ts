import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/staff-access";
import { LinkedInPublisher, linkedInApp, loadConnection } from "@/lib/marketing/publish/linkedin";
import { choosePage, exchangeCode, saveConnection } from "@/lib/marketing/publish/linkedin-connect";
import { serviceClient, hasServiceRole } from "@/lib/marketing/db";

// Where LinkedIn returns the founder after she signs in for the Zyvorah page.
// Code → token → which page → admin_config, then a live check, then back to
// the desk saying what happened. Registered on the LinkedIn app as
// https://zyvorah.com/admin/linkedin/callback.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_COOKIE = "li_oauth_state";

function back(req: NextRequest, status: string, msg?: string) {
  const u = new URL("/admin/marketing", req.url);
  u.searchParams.set("tab", "linkedin");
  u.searchParams.set("linkedin", status);
  if (msg) u.searchParams.set("msg", msg.slice(0, 400));
  const res = NextResponse.redirect(u);
  res.cookies.set(STATE_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/admin/linkedin", maxAge: 0 });
  return res;
}

export async function GET(req: NextRequest) {
  if (!(await requireStaff(req))) return back(req, "problem", "Sign in to the admin first, then press Connect LinkedIn again.");
  const q = req.nextUrl.searchParams;
  if (q.get("error")) {
    return back(req, "problem", `LinkedIn did not connect: ${q.get("error_description") ?? q.get("error")}.`);
  }
  const code = q.get("code");
  const state = q.get("state");
  if (!code || !state || state !== req.cookies.get(STATE_COOKIE)?.value) {
    return back(req, "problem", "That sign-in had expired or did not start here. Press Connect LinkedIn again.");
  }
  const { clientId, clientSecret } = await linkedInApp();
  if (!clientId || !clientSecret) return back(req, "needs-app", "The LinkedIn app's details are missing.");

  try {
    const t = await exchangeCode(code, { clientId, clientSecret });
    // A page already named (a Worker secret, or entered on the desk) wins.
    let named: string | undefined = process.env.LINKEDIN_ORG_URN;
    if (!named && hasServiceRole()) {
      const { data } = await serviceClient().from("admin_config").select("v").eq("k", "linkedin_org_urn").maybeSingle();
      named = (data?.v as string | undefined) || undefined;
    }
    const org = await choosePage(t.access_token, named);
    await saveConnection({ ...t, org });
    if (!org) {
      return back(req, "needs-page", "Signed in. One more detail: enter the Zyvorah company page's ID (the number in its admin address, linkedin.com/company/…/admin).");
    }
    await loadConnection();
    const h = await new LinkedInPublisher().health();
    return h.ok ? back(req, "connected", `Connected: ${h.detail}.`) : back(req, "problem", `Signed in, but the check failed: ${h.detail}`);
  } catch (e) {
    return back(req, "problem", (e as Error).message);
  }
}
