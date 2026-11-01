import type { BriefKey, BriefSection, BriefStatus, MissingSection } from "./briefing-rules";

export type DecisionStatus = BriefStatus | "unknown";
/** A failed store read cannot establish that yesterday had zero sales. */
export function briefSalesHeadline(snapshotError: string | null, ordersPaid: number, revenueLabel: string): string {
  if (snapshotError) return "Yesterday's sales unknown — store data could not be read";
  return ordersPaid > 0
    ? `${revenueLabel} from ${ordersPaid} order${ordersPaid === 1 ? "" : "s"}`
    : "No sales yesterday";
}
export const BRIEF_LABELS: Record<DecisionStatus, string> = {
  green: "🟢 Working / resolved", red: "🔴 Urgent problem",
  amber: "🟡 Action / review needed", info: "🔵 FYI", unknown: "🟡 Check incomplete — Claude Code to retry",
};
const COLORS: Record<DecisionStatus, string> = {
  green: "#166534", red: "#b91c1c", amber: "#854d0e", info: "#1d4ed8", unknown: "#854d0e",
};
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const plain = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, " ").trim();

type Category = "Technical" | "Customer" | "Business & sales";
export type BriefDecision = {
  status: DecisionStatus; category: Category; finding: string; source: string;
  owner: "Roheena" | "Claude Code" | "None";
  action: string; when: string; completion: string;
  /** A site path that opens the place to act, when there is one. */
  href?: string;
};
export type DecisionInput = {
  briefFor: string; sections: BriefSection[]; missing: MissingSection[];
  orders_paid: number; abandoned_carts: number;
  /** Set when the store snapshot could not be read: zero orders then means "unknown", not "none". */
  snapshot_error?: string | null;
  conv7: { sessions: number; ordersPaid: number } | null;
  social: { available: boolean; publishedYesterday: number; awaitingReview: number; approvedWaiting: number; failed: number; blocked: number; collabsWaiting: number };
  adChannels: { flags: string[] };
};
const category = (key: BriefKey): Category =>
  key === "google-ads" ? "Business & sales" : ["crm", "homelane-portal", "call-followups"].includes(key) ? "Customer" : "Technical";

/** Legacy producers file prose. Only explicit, bounded headings are extracted;
 * never infer resolution from a word such as "fixed" anywhere in a report.
 * Inputs must already have passed classifySections and its claim/evidence gates.
 * Unrecognised prose stays in the source report with a section-level review row. */
function groups(html: string): { heading: string; lines: string[] }[] {
  return [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((match) => {
    const heading = /^\s*<strong\b[^>]*>([\s\S]*?)<\/strong>/i.exec(match[1]);
    return {
      heading: heading ? plain(heading[1]) : "",
      lines: (heading ? match[1].slice(heading[0].length) : match[1]).split(/<br\s*\/?\s*>/gi)
        .map(plain).map(s => s.replace(/^(?:[•·]|\d+\.)\s*/, "")).filter(Boolean),
    };
  });
}

const ROHEENA_HEADING = /^(?:Needs Roheena\b|What (?:it )?needs (?:from )?you\b)/i;
const RESOLVED_HEADING = /^(?:Fixed overnight|Resolved|Closed as a false alarm:?)$/i;
/** Every heading whose lines are lifted into the top of the brief. The source
 *  report under "Detail" leaves these paragraphs out, so a finding is printed
 *  once — 9 October 2026: the same item appeared in the action table, the
 *  source report and the review list. */
const STATUS_LINE = /—\s*(green|amber|red)\b/i;
export const LIFTED_HEADING = /^(?:Needs Roheena\b|What (?:it )?needs (?:from )?you\b|Fixed overnight$|Resolved$|Closed as a false alarm:?$|Status board$|Recurring problems$)/i;

/** A filed body without the paragraphs the top of the brief already carries. */
export function withoutLifted(html: string): string {
  return html.replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, (whole, inner: string) => {
    const heading = /^\s*<strong\b[^>]*>([\s\S]*?)<\/strong>/i.exec(inner);
    if (!heading || !LIFTED_HEADING.test(plain(heading[1]))) return whole;
    // A status-board line is lifted only when it carries its colour; a board
    // with any other line stays in the detail whole, so nothing is lost.
    if (/^Status board$/i.test(plain(heading[1]))) {
      const lines = inner.slice(heading[0].length).split(/<br\s*\/?\s*>/gi).map(plain).filter(Boolean);
      if (!lines.every((l) => STATUS_LINE.test(l))) return whole;
    }
    return "";
  });
}

