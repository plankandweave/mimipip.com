import { NextResponse } from "next/server";

// Design commissions and exclusivity are decided in the Magnitude OS since
// 1 October 2026 (os.magnitudegroup.in/design-commissions). The public concept
// brief form (/api/concept-brief) stays here; only the staff screen moved.
// design_commercial_policy, design_exclusivity, concept_briefs and the
// admin_concept_commerce / admin_update_design_commerce functions stay in this
// database; the OS drives them with the service key.
const OS_BASE = (process.env.OS_BASE_URL ?? "https://os.magnitudegroup.in").replace(/\/$/, "");

export function GET() {
  return NextResponse.redirect(`${OS_BASE}/design-commissions`, 308);
}
