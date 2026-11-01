import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { partnerManifest } from "@/lib/partner-app";

export const dynamic = "force-dynamic";

// The installable-app manifest for one partner's portal (lib/partner-app.ts).
// Public on purpose: a browser fetches it without cookies, and it says no more
// than the sign-in page already shows — the account's name.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sb = supabaseAdmin();
  const { data } = sb
    ? await sb.from("corporate_accounts").select("slug, name").eq("slug", slug).eq("active", true).maybeSingle()
    : { data: null };
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(partnerManifest(data as { slug: string; name: string }), {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" },
  });
}
