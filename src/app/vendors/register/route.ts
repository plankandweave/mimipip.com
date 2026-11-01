import { NextResponse } from "next/server";

// Supplier registration is taken by the Magnitude OS (see ../route.ts).
const OS_BASE = (process.env.OS_BASE_URL ?? "https://os.magnitudegroup.in").replace(/\/$/, "");

export function GET() {
  return NextResponse.redirect(`${OS_BASE}/supplier/register`, 308);
}
