import { NextResponse } from "next/server";

// Collaborator royalties live in the Magnitude OS since 1 October 2026
// (os.magnitudegroup.in/royalties): the OS drafts each month's statement,
// takes the approval that emails the partner, and sends the RazorpayX payout.
// The ledger itself (royalty_partners, royalty_statements,
// royalty_settled_items and their functions, migrations 0138/0139) stays in
// this database, because a statement is computed from this site's orders —
// but nothing on this site reads or writes it any more. This path sends the
// 6 am preview's old link, and any bookmark, to the real desk.
const OS_BASE = (process.env.OS_BASE_URL ?? "https://os.magnitudegroup.in").replace(/\/$/, "");

export function GET() {
  return NextResponse.redirect(`${OS_BASE}/royalties`, 308);
}
