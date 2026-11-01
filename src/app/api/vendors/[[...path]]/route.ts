import { NextResponse } from "next/server";

// The supplier portal's API (register / login / logout) is gone from this site:
// the Magnitude OS owns the supplier master and the portal that signs into it.
// A stale form or script that still posts here gets a plain answer with the new
// address, rather than a 404 it might read as a transient outage. Nothing on
// this side writes to `vendors` or `vendor_sessions` any more.
const OS_BASE = (process.env.OS_BASE_URL ?? "https://os.magnitudegroup.in").replace(/\/$/, "");

export const dynamic = "force-dynamic";

function gone() {
  return NextResponse.json(
    {
      error: "The supplier portal has moved to the Magnitude OS.",
      register: `${OS_BASE}/supplier/register`,
      login: `${OS_BASE}/supplier/login`,
    },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}

export const GET = gone;
export const POST = gone;
