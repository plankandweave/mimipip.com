import { NextResponse } from "next/server";
import { requireStaff, notStaff } from "@/lib/staff-access";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { listSonar, makeDemo, makeWallsTalk, setStatus } from "@/lib/sonar";
import type { BlueprintRow } from "@/lib/trace-link";
import type { ProposalRow } from "@/lib/prism";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// The Sonar desk.
//
//   GET ?blueprintId=        → every talking wall (or one campus's)
//   POST action: "walls"     → give every wall of a campus's current proposal
//                              its voice (rewrite: true writes the pieces again)
//   POST action: "demo"      → the house demo wall, spoken in four languages
//   POST action: "status"    → switch a wall's QR off or on

export async function GET(req: Request) {
  if (!(await requireStaff(req))) return notStaff();
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "The desk is unavailable." }, { status: 503 });
  const blueprintId = new URL(req.url).searchParams.get("blueprintId") ?? undefined;
  return NextResponse.json({ walls: await listSonar(sb, blueprintId) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request) {
  const staff = await requireStaff(req);
  if (!staff) return notStaff();
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "The desk is unavailable." }, { status: 503 });
  const b = await req.json().catch(() => ({})) as { action?: string; blueprintId?: string; rewrite?: boolean; id?: string; status?: string };
  const action = String(b.action ?? "");

  if (action === "walls") {
    const { data: bp } = await sb.from("campus_blueprints").select("*").eq("id", String(b.blueprintId ?? "")).maybeSingle();
    if (!bp) return NextResponse.json({ error: "No such project." }, { status: 404 });
    const blueprint = bp as BlueprintRow;
    const { data: propRow } = await sb.from("prism_proposals").select("*").eq("blueprint_id", blueprint.id).neq("status", "superseded").order("revision", { ascending: false }).limit(1).maybeSingle();
    if (!propRow) return NextResponse.json({ error: "Compose a direction with Prism first; the walls speak from its concepts." }, { status: 409 });
    const r = await makeWallsTalk(sb, blueprint, propRow as ProposalRow, staff.email ?? null, Boolean(b.rewrite));
    return r.ok ? NextResponse.json({ ok: true, made: r.made, spoken: r.spoken, errors: r.errors }) : NextResponse.json({ error: r.error }, { status: 503 });
  }
  if (action === "demo") {
    const r = await makeDemo(sb, staff.email ?? null);
    return r.ok ? NextResponse.json({ ok: true, error: r.row.error }) : NextResponse.json({ error: r.error }, { status: 503 });
  }
  if (action === "status") {
    const status = b.status === "off" ? "off" : "live";
    const ok = await setStatus(sb, String(b.id ?? ""), status);
    return NextResponse.json({ ok });
  }
  return NextResponse.json({ error: "Bad request" }, { status: 400 });
}
