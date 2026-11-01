import { NextResponse } from "next/server";
import { partnerCapabilities } from "@/lib/partner-capabilities";
import { currentCorporateSession } from "@/lib/corporate-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cityAllows, storeCity } from "@/lib/site-batch-rules";

export const dynamic = "force-dynamic";

/**
 * GET ?storeId= → the design series a measured store order can be built from.
 *
 * Exactly the pool the allocator draws on (site-batch.ts allocateDesigns):
 * approved designs only, never office artwork on a showroom floor, and a
 * city-tagged design only for its own city or state. Offering a series the
 * allocator would then filter out is how a form says yes and the proposal
 * says nothing — so the list is built from the same rule, not a copy of it.
 *
 * Each series carries how many approved designs it has and whether it is the
 * store's own local collection, so the form can say "Gujarat Collection ·
 * local · 10 designs" rather than leaving the uploader to guess.
 */
export async function GET(req: Request) {
  const session = await currentCorporateSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (partnerCapabilities(session.account).poRequiredRelease) {
    return NextResponse.json({ error: "Use the private customer workspace." }, { status: 403 });
  }
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const storeId = new URL(req.url).searchParams.get("storeId") ?? "";
  const { data: store } = storeId
    ? await sb.from("corporate_stores").select("city, state")
        .eq("id", storeId).eq("account_id", session.account.id).maybeSingle()
    : { data: null };
  const here = { city: storeCity((store?.city as string | null) ?? null), state: (store?.state as string | null) ?? null };

  const { data, error } = await sb.from("corporate_designs")
    .select("series_name, usage, city")
    .eq("account_id", session.account.id).eq("status", "approved");
  if (error) {
    console.error("[designs/series] list failed:", error.message);
    return NextResponse.json({ error: "Could not load the series." }, { status: 500 });
  }

  const bySeries = new Map<string, { name: string; designs: number; local: boolean }>();
  for (const d of data ?? []) {
    const name = String(d.series_name ?? "").trim();
    if (!name) continue;
    if (((d.usage as string | null) ?? "showroom") === "office") continue;
    if (store && !cityAllows(d.city as string | null, here)) continue;
    const row = bySeries.get(name) ?? { name, designs: 0, local: false };
    row.designs++;
    if (d.city) row.local = true;
    bySeries.set(name, row);
  }
  // Local collections first, then natural order: Series 2 before Series 10.
  const series = [...bySeries.values()].sort((a, b) =>
    Number(b.local) - Number(a.local) || a.name.localeCompare(b.name, "en", { numeric: true }));
  return NextResponse.json({ ok: true, series });
}
