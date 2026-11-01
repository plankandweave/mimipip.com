"use client";

import { useCallback, useEffect, useState } from "react";

// The work, done, under the task. Opens a drafted email (or, for a decision,
// a recommendation and one email per way it could go), every field editable,
// and a Send that leaves as roheena@zyvorah.com. Nothing is sent until she
// presses Send and then confirms who it is going to.
// Server side: src/app/api/admin/crm/task-action/route.ts

type Option = {
  label: string; gmail_thread_id: string;
  to: string[]; cc: string[]; subject: string; body: string;
  /** Finished HTML of a hand-prepared email (src/lib/crm-prepared.ts). */
  html?: string;
  /** Files the desk will attach at send time, rendered from the quotation
   *  row (src/lib/quotation/store.ts). Shown as chips that open the PDF. */
  /** The desk's files: the supply quotation (Magnitude Brands), the
   *  installation quotation (Magnitude Spaces), the specification sheets.
   *  "quotation" is what drafts said before the split and opens the supply one. */
  attachments?: { quotation_id: string; kind: "supply" | "install" | "spec" | "quotation"; filename: string }[];
};
type Draft = {
  kind: "email" | "decision" | "conditional" | "other";
  headline: string; recommendation: string; status_note: string;
  already_resolved: boolean; needs: string[]; options: Option[];
  followup: { title: string; days: number };
};
type DraftResponse = {
  draft: Draft; generated_at: string; cached: boolean; stale?: boolean;
  provider: "gmail" | "resend"; from: string; sender_ready: boolean | null;
  threads: { gmail_thread_id: string; subject: string; last_at: string | null }[];
};
type Editable = { to: string; cc: string; subject: string; body: string; gmail_thread_id: string };

const PLACEHOLDER = /\[\[[^\]]*\]\]/;

const toEditable = (o: Option): Editable => ({
  to: o.to.join(", "), cc: o.cc.join(", "), subject: o.subject, body: o.body,
  gmail_thread_id: o.gmail_thread_id,
});

const ERRORS: Record<string, string> = {
  drafter_unconfigured: "The drafter needs ANTHROPIC_API_KEY on the server.",
  draft_failed: "Couldn't write this one just now. Try again in a moment.",
  task_done: "This task is already done.",
  no_recipient: "Add at least one address in To.",
  bad_address: "One of the addresses isn't valid",
  empty_email: "The subject or the email is empty.",
  placeholder_left: "Fill in the [[ ]] gaps before sending.",
  unauthorized: "You're not signed in.",
};

