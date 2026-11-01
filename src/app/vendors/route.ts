import { NextResponse } from "next/server";

// The supplier portal moved to the Magnitude OS on 27 September 2026
// (os.magnitudegroup.in/supplier): one supplier master, one login, the same
// record procurement raises POs against. Suppliers carried over were told
// their login moved; this keeps the old address working for the ones who
// kept a bookmark.
const OS_BASE = (process.env.OS_BASE_URL ?? "https://os.magnitudegroup.in").replace(/\/$/, "");

export function GET() {
  return NextResponse.redirect(`${OS_BASE}/supplier`, 308);
}
