import { NextResponse } from "next/server";
import { requireStaff, notStaff } from "@/lib/staff-access";
import { hasServiceRole } from "@/lib/marketing/db";
import { pauseCampaigns, saveApp, status } from "@/lib/google-ads/api";

// The Ads tab's Google Ads card (lib/google-ads/api.ts).
//   GET                                  — what is connected, and the campaigns.
//   POST { action: "save_app", clientId?, clientSecret?, developerToken? }
//   POST { action: "pause", campaignIds: string[] }
// Signed-in staff only. Credentials are written, never read back out.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await requireStaff(req))) return notStaff();
  return NextResponse.json(await status());
}

export async function POST(req: Request) {
  if (!(await requireStaff(req))) return notStaff();
  if (!hasServiceRole()) return NextResponse.json({ error: "the site cannot write its settings" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; clientId?: string; clientSecret?: string; developerToken?: string; campaignIds?: unknown };

  if (body.action === "save_app") {
    const clientId = body.clientId?.trim();
    const clientSecret = body.clientSecret?.trim();
    const developerToken = body.developerToken?.trim();
    if (clientId && !/\.apps\.googleusercontent\.com$/.test(clientId)) return NextResponse.json({ error: "That does not look like a Google OAuth client ID (it ends in .apps.googleusercontent.com)." }, { status: 400 });
    if (clientSecret && clientSecret.length < 10) return NextResponse.json({ error: "That client secret looks too short." }, { status: 400 });
    if (developerToken && !/^[A-Za-z0-9_-]{15,40}$/.test(developerToken)) return NextResponse.json({ error: "That does not look like a developer token (API Center shows a 22-character code)." }, { status: 400 });
    if (!clientId && !clientSecret && !developerToken) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
    try {
      await saveApp({ clientId, clientSecret, developerToken });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === "pause") {
    const ids = Array.isArray(body.campaignIds) ? body.campaignIds.filter((i): i is string => typeof i === "string" && /^\d+$/.test(i)) : [];
    if (!ids.length) return NextResponse.json({ error: "no campaigns named" }, { status: 400 });
    try {
      return NextResponse.json({ ok: true, ...(await pauseCampaigns(ids)) });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 502 });
    }
  }

  return NextResponse.json({ error: `unknown action "${String(body.action)}"` }, { status: 400 });
}
