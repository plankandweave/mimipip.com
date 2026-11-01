import { NextResponse } from "next/server";
import { withCronRun } from "@/lib/cron-run";
import { fileSection, type BriefStatus } from "@/lib/briefing";
import {
  enqueueCandidates,
  followupReadiness,
  last24h,
  placeDueCalls,
  MAX_CALLS_PER_RUN,
  type Last24h,
} from "@/lib/voice-followup";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Twice a day (08:00 and 14:00 IST, cron-worker; founder 9 Oct 2026): queue anyone
 * newly worth a follow-up call, then dial up to MAX_CALLS_PER_RUN of them —
 * but only inside Mon–Sat 10:30–19:30 IST. Outside the window the tick still
 * runs (queue, housekeeping, brief), which is also what keeps its heartbeat
 * honest at its twice-a-day cadence. Only the 14:00 tick is inside the window,
 * so at most MAX_CALLS_PER_RUN calls a day while calling is switched on.
 *
 * Every rule about who may be called lives in src/lib/voice-followup.ts; this
 * route only sequences it and reports. It never throws for missing config:
 * followupReadiness() names what is missing, and that sentence is what the
 * morning brief prints, so "why is nobody being called" has an answer.
 */
async function tick(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const ready = await followupReadiness();
  // When the readiness check answered — the evidence an inert run files.
  const checkedAt = new Date().toISOString();
  if (!ready.ok) {
    // Paused on purpose reads as information; anything else is a thing to fix.
    const paused = ready.reason.startsWith("VOICE_FOLLOWUP_ENABLED");
    await fileSection({
      key: "call-followups",
      status: paused ? "info" : "amber",
      headline: `AI follow-up calls are not running: ${ready.reason}`,
      bodyHtml: `<p>No calls were placed by this run. ${esc(ready.reason)}.</p>`,
      source: "voice-followups cron",
      observedAt: checkedAt,
    });
    return NextResponse.json({ ok: true, inert: true, reason: ready.reason });
  }

  const now = new Date();
  // Candidates are read from Supabase (ready.db); the queue, the opt-out list
  // and the call log are D1 zyvorah-ops (ready.ops).
  const enq = await enqueueCandidates(ready.db, ready.ops, now);
  const dial = await placeDueCalls(ready.ops, now);
  const stats = await last24h(ready.ops, now);
  // The call log was read just now; that read is what the section reports.
  const observedAt = new Date().toISOString();
  const notes = [...enq.notes, ...dial.notes];

  await fileSection({
    key: "call-followups",
    ...brief(stats, notes),
    source: "voice-followups cron",
    observedAt,
  });

  return NextResponse.json({
    ok: true,
    enqueue: { found: enq.found, queued: enq.queued, optedOut: enq.optedOut, recentlyCalled: enq.recentlyCalled },
    dial: {
      placed: dial.placed,
      skipped: dial.skipped,
      failed: dial.failed,
      expired: dial.expired,
      stuck: dial.stuck,
      outsideWindow: dial.outsideWindow,
      maxPerRun: MAX_CALLS_PER_RUN,
    },
    notes: notes.length,
  });
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function brief(s: Last24h | null, notes: string[]): { status: BriefStatus; headline: string; bodyHtml: string } {
  if (!s) {
    return { status: "amber", headline: "AI follow-up calls: could not read the call log", bodyHtml: "<p>voice_followups (D1 zyvorah-ops) was unreadable this run.</p>" };
  }
  const headline =
    `${plural(s.placed, "call")} placed, ${s.answered} answered, ${plural(s.hot.length, "hot lead")}, ` +
    `${plural(s.optOuts, "opt-out")} in the last 24h · ${s.queued} queued`;
  const status: BriefStatus = s.failed > 0 || notes.length > 0 ? "amber" : s.placed > 0 ? "green" : "info";
  const hot = s.hot.length
    ? `<ul>${s.hot
        .slice(0, 10)
        .map((h) => `<li><strong>${esc(h.name ?? "Unnamed")}</strong> (${esc(h.kind)}${h.room ? `, ${esc(h.room)}` : ""}) — ${esc(h.summary ?? "no summary")}</li>`)
        .join("")}</ul>`
    : "";
  const parts = [
    `<p>${s.placed} dialled · ${s.answered} answered · ${s.noAnswer} no answer · ${s.failed} failed · ${s.optOuts} opted out. Calls run Mon–Sat 10:30–19:30 IST; each hot lead was also emailed the moment its call ended.</p>`,
    hot,
    notes.length ? `<p>Problems this run:</p><ul>${notes.slice(0, 8).map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : "",
  ];
  return { status, headline, bodyHtml: parts.join("") };
}

export const GET = withCronRun("voice-followups", tick);
