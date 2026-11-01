import { NextResponse } from "next/server";
import { requireStaff, notStaff } from "@/lib/staff-access";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { loadPulse, type BlueprintWallRow } from "@/lib/vault";
import type { BlueprintRow } from "@/lib/trace-link";
import { choosePreview, composeProposal, loadPrismDesk, type ProposalRow } from "@/lib/prism";
import { presentable } from "@/lib/prism-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// One Blueprint on the Prism desk.
//
//   GET                      → the desk: walls, the current proposal, every
//                              revision, the conversation
//   POST action: "compose"   → a first direction, or a different one
//   POST action: "say"       → the founder's words; Prism revises
//   POST action: "choose"    → show another candidate on a wall
//   POST action: "commission"→ mark a wall as needing an artist (or not)
//   POST action: "present"   → the proposal goes to the college's Vault;
//                              refused until Pulse says every wall is ready

async function open(req: Request, id: string) {
  const staff = await requireStaff(req);
  if (!staff) return { error: notStaff() };
  const sb = supabaseAdmin();
  if (!sb) return { error: NextResponse.json({ error: "The desk is unavailable." }, { status: 503 }) };
  const { data: bp } = await sb.from("campus_blueprints").select("*").eq("id", id).maybeSingle();
  if (!bp) return { error: NextResponse.json({ error: "No such project." }, { status: 404 }) };
  const blueprint = bp as BlueprintRow;
  const { data: acc } = await sb.from("corporate_accounts").select("name, slug").eq("id", blueprint.account_id).maybeSingle();
  return { sb, blueprint, account: (acc as { name: string; slug: string } | null) ?? { name: "—", slug: "" }, staff };
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const o = await open(req, id);
  if ("error" in o) return o.error;
  const desk = await loadPrismDesk(o.sb, o.blueprint, o.account);
  return NextResponse.json(desk, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const o = await open(req, id);
  if ("error" in o) return o.error;
  const { sb, blueprint, staff } = o;
  const b = await req.json().catch(() => ({})) as { action?: string; body?: string; wallId?: string; handle?: string; commissioned?: boolean; note?: string };
  const action = String(b.action ?? "");
  const byEmail = staff.email ?? null;

  if (action === "compose" || action === "say") {
    const instruction = action === "say" ? String(b.body ?? "").trim().slice(0, 4000) : null;
    if (action === "say" && !instruction) return NextResponse.json({ error: "Say something first." }, { status: 400 });
    if (instruction) {
      await sb.from("prism_messages").insert({ blueprint_id: blueprint.id, role: "founder", body: instruction, author_email: byEmail });
    }
    const r = await composeProposal(sb, blueprint, { instruction, byEmail });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
    return NextResponse.json({ ok: true, proposalId: r.proposal.id, revision: r.proposal.revision });
  }

  const { data: propRow } = await sb.from("prism_proposals").select("*").eq("blueprint_id", blueprint.id)
    .neq("status", "superseded").order("revision", { ascending: false }).limit(1).maybeSingle();
  const proposal = propRow as ProposalRow | null;
  if (!proposal) return NextResponse.json({ error: "Compose a direction first." }, { status: 409 });

  if (action === "choose") {
    const { data: wallRow } = await sb.from("blueprint_walls").select("*").eq("id", String(b.wallId ?? "")).eq("blueprint_id", blueprint.id).maybeSingle();
    const wall = wallRow as BlueprintWallRow | null;
    if (!wall) return NextResponse.json({ error: "That wall isn't in this project." }, { status: 404 });
    const handle = String(b.handle ?? "").trim();
    const allowed = (proposal.narrative.candidates?.[String(wall.seq)] ?? []).some((c) => c.handle === handle);
    if (!allowed) return NextResponse.json({ error: "Pick one of the candidates Prism found for this wall." }, { status: 400 });
    const ok = await choosePreview(sb, proposal, wall, handle);
    return NextResponse.json({ ok });
  }

  if (action === "commission") {
    const { data: wallRow } = await sb.from("blueprint_walls").select("seq").eq("id", String(b.wallId ?? "")).eq("blueprint_id", blueprint.id).maybeSingle();
    if (!wallRow) return NextResponse.json({ error: "That wall isn't in this project." }, { status: 404 });
    const walls = proposal.narrative.walls.map((w) => w.seq === wallRow.seq
      ? { ...w, commissioned: Boolean(b.commissioned), commissionNote: String(b.note ?? "").trim().slice(0, 2000) || w.commissionNote }
      : w);
    await sb.from("prism_proposals").update({ narrative: { ...proposal.narrative, walls } }).eq("id", proposal.id);
    return NextResponse.json({ ok: true });
  }

  if (action === "present") {
    const pulse = await loadPulse(sb, blueprint);
    const gate = presentable(pulse.readiness);
    if (!gate.ok) return NextResponse.json({ error: `Not yet. ${gate.reason}` }, { status: 409 });
    await sb.from("prism_proposals").update({ status: "presented", presented_at: new Date().toISOString() }).eq("id", proposal.id);
    await sb.from("prism_proposals").update({ status: "superseded" }).eq("blueprint_id", blueprint.id).neq("id", proposal.id).eq("status", "presented");
    await sb.from("campus_blueprints").update({ status: "presented", updated_at: new Date().toISOString() }).eq("id", blueprint.id);
    await sb.from("prism_messages").insert({ blueprint_id: blueprint.id, role: "prism", proposal_id: proposal.id, body: `Revision ${proposal.revision} presented to ${o.account.name}. It now shows in their Vault.` });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Bad request" }, { status: 400 });
}
