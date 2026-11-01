import { NextResponse } from "next/server";
import { getGatedUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

// A returning, signed-in customer's address from their most recent order, so
// checkout shows it as one line with "Change" instead of empty boxes
// (founder, 11 October 2026). There is no address book: the last order IS the
// address they last used. Only the caller's own orders, by their verified
// email; never anyone else's, and nothing when signed out.
export async function GET() {
  const user = await getGatedUser();
  const admin = supabaseAdmin();
  if (!user?.email || !admin) return NextResponse.json({ address: null }, { headers: { "Cache-Control": "private, no-store" } });

  const { data } = await admin
    .from("orders")
    .select("phone, shipping_address, gstin, billing_name")
    // Case-insensitive, with LIKE's wildcards escaped: an "_" in an address
    // must match only itself, never another customer's email.
    .ilike("email", user.email.replace(/[\\%_]/g, (c) => `\\${c}`))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = data as {
    phone?: string | null;
    shipping_address?: Record<string, unknown> | null;
    gstin?: string | null;
    billing_name?: string | null;
  } | null;
  const a = row?.shipping_address ?? null;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const address = a && str(a.line1) && str(a.pincode)
    ? {
        name: str(a.name),
        phone: str(row?.phone),
        line1: str(a.line1),
        city: str(a.city),
        state: str(a.state),
        pincode: str(a.pincode),
        countryCode: str(a.countryCode) || "IN",
        gstin: str(row?.gstin),
        billingName: str(row?.billing_name),
      }
    : null;
  return NextResponse.json({ address }, { headers: { "Cache-Control": "private, no-store" } });
}
