import { NextResponse } from "next/server";
import { requireStaff, notStaff } from "@/lib/staff-access";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendEmailWithId } from "@/lib/email";
import { briefEmail, nextSendWindow } from "@/lib/collab-brief-email";
import { FOUNDER_ADDRESS } from "@/lib/founder-mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { id, preview?: true } — the creator's brief: her code, her link, what
 * she agreed to make and the hashtags. Sent only when staff press Send, from
 * Team Zyvorah with the founder copied, and only between 9 am and 7 pm India
 * time, never on a Sunday (the founder's rule for every work email): outside
 * that window Resend holds it until the next 9:05 am on a working day.
 * `preview` returns the email without sending.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const staff = await requireStaff(req);
  if (!staff) return notStaff();
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "The desk is unavailable." }, { status: 503 });
  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Unknown collaboration." }, { status: 400 });

  const { data: c } = await db.from("collaborations").select("*").eq("id", id).maybeSingle();
  if (!c) return NextResponse.json({ error: "Unknown collaboration." }, { status: 404 });
  const row = c as {
    name: string; email: string; code: string; slug: string; discount_pct: number; max_value_inr: number | null;
    free_shipping: boolean; code_expires_at: string | null; allowed_handles: string[] | null; hashtags: string[]; status: string;
  };
  if (row.status === "cancelled") return NextResponse.json({ error: "This collaboration is cancelled." }, { status: 409 });

  const [{ data: dels }, { data: prods }] = await Promise.all([
    db.from("collaboration_deliverables").select("kind, description, due_on").eq("collaboration_id", id).order("due_on", { ascending: true, nullsFirst: false }),
    row.allowed_handles?.length ? db.from("products").select("handle, title").in("handle", row.allowed_handles) : Promise.resolve({ data: [] }),
  ]);
  const email = briefEmail({
    name: row.name,
    code: row.code,
    slug: row.slug,
    discountPct: row.discount_pct,
    maxValueInr: row.max_value_inr != null ? Number(row.max_value_inr) : null,
    freeShipping: row.free_shipping,
    codeExpiresAt: row.code_expires_at,
    allowedTitles: ((prods ?? []) as { title: string }[]).map((p) => p.title),
    hashtags: row.hashtags ?? [],
    deliverables: (dels ?? []) as { kind: string; description: string | null; due_on: string | null }[],
  });
  if (body?.preview === true) return NextResponse.json({ ...email, to: row.email });

  const now = new Date();
  const at = nextSendWindow(now);
  const scheduled = at.getTime() > now.getTime();
  const sent = await sendEmailWithId({
    to: row.email,
    cc: FOUNDER_ADDRESS,
    from: "Team Zyvorah <hello@mail.zyvorah.com>",
    replyTo: "hello@zyvorah.com",
    subject: email.subject,
    html: email.html,
    tags: [{ name: "kind", value: "collab_brief" }],
    ...(scheduled ? { scheduledAt: at.toISOString() } : {}),
    idempotencyKey: `collab-brief-${id}-${now.toISOString().slice(0, 13)}`,
  });
  if (!sent.ok) return NextResponse.json({ error: "The email could not be sent — please try again." }, { status: 502 });

  const stamp = `Brief ${scheduled ? `scheduled for ${at.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} IST` : "sent"} to ${row.email} by ${staff.email} on ${now.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}.`;
  const { data: cur } = await db.from("collaborations").select("notes").eq("id", id).maybeSingle();
  const notes = [(cur as { notes?: string | null } | null)?.notes, stamp].filter(Boolean).join("\n");
  await db.from("collaborations").update({ notes: notes.slice(-4000) }).eq("id", id);
  return NextResponse.json({ ok: true, scheduledAt: scheduled ? at.toISOString() : null });
}
