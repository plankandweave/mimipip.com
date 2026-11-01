import { NextResponse } from "next/server";
import { requireStaff, notStaff } from "@/lib/staff-access";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { loadPulse } from "@/lib/vault";
import type { BlueprintRow } from "@/lib/trace-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The Prism desk's front page: every campus Blueprint, its Pulse and where
// its design stands. Staff only.
export async function GET(req: Request) {
  if (!(await requireStaff(req))) return notStaff();
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "The desk is unavailable." }, { status: 503 });

  const { data: bpRows } = await sb.from("campus_blueprints").select("*").neq("status", "closed").order("created_at");
  const blueprints = (bpRows ?? []) as BlueprintRow[];
  const accountIds = [...new Set(blueprints.map((b) => b.account_id))];
  const { data: accRows } = accountIds.length
    ? await sb.from("corporate_accounts").select("id, name, slug").in("id", accountIds) : { data: [] };
  const accounts = new Map(((accRows ?? []) as { id: string; name: string; slug: string }[]).map((a) => [a.id, a]));
  const { data: propRows } = blueprints.length
    ? await sb.from("prism_proposals").select("blueprint_id, revision, direction, status, created_at")
        .in("blueprint_id", blueprints.map((b) => b.id)).neq("status", "superseded").order("revision", { ascending: false })
    : { data: [] };
  const latest = new Map<string, { revision: number; direction: string; status: string; created_at: string }>();
  for (const p of (propRows ?? []) as { blueprint_id: string; revision: number; direction: string; status: string; created_at: string }[]) {
    if (!latest.has(p.blueprint_id)) latest.set(p.blueprint_id, p);
  }

  const rows = await Promise.all(blueprints.map(async (b) => {
    const pulse = await loadPulse(sb, b);
    const a = accounts.get(b.account_id);
    return {
      id: b.id, name: b.name, city: b.city, language: b.language, status: pulse.status,
      accountName: a?.name ?? "—", accountSlug: a?.slug ?? null,
      readiness: pulse.readiness, latest: latest.get(b.id) ?? null,
    };
  }));
  return NextResponse.json({ blueprints: rows }, { headers: { "Cache-Control": "private, no-store" } });
}
