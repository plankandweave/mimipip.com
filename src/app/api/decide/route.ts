import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

// Flip a weekly-intelligence decision to approved/rejected. The unguessable
// per-decision token IS the capability (it only ever travels in the founder's
// report email), and the DB refuses to touch decisions already in execution.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const token = String(body?.token ?? "");
  const approve = body?.approve === true;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return NextResponse.json({ error: "bad_token" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("decide_by_token", {
    p_token: token,
    p_approve: approve,
  });
  if (error) {
    console.error("decide failed:", error.message);
    return NextResponse.json({ error: "decide_failed" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(data);
}
