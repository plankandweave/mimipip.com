import { NextResponse } from "next/server";
import { requireStaff, notStaff } from "@/lib/staff-access";
import { serviceClient, hasServiceRole } from "@/lib/marketing/db";
import { LINKEDIN_APP_KEY, LINKEDIN_ORG_KEY } from "@/lib/marketing/publish/linkedin";
import { pageUrn } from "@/lib/marketing/publish/linkedin-connect";

// The LinkedIn app's Client ID and Client Secret, and the Zyvorah page, entered
// once on the desk so Connect LinkedIn works without a laptop. Stored in
// admin_config (service role only); never returned to the browser. Worker
// secrets of the same meaning, when set, still win (publish/linkedin.ts).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!(await requireStaff(req))) return notStaff();
  if (!hasServiceRole()) return NextResponse.json({ error: "the site cannot write its settings" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { clientId?: string; clientSecret?: string; page?: string };
  const clientId = body.clientId?.trim();
  const clientSecret = body.clientSecret?.trim();
  const page = body.page?.trim();

  const rows: { k: string; v: string }[] = [];
  if (clientId || clientSecret) {
    if (!clientId || !/^[A-Za-z0-9]{8,32}$/.test(clientId)) return NextResponse.json({ error: "That does not look like a LinkedIn Client ID." }, { status: 400 });
    if (!clientSecret || clientSecret.length < 8) return NextResponse.json({ error: "Enter the Primary Client Secret too." }, { status: 400 });
    rows.push({ k: LINKEDIN_APP_KEY, v: JSON.stringify({ client_id: clientId, client_secret: clientSecret }) });
  }
  if (page) {
    const urn = pageUrn(page);
    if (!urn) return NextResponse.json({ error: "Enter the page ID: the number in the page's admin address." }, { status: 400 });
    rows.push({ k: LINKEDIN_ORG_KEY, v: urn });
  }
  if (!rows.length) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  const { error } = await serviceClient().from("admin_config").upsert(rows, { onConflict: "k" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
