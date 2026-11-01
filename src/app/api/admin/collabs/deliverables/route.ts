import { NextResponse } from "next/server";
import { requireStaff, notStaff } from "@/lib/staff-access";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { parseDeliverableFields } from "@/lib/collab-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What a creator owes back, one row per piece (a reel, three stories…).
 *   POST   { collaboration_id, kind, description?, due_on? } → add
 *   PATCH  { id, …fields }  → edit: mark posted (paste the link), verify,
 *                             type in the insight numbers she sends
 *   DELETE { id }
 * When every deliverable is posted or verified, the collaboration moves to
 * 'live' on its own — the desk should not need two clicks for one fact.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Db = NonNullable<ReturnType<typeof supabaseAdmin>>;

async function settleStatus(db: Db, collaborationId: string) {
  const { data } = await db.from("collaboration_deliverables").select("status").eq("collaboration_id", collaborationId);
  const all = (data ?? []) as { status: string }[];
  if (!all.length) return;
  const done = all.every((d) => d.status === "posted" || d.status === "verified" || d.status === "waived");
  if (done) {
    await db.from("collaborations").update({ status: "live" }).eq("id", collaborationId).in("status", ["agreed", "ordered", "delivered"]);
  }
}

export async function POST(req: Request) {
  if (!(await requireStaff(req))) return notStaff();
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "The desk is unavailable." }, { status: 503 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const collaborationId = typeof body?.collaboration_id === "string" ? body.collaboration_id : "";
  if (!UUID_RE.test(collaborationId)) return NextResponse.json({ error: "Unknown collaboration." }, { status: 400 });
  const { collaboration_id: _c, ...rest } = body!;
  void _c;
  const parsed = parseDeliverableFields({ kind: "reel", ...rest });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { data, error } = await db
    .from("collaboration_deliverables")
    .insert({ ...parsed.value, collaboration_id: collaborationId })
    .select("id")
    .single();
  if (error) {
    console.error("deliverable create failed:", error.message);
    return NextResponse.json({ error: "Could not add the deliverable." }, { status: 500 });
  }
  return NextResponse.json({ id: (data as { id: string }).id });
}

export async function PATCH(req: Request) {
  if (!(await requireStaff(req))) return notStaff();
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "The desk is unavailable." }, { status: 503 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const id = typeof body?.id === "string" ? body.id : "";
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Unknown deliverable." }, { status: 400 });
  const { id: _id, ...rest } = body!;
  void _id;
  const parsed = parseDeliverableFields(rest);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { data, error } = await db
    .from("collaboration_deliverables")
    .update(parsed.value)
    .eq("id", id)
    .select("collaboration_id")
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Could not save the deliverable." }, { status: error ? 500 : 404 });
  await settleStatus(db, (data as { collaboration_id: string }).collaboration_id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!(await requireStaff(req))) return notStaff();
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "The desk is unavailable." }, { status: 503 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const id = typeof body?.id === "string" ? body.id : "";
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Unknown deliverable." }, { status: 400 });
  const { error } = await db.from("collaboration_deliverables").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Could not remove the deliverable." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
