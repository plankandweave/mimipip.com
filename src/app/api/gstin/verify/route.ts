import { NextResponse } from "next/server";
import { getGatedUser } from "@/lib/auth-server";
import { gstinChecksumOk } from "@/lib/gst";
import { verifyGstin } from "@/lib/kyc";

export const runtime = "nodejs";

// Checkout's GST box (founder, 11 October 2026): verify a GSTIN the moment it
// is typed and fill the business name the GST register holds, so a buyer types
// one number, not their company's legal name.
//
// Every lookup is a paid Cashfree call, so it is asked only for a signed-in
// shopper and only for a number whose check digit is already right; the
// same isolate answers a repeat from memory. A failed or unconfigured lookup
// answers { unavailable: true } and the page keeps the name box editable —
// a GST invoice is never held up for want of the lookup.
const seen = new Map<string, { valid: boolean; status: string | null; legalName: string | null }>();

export async function POST(req: Request) {
  const noStore = { headers: { "Cache-Control": "private, no-store" } };
  let gstin = "";
  try {
    gstin = String(((await req.json()) as { gstin?: unknown }).gstin ?? "").trim().toUpperCase();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!gstinChecksumOk(gstin)) return NextResponse.json({ valid: false, reason: "checksum" }, noStore);

  const cached = seen.get(gstin);
  if (cached) return NextResponse.json(cached, noStore);

  if (!(await getGatedUser())) return NextResponse.json({ unavailable: true }, noStore);
  const result = await verifyGstin(gstin);
  if (!result) return NextResponse.json({ unavailable: true }, noStore);

  const answer = { valid: result.valid, status: result.status, legalName: result.legalName };
  if (seen.size > 500) seen.clear();
  seen.set(gstin, answer);
  return NextResponse.json(answer, noStore);
}
