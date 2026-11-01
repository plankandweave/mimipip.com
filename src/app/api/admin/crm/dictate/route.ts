import { istDateKey } from "@/lib/ist";
import { NextResponse } from "next/server";
import { staffKey } from "@/lib/staff-key";
import { supabase } from "@/lib/supabase";
import { parseDictation } from "@/lib/crm-dictate";
import { anthropicKeyFor } from "@/lib/ai-keys";

export const runtime = "nodejs";
// Opus with adaptive thinking on a paragraph of speech takes longer than the
// default function budget allows.
export const maxDuration = 60;

// Parse dictated speech into a CRM proposal. Returns the proposal; writes
// nothing. The browser shows it, Roheena confirms, and the confirmed payload
// goes to crm_capture() from the client — the same RPC the manual form uses.
//
// Gated on the admin key like every other admin_* route, and gated BEFORE the
// Anthropic call specifically: this endpoint spends tokens per request, so an
// unauthenticated caller who could reach the model would be a billing hole as
// well as a data one.

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const key = await staffKey(req);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const today = typeof body?.today === "string" ? body.today : "";

  if (!key || !text) return NextResponse.json({ error: "missing_fields" }, { status: 400 });

  const { data: ok, error: keyErr } = await supabase.rpc("admin_key_ok", { p_key: key });
  if (keyErr || ok !== true) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // A hard ceiling on input. Pasting a whole mail archive in here would be a
  // slow, expensive accident rather than a use case.
  if (text.length > 12000) return NextResponse.json({ error: "too_long" }, { status: 413 });

  // The date is the browser's local date, not the server's: the server is UTC
  // and "Friday" means Roheena's Friday.
  const day = /^\d{4}-\d{2}-\d{2}$/.test(today) ? today : istDateKey();

  if (!anthropicKeyFor("crm")) {
    return NextResponse.json({ error: "parser_unconfigured" }, { status: 503 });
  }

  try {
    const proposal = await parseDictation(text, day);
    return NextResponse.json(proposal);
  } catch (e) {
    console.error("[crm/dictate] parse failed:", e);
    return NextResponse.json({ error: "parse_failed" }, { status: 502 });
  }
}
