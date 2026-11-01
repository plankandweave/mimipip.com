import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { supabase } from "@/lib/supabase";
import { TASTE_COOKIE } from "@/lib/taste";
import { isCrawler, uaFamily, VISITOR_TOKEN_RE } from "@/lib/ua";

export const runtime = "nodejs";

// What a Library film did for a visitor, one beacon per step: it started, the
// sound came on, half was watched, it finished, its link was taken. The server
// names the event from a fixed list, so nothing a browser sends becomes a row
// on its own. These feed marketing_film_stats → the Library card and the
// Monday report. POST { filmId, step, path }
const STEPS = new Set(["play", "sound", "half", "complete", "cta"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const filmId = String(body?.filmId ?? "");
  const step = String(body?.step ?? "");
  if (!UUID.test(filmId) || !STEPS.has(step)) return NextResponse.json({ ok: false }, { status: 400 });
  const path = typeof body?.path === "string" ? body.path.slice(0, 200) : "";
  // A film on a product page is credited to that design, so it joins the
  // design's own views and carts in the report.
  const handle = path.match(/^\/products\/([^/?#]+)/)?.[1] ?? null;

  const store = await cookies();
  const existing = store.get(TASTE_COOKIE)?.value;
  // The visitor token proxy.ts minted on the first page — the same one the
  // taste and cart beacons carry, so a play and a later cart join up.
  const token = existing && VISITOR_TOKEN_RE.test(existing) ? existing : randomUUID();
  const ua = req.headers.get("user-agent");
  const { error } = await supabase.rpc("log_site_event", {
    p_token: token,
    p_event: `film_${step}`,
    p_handle: handle,
    p_meta: { film_id: filmId, path: path || null },
    p_is_bot: isCrawler(ua),
    p_ua_family: uaFamily(ua),
  });
  if (error) console.error("[films] event failed:", error.message);
  return NextResponse.json({ ok: !error });
}
