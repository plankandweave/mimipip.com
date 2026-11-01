"use client";

import { useState } from "react";

// The confirm step. Approving sends the drafted reply shown above the buttons;
// declining sends a short, polite pass. Both are one-way — the person on the
// other end has now been written to — so unlike a weekly-intel decision this
// cannot be flipped afterwards, and the buttons say so.
export function OutreachDecideActions({
  token,
  initialStatus,
  draftHtml,
  firstName,
}: {
  token: string;
  initialStatus: string;
  draftHtml: string;
  firstName: string;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const decide = async (approve: boolean) => {
    setBusy(true);
    setError(false);
    try {
      const res = await fetch("/api/outreach/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, approve }),
      });
      const data = await res.json();
      if (!res.ok || !data.status) throw new Error();
      setStatus(data.status);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  if (status === "approved" || status === "declined") {
    const approved = status === "approved";
    return (
      <div className={`mt-8 rounded-[16px] p-5 text-sm ${approved ? "bg-sage/40" : "bg-wash"}`}>
        <p className="font-semibold text-charcoal">
          {approved
            ? "✓ Approved — your reply is on its way to them from roheena@zyvorah.com."
            : "Declined — a short, warm pass has gone out. Nothing else happens."}
        </p>
        <p className="mt-2 text-xs text-slate">
          Their reply will land in hello@zyvorah.com, so carry on the conversation there.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8 border-t border-edge pt-8">
      {draftHtml && (
        <div className="rounded-[20px] border border-edge bg-surface p-6">
          <p className="text-[0.68rem] font-semibold uppercase tracking-widest text-mist">
            The reply that will be sent
          </p>
          <div className="mt-3 text-sm leading-relaxed text-slate">
            <p>Dear {firstName},</p>
            <div dangerouslySetInnerHTML={{ __html: draftHtml }} />
            <p className="mt-3">Warmly,<br />Roheena</p>
          </div>
          <p className="mt-4 text-xs text-mist">
            Not quite right? Decline here and write to them yourself — nothing is sent until you press a button.
          </p>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button onClick={() => decide(true)} disabled={busy} className="btn h-12 px-8 text-sm disabled:opacity-40">
          {busy ? "Sending…" : "✓ Approve & send this reply"}
        </button>
        <button onClick={() => decide(false)} disabled={busy} className="btn btn-ghost h-12 px-8 text-sm disabled:opacity-40">
          Decline politely
        </button>
      </div>
      <p className="mt-3 text-xs text-mist">Either choice emails them, so it can&apos;t be undone from here.</p>
      {error && <p className="mt-3 text-sm text-slate">Couldn&apos;t save that — please try again.</p>}
    </div>
  );
}