/** One readable line: whole sentences until there is enough to understand it,
 *  never more than ~170 characters. Takes PLAIN text (findings already are);
 *  it is escaped when printed. */
export function oneLine(text: string, max = 170): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const sentences = flat.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) ?? [flat];
  let out = "";
  for (const sentence of sentences) {
    if (out.length >= 40) break;
    out = `${out} ${sentence.trim()}`.trim();
  }
  return out.length > max ? `${out.slice(0, max - 1).replace(/\s+\S*$/, "")}…` : out;
}

export function briefDecisions(m: DecisionInput): BriefDecision[] {
  const rows: BriefDecision[] = [];
  const today = `Suggested: ${m.briefFor} (IST); ETA not confirmed`;
  const add = (row: BriefDecision) => rows.push(row.status === "unknown" ? {
    ...row,
    action: `${row.action} Roheena: no action now. If access or a decision is required, report the exact step separately.`,
    when: `Proposed: retry on ${m.briefFor} (IST); report the result in the next 08:00 IST brief. Retry not yet confirmed.`,
    completion: `${row.completion} If the check fails again, record what was attempted, when, why it failed, and the next retry or exact human dependency.`,
  } : row);
  for (const s of m.sections) {
    const source = `${s.title}; filed ${s.filedFor}; ${s.observedAt ? `checked ${s.observedAt}` : "observation time not supplied"}`;
    const base = { category: category(s.key), source };
    const parsed = groups(s.bodyHtml ?? "");
    for (const group of parsed) {
      if (ROHEENA_HEADING.test(group.heading)) {
        for (const line of group.lines) add({ ...base, status: "amber", finding: line, owner: "Roheena",
          action: "Review the reported request above; confirm the current state before acting.", when: today,
          completion: "Claude Code verifies the result and reports any remaining blocker." });
      }
      if (RESOLVED_HEADING.test(group.heading)) {
        for (const line of group.lines) add({ ...base, status: "green", finding: line, owner: "None",
          action: "No action requested; resolution as reported by the source.", when: "Reported complete",
          completion: "Supporting evidence remains in the source report below." });
      }
      if (/^Status board$/i.test(group.heading)) {
        for (const line of group.lines) {
          const status = STATUS_LINE.exec(line)?.[1].toLowerCase() as BriefStatus | undefined;
          if (!status) continue;
          add({ ...base, status, finding: line, owner: status === "green" ? "None" : "Claude Code",
            action: status === "green" ? "No action requested for this check." : "Verify the blocker; handle technical recovery and flag only payment, access or decisions requiring Roheena.",
            when: status === "green" ? "At the reported check" : today,
            completion: status === "green" ? "Reported check passed; this does not verify untested paths." : "A fresh successful check, with remaining dependencies named." });
        }
      }
      if (/^Recurring problems$/i.test(group.heading)) {
        for (const line of group.lines) {
          const noRecurrence = /:\s*no kill tonight\.?$/i.test(line);
          add({ ...base, status: noRecurrence ? "info" : "amber", finding: line,
            owner: noRecurrence ? "None" : "Claude Code",
            action: noRecurrence ? "No recurrence reported in this window; this does not prove the underlying risk is fixed." :
              "Verify the current state of the source's plan, implement remaining technical work, test it and report deployment separately from resolution.",
            when: noRecurrence ? "Reported observation window" : today,
            completion: noRecurrence ? "Keep monitoring the known risk." : "Evidence that the fix addresses the failure; remaining risks and a confirmed ETA." });
        }
      }
    }
    if (/owner no-reprint hold/i.test(plain(s.bodyHtml ?? ""))) add({ ...base, category: "Customer", status: "amber",
      finding: "A protected order remains on an owner no-reprint hold; see the source report for its identity.", owner: "Roheena",
      action: "Arrange a physical-state check with the printer-floor operator. Claude Code reconciles the journal with print, QC and dispatch evidence. Do not render, replay, reprint or send the order to the printer.",
      when: "Suggested: next staffed printer check; time not confirmed", completion: "Physical state reconciled. This brief does not lift the owner's hold." });
    // The section-level row retains coverage when a legacy producer changes its
    // format or includes findings outside the recognised headings.
    add({ ...base, status: s.status, finding: `${s.title}: ${s.headline ?? "See the filed report below."}`,
      owner: s.status === "green" || s.status === "info" ? "None" : "Claude Code",
      action: s.status === "green" || s.status === "info" ? "No action requested by this section's status." :
        s.key === "crm" ? "Verify mailbox access, backfill from the last successful sync, and check customer records. If user access is required, name the exact step for Roheena." :
        s.key === "call-followups" ? "Report calling readiness and the precise blocker. Do not activate calls or change calling permissions from this brief." :
        "Review the unresolved findings below; implement and test technical fixes, and report the actual deployment state. Escalate only a specific human dependency.",
      when: s.status === "green" || s.status === "info" ? "No deadline" : today,
      completion: s.status === "green" || s.status === "info" ? "See source evidence." : "Next brief: completed work, evidence, remaining blockers and a confirmed ETA." });
  }
  for (const s of m.missing) add({ status: "unknown", category: category(s.key),
    finding: `${s.title}: ${s.state === "evidence-held" ? "Filed, but evidence is held" : "Report unavailable"}. ${s.reason}`,
    source: s.title, owner: "Claude Code", action: "Retry the current-source check and file its actual observation timestamp. Diagnose a missing producer separately from a filed report held for evidence.",
    when: today, completion: "A fresh, evidence-backed report; no inferred all-clear." });
  if (m.snapshot_error) add({ status: "unknown", category: "Business & sales", finding: `Yesterday's store numbers could not be read (${m.snapshot_error}).`,
    source: "Store order cohort", owner: "Claude Code", action: "Find why the store snapshot failed and re-run the brief's numbers for the day.",
    when: today, completion: "The day's orders and revenue read successfully; no zero reported as a quiet day." });
  else if (m.orders_paid === 0) add({ status: "amber", category: "Business & sales", finding: "No paid customer orders recorded yesterday.",
    source: "Store order cohort", owner: "Claude Code", action: "Reconcile purchase tracking and inspect design → cart → checkout drop-off before proposing changes to advertising.",
    when: today, completion: "Evidence of the drop-off and a prioritised recovery plan; zero orders alone does not prove a checkout defect." });
  if (m.conv7 && m.conv7.sessions > 0 && m.conv7.ordersPaid === 0) add({ status: "amber", category: "Business & sales",
    finding: `${m.conv7.sessions} sessions and zero external retail wall/art orders in the rolling week.`, source: "Conversion watch",
    owner: "Claude Code", action: "Check the funnel, payment evidence, landing pages and tracking; identify the highest-impact next fix.", when: today,
    completion: "A verified diagnosis and measured next step; no automatic ad-spend change." });
  if (m.adChannels.flags.length) add({ status: "amber", category: "Business & sales", finding: m.adChannels.flags.join(" "),
    source: "Paid-channel review", owner: "Claude Code", action: "Verify tracking, current campaign state, landing-page performance and sample size before recommending a budget or delivery change.",
    when: today, completion: "Recommendation with supporting data and any precise decision needed from Roheena." });
  if (m.abandoned_carts > 0) add({ status: "amber", category: "Customer", finding: `${m.abandoned_carts} abandoned carts recorded.`,
    source: "Store funnel", owner: "Claude Code", action: "Review checkout friction and eligible follow-ups under existing consent and approval rules.", when: today,
    completion: "Cause or next diagnostic step recorded; no unapproved outreach." });
  if (m.social.available) {
    if (m.social.publishedYesterday > 0) add({ status: "green", category: "Business & sales", finding: `${m.social.publishedYesterday} posts published yesterday.`,
      source: "Social publishing records", owner: "None", action: "No action for these published posts.", when: "Reported complete", completion: "Separate failures and pending approvals remain listed below." });
    if (m.social.approvedWaiting > 0) add({ status: "info", category: "Business & sales", finding: `${m.social.approvedWaiting} posts approved and scheduled; not yet published.`,
      source: "Social queue", owner: "None", action: "FYI; retain the existing schedule.", when: "Existing scheduled dates", completion: "Publication is only complete when confirmed." });
    for (const [count, finding, action, href] of [
      [m.social.awaitingReview, "posts awaiting your review", "Approve, edit or decline the posts at /admin/marketing/review.", "/admin/marketing/review"],
      [m.social.collabsWaiting, "creator / press pitches awaiting your decision", "Review the drafted replies in /admin/marketing?tab=collabs.", "/admin/marketing?tab=collabs"],
    ] as const) if (count > 0) add({ status: "amber", category: "Business & sales", finding: `${count} ${finding}.`,
      source: "Marketing review queue", owner: "Roheena", action, when: today, href, completion: "Decisions saved; Claude Code handles only the already-authorised next steps." });
    if (m.social.failed || m.social.blocked) add({ status: "amber", category: "Technical", finding: `${m.social.failed} posts failed to publish; ${m.social.blocked} blocked by checks.`,
      source: "Social queue", owner: "Claude Code", action: "Inspect failures and repair publishing; rewrite blocked content. Preserve approval and Story link-sticker requirements.",
      when: today, completion: "Verified publication or a specific remaining blocker; no blind retry." });
  } else add({ status: "unknown", category: "Business & sales", finding: "Social publishing data unavailable.", source: "Social queue",
    owner: "Claude Code", action: "Restore the read and verify published, failed and pending counts.", when: today, completion: "Fresh queue evidence." });
  if (!m.conv7) add({ status: "unknown", category: "Business & sales", finding: "Weekly conversion data unavailable.", source: "Conversion watch",
    owner: "Claude Code", action: "Restore the conversion read; do not interpret missing data as zero sales.", when: today, completion: "Verified conversion figures." });
  return rows;
}

