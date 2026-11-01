import { NextRequest, NextResponse } from "next/server";

// Server-side proxy so the customer's order page can read install status and
// submit installation feedback without a cross-origin call to the OS. The OS
// endpoints are unguessable-token-gated; we just forward the token.

const OS_BASE = (process.env.OS_BASE_URL ?? "https://os.magnitudegroup.in").replace(/\/$/, "");

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const r = await fetch(`${OS_BASE}/api/zyvorah/o/${encodeURIComponent(token)}/install`, { cache: "no-store" });
    if (!r.ok) return NextResponse.json({ ok: false }, { status: r.status });
    return NextResponse.json(await r.json());
  } catch {
    return NextResponse.json({ ok: false, error: "unreachable" }, { status: 502 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json().catch(() => ({}));
  // A `consent` object = the customer's choice about showing a photo of their
  // finished wall (scope site / social). The OS owns the consent record and
  // the approval; it decides whether a photo is ever pushed back to us.
  if (body?.consent && typeof body.consent === "object") {
    const site = body.consent.site === true;
    // Social is a widening of site consent, never on its own.
    const social = site && body.consent.social === true;
    try {
      const r = await fetch(`${OS_BASE}/api/zyvorah/o/${encodeURIComponent(token)}/photo-consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site, social }),
      });
      return NextResponse.json(await r.json().catch(() => ({})), { status: r.status });
    } catch {
      return NextResponse.json({ ok: false, error: "unreachable" }, { status: 502 });
    }
  }
  // A `slot` in the body = confirm the appointment time; otherwise it's feedback.
  const isSlot = typeof body?.slot === "string" && body.slot.length > 0;
  const path = isSlot ? "confirm-slot" : "feedback";
  const payload = isSlot
    ? { slot: body.slot }
    : { happy: body?.happy === true, note: typeof body?.note === "string" ? body.note : undefined };
  try {
    const r = await fetch(`${OS_BASE}/api/zyvorah/o/${encodeURIComponent(token)}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return NextResponse.json(await r.json().catch(() => ({})), { status: r.status });
  } catch {
    return NextResponse.json({ ok: false, error: "unreachable" }, { status: 502 });
  }
}
