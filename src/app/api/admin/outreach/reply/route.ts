import { NextResponse } from "next/server";
import { requireStaff, notStaff } from "@/lib/staff-access";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const escapeHtml = (value: string) => value
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

function asHtml(text: string): string {
  return text.split(/\n\s*\n/).map((paragraph) =>
    `<p>${escapeHtml(paragraph.trim()).replace(/\n/g, "<br/>")}</p>`
  ).join("");
}

// The founder can keep a reply as a draft. Approve & send saves the exact
// editor text first, then the existing idempotent decision endpoint sends it.
export async function POST(req: Request) {
  if (!(await requireStaff(req))) return notStaff();
  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !text || text.length > 6000) {
    return NextResponse.json({ error: "A reply of 1–6000 characters is required." }, { status: 400 });
  }

  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "Draft saving is unavailable." }, { status: 503 });

  const { data: row, error: readError } = await db.from("outreach_inquiries")
    .select("id, status, ai").eq("id", id).single();
  if (readError || !row) return NextResponse.json({ error: "Pitch not found." }, { status: 404 });
  if (row.status !== "new" && row.status !== "checked") {
    return NextResponse.json({ error: "This pitch has already been decided." }, { status: 409 });
  }

  const ai = row.ai && typeof row.ai === "object" && !Array.isArray(row.ai) ? row.ai : {};
  const { data: saved, error } = await db.from("outreach_inquiries")
    .update({ ai: { ...ai, draft_reply_text: text, draft_reply_html: asHtml(text) } })
    .eq("id", id).in("status", ["new", "checked"]).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: "Could not save reply." }, { status: 500 });
  if (!saved) return NextResponse.json({ error: "This pitch has already been decided." }, { status: 409 });
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
