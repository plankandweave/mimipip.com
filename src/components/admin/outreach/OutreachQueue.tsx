"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";

// The collab & press queue — every creator, artist or journalist who has pitched us,
// verified and scored, with the drafted reply Roheena approves or declines.
//
// Lives inside the marketing desk (the Collabs tab) since 27 Sep 2026: she
// asked for one window she opens every day, with whatever needs her on top,
// instead of an email per pitch. /admin/outreach still resolves there so old
// links keep working. Deciding goes through the same tokenized endpoint as the
// full review page, so a reply is the same reply, sent once.

/* eslint-disable @typescript-eslint/no-explicit-any */
export type OutreachRow = {
  id: string;
  reference: string;
  kind: "influencer" | "press" | "artist";
  name: string;
  email: string;
  handle: string | null;
  outlet: string | null;
  links: string[];
  fields: Record<string, any>;
  message: string;
  status: "new" | "checked" | "approved" | "declined";
  checks: any;
  ai: any;
  decision_token: string;
  created_at: string;
  source?: "form" | "email";
  source_subject?: string | null;
  source_thread_id?: string | null;
};

const STATUS_LABEL: Record<OutreachRow["status"], string> = {
  new: "Checking…",
  checked: "Awaiting your call",
  approved: "Approved",
  declined: "Declined",
};

const KIND_LABEL: Record<OutreachRow["kind"], string> = {
  influencer: "Creator",
  artist: "Artist",
  press: "Press",
};

/** Headline name: the Instagram handle for a creator, the outlet or studio for
 *  press and artists, else the person. */
const title = (r: OutreachRow) =>
  r.kind === "influencer" ? (r.handle ? `@${r.handle}` : r.name) : (r.outlet ?? r.name);

/** From admin_outreach_inbox_status: when the mailbox was last read for pitches. */
export type InboxStatus = {
  last_run_at: string | null;
  last_run_ok: boolean | null;
  last_run_note: string | null;
  last_ok_at: string | null;
  scoring: number;
  stuck: number;
};

/** The mailbox is read for pitches once a day, by the 06:00 IST CRM sweep
 *  (Roheena, 29 Sep 2026: once a day is enough). Past 30 hours without a good
 *  read, an empty desk means "not looking", not "nothing arrived". */
function inboxLine(s: InboxStatus | null): { text: string; alarm: boolean } | null {
  if (!s) return null;
  const at = (iso: string) =>
    new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const parts: string[] = [];
  let alarm = false;
  if (!s.last_ok_at) {
    parts.push("The inbox has not been read for pitches yet");
    alarm = true;
  } else {
    parts.push(`hello@ inbox last read ${at(s.last_ok_at)}`);
    if (Date.now() - new Date(s.last_ok_at).getTime() > 30 * 3600_000) alarm = true;
  }
  if (s.last_run_ok === false) {
    parts.push(`last attempt failed${s.last_run_note ? `: ${s.last_run_note}` : ""}`);
    alarm = true;
  }
  if (s.scoring > 0) parts.push(`${s.scoring} email${s.scoring === 1 ? "" : "s"} being scored now`);
  if (s.stuck > 0) {
    parts.push(`${s.stuck} email${s.stuck === 1 ? "" : "s"} could not be scored`);
    alarm = true;
  }
  return { text: parts.join(" · "), alarm };
}

/** A placeholder assessment (it could not run), not a verdict. Mirrors
 *  assessmentUnavailable in src/lib/outreach.ts, which is server-only. */
const unscored = (ai: any): boolean =>
  !!ai && (ai.unavailable === true || (Array.isArray(ai.flags) && ai.flags.includes("AI assessment unavailable — review manually")));

/** The desk's definition of "needs her": on the desk and not yet decided. */
export const outreachPending = (r: OutreachRow) => r.status === "new" || r.status === "checked";

function verdictTone(v?: string) {
  if (v === "recommend") return "bg-sage/50 text-charcoal";
  if (v === "pass") return "bg-wash text-slate";
  return "bg-wash text-charcoal";
}