export function TaskAction({
  taskId, hasDraft, onDone,
}: { taskId: string; hasDraft?: boolean; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [res, setRes] = useState<DraftResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pick, setPick] = useState(0);
  const [edits, setEdits] = useState<Editable[]>([]);
  const [follow, setFollow] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  const load = useCallback(async (regenerate = false) => {
    setLoading(true); setErr(null); setConfirming(false);
    try {
      const r = await fetch("/api/admin/crm/task-action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task_id: taskId, action: "draft", regenerate }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body?.error ?? "draft_failed");
      const d = body as DraftResponse;
      setRes(d);
      setEdits(d.draft.options.map(toEditable));
      setPick(0);
      setFollow(d.draft.followup.days > 0 && !!d.draft.followup.title);
    } catch (e) {
      setErr(ERRORS[(e as Error).message] ?? ERRORS.draft_failed);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    // Opening is the request: the first open fetches (instant when a draft is
    // cached, ~20s when it has to be written).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open && !res && !loading) void load();
  }, [open, res, loading, load]);

  const current = edits[pick];
  const setField = (k: keyof Editable, v: string) => {
    setConfirming(false);
    setEdits((all) => all.map((e, i) => (i === pick ? { ...e, [k]: v } : e)));
  };

  // A prepared email goes as its designed HTML only while its words are
  // untouched; the server checks the same thing against the stored copy.
  const prepared = res?.draft.options[pick];
  const designed = !!prepared?.html && !!current
    && prepared.body.trim() === current.body.trim() && prepared.subject.trim() === current.subject.trim();

  const gaps = current ? PLACEHOLDER.test(current.body) || PLACEHOLDER.test(current.subject) : false;
  const recipients = current
    ? current.to.split(/[,;\s]+/).filter(Boolean).length
    : 0;

  const send = async () => {
    if (!current || !res) return;
    setSending(true); setErr(null);
    try {
      const r = await fetch("/api/admin/crm/task-action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          task_id: taskId,
          action: "send",
          option: current,
          option_index: pick,
          followup: follow ? res.draft.followup : undefined,
        }),
      });
      const body = await r.json();
      if (!r.ok) {
        const base = ERRORS[body?.error] ?? "It didn't send.";
        throw new Error(body?.detail ? `${base}: ${body.detail}` : base);
      }
      setSent(
        body.recorded
          ? `Sent from ${res.from} to ${current.to}.${body.followup_due_on ? ` Follow-up set for ${body.followup_due_on}.` : ""}`
          : `Sent from ${res.from} to ${current.to} — but it couldn't be logged on the timeline. Don't send it again; tick the task by hand.`,
      );
      setTimeout(onDone, body.recorded ? 1800 : 6000);
    } catch (e) {
      setErr((e as Error).message);
      setConfirming(false);
    } finally {
      setSending(false);
    }
  };

  const markDone = async () => {
    const { adminRpc } = await import("@/lib/admin-rpc");
    await adminRpc("crm_set_task_done", { p_task_id: taskId, p_done: true });
    onDone();
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 rounded-[10px] bg-surface px-3 py-1.5 text-[0.72rem] font-semibold"
      >
        {hasDraft ? "Draft ready — review & send" : "Do it for me"}
      </button>
    );
  }

  const d = res?.draft;

  return (
    <div className="mt-3 rounded-[14px] bg-surface p-4">
      {loading && (
        <p className="text-xs text-slate">
          Reading the thread and the notes, and writing it… usually about 20 seconds.
        </p>
      )}

      {sent && <p className="text-sm font-semibold">{sent}</p>}

      {!loading && !sent && d && (
        <>
          <p className="text-sm">{d.headline}</p>
          {res?.stale && (
            <p className="mt-1 text-[0.7rem] text-slate">
              Something changed since this was written and it couldn&apos;t be rewritten just now — check it against the latest.
            </p>
          )}

          {d.recommendation && (
            <div className="mt-3 rounded-[12px] bg-wash p-3">
              <p className="text-[0.7rem] font-semibold">My recommendation</p>
              <p className="mt-1 text-xs leading-relaxed">{d.recommendation}</p>
            </div>
          )}

          {d.status_note && <p className="mt-2 text-xs text-slate">{d.status_note}</p>}

          {d.needs.length > 0 && (
            <div className="mt-3 rounded-[12px] border border-charcoal/30 p-3">
              <p className="text-[0.7rem] font-semibold">Before this can go, it needs from you</p>
              <ul className="mt-1 list-inside list-disc text-xs">
                {d.needs.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
              <p className="mt-1 text-[0.65rem] text-slate">Replace each [[ ]] in the email below.</p>
            </div>
          )}

          {d.already_resolved && (
            <button onClick={markDone} className="btn mt-3 h-9 px-4 text-[0.78rem]">
              Nothing to send — mark done
            </button>
          )}

          {edits.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-1 rounded-[12px] bg-wash p-1">
              {res!.draft.options.map((o, i) => (
                <button
                  key={i}
                  onClick={() => { setPick(i); setConfirming(false); }}
                  className={`rounded-[9px] px-3 py-1.5 text-[0.72rem] ${pick === i ? "bg-surface font-semibold" : "text-slate"}`}
                >
                  {i === 0 ? `${o.label} (recommended)` : o.label}
                </button>
              ))}
            </div>
          )}

          {current && (
            <div className="mt-3 space-y-2">
              <p className="text-[0.7rem] text-slate">
                From <span className="font-semibold text-charcoal">{res!.from}</span>
                {res!.provider === "resend" ? " · a copy lands in your inbox" : " · goes from your Gmail"}
                {current.gmail_thread_id ? " · replies in the existing conversation" : " · new conversation"}
              </p>
              {res!.sender_ready === false && (
                <p className="text-xs font-semibold">
                  Sending as {res!.from} isn&apos;t switched on with the email service yet, so Send will be refused.
                  The draft is safe to copy into Gmail meanwhile.
                </p>
              )}
              {!!prepared?.attachments?.length && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-14 shrink-0 text-[0.7rem] text-slate">Attached</span>
                  {prepared.attachments.map((a) => (
                    <a
                      key={`${a.quotation_id}-${a.kind}`}
                      href={`/api/admin/crm/quotation?id=${a.quotation_id}&kind=${a.kind === "quotation" ? "supply" : a.kind}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border border-edge bg-wash px-3 py-1 text-[0.7rem] underline-offset-2 hover:underline"
                    >
                      {a.kind === "spec" ? "Specification sheets PDF" : a.kind === "install" ? "Installation quotation PDF" : "Supply quotation PDF"}
                    </a>
                  ))}
                  <span className="text-[0.65rem] text-slate">Open each one and read it before you send.</span>
                </div>
              )}
              <Field label="To" value={current.to} onChange={(v) => setField("to", v)} />
              <Field label="Cc" value={current.cc} onChange={(v) => setField("cc", v)} />
              <Field label="Subject" value={current.subject} onChange={(v) => setField("subject", v)} />
              {prepared?.html && (
                designed ? (
                  <div>
                    <p className="text-[0.7rem] text-slate">As it will arrive, pictures and links included:</p>
                    <iframe
                      title="Email preview"
                      srcDoc={prepared.html}
                      sandbox=""
                      className="mt-1 h-[560px] w-full rounded-[10px] border border-edge bg-white"
                    />
                    <p className="mt-2 text-[0.7rem] text-slate">The plain text below is the version for email apps that can&apos;t show pictures.</p>
                  </div>
                ) : (
                  <p className="text-xs font-semibold">
                    You&apos;ve changed the words, so this will go as plain text without the pictures.
                    Undo the change to send the designed version.
                  </p>
                )
              )}
              <textarea
                value={current.body}
                onChange={(e) => setField("body", e.target.value)}
                rows={Math.min(22, Math.max(10, current.body.split("\n").length + 2))}
                className="w-full rounded-[10px] border border-edge bg-surface p-3 text-[0.82rem] leading-relaxed outline-none focus:border-charcoal"
              />

              {d.followup.days > 0 && d.followup.title && (
                <label className="flex items-center gap-2 text-xs text-slate">
                  <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} className="accent-charcoal" />
                  Then remind me: &ldquo;{d.followup.title}&rdquo; in {d.followup.days} days
                </label>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {!confirming ? (
                  <button
                    onClick={() => setConfirming(true)}
                    disabled={gaps || !recipients || sending}
                    className="btn h-10 px-5 text-[0.8rem] disabled:opacity-40"
                  >
                    Send
                  </button>
                ) : (
                  <button onClick={send} disabled={sending} className="btn h-10 px-5 text-[0.8rem] disabled:opacity-40">
                    {sending ? "Sending…" : `Yes, send to ${current.to.split(/[,;\s]+/).filter(Boolean)[0]}${recipients > 1 ? ` +${recipients - 1}` : ""}`}
                  </button>
                )}
                {confirming && !sending && (
                  <button onClick={() => setConfirming(false)} className="text-xs text-slate underline">Not yet</button>
                )}
                <button
                  onClick={() => load(true)}
                  disabled={sending}
                  className="h-10 rounded-[12px] border border-edge px-4 text-[0.78rem]"
                >
                  Write it again
                </button>
                <button onClick={() => setOpen(false)} className="text-xs text-slate underline">Close</button>
                {gaps && <span className="text-xs">Fill the [[ ]] gaps first.</span>}
              </div>
            </div>
          )}

          {!current && !d.already_resolved && (
            <div className="mt-3 flex gap-2">
              <button onClick={() => load(true)} className="h-9 rounded-[12px] border border-edge px-4 text-[0.78rem]">Write it again</button>
              <button onClick={() => setOpen(false)} className="text-xs text-slate underline">Close</button>
            </div>
          )}
        </>
      )}

      {err && <p className="mt-2 text-xs text-charcoal/80">{err}</p>}
      {!loading && !d && err && (
        <button onClick={() => load()} className="mt-2 text-xs underline">Try again</button>
      )}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-[0.7rem] text-slate">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 min-w-0 flex-1 rounded-[10px] border border-edge bg-surface px-2.5 text-xs outline-none focus:border-charcoal"
      />
    </label>
  );
}
