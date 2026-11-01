import { NextResponse } from "next/server";

// Supplier review lives in the Magnitude OS. Registrations arrive at
// os.magnitudegroup.in/supplier/register and are approved in /approvals,
// which is the one gate anything takes into the OS vendor master — the same
// desk that raises POs against them. The website's copy of this screen was a
// second, disconnected approval queue; this path now sends an old bookmark to
// the real one. The `vendors` table here is kept, read-only, until the OS's
// carry-over has been run one last time against it (lib/zyvorah-supplier-
// backfill in the OS); nothing on this site writes to it any more.
const OS_BASE = (process.env.OS_BASE_URL ?? "https://os.magnitudegroup.in").replace(/\/$/, "");

export function GET() {
  return NextResponse.redirect(`${OS_BASE}/approvals?tab=supplier`, 308);
}