/** Highest score first among the undecided, then the decided, newest first —
 *  the best pitch is the one she should look at first, not the newest. */
function order(rows: OutreachRow[]): OutreachRow[] {
  return [...rows].sort((a, b) => {
    const pa = outreachPending(a) ? 0 : 1;
    const pb = outreachPending(b) ? 0 : 1;
    if (pa !== pb) return pa - pb;
    if (pa === 0) return (b.ai?.score ?? -1) - (a.ai?.score ?? -1);
    return b.created_at.localeCompare(a.created_at);
  });
}

function replyText(row: OutreachRow): string {
  if (typeof row.ai?.draft_reply_text === "string") return row.ai.draft_reply_text;
  const html = String(row.ai?.draft_reply_html ?? "");
  if (typeof DOMParser === "undefined") return html.replace(/<[^>]*>/g, " ").trim();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const paragraphs = [...doc.body.querySelectorAll("p")];
  return (paragraphs.length ? paragraphs.map((p) => p.textContent?.trim() ?? "").join("\n\n") : doc.body.textContent ?? "").trim();
}

export function OutreachQueue({
  rows,
  error,
  onReload,
  inbox = null,
}: {
  rows: OutreachRow[] | null;
  error: string | null;
  onReload: () => Promise<void> | void;
  inbox?: InboxStatus | null;
}) {
  const [filter, setFilter] = useState<"pending" | OutreachRow["kind"] | "all">("pending");
  const [open, setOpen] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [savedId, setSavedId] = useState<string | null>(null);

  const saveReply = useCallback(async (row: OutreachRow, text: string) => {
    const res = await fetch("/api/admin/outreach/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, text }),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(result.error ?? "Could not save reply");
    setSavedId(row.id);
    await onReload();
  }, [onReload]);

  const save = useCallback(async (row: OutreachRow) => {
    setBusyId(row.id);
    setLocalError(null);
    try {
      await saveReply(row, edits[row.id] ?? replyText(row));
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Could not save reply");
    } finally {
      setBusyId(null);
    }
  }, [edits, saveReply]);

  const decide = useCallback(
    async (row: OutreachRow, approve: boolean) => {
      const text = edits[row.id] ?? replyText(row);
      if (!confirm(approve
        ? `Send the reply shown in the editor to ${row.name} <${row.email}>?`
        : `Send a polite decline to ${row.name} <${row.email}>?`)) return;
      setBusyId(row.id);
      setLocalError(null);
      try {
        if (approve) await saveReply(row, text);
        const res = await fetch("/api/outreach/decide", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: row.decision_token, approve }),
        });
        if (!res.ok) throw new Error();
        await onReload();
      } catch (e) {
        setLocalError(e instanceof Error ? e.message : "Couldn't record that decision — please try again.");
      } finally {
        setBusyId(null);
      }
    },
    [edits, onReload, saveReply],
  );

  const counts = useMemo(() => {
    const c = { pending: 0, influencer: 0, artist: 0, press: 0, all: (rows ?? []).length };
    for (const r of rows ?? []) {
      if (outreachPending(r)) c.pending++;
      c[r.kind]++;
    }
    return c;
  }, [rows]);

  const shown = useMemo(() => {
    const all = order(rows ?? []);
    if (filter === "pending") return all.filter(outreachPending);
    if (filter === "all") return all;
    return all.filter((r) => r.kind === filter);
  }, [rows, filter]);

  return (
    <div className="mt-5">
      <p className="text-xs text-slate">
        {rows ? `${counts.pending} awaiting you · ${counts.all} total` : "Loading…"} · every pitch is verified and
        scored before it lands here; approving emails the drafted reply from roheena@zyvorah.com, declining sends a
        short polite pass. Best fit first.
      </p>
      {(() => {
        const line = inboxLine(inbox);
        return line ? (
          <p className={`mt-1 text-xs ${line.alarm ? "text-[#A3211E]" : "text-mist"}`}>{line.text}</p>
        ) : null;
      })()}

      <div className="mt-4 flex flex-wrap gap-2">
        {([
          ["pending", `Awaiting you (${counts.pending})`],
          ["influencer", `Creators (${counts.influencer})`],
          ["artist", `Artists (${counts.artist})`],
          ["press", `Press (${counts.press})`],
          ["all", `All (${counts.all})`],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={`rounded-full border px-4 py-1.5 text-[0.75rem] transition-colors ${
              filter === k ? "border-charcoal bg-charcoal text-surface" : "border-edge text-slate hover:border-charcoal"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {(error || localError) && <p className="mt-4 text-sm text-charcoal/80">{error ?? localError}</p>}

      <div className="mt-5 space-y-3">
        {shown.length === 0 && rows && (
          <p className="text-sm text-slate">
            {filter === "pending" ? "Nothing is waiting for you." : "Nothing here."}
          </p>
        )}
        {shown.map((r) => {
          const expanded = open === r.id;
          const pending = outreachPending(r);
          return (
            <div key={r.id} className="rounded-[18px] border border-edge bg-surface">
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : r.id)}
                className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4 text-left"
              >
                <span className="text-[0.68rem] font-semibold uppercase tracking-widest text-mist">
                  {KIND_LABEL[r.kind] ?? r.kind}
                </span>
                <span className="font-medium text-charcoal">{title(r)}</span>
                {title(r) !== r.name && <span className="text-sm text-slate">{r.name}</span>}
                {r.source === "email" && (
                  <span className="rounded-full border border-edge px-2.5 py-0.5 text-[0.65rem] uppercase tracking-widest text-mist">
                    via email
                  </span>
                )}
                {r.ai && (unscored(r.ai) ? (
                  <span className="rounded-full bg-wash px-3 py-0.5 text-[0.7rem] font-semibold uppercase text-[#B8860B]">
                    not scored yet
                  </span>
                ) : (
                  <span className={`rounded-full px-3 py-0.5 text-[0.7rem] font-semibold uppercase ${verdictTone(r.ai.verdict)}`}>
                    {r.ai.verdict} {r.ai.score}
                  </span>
                ))}
                <span className="ml-auto text-xs text-mist">{STATUS_LABEL[r.status]}</span>
              </button>

              {expanded && (
                <div className="space-y-4 border-t border-edge px-5 py-5 text-sm">
                  <p className="text-xs text-mist">
                    {r.reference} · {new Date(r.created_at).toLocaleString("en-IN")} ·{" "}
                    <a href={`mailto:${r.email}`} className="underline underline-offset-2">{r.email}</a>
                    {r.source === "email" && (
                      <>
                        {" · "}emailed hello@: &ldquo;{r.source_subject}&rdquo;
                        {r.source_thread_id && (
                          <>
                            {" · "}
                            <a
                              href={`https://mail.google.com/mail/u/0/#all/${r.source_thread_id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="underline underline-offset-2"
                            >
                              open in Gmail
                            </a>
                          </>
                        )}
                      </>
                    )}
                  </p>

                  {r.ai && unscored(r.ai) && (
                    <p className="text-xs text-[#B8860B]">
                      The automatic assessment could not run{r.ai.error ? ` (${r.ai.error})` : ""}. It is retried every
                      ten minutes; the verdict and draft below are placeholders until then.
                    </p>
                  )}
                  {r.ai && (
                    <div className={`rounded-[14px] p-4 ${verdictTone(r.ai.verdict)}`}>
                      <p className="leading-relaxed">{r.ai.summary}</p>
                      {r.ai.angle && <p className="mt-2"><strong>What we get:</strong> {r.ai.angle}</p>}
                      {Array.isArray(r.ai.flags) && r.ai.flags.length > 0 && (
                        <p className="mt-2 text-[#c0392b]">⚑ {r.ai.flags.join(" · ")}</p>
                      )}
                    </div>
                  )}

                  {r.checks && (
                    <p className="text-xs text-slate">
                      MX {String(r.checks.mx_ok)} ·{" "}
                      {r.checks.instagram
                        ? `IG exists ${String(r.checks.instagram.exists)}${
                            r.checks.instagram.followers !== null ? ` (${r.checks.instagram.followers.toLocaleString("en-IN")} followers)` : ""
                          }${r.checks.instagram.followers_mismatch ? ` ⚑ ${r.checks.instagram.followers_mismatch}` : ""} · `
                        : ""}
                      {r.checks.outlet_domain_match !== null && r.checks.outlet_domain_match !== undefined
                        ? `outlet match ${String(r.checks.outlet_domain_match)} · ` : ""}
                      {(r.checks.links ?? []).length} link(s) checked
                    </p>
                  )}

                  <div>
                    <p className="text-[0.68rem] font-semibold uppercase tracking-widest text-mist">Their message</p>
                    <p className="mt-1 whitespace-pre-wrap leading-relaxed text-slate">{r.message}</p>
                  </div>

                  {(r.links ?? []).length > 0 && (
                    <p className="flex flex-wrap gap-3 text-xs">
                      {r.links.map((l) => (
                        <a key={l} href={l} target="_blank" rel="noreferrer" className="text-slate underline underline-offset-2">
                          {l.replace(/^https?:\/\//, "").slice(0, 46)}
                        </a>
                      ))}
                    </p>
                  )}

                  {pending && (
                    <div className="rounded-[14px] border border-edge bg-wash/40 p-4">
                      <label htmlFor={`reply-${r.id}`} className="text-[0.68rem] font-semibold uppercase tracking-widest text-mist">
                        Your reply — edit and save, or approve to send
                      </label>
                      <p className="mt-2 text-xs text-slate">Dear {r.name.split(/\s+/)[0]}, and Roheena’s sign-off are added to the email automatically.</p>
                      <textarea
                        id={`reply-${r.id}`}
                        value={edits[r.id] ?? replyText(r)}
                        onChange={(e) => { setEdits((prev) => ({ ...prev, [r.id]: e.target.value })); setSavedId(null); }}
                        rows={10}
                        maxLength={6000}
                        className="mt-3 w-full rounded-xl border border-edge bg-surface p-3 text-sm leading-relaxed text-charcoal"
                        placeholder="Write your response here…"
                      />
                      <div className="mt-2 flex items-center gap-3">
                        <button type="button" onClick={() => save(r)} disabled={busyId === r.id || !(edits[r.id] ?? replyText(r)).trim()} className="btn btn-ghost h-9 px-4 text-xs disabled:opacity-40">Save draft</button>
                        {savedId === r.id && <span className="text-xs text-slate">Draft saved</span>}
                      </div>
                    </div>
                  )}

                  {pending ? (
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => decide(r, true)}
                        disabled={busyId === r.id || !(edits[r.id] ?? replyText(r)).trim()}
                        className="btn h-10 px-5 text-[0.78rem] disabled:opacity-40"
                      >
                        ✓ Approve &amp; send reply
                      </button>
                      <button
                        type="button"
                        onClick={() => decide(r, false)}
                        disabled={busyId === r.id}
                        className="btn btn-ghost h-10 px-5 text-[0.78rem] disabled:opacity-40"
                      >
                        Decline
                      </button>
                      <Link
                        href={`/decide/outreach/${r.decision_token}`}
                        className="text-xs text-slate underline underline-offset-2"
                      >
                        Full review page →
                      </Link>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-xs text-mist">
                        {STATUS_LABEL[r.status]} — the reply has already gone out.
                      </p>
                      {/* An approved creator becomes a collaboration: her code,
                          link, hashtags and deliverables, prefilled from this
                          pitch (/admin/collabs). */}
                      {r.status === "approved" && r.kind === "influencer" && (
                        <Link
                          href={`/admin/collabs?inquiry=${r.id}`}
                          className="btn h-10 px-5 text-[0.78rem]"
                        >
                          Start collaboration
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
