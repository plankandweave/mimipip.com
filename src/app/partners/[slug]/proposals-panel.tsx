"use client";

import { useCallback, useEffect, useState } from "react";

// What we have already shown this client.
//
// Before this, a proposal reached them as a capability link in an inbox:
// forwardable, losable, and invisible to anyone who joined the conversation
// afterwards. The deck is the single most considered thing we make for a
// client, and it lived nowhere they could go back to.
//
// Opened in place, in an iframe, so nothing navigates away from the dashboard —
// and the frame is sandboxed by the route that serves it, because a deck is
// arbitrary uploaded HTML and the person reading it here is carrying a live
// session.

type Proposal = {
  id: string;
  title: string;
  format: "html" | "pdf" | "video";
  sentAt: string | null;
};

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : null;

export default function ProposalsPanel() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<Proposal | null>(null);

  const fetchProposals = useCallback(async () => {
    const r = await fetch("/api/corporate/proposals", { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? "Could not load your proposals.");
    return (j.proposals ?? []) as Proposal[];
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const p = await fetchProposals();
        if (alive) { setProposals(p); setErr(null); }
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : "Could not load your proposals.");
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [fetchProposals]);

  if (loading) return <p className="mt-6 text-sm text-slate">Loading…</p>;
  if (err) return <p className="mt-6 text-sm text-red-600">{err}</p>;

  if (open) {
    return (
      <div className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button onClick={() => setOpen(null)} className="text-xs text-slate underline">
            ← All proposals
          </button>
          <a href={`/api/corporate/proposals/${open.id}/frame`} target="_blank" rel="noopener noreferrer"
            className="text-xs text-slate underline">
            Open in a new tab
          </a>
        </div>
        <h2 className="mt-3 font-display text-xl font-bold leading-tight">{open.title}</h2>
        {when(open.sentAt) && (
          <p className="mt-0.5 text-xs text-slate">Sent to you on {when(open.sentAt)}</p>
        )}
        {open.format === "video" ? (
          <video
            src={`/api/corporate/proposals/${open.id}/frame`}
            title={open.title}
            controls
            playsInline
            preload="metadata"
            controlsList="nodownload noplaybackrate"
            disablePictureInPicture
            className="mt-4 max-h-[80vh] w-full rounded-[16px] border border-edge bg-[#1C1C1C]"
          />
        ) : (
          /* Tall on purpose: a deck is read, not glanced at, and a short frame
             turns one document into two scrollbars. */
          <iframe
            src={`/api/corporate/proposals/${open.id}/frame`}
            title={open.title}
            className="mt-4 h-[80vh] w-full rounded-[16px] border border-edge bg-surface"
          />
        )}
      </div>
    );
  }

  if (proposals.length === 0) return null;

  return (
    <div className="mt-6">
      <p className="max-w-[54ch] text-sm text-slate">
        Everything we have put in front of you, kept here so you can open it
        again — and show it to someone — without hunting for the email.
      </p>
      <ul className="mt-5 space-y-1.5">
        {proposals.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => setOpen(p)}
              className="flex w-full items-center justify-between gap-3 rounded-[12px] bg-wash px-4 py-3 text-left hover:bg-edge/40">
              <div className="min-w-0">
                <p className="text-sm font-medium">{p.title}</p>
                {when(p.sentAt) && (
                  <p className="mt-0.5 text-xs text-slate">Sent to you on {when(p.sentAt)}</p>
                )}
              </div>
              <span className="shrink-0 text-xs text-slate">Open →</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
