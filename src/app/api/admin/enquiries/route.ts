import { NextResponse } from "next/server";
import { requireStaff, notStaff } from "@/lib/staff-access";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await requireStaff(req))) return notStaff();
  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Enquiry inbox is unavailable." }, { status: 503 });
  const { data, error } = await admin.from("contact_messages").select("*").order("created_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: "Could not load enquiries." }, { status: 500 });
  return NextResponse.json({ enquiries: (data ?? []).map(row => ({ id: row.id, name: row.name, email: row.email, topic: row.topic, message: row.message, created_at: row.created_at })) }, { headers: { "Cache-Control": "private, no-store" } });
}
