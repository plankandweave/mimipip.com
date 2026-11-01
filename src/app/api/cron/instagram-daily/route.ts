import { NextResponse } from "next/server";
import { withCronRun } from "@/lib/cron-run";
import { composeInstagramCadence } from "@/lib/marketing/pipeline";
import { INSTAGRAM_KEYS, instagramKeySet } from "@/lib/marketing/providers/copy";
import { cadenceDaySummary, type CadenceDaySummary, type CadenceLedgerRow } from "@/lib/marketing/cadence";
import { hasServiceRole, serviceClient } from "@/lib/marketing/db";
import { nextDay } from "@/lib/marketing/plan";
import { qualifyReviewPosts } from "@/lib/marketing/review-queue";
import { PERSONAL_PLAN_PREFIX } from "@/lib/marketing/profiles";
import { fileSection } from "@/lib/briefing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Instagram's own run (08:00 and 14:00 IST): the daily cadence's grid post,
// reel and Stories for today and the next three days, composed for the
// founder's review. Composes only; never approves, publishes, spends on ads
// or sends outreach. See composeInstagramCadence (src/lib/marketing/pipeline.ts).
//
// A SILENT DAY IS A FAILED RUN. On 10–15 October 2026 this job reported ok
// twice a day while every one of those days had nothing on it (its rows had
// been set skipped by hand); on 7–8 October every composed post was refused by
// the review gate, so the review page said "nothing to approve" and two days
// went out empty. After composing, the run now counts what each day of its
// window has — out, approved, approvable, or HELD with the reason
// (cadenceDaySummary) — answers 503 when TODAY is still short, and files the
// whole picture to the morning brief with what needs the founder.
export const GET = withCronRun("instagram-daily", async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // No Instagram key: say so as a failed run (cron health shows it), and
  // compose nothing — the cadence never falls back to a shared key.
  if (!instagramKeySet()) {
    return NextResponse.json({ ok: false, error: `no Instagram caption key — set ${INSTAGRAM_KEYS.anthropic} (or ${INSTAGRAM_KEYS.openai}) on the zyvorah-store Worker` }, { status: 503 });
  }
  const AHEAD = 3;
  const { composed, remaining } = await composeInstagramCadence(AHEAD);
  const days = await summarise(AHEAD);
  const today = days[0];
  const todayShort = !!today && today.missing.length > 0;
  await fileBrief(days, composed.filter((o) => o.status === "failed").map((o) => `${o.slotKey}: ${o.error ?? "failed"}`)).catch(() => {});
  return NextResponse.json({
    ok: !todayShort,
    ...(todayShort ? { error: `today (${today.day}) is short: ${today.missing.join(", ")}` } : {}),
    captionKey: Object.values(INSTAGRAM_KEYS).find((k) => !!process.env[k]) ?? "none set",
    composed: composed.map((o) => ({ slot: o.slotKey, handle: o.handle, format: o.format, status: o.status, safety: o.safetyPassed, error: o.error })),
    remaining,
    days,
  }, { status: todayShort ? 503 : 200 });
});

/** Today in IST, the day the cadence composes for first. */
const istToday = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

/** Each day of the window, judged on what can actually go out. */
async function summarise(aheadDays: number): Promise<CadenceDaySummary[]> {
  if (!hasServiceRole()) return [];
  const days: string[] = [istToday()];
  for (let i = 0; i < aheadDays; i++) days.push(nextDay(days[days.length - 1]));
  const sb = serviceClient();
  const { data, error } = await sb
    .from("marketing_posts")
    .select("id,status,channel,format,caption,media_urls,thumbnail_url,safety_passed,approved_at,regenerate_requested_at,plan_slot_id,plan_key,slot_key,product_handle,error")
    .or(`plan_key.is.null,plan_key.not.like.${PERSONAL_PLAN_PREFIX}%`)
    .gte("slot_key", `${days[0]}#`)
    .lt("slot_key", `${nextDay(days[days.length - 1])}#`)
    .in("status", ["queued", "published"]);
  if (error) throw new Error(`cadence ledger read: ${error.message}`);
  const rows = await qualifyReviewPosts((data ?? []) as (CadenceLedgerRow & { id: string; caption: string | null; media_urls: string[] | null; safety_passed: boolean | null; channel: string; format: string })[], sb);
  return days.map((day) => cadenceDaySummary(day, rows));
}

const REVIEW = "https://zyvorah.com/admin/marketing/review";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const pretty = (day: string) => new Date(`${day}T00:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

/** The brief's Instagram line: one row per day, what needs her, and every
 *  hold by name — so a silent day can never again be a green morning. */
async function fileBrief(days: CadenceDaySummary[], composeFailures: string[]): Promise<void> {
  if (!days.length) return;
  const today = days[0];
  const status = today.missing.length ? "red" : days.some((d) => d.missing.length || d.held.length) ? "amber" : "green";
  const needs: string[] = [];
  for (const d of days) if (d.awaiting) needs.push(`Approve ${d.awaiting} post${d.awaiting === 1 ? "" : "s"} for ${pretty(d.day)} — <a href="${REVIEW}">${REVIEW}</a>`);
  const lines = days.map((d) => {
    const parts = [`${d.published} out`, `${d.approved} approved`, `${d.awaiting} waiting on you`];
    if (d.held.length) parts.push(`${d.held.length} held`);
    const miss = d.missing.length ? ` — <strong>missing ${esc(d.missing.join(", "))}</strong>` : "";
    return `<li>${pretty(d.day)}: ${parts.join(", ")}${miss}</li>`;
  });
  const holds = days.flatMap((d) => d.held.map((h) => `<li>${esc(h.slot)} ${esc(h.format)}: ${esc(h.reason)}</li>`));
  const failures = composeFailures.map((f) => `<li>${esc(f)}</li>`);
  const headline = today.missing.length
    ? `Today is short: ${today.missing.join(", ")}`
    : today.awaiting
      ? `Today's ${today.awaiting} post${today.awaiting === 1 ? " waits" : "s wait"} on your approval`
      : `Today is covered (${today.published} out, ${today.approved} approved)`;
  const body = [
    `<ul>${lines.join("")}</ul>`,
    holds.length ? `<p>Held, with the reason (production's, not yours):</p><ul>${holds.join("")}</ul>` : "",
    failures.length ? `<p>Could not be drawn this run:</p><ul>${failures.join("")}</ul>` : "",
    needs.length ? `<p><strong>What needs you:</strong><br/>${needs.join("<br/>")}</p>` : "",
  ].join("");
  await fileSection({ key: "instagram-cadence", status, headline, bodyHtml: body, source: "instagram-daily", observedAt: new Date().toISOString() });
}
