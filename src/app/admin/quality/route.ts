import { NextResponse } from "next/server";

// Customer quality claims and the storefront funnel are reviewed in the
// Magnitude OS since 1 October 2026 (os.magnitudegroup.in/storefront-quality).
// The customer's claim form on the order page (/api/order/quality) stays here;
// only the staff review moved. The claims table, the quality-evidence bucket
// and storefront_quality_metrics stay in this database; the OS reads them with
// the service key.
const OS_BASE = (process.env.OS_BASE_URL ?? "https://os.magnitudegroup.in").replace(/\/$/, "");

export function GET() {
  return NextResponse.redirect(`${OS_BASE}/storefront-quality`, 308);
}
