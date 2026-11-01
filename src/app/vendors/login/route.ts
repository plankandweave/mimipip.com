import { NextResponse } from "next/server";

// Supplier sign-in is the Magnitude OS's (see ../route.ts).
const OS_BASE = (process.env.OS_BASE_URL ?? "https://os.magnitudegroup.in").replace(/\/$/, "");

export function GET() {
  return NextResponse.redirect(`${OS_BASE}/supplier/login`, 308);
}