export function briefOverallStatus(rows: BriefDecision[]): DecisionStatus {
  if (rows.some(r => r.status === "red")) return "red";
  if (rows.some(r => r.status === "amber" || r.status === "unknown")) return "amber";
  if (rows.some(r => r.status === "green")) return "green";
  return "unknown";
}

/** How a Claude Code item reads in one word or two. Never "done" or "running":
 *  the brief cannot see that, so it does not say it. */
const HANDLING: Record<DecisionStatus, string> = {
  red: "🔴 Urgent", amber: "🟡 To do", unknown: "🟡 Check incomplete — to retry", info: "🔵 Watching", green: "🟢 Working",
};

const MUTED = "#6B6B6B";
const list = (items: string[]) =>
  `<ul style="margin:0;padding-left:18px;">${items.map((i) => `<li style="margin:0 0 6px;">${i}</li>`).join("")}</ul>`;

/** Unique by what the reader sees, keeping the first (worst-first order). */
function uniqueLines<T>(rows: T[], line: (r: T) => string): { row: T; line: string }[] {
  const seen = new Set<string>();
  const out: { row: T; line: string }[] = [];
  for (const row of rows) {
    const l = line(row);
    const k = l.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ row, line: l });
  }
  return out;
}

const RANK: Record<DecisionStatus, number> = { red: 0, unknown: 1, amber: 2, info: 3, green: 4 };

