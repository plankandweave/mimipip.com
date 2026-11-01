import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { sendEmail } from "@/lib/email";
import { isHotLead, recordEndOfCall, type EndOfCall } from "@/lib/voice-followup";
import { formatIstDateTime } from "@/lib/ist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vapi's server messages for OUTBOUND follow-up calls (src/lib/voice-followup.ts
// sets this url and the secret header on every call it places).
//
// We act on one message: the end-of-call report. It carries the summary, the
// transcript, the recording and the structured outcome Vapi extracted; we write
// them onto the voice_followups row, record an opt-out, re-queue a missed call
// for its second try, and email Roheena at once when the call found someone
// who wants a quote, a designer or simply a wall. Everything else (status
// updates today, whatever Vapi adds tomorrow) gets a fast 200 and is ignored —
// a non-2xx only makes Vapi retry something we do not need.
//
// Security: the x-vapi-secret header must equal VOICE_LLM_SECRET, compared in
// constant time over fixed-length digests. With no secret configured we
// refuse everything: an unauthenticated POST here could forge an opt-out or a
// "hot lead" for any queued customer.

function authorized(req: Request): boolean {
  const secret = process.env.VOICE_LLM_SECRET;
  if (!secret) return false;
  const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "")?.[1] ?? "";
  const given = req.headers.get("x-vapi-secret") ?? bearer;
  if (!given) return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

const LEAD_TO = process.env.LEAD_ALERT_TO || "roheena@plankandweave.com";
const FROM = "Zyvorah alerts <hello@mail.zyvorah.com>";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

async function mailHotLead(e: EndOfCall): Promise<void> {
  const o = e.outcome ?? {};
  const size = o.wall_width_ft && o.wall_height_ft ? `${o.wall_width_ft} x ${o.wall_height_ft} ft` : "size not given";
  const name = e.row.name ?? "Unnamed";
  const subject = `Hot lead from AI call: ${name}, ${e.row.phone}, ${o.room ?? "room not given"}, ${size}, ${o.timeline ?? "no timeline"}`;
  const wa = `https://wa.me/${e.row.phone.replace(/\D/g, "")}`;
  const ctx = e.row.context ?? {};
  const wants = [o.wants_quote && "a quote", o.wants_designer_call && "a designer call", o.interested && "interested"]
    .filter(Boolean)
    .join(", ");
  const html = `
    <p><strong>${esc(name)}</strong> · ${esc(e.row.phone)}${e.row.email ? ` · ${esc(e.row.email)}` : ""}</p>
    <p>Why we called: <strong>${esc(e.row.kind)}</strong>${ctx.design_title ? ` — ${esc(ctx.design_title)}` : ""}${ctx.city ? `, ${esc(ctx.city)}` : ""}</p>
    <p>Wants: ${esc(wants || "—")}<br>
       Room: ${esc(o.room ?? "—")} · Wall: ${esc(size)} · Timeline: ${esc(o.timeline ?? "—")}<br>
       Best time to reach them: ${esc(o.preferred_callback ?? "—")}</p>
    <p><strong>Summary</strong><br>${esc(e.summary ?? "No summary.")}</p>
    ${o.notes ? `<p><strong>Notes</strong><br>${esc(o.notes)}</p>` : ""}
    <p><a href="${esc(wa)}">WhatsApp ${esc(name)}</a>${e.recordingUrl ? ` · <a href="${esc(e.recordingUrl)}">Listen to the call</a>` : ""}</p>
    <p style="color:#888;font-size:12px">AI follow-up call ended ${esc(formatIstDateTime(new Date()))} IST. The customer was told it was an AI assistant.</p>`;
  await sendEmail({ to: LEAD_TO, subject: subject.slice(0, 200), html, from: FROM });
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { message?: Record<string, unknown> } | null;
  const msg = body?.message;
  if (!msg || msg.type !== "end-of-call-report") return NextResponse.json({ ok: true });

  try {
    const done = await recordEndOfCall(msg);
    if (!done) return NextResponse.json({ ok: true, recorded: false });
    if (done.status !== "opted_out" && isHotLead(done.outcome)) {
      try {
        await mailHotLead(done);
      } catch (e) {
        console.error("[vapi webhook] hot-lead email failed:", e instanceof Error ? e.message : "unknown");
      }
    }
    return NextResponse.json({ ok: true, recorded: true, status: done.status });
  } catch (e) {
    // Still 200: a retry would find the same fault. The row stays 'calling' and
    // the cron's stuck-call sweep marks it failed, which the brief reports.
    console.error("[vapi webhook] end-of-call failed:", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ ok: true, recorded: false });
  }
}
