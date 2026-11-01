import { NextResponse } from "next/server";
import { currentCorporateSession } from "@/lib/corporate-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

// Every state this company has dispatched to before, with its saved address and
// GSTIN — so picking a state auto-fills the paperwork. Entered once, ever.
export async function GET() {
  const session = await currentCorporateSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const { data } = await sb.from("corporate_state_profiles")
    .select("state, gstin, address_line, city, pincode, contact_name, contact_phone")
    .eq("account_id", session.account.id)
    .order("state");
  return NextResponse.json({ ok: true, states: data ?? [] });
}
