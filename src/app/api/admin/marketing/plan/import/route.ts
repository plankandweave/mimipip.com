import { NextResponse } from "next/server";
import { requireStaff, notStaff } from "@/lib/staff-access";
import { hasServiceRole } from "@/lib/marketing/db";
import { importPlan, type PlanDocument } from "@/lib/marketing/plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// How a strategy arrives. The body is a plan document — the shape of
// campaign.json that Codex Astra wrote on 22 Sep, documented in
// docs/marketing-desk.md — from the desk's "Import plan" button or from
// scripts/marketing-plan-import.ts run by an agent session.
//
// Upserts: re-sending a plan updates its copy and briefs but keeps every
// decision the founder made on the desk (removed slots stay removed, comments
// stay). A document that cannot be stored fails whole, before any row is
// written, with the offending slot named.

export async function POST(req: Request) {
  const staff = await requireStaff(req);
  if (!staff) return notStaff();
  if (!hasServiceRole()) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set — the plan cannot be stored" }, { status: 503 });
  }
  const doc = (await req.json().catch(() => null)) as PlanDocument | null;
  if (!doc || typeof doc !== "object") return NextResponse.json({ error: "a JSON plan document is required" }, { status: 400 });
  try {
    const result = await importPlan(doc, staff.email);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
