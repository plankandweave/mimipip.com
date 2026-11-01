import { partnerCapabilities } from "@/lib/partner-capabilities";
import { NextResponse } from "next/server";
import { currentCorporateSession } from "@/lib/corporate-auth";
import { proposalsForAccount } from "@/lib/corporate-proposals";

export const dynamic = "force-dynamic";

/** What we have already sent this client, for their own account to list.
 *
 *  Reading only. Everything about which decks these are — client audience,
 *  actually sent, this account's company — is decided in
 *  lib/corporate-proposals, so a second reader cannot forget one of the filters
 *  and surface an internal review deck. */
export async function GET() {
  const session = await currentCorporateSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (partnerCapabilities(session.account).poRequiredRelease) return NextResponse.json({ error: "Use the private customer workspace. PO acceptance is required." }, { status: 403 });
  return NextResponse.json({ ok: true, proposals: await proposalsForAccount(session) });
}
