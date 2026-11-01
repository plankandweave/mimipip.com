import { NextResponse } from "next/server";
import { requireStaff, notStaff } from "@/lib/staff-access";
import { hasServiceRole } from "@/lib/marketing/db";
import { publishApproved } from "@/lib/marketing/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  if (!(await requireStaff(req))) return notStaff();
  if (!hasServiceRole()) return NextResponse.json({ error: "Publishing is not configured" }, { status: 503 });
  try {
    const outcomes = await publishApproved(new Date(), { todayOnly: true });
    return NextResponse.json({ outcomes });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
