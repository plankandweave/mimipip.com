"use client";

import { useState } from "react";

// The confirm step: one deliberate tap. Approving hands the decision to the
// executor agent's queue; skipping parks it. Both can be flipped until
// execution actually starts.
export function DecideActions({
  token,
  initialStatus,
  preselect,
}: {
  token: string;
  initialStatus: string;
  preselect: "go" | "skip";
}) {
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const decide = async (approve: boolean) => {
    setBusy(true);
    setError(false);
    try {
      const res = await fetch("/api/decide", {
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

  if (status === "approved" || status === "rejected") {
    const approved = status === "approved";
    return (
      <div className={`mt-6 rounded-[16px] p-5 text-sm ${approved ? "bg-sage/40" : "bg-wash"}`}>
        <p className="font-semibold">
          {approved
            ? "✓ Approved — the executor will pick this up on its next run and report back what it did."
            : "Skipped — nothing will happen. It stays in the archive if you change your mind."}
        </p>
        <div className="mt-3 flex items-center gap-4">
          <button
            onClick={() => decide(!approved)}
            disabled={busy}
            className="text-xs text-slate underline underline-offset-2 disabled:opacity-40"
          >
            {approved ? "Actually, skip this one" : "Actually, go ahead"}
          </button>
          <a href="/decide" className="text-xs text-slate underline underline-offset-2">
            See every decision →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => decide(true)}
          disabled={busy}
          className={`btn h-12 px-8 text-sm disabled:opacity-40 ${preselect === "go" ? "" : "btn-ghost"}`}
        >
          {busy ? "Saving…" : "✓ Yes, go ahead"}
        </button>
        <button
          onClick={() => decide(false)}
          disabled={busy}
          className={`btn h-12 px-8 text-sm disabled:opacity-40 ${preselect === "skip" ? "" : "btn-ghost"}`}
        >
          Skip this
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-slate">Couldn&apos;t save that — please try again.</p>}
    </div>
  );
}
