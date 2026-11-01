import { partnerCapabilities } from "@/lib/partner-capabilities";
import { NextResponse } from "next/server";
import { currentCorporateSession } from "@/lib/corporate-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildInstallSheet } from "@/lib/install-sheet";

export const dynamic = "force-dynamic";

/**
 * GET → the installation sheet as JSON: every wall with the ZVY numbers of the
 * rolls that go on it, live from the OS.
 *
 * A READ, so it follows the read contract: session required, but no agreement
 * gate. The sheet is scoped to the caller's own account inside
 * `buildInstallSheet` — a batch id belonging to another partner resolves to
 * null and is reported as Not found, never as Not authorised, because the
 * difference between the two leaks whether that id exists.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await currentCorporateSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (partnerCapabilities(session.account).poRequiredRelease) return NextResponse.json({ error: "Use the private customer workspace. PO acceptance is required." }, { status: 403 });

  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const sheet = await buildInstallSheet(sb, id, session.account.id);
  if (!sheet) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true, sheet });
}
