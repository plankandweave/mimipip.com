import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { staffKey } from "@/lib/staff-key";
import { currentStaff } from "@/lib/staff-access";
import { previewMetaSales, launchMetaSales, scrub, VARIANT_KEYS, DEFAULT_VARIANTS, type VariantKey } from "@/lib/marketing/ads/retarget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The Meta sales launcher's only door (lib/marketing/ads/retarget.ts).
//
//   GET  — the dry run: every Graph payload a launch would send, the audience
//          sizes if Meta answers, the designs and copy, and what is blocking.
//          Never POSTs to Meta.
//   POST — { action: "launch", variants?: ["retarget", "prospect"], activate?: boolean }
//          Creates the selected variants PAUSED; with activate: true, also
//          commits the week to the ledger and switches them on — if the
//          audience and budget gates pass.
//
// Gated exactly like /api/admin/marketing: a signed-in staff member's key,
// checked by the database (intel_key_ok). This route is the "explicit staff
// action" retarget.ts's header depends on — nothing on a timer calls it — so
// the gate here is what stands between the internet and the ad account.
//
// Responses are JSON on every path, and error text passes through scrub() on
// the way out: the Marketing API token must never reach a browser, including
// inside an error message that happened to echo a request URL.

async function keyOk(key: string): Promise<boolean> {
  const { data } = await supabase.rpc("intel_key_ok", { p_key: key });
  return !!data;
}

export async function GET(req: Request) {
  const key = await staffKey(req);
  if (!(await keyOk(key))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, preview: await previewMetaSales() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: scrub((e as Error).message) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const key = await staffKey(req);
  if (!(await keyOk(key))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { action?: string; activate?: unknown; variants?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "expected a JSON body" }, { status: 400 });
  }
  if (body.action !== "launch") return NextResponse.json({ ok: false, error: `unknown action "${String(body.action)}"` }, { status: 400 });

  // Only the literal `true` activates. "true", 1 or a truthy object do not —
  // spend is switched on by the button that says so, not by a coercion.
  const activate = body.activate === true;
  const variants: VariantKey[] = Array.isArray(body.variants)
    ? (body.variants as unknown[]).filter((v): v is VariantKey => typeof v === "string" && (VARIANT_KEYS as string[]).includes(v))
    : DEFAULT_VARIANTS;
  if (!variants.length) return NextResponse.json({ ok: false, error: "no known variant selected" }, { status: 400 });

  try {
    const staff = await currentStaff(req).catch(() => null);
    const result = await launchMetaSales({ variants, activate, staff: staff?.email ?? null });
    return NextResponse.json(result, { status: result.ok ? 200 : result.state === "refused" ? 409 : 502 });
  } catch (e) {
    return NextResponse.json({ ok: false, state: "failed", error: scrub((e as Error).message) }, { status: 500 });
  }
}
