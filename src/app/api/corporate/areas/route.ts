import { NextResponse } from "next/server";
import {
  canAdministerAccount, currentCorporateSession, recordAudit,
} from "@/lib/corporate-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { AreaRow } from "@/lib/portfolio";

export const dynamic = "force-dynamic";

/**
 * The floors and locations inside a building.
 *
 * An area is the level BELOW a place: 'Level 12 · Lift lobby', 'Ground ·
 * Main arrival'. It exists because a commercial tower is surveyed a floor at a
 * time by different people on different days, and corporate_stores.floors is an
 * integer count that cannot be listed, briefed or revisited.
 *
 * One survey belongs to one area (corporate_site_batches.area_id), which is
 * what keeps the allocator's contract intact: it still sees a batch of walls
 * numbered 1..n and cannot tell a lift lobby from a showroom.
 *
 * Reading is open to the whole account — knowing which floors exist is not
 * privileged inside the company. Writing is admin-only, matching stores.
 *
 * `code` is generated once from floor+name and then frozen: a link minted for
 * 'Level 12 · Lift lobby' must still point at the same place months later.
 */

const CODE_MAX = 40;

function codeFrom(floor: string | null, name: string): string {
  const raw = [floor, name].filter(Boolean).join("-");
  return raw.toLowerCase().normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, CODE_MAX) || "area";
}

/** First free suffix within the building. Two floors genuinely can hold a
 *  'Lift lobby' each, and nobody should have to invent a handle to say so. */
async function freeCode(storeId: string, base: string): Promise<string> {
  const sb = supabaseAdmin();
  if (!sb) return base;
  const { data } = await sb.from("corporate_site_areas")
    .select("code").eq("store_id", storeId).like("code", `${base}%`);
  const taken = new Set((data ?? []).map((r) => r.code as string));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 100; i++) {
    const candidate = `${base}-${i}`.slice(0, CODE_MAX);
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`.slice(0, CODE_MAX);
}

export async function GET() {
  const session = await currentCorporateSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  // Every area on the account in one read: the dashboard builds the whole
  // building → floor tree from this plus /stores, without a request per
  // building. A portfolio is tens of rows, not thousands.
  const { data, error } = await sb.from("corporate_site_areas")
    .select("*").eq("account_id", session.account.id).eq("active", true)
    .order("sort").order("floor").order("name");
  if (error) {
    console.error("[corporate/areas] list failed:", error.message);
    return NextResponse.json({ error: "Could not load your floors." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    areas: (data ?? []) as AreaRow[],
    can: { admin: canAdministerAccount(session) },
  });
}

export async function POST(req: Request) {
  const session = await currentCorporateSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (session.agreementPending) {
    return NextResponse.json({ error: "agreement_required" }, { status: 403 });
  }
  if (!canAdministerAccount(session)) {
    return NextResponse.json({
      error: "Only an account admin can add or change a floor.",
    }, { status: 403 });
  }
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  let b: {
    action?: string; id?: string; storeId?: string;
    floor?: string; name?: string; brief?: string; notes?: string; sort?: number;
  };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  const text = (v: unknown, max: number) => {
    const s = String(v ?? "").trim();
    return s ? s.slice(0, max) : null;
  };

  // ── Deactivate ───────────────────────────────────────────────────────────
  // Never deleted: past surveys point at this row, and a vanished area would
  // take their location with it.
  if (b.action === "deactivate") {
    const id = String(b.id ?? "");
    const { data: gone } = await sb.from("corporate_site_areas")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("id", id).eq("account_id", session.account.id)
      .select("id, name, floor").maybeSingle();
    if (!gone) return NextResponse.json({ error: "That floor isn't on your account." }, { status: 404 });
    await recordAudit(session, "area.deactivate", { type: "area", id },
      { name: gone.name, floor: gone.floor });
    return NextResponse.json({ ok: true, deactivated: true });
  }

  const name = text(b.name, 160);
  if (!name) {
    return NextResponse.json({ error: "Name the space — 'Lift lobby', 'Main arrival'." }, { status: 400 });
  }

  const sort = Number.isFinite(Number(b.sort)) ? Math.max(0, Math.min(999, Math.round(Number(b.sort)))) : 0;
  const patch = {
    floor: text(b.floor, 40),
    name,
    brief: text(b.brief, 2000),
    notes: text(b.notes, 2000),
    sort,
    updated_at: new Date().toISOString(),
  };

  // ── Update ───────────────────────────────────────────────────────────────
  // `code` and `store_id` are deliberately absent: the handle is stable, and a
  // floor cannot move to another building — that would silently re-address
  // every survey already taken on it.
  if (b.id) {
    const { data: saved, error } = await sb.from("corporate_site_areas")
      .update(patch).eq("id", b.id).eq("account_id", session.account.id)
      .select("*").maybeSingle();
    if (error || !saved) {
      console.error("[corporate/areas] update failed:", error?.message);
      return NextResponse.json({ error: "Could not save that floor." }, { status: error ? 500 : 404 });
    }
    await recordAudit(session, "area.update", { type: "area", id: b.id }, { name });
    return NextResponse.json({ ok: true, area: saved as AreaRow });
  }

  // ── Create ───────────────────────────────────────────────────────────────
  // The building is verified to belong to this account before anything is
  // written under it, so a storeId in the body cannot reach another tenant.
  const storeId = String(b.storeId ?? "");
  const { data: store } = await sb.from("corporate_stores")
    .select("id, name").eq("id", storeId).eq("account_id", session.account.id)
    .eq("active", true).maybeSingle();
  if (!store) {
    return NextResponse.json({ error: "That building isn't on your account." }, { status: 404 });
  }

  const code = await freeCode(storeId, codeFrom(patch.floor, name));
  const { data: created, error } = await sb.from("corporate_site_areas").insert({
    account_id: session.account.id, store_id: storeId, code, ...patch,
    created_by_email: session.email,
  }).select("*").single();
  if (error || !created) {
    console.error("[corporate/areas] create failed:", error?.message);
    return NextResponse.json({ error: "Could not add that floor." }, { status: 500 });
  }

  await recordAudit(session, "area.create",
    { type: "area", id: (created as AreaRow).id },
    { name, code, floor: patch.floor, building: store.name });
  return NextResponse.json({ ok: true, area: created as AreaRow });
}
