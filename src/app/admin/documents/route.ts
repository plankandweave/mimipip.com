import { NextResponse } from "next/server";

// Agreements live in the Magnitude OS — it holds the signing trail and the
// certificate, and it is the system of record. This path used to show a
// read-only copy here; it now sends anyone with an old bookmark to the real
// thing. The OS still mirrors each signed PDF into /api/documents/signed (so a
// copy stays on this side); only the staff viewer moved.
const OS_BASE = (process.env.OS_BASE_URL ?? "https://os.magnitudegroup.in").replace(/\/$/, "");

export function GET() {
  return NextResponse.redirect(`${OS_BASE}/documents`, 308);
}
