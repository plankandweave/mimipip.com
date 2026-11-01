import { NextResponse } from "next/server";
import { withCronRun } from "@/lib/cron-run";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchOsStatuses, type OsOrderStatus } from "@/lib/corporate-os";
import {
  classifyAttention, rememberSettled, syncAttention, hoursWaiting, waitingLabel, firstStuckAt,
  ESCALATE_AFTER_HOURS, RE_ESCALATE_AFTER_HOURS,
} from "@/lib/corporate-attention";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Escalation sweep for partner orders that are stuck (Roheena 2026-08-11:
 * "if Savita isn't responding to something, it should have escalated to me
 * within 24 hours of something pending on her").
 *
 * Why a cron and not a dashboard-time check: the dashboard only classifies rows
 * when a partner happens to open it. VS-000039/40 sat needing attention from
 * 6 Aug — five days — precisely because nothing ran unless someone looked. An
 * escalation that depends on somebody noticing is not an escalation.
 *
 * The sweep is the authority on attention state: it polls the OS itself rather
 * than trusting the last dashboard read, so a partner who never logs in still
 * gets their stuck order surfaced.
 *
 * Auth: Vercel cron sends `Authorization: Bearer <CRON_SECRET>`.
 */

const ESCALATE_TO = process.env.CORPORATE_ESCALATION_EMAIL || "roheena@plankandweave.com";
const DESK_EMAIL = process.env.CORPORATE_DESK_EMAIL || "hello@zyvorah.com";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://zyvorah.com";
/** Rows we consider at all. Terminal states can't be "stuck". */
const LIVE_STATUSES = ["submitted", "in_production", "frozen", "po_received", "push_failed"];

type Row = {
  id: string;
  order_ref: string;
  status: string | null;
  push_error: string | null;
  cancel_requested_at: string | null;
  cancel_resolved_at: string | null;
  os_order_id: number | null;
  placed_by_email: string;
  print_name: string | null;
  width_mm: number;
  height_mm: number;
  total: number | null;
  created_at: string;
  attention_since: string | null;
  attention_party: string | null;
  attention_reason: string | null;
  escalated_at: string | null;
  corporate_accounts: { name: string; slug: string } | null;
};

async function tick(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const viaCron = !!cronSecret && req.headers.get("authorization") === `Bearer ${cronSecret}`;
  if (!viaCron) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const { data, error } = await sb
    .from("corporate_orders")
    .select(
      "id, order_ref, status, push_error, cancel_requested_at, cancel_resolved_at, os_order_id, placed_by_email, " +
      "print_name, width_mm, height_mm, total, created_at, attention_since, attention_party, " +
      "attention_reason, escalated_at, corporate_accounts(name, slug)",
    )
    .in("status", LIVE_STATUSES)
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) {
    console.error("[cron/corporate-attention] query failed:", error.message);
    return NextResponse.json({ error: "query failed" }, { status: 500 });
  }
  const rows = (data ?? []) as unknown as Row[];
  if (rows.length === 0) return NextResponse.json({ ok: true, considered: 0, escalated: 0 });

  // One OS call for the whole sweep.
  const osIds = rows.map(r => r.os_order_id).filter((n): n is number => typeof n === "number");
  let statuses: Record<number, OsOrderStatus> = {};
  try {
    statuses = await fetchOsStatuses(osIds);
  } catch (e) {
    // A blind sweep would clear every attention flag it can't confirm, so stop.
    console.error("[cron/corporate-attention] OS unreachable, skipping run:", e);
    return NextResponse.json({ ok: false, skipped: "os unreachable" }, { status: 200 });
  }

  // A finished wall leaves the live statuses, so it is never swept again.
  await rememberSettled(sb, rows, statuses);

  // Stamp / refresh / clear, exactly as the dashboard would.
  await syncAttention(sb, rows, statuses, (r) => {
    const hit = rows.find(x => x.id === r.id);
    return typeof hit?.os_order_id === "number" ? hit.os_order_id : null;
  });

  const now = Date.now();
  const due: Array<{ row: Row; hours: number; headline: string; reason: string; party: string }> = [];

  for (const row of rows) {
    const os = typeof row.os_order_id === "number" ? statuses[row.os_order_id] : null;
    const a = classifyAttention(row, os);
    if (!a) continue;

    // syncAttention has just stamped first-sightings, but this row object still
    // holds the pre-write value — recompute with the same rule so an order
    // production never progressed is measured from when it was PLACED. Without
    // that, VS-000039/40 (stuck since 6 Aug, reason known only to the OS, so
    // invisible to 0088's backfill) would restart at zero here and defer this
    // escalation by another 24 h.
    const since = row.attention_since ?? firstStuckAt(row, os, new Date(now).toISOString());
    const hours = hoursWaiting(since, now) ?? 0;
    if (hours < ESCALATE_AFTER_HOURS) continue;

    // Already told her recently? Stay quiet until the re-notice window passes,
    // so a genuinely stuck order nags weekly-ish rather than hourly.
    if (row.escalated_at) {
      const sinceMail = hoursWaiting(row.escalated_at, now) ?? 0;
      if (sinceMail < RE_ESCALATE_AFTER_HOURS) continue;
    }
    due.push({ row, hours, headline: a.headline, reason: a.reason, party: a.party });
  }

  if (due.length === 0) {
    return NextResponse.json({ ok: true, considered: rows.length, escalated: 0 });
  }

  const ftIn = (mm: number) => {
    const t = mm / 25.4, f = Math.floor(t / 12), i = Math.round(t - f * 12);
    return i === 12 ? `${f + 1} ft` : i ? `${f} ft ${i} in` : `${f} ft`;
  };

  // ONE mail for the whole sweep — a separate mail per stuck order is how an
  // escalation becomes noise and stops being read.
  const rowsHtml = due.map(({ row, hours, headline, reason, party }) => `
    <tr style="border-top:1px solid #e5e7eb">
      <td style="padding:8px 12px 8px 0;vertical-align:top">
        <strong style="font-family:ui-monospace,monospace">${escapeHtml(row.order_ref)}</strong><br>
        <span style="color:#64748b;font-size:12px">${escapeHtml(row.corporate_accounts?.name ?? "—")}</span>
      </td>
      <td style="padding:8px 12px 8px 0;vertical-align:top;font-size:13px">
        ${escapeHtml(row.print_name ?? "Untitled")}<br>
        <span style="color:#64748b;font-size:12px">${ftIn(row.width_mm)} × ${ftIn(row.height_mm)}${row.total ? ` · ₹${Number(row.total).toLocaleString("en-IN")}` : ""}</span>
      </td>
      <td style="padding:8px 12px 8px 0;vertical-align:top;font-size:13px">
        <strong style="color:#b45309">${escapeHtml(headline)}</strong><br>
        <span style="color:#334155;font-size:12px">${escapeHtml(reason)}</span>
      </td>
      <td style="padding:8px 0;vertical-align:top;font-size:13px;white-space:nowrap">
        <strong>${escapeHtml(waitingLabel(hours) ?? "—")}</strong><br>
        <span style="color:#64748b;font-size:12px">pending on ${escapeHtml(owedBy(party, row))}</span>
      </td>
    </tr>`).join("");

  const subject = due.length === 1
    ? `Stuck ${RE_ESCALATE_AFTER_HOURS}h+: ${due[0].row.order_ref} (${due[0].row.corporate_accounts?.name ?? "partner"}) — ${waitingLabel(due[0].hours)}`
    : `${due.length} partner orders stuck over ${ESCALATE_AFTER_HOURS}h`;

  const sentOk = await sendEmail({
    to: ESCALATE_TO,
    cc: DESK_EMAIL,
    subject,
    html: `<div style="font-family:system-ui,sans-serif;max-width:680px">
      <p style="font-size:14px;color:#0f172a">
        ${due.length === 1 ? "A partner order has" : `${due.length} partner orders have`}
        been waiting more than ${ESCALATE_AFTER_HOURS} hours with nobody closing it out.
      </p>
      <table style="border-collapse:collapse;width:100%;font-size:13px">
        <tr style="text-align:left;color:#64748b;font-size:11px;text-transform:uppercase">
          <th style="padding:0 12px 6px 0">Order</th>
          <th style="padding:0 12px 6px 0">Print</th>
          <th style="padding:0 12px 6px 0">What it needs</th>
          <th style="padding:0 0 6px 0">Waiting</th>
        </tr>
        ${rowsHtml}
      </table>
      <p style="font-size:13px;color:#0f172a;margin-top:16px">
        Cancellation requests are answered on
        <a href="${SITE_URL}/admin/orders" style="color:#0f172a">/admin/orders</a>
        &mdash; &ldquo;Cancellation requests&rdquo; at the top of that page. Answering one,
        either way, is what stops these reminders.
      </p>
      <p style="font-size:12px;color:#64748b;margin-top:18px">
        Sent because it crossed ${ESCALATE_AFTER_HOURS}h. You'll get one reminder per
        ${RE_ESCALATE_AFTER_HOURS}h while it stays stuck, and nothing once it clears.
      </p>
    </div>`,
  });

  // Only stamp what actually went out — a failed send (or an unconfigured
  // RESEND_API_KEY, which no-ops to false) must be retried next tick, not
  // silently marked as escalated.
  if (sentOk) {
    await Promise.all(
      due.map(({ row }) =>
        sb.from("corporate_orders")
          .update({ escalated_at: new Date(now).toISOString() })
          .eq("id", row.id),
      ),
    );
  } else {
    console.error("[cron/corporate-attention] escalation mail failed — will retry next tick");
  }

  return NextResponse.json({
    ok: true,
    considered: rows.length,
    escalated: due.length,
    refs: due.map(d => d.row.order_ref),
  });
}

/**
 * Who has to move. classifyAttention already decided this ("party"), and every
 * zyvorah-party reason ends "you do not need to do anything" — so naming the
 * PARTNER here, as this column used to, contradicted the row beside it and read
 * as though we were waiting on the customer. A desk-owned order says the desk.
 */
function owedBy(party: string, row: Row): string {
  if (party === "production") return "production";
  const placer = row.placed_by_email;
  // A partner-placed order is still ours to answer; say so, and say whose
  // account it is, so she knows who is waiting on the reply.
  return `our desk (${row.corporate_accounts?.name ?? nameOf(placer)}'s order)`;
}

/** "savita.m@plankandweave.com" → "Savita M" — the mail should name a person. */
function nameOf(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local.split(/[._-]+/).filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1)).join(" ") || email;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

export const GET = withCronRun("corporate-attention", tick);
