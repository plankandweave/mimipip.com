import { NextResponse } from "next/server";
import { currentBuyerIsTradeAccount } from "@/lib/trade-auth";

export const runtime = "nodejs";

// Who pays the courier on THIS buyer's order, so checkout can say it before
// they pay rather than surprising them at the door. Freight is prepaid by us
// on retail e-commerce deliveries alone; for a reseller or a corporate account
// it is to-pay, always (Roheena 2026-08-12, restated 2026-09-02).
//
// Display only — the basis that actually books the docket is derived on the OS
// from the order's channel (see os-sync.ts), never from this answer.
export async function GET() {
  return NextResponse.json({ toPay: await currentBuyerIsTradeAccount() });
}
