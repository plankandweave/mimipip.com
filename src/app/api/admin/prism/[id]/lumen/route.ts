import { NextResponse } from "next/server";
import { requireStaff, notStaff } from "@/lib/staff-access";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { BlueprintRow } from "@/lib/trace-link";
import type { ProposalRow } from "@/lib/prism";
import { cutFilm, filmView, latestFilm, presentFilm, recordNarration, saveScript, writeScript } from "@/lib/lumen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Lumen, for one Blueprint's current proposal.
//
//   GET                      → the latest film of the current proposal (or null)
//   POST action: "write"     → Lumen writes the narration; a new film row
//   POST action: "save"      → the founder's edits to the words (and title)
//   POST action: "record"    → her voice, scene by scene, on ElevenLabs
//   POST action: "cut"       → the container cuts the film; poll GET
//   POST action: "present"   → the film shows in the college's Vault

async function open(req: Request, id: string) {
  const staff = await requireStaff(req);
  if (!staff) return { error: notStaff() };
  const sb = supabaseAdmin();
  if (!sb) return { error: NextResponse.json({ error: "The desk is unavailable." }, { status: 503 }) };
  const { data: bp } = await sb.from("campus_blueprints").select("*").eq("id", id).maybeSingle();
  if (!bp) return { error: NextResponse.json({ error: "No such project." }, { status: 404 }) };
  const blueprint = bp as BlueprintRow;
  const { data: acc } = await sb.from("corporate_accounts").select("name, slug").eq("id", blueprint.account_id).maybeSingle();
  const { data: propRow } = await sb.from("prism_proposals").select("*").eq("blueprint_id", blueprint.id)
    .neq("status", "superseded").order("revision", { ascending: false }).limit(1).maybeSingle();
  const proposal = propRow as ProposalRow | null;
  return { sb, blueprint, proposal, account: (acc as { name: string; slug: string } | null) ?? { name: "—", slug: "unknown" }, staff };
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const o = await open(req, id);
  if ("error" in o) return o.error;
  if (!o.proposal) return NextResponse.json({ film: null }, { headers: { "Cache-Control": "private, no-store" } });
  const film = await latestFilm(o.sb, o.proposal.id);
  return NextResponse.json({ film: film ? await filmView(o.sb, film) : null }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const o = await open(req, id);
  if ("error" in o) return o.error;
  const { sb, blueprint, proposal, account, staff } = o;
  if (!proposal) return NextResponse.json({ error: "Compose a direction with Prism first." }, { status: 409 });
  const b = await req.json().catch(() => ({})) as { action?: string; title?: string; scenes?: { key: string; narration: string }[] };
  const action = String(b.action ?? "");

  if (action === "write") {
    const r = await writeScript(sb, blueprint, proposal, account, staff.email ?? null);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
    return NextResponse.json({ ok: true, filmId: r.film.id });
  }

  const film = await latestFilm(sb, proposal.id);
  if (!film) return NextResponse.json({ error: "Write the script first." }, { status: 409 });

  if (action === "save") {
    const scenes = Array.isArray(b.scenes) ? b.scenes.filter((s) => s && typeof s.key === "string" && typeof s.narration === "string").slice(0, 80) : [];
    const r = await saveScript(sb, film, scenes, typeof b.title === "string" ? b.title : undefined);
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 409 });
  }
  if (action === "record") {
    const r = await recordNarration(sb, film, account.slug);
    return r.ok ? NextResponse.json({ ok: true, recorded: r.recorded }) : NextResponse.json({ error: r.error }, { status: 409 });
  }
  if (action === "cut") {
    const r = await cutFilm(sb, film, proposal, blueprint, account);
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 409 });
  }
  if (action === "present") {
    const r = await presentFilm(sb, film, proposal);
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 409 });
  }
  return NextResponse.json({ error: "Bad request" }, { status: 400 });
}
