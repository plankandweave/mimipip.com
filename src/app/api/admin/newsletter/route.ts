import { NextResponse } from "next/server";
import { staffKey } from "@/lib/staff-key";
import { supabase } from "@/lib/supabase";
import { elevatedKey } from "@/lib/elevated-key";
import { SITE_URL } from "@/lib/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin bridge for the weekly newsletter. The browser holds the /admin key; the
// intel key (which unlocks the recipient list + generation) never leaves the
// server. So: validate the admin key here, then act with the elevated key —
// read from the database that validates it, not from a second copy in the
// environment that can drift out of step with it.
//
// POST { key, action: "overview" | "test" | "send-now", email?, week? }
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const action = body?.action as string | undefined;

  const { data: ok, error: keyErr } = await supabase.rpc("admin_key_ok", { p_key: await staffKey(req) });
  if (keyErr || !ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const intelKey = await elevatedKey();
  if (!intelKey) return NextResponse.json({ error: "newsletter_key_unset" }, { status: 503 });

  if (action === "overview") {
    const { data, error } = await supabase.rpc("newsletter_overview", { p_key: intelKey });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, overview: data });
  }

  if (action === "test" || action === "send-now") {
    const params = new URLSearchParams();
    if (body?.week) params.set("week", String(body.week));
    if (action === "test") {
      const email = String(body?.email ?? "").trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return NextResponse.json({ error: "invalid_email" }, { status: 400 });
      }
      params.set("test", email);
    }
    // Reuse the cron pipeline (generation, storage, send) with the server key.
    const res = await fetch(`${SITE_URL}/api/cron/newsletter?${params.toString()}`, {
      headers: { "x-intel-key": intelKey },
    });
    const json = await res.json().catch(() => ({}));
    return NextResponse.json({ ok: res.ok, result: json }, { status: res.ok ? 200 : 502 });
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
