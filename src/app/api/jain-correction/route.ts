import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { istDateKey } from "@/lib/ist";
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  if (Number(req.headers.get("content-length") ?? 0) > 12000) return NextResponse.json({ error: "Too large" }, { status: 413 });
  const raw = await req.text();
  if (raw.length > 12000) return NextResponse.json({ error: "Too large" }, { status: 413 });
  let b: Record<string, unknown>;
  try { b = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  if (!b || typeof b !== "object") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const val = (k: string, n: number) => typeof b[k] === "string" ? b[k].trim().slice(0, n) : "";
  const name = val("name", 120), email = val("email", 254), message = val("message", 4000), id = val("submissionId", 36);
  if (val("website", 200)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || message.length < 10 || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return NextResponse.json({ error: "Please check the form" }, { status: 400 });
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "Review inbox unavailable" }, { status: 503 });
  const existing = await db.from("contact_messages").select("id").eq("id", id).maybeSingle();
  if (!existing.data) {
    const recent = await db.from("contact_messages").select("id", { count: "exact", head: true }).eq("email", email).eq("topic", "Jain Temples correction").gte("created_at", new Date(Date.now() - 3600000).toISOString());
    if ((recent.count ?? 0) >= 5) return NextResponse.json({ error: "Please try again later" }, { status: 429 });
  }
  const companyId = "137484b3-c49a-4ef9-8496-05f703425b3e";
  const company = await db.from("crm_companies").upsert({ id: companyId, name: "Jain Temples — artwork correction review", kind: "other", status: "active", source: "jain-correction" }, { onConflict: "id", ignoreDuplicates: true });
  if (company.error) return NextResponse.json({ error: "Review queue unavailable" }, { status: 503 });
  const note = `Jain Temples — Suggest a Correction\nName: ${name}\nEmail: ${email}\nDesign: ${val("design", 300)}\n\n${message}\n\nSupporting reference: ${val("reference", 500)}\nReference: ${id}`;
  // The same UUID makes a retry resume the original submission. These are the
  // canonical store CRM tables read by OS /api/store-crm/review. No subscriber,
  // outbound email, auto-reply or religious verification is created here.
  const contact = await db.from("contact_messages").upsert({ id, name, email, message: note, topic: "Jain Temples correction" }, { onConflict: "id", ignoreDuplicates: true });
  if (contact.error) return NextResponse.json({ error: "Could not save suggestion" }, { status: 503 });
  const recorded = await db.from("crm_notes").upsert({ id, company_id: companyId, kind: "note", body: note, source: "manual" }, { onConflict: "id", ignoreDuplicates: true });
  const task = await db.from("crm_tasks").upsert({ id, company_id: companyId, title: `Review Jain Temples correction ${id} — ${val("design", 100) || name}`, due_on: istDateKey(), source: "manual" }, { onConflict: "id", ignoreDuplicates: true });
  if (recorded.error || task.error) return NextResponse.json({ error: "Review queue unavailable; please retry" }, { status: 503 });
  return NextResponse.json({ ok: true, reference: id }, { headers: { "Cache-Control": "no-store" } });
}
