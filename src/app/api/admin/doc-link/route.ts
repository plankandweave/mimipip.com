import { NextResponse } from "next/server";
import { staffKey } from "@/lib/staff-key";
import { supabase } from "@/lib/supabase";
import { docRef, signDoc } from "@/lib/private-doc";

export const runtime = "nodejs";

// The ops dashboard is a Client Component, so it cannot mint a signed link
// itself — the service role must never reach the browser. It posts the stored
// document reference here with the admin key instead, and the key is validated
// where every other admin action validates it: in the database.

/** Only the document buckets are signable here. Without this the route would
 *  sign any path in any bucket for anyone holding the admin key — a wider grant
 *  than the dashboard needs, and the kind that quietly becomes load-bearing. */
const SIGNABLE = new Set(["order-copies", "order-previews", "print-files"]);

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const { url } = body ?? {};
  if (!url) return NextResponse.json({ error: "missing_fields" }, { status: 400 });

  const { data: ok, error } = await supabase.rpc("admin_key_ok", { p_key: await staffKey(req) });
  if (error || ok !== true) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const ref = docRef(url);
  if (!ref || !SIGNABLE.has(ref.bucket)) {
    return NextResponse.json({ error: "not_a_document" }, { status: 400 });
  }

  const signed = await signDoc(url);
  if (!signed) return NextResponse.json({ error: "sign_failed" }, { status: 500 });

  return NextResponse.json({ url: signed });
}
