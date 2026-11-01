import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { signDoc } from "@/lib/private-doc";

export const runtime = "nodejs";

// A DURABLE link to an order document.
//
// Signed URLs expire in an hour. That is right for a page render and useless in
// an email a customer opens next week, so anything long-lived points here
// instead: this mints a fresh signature on each visit and redirects to it.
//
// The order token is the same secret that already opens /order/<token>, so this
// grants a holder nothing they did not already have — it only replaces a
// permanently-public file with a link that can be revoked by rotating the token.

const KINDS = {
  copy: "order_copy_url",
  invoice: "gst_invoice_url",
} as const;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string; kind: string }> },
) {
  const { token, kind } = await params;

  const column = KINDS[kind as keyof typeof KINDS];
  if (!column) return NextResponse.json({ error: "unknown_document" }, { status: 404 });

  const { data } = await supabase.rpc("order_by_token", { p_token: token });
  const order = data as Record<string, string | null> | null;
  if (!order) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const signed = await signDoc(order[column]);
  if (!signed) return NextResponse.json({ error: "no_document" }, { status: 404 });

  // The signature expires, so this redirect must never be cached — a cached
  // 302 would keep pointing at a URL that has already gone dead.
  const res = NextResponse.redirect(signed, 302);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
