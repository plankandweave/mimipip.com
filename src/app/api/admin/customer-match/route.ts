import { metaAudienceCsv } from "@/lib/meta-customer-audience";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { staffKey } from "@/lib/staff-key";
import { currentStaff } from "@/lib/staff-access";
import { csvSha256, hashMatchRow, matchCsv, type MatchRow } from "@/lib/customer-match";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Google Ads Customer Match / Meta hashed-email list, for upload in Ads → Audience manager →
// Customer list ("Upload hashed data"). Meta: append &platform=meta.
// Both exports use the same current opt-in filter. Replace the platform list
// with a fresh export after withdrawals; downloading does not launch ads.
//
//   GET /api/admin/customer-match           → { eligible, withdrawn, last_export }
//   GET /api/admin/customer-match?download=1 → text/csv, headers Email,Phone
//
// Only customers whose LATEST ads-personalisation decision is yes are included
// (admin_customer_match_contacts). Values are normalised to Google's rules and
// SHA-256 hashed here, in the Worker, so plain addresses never leave our own
// infrastructure; the file is built per request and never stored. Every
// download is logged with the staff member's email and the file's hash.
//
// Re-upload after withdrawals: Google's list is REPLACED by uploading a fresh
// file with "Replace all data", which is how a withdrawn person leaves it.

export async function GET(req: Request) {
  const key = await staffKey(req);
  const { data: ok } = await supabase.rpc("admin_key_ok", { p_key: key });
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const staff = (await currentStaff(req))?.email ?? "unknown";
  const platform = new URL(req.url).searchParams.get("platform") ?? "google";
  if (platform !== "google" && platform !== "meta") {
    return NextResponse.json({ error: "Supported platforms: google, meta. ChatGPT needs separate consent and sufficient matched users." }, { status: 400 });
  }

  if (new URL(req.url).searchParams.get("download") !== "1") {
    const { data, error } = await supabase.rpc("admin_customer_match_status", { p_key: key });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  }

  const { data, error } = await supabase.rpc("admin_customer_match_contacts", { p_key: key, p_staff: staff });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows: MatchRow[] = [];
  for (const c of (data ?? []) as { email: string | null; phone: string | null }[]) {
    const row = hashMatchRow(c);
    if (row) rows.push(row);
  }
  const meta = platform === "meta" ? metaAudienceCsv(data ?? []) : null;
  const csv = meta?.csv ?? matchCsv(rows);
  const rowCount = meta?.count ?? rows.length;
  const { error: noteErr } = await supabase.rpc("note_customer_match_export", {
    p_key: key,
    p_staff: staff,
    p_sha256: csvSha256(csv),
  });
  if (noteErr) console.error("[customer-match] note export failed:", noteErr.message);

  const day = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="zyvorah-${platform}-customer-match-${day}.csv"`,
      "Cache-Control": "no-store",
      "X-Row-Count": String(rowCount),
    },
  });
}
