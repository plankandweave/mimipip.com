import { partnerCapabilities } from "@/lib/partner-capabilities";
import { NextResponse } from "next/server";
import { can, currentCorporateSession, isAccountAdmin } from "@/lib/corporate-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

// The partner's design library. Everyone on the account sees the same list —
// approval is retired, so there is no pending pile and no privileged viewer.
// What differs is what you may DO with it, which rides along as `can`.
//
// Designs arrive two ways now: the studio uploads from the OS desk (service
// key, never through this session-gated route), and the partner uploads their
// own artwork through /api/corporate/designs/upload.
//
// Archived designs are withheld: archiving is how a design leaves the library,
// so the partner must stop seeing it the moment it goes.
export async function GET() {
  const session = await currentCorporateSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (partnerCapabilities(session.account).poRequiredRelease || !partnerCapabilities(session.account).customLibrary) return NextResponse.json({ error: "Use the private customer workspace. PO acceptance is required." }, { status: 403 });
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const { data, error } = await sb
    .from("corporate_designs")
    .select("*, corporate_design_messages(*)")
    .eq("account_id", session.account.id)
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .order("created_at", { referencedTable: "corporate_design_messages", ascending: true })
    .limit(200);
  if (error) {
    console.error("[corporate/designs] list failed:", error.message);
    return NextResponse.json({ error: "Could not load the library." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    designs: data ?? [],
    can: {
      upload: can(session, "upload"),
      build: can(session, "build"),
      order: can(session, "order"),
      admin: isAccountAdmin(session),
    },
  });
}
