import { NextResponse } from "next/server";
import { currentCorporateSession, renewCorporateSession } from "@/lib/corporate-auth";
import { partnerModeOf } from "@/lib/partner-mode";

export const dynamic = "force-dynamic";

// Who is browsing the storefront as a partner, for the client chrome. The
// product pages are ISR (cached for an hour, shared by everyone), so the
// server render cannot branch on a cookie; the header badge, the
// save-to-project button and the sign-in gates ask here once per page load
// instead. Answers nothing about rates or terms — see partner-mode.ts.
export async function GET() {
  const session = await currentCorporateSession({ allowVaultUploadOnly: true });
  if (session) await renewCorporateSession(session);
  // A staff portal cookie must not replace their retail cart with projects.
  return NextResponse.json(session && !session.staff ? partnerModeOf(session) : null, { headers: { "Cache-Control": "private, no-store" } });
}
