import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { staffKey } from "@/lib/staff-key";
import { currentStaff } from "@/lib/staff-access";
import { scrub } from "@/lib/marketing/ads/retarget";
import { BOOSTS, isBoostKey, launchBoost, previewBoost } from "@/lib/marketing/ads/reel-boost";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The reel promoter's only door (lib/marketing/ads/reel-boost.ts).
//
//   GET  — every boost's dry run: is the reel out, which postcodes resolved,
//          budget headroom, and what already exists. Never POSTs to Meta.
//   POST — { boost, activate?: boolean }. Creates the boost PAUSED; with
//          activate: true (only the literal true) also commits the week to the
//          ledger and switches it on.
//
// Gated like /api/admin/marketing/meta-retarget: a signed-in staff member's
// key, checked by the database. Nothing on a timer calls this.

async function keyOk(key: string): Promise<boolean> {
  const { data } = await supabase.rpc("intel_key_ok", { p_key: key });
  return !!data;
}

export async function GET(req: Request) {
  const key = await staffKey(req);
  if (!(await keyOk(key))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const previews = await Promise.all(Object.keys(BOOSTS).filter(isBoostKey).map((k) => previewBoost(k)));
    return NextResponse.json({ ok: true, previews });
  } catch (e) {
    return NextResponse.json({ ok: false, error: scrub((e as Error).message) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const key = await staffKey(req);
  if (!(await keyOk(key))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { boost?: unknown; activate?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "expected a JSON body" }, { status: 400 });
  }
  if (!isBoostKey(body.boost)) return NextResponse.json({ ok: false, error: `unknown boost "${String(body.boost)}"` }, { status: 400 });
  try {
    const staff = await currentStaff(req).catch(() => null);
    const result = await launchBoost(body.boost, { activate: body.activate === true, staff: staff?.email ?? null });
    return NextResponse.json(result, { status: result.ok ? 200 : result.state === "refused" ? 409 : 502 });
  } catch (e) {
    return NextResponse.json({ ok: false, state: "failed", error: scrub((e as Error).message) }, { status: 500 });
  }
}
