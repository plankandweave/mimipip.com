import { NextResponse } from "next/server";
import { after } from "next/server";
import { supabase } from "@/lib/supabase";
import { processOutreach, recordOutreachAssessment, type OutreachSubmission } from "@/lib/outreach";

export const runtime = "nodejs";
export const maxDuration = 60;

// Public intake for /collaborate (creators) and /press (journalists).
//
// /collaborate (kind=influencer): the route only validates shape and hands
// off — after() runs the verification + AI assessment once the visitor
// already has their "thanks, we've got it" (the Instagram/MX/link lookups
// take seconds and must never sit in front of the form's response).
//
// /press (kind=press): this same form is also the gate in front of the press
// kit's downloads (see PressAccessGate), so the visitor needs a same-request
// answer. We run the checks + AI assessment INLINE here — a few seconds, but
// bounded by maxDuration — and unlock based on the verdict a "pass" (the
// scam/advertorial-fishing signal) is the only thing that keeps it locked.
// Either way the request lands on the Collabs tab of the marketing desk for
// her decision — the gate only decides browser access.

const MAX_LINKS = 6;

function cleanLinks(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => String(x ?? "").trim())
    .filter((s) => /^https?:\/\/[^\s]+$/i.test(s) && s.length <= 300)
    .slice(0, MAX_LINKS);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "server" }, { status: 400 });
  }

  const kind = body.kind === "press" ? "press" : body.kind === "influencer" ? "influencer" : null;
  if (!kind) return NextResponse.json({ error: "kind" }, { status: 400 });

  // Honeypot: a real person never sees this field. Answer like a success so a
  // bot has nothing to tune against, and never touch the database. Stays
  // locked (unlocked: false) — a bot filling a hidden field should never be
  // the thing that opens the press kit.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return NextResponse.json({
      ok: true,
      reference: kind === "press" ? "ZPRS-0000" : "ZCOL-0000",
      unlocked: false,
    });
  }

  const links = cleanLinks(body.links);
  const fields = body.fields && typeof body.fields === "object" && !Array.isArray(body.fields)
    ? Object.fromEntries(
        Object.entries(body.fields as Record<string, unknown>)
          .slice(0, 20)
          .map(([k, v]) => [k.slice(0, 40), Array.isArray(v) ? v.map(String).slice(0, 12) : String(v ?? "").slice(0, 300)]),
      )
    : {};

  const { data, error } = await supabase.rpc("submit_outreach", {
    p: {
      kind,
      name: body.name ?? null,
      email: body.email ?? null,
      handle: body.handle ?? null,
      outlet: body.outlet ?? null,
      links,
      fields,
      message: body.message ?? null,
    },
  });

  if (error) {
    console.error("[outreach] submit rpc failed", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
  const result = data as { ok?: boolean; error?: string; id?: string; token?: string; reference?: string };
  if (!result?.ok) {
    return NextResponse.json({ error: result?.error ?? "server" }, { status: 400 });
  }

  const sub: OutreachSubmission = {
    id: result.id!,
    token: result.token!,
    reference: result.reference!,
    kind,
    name: String(body.name),
    email: String(body.email).trim().toLowerCase(),
    handle: kind === "influencer" ? String(body.handle ?? "").replace(/^@/, "") || null : null,
    outlet: kind === "press" ? String(body.outlet ?? "") || null : null,
    links,
    fields,
    message: String(body.message),
  };

  if (kind === "press") {
    const assessed = await recordOutreachAssessment(sub);
    // Fail closed: no assessment (e.g. the RPC write failed) means we can't
    // vouch for it, so it stays locked and falls back to manual review.
    const unlocked = !!assessed && assessed.ai.verdict !== "pass";
    return NextResponse.json({ ok: true, reference: result.reference, unlocked });
  }

  after(() => processOutreach(sub));
  return NextResponse.json({ ok: true, reference: result.reference });
}
