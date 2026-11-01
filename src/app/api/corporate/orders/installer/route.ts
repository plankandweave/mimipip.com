import { NextResponse } from "next/server";
import { can, currentCorporateSession } from "@/lib/corporate-auth";
import { nominatePartnerInstaller } from "@/lib/corporate-os";
export const dynamic = "force-dynamic";
export const maxDuration = 90;
export async function POST(req: Request) {
  const session = await currentCorporateSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (session.agreementPending || !can(session, "order")) return NextResponse.json({ error: "Your account cannot assign an installer" }, { status: 403 });
  let body: { orderId?: unknown; installerPhone?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  if (typeof body.orderId !== "number" || !Number.isSafeInteger(body.orderId) || body.orderId <= 0 || typeof body.installerPhone !== "string" || !/^\d{10}$/.test(body.installerPhone)) return NextResponse.json({ error: "Select an order and installer" }, { status: 400 });
  try { await nominatePartnerInstaller(session.account.slug, body.orderId, body.installerPhone); return NextResponse.json({ ok: true }); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Could not assign installer" }, { status: 409 }); }
}
