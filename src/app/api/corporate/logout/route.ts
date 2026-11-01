import { NextResponse } from "next/server";
import { endCorporateSession } from "@/lib/corporate-auth";

export const dynamic = "force-dynamic";

export async function POST() {
  await endCorporateSession();
  return NextResponse.json({ ok: true });
}