/** The top of the brief, in the order a non-technical founder reads it:
 *  "Needs you" (only what nobody else can do, one line each), then what
 *  Claude Code is handling (one line each, with its status). Everything else
 *  is detail and lives below. Nothing missing is ever counted as fine: an
 *  unchecked source is a Claude Code line, never silence. */
export function briefTopHtml(rows: BriefDecision[], siteUrl = ""): { needsYou: string; handling: string } {
  const sorted = [...rows].sort((a, b) => RANK[a.status] - RANK[b.status]);
  const yours = uniqueLines(sorted.filter((r) => r.owner === "Roheena"), (r) => oneLine(r.finding));
  const needsYou = yours.length
    ? list(yours.map(({ row, line }) =>
        `${esc(line)}${row.href ? ` <a href="${esc(siteUrl + row.href)}" style="color:#2D2D2D;font-weight:700;">Open →</a>` : ""}`))
    : "<p style=\"margin:0;\">Nothing needs you today.</p>";
  const ours = uniqueLines(sorted.filter((r) => r.owner === "Claude Code"), (r) => oneLine(r.finding));
  const handling = (ours.length
    ? list(ours.map(({ row, line }) => `<strong style="color:${COLORS[row.status]};">${HANDLING[row.status]}</strong> · ${esc(line)}`))
    : "<p style=\"margin:0;\">Nothing open.</p>") +
    `<p style="margin:8px 0 0;font-size:12px;color:${MUTED};">A check that did not run is listed here, never counted as fine. Nothing here needs you unless it is also under “Needs you”.</p>`;
  return { needsYou, handling };
}

/** Good news and context, one line each — the first thing under "Detail". */
export function briefGoingWellHtml(rows: BriefDecision[]): string {
  const items = uniqueLines(rows.filter((r) => r.owner === "None" && (r.status === "green" || r.status === "info")), (r) => oneLine(r.finding));
  return items.length
    ? list(items.map(({ row, line }) => `${row.status === "green" ? "🟢" : "🔵"} ${esc(line)}`))
    : "<p style=\"margin:0;\">No checks reported working. This is not verification of unreported work.</p>";
}
