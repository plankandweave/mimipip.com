"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

/**
 * Every store survey on the account, and the one tap that starts costing money.
 *
 * "Release to design" is the only human act between a store employee sending
 * measurements and Opus reading forty photographs. The person who measured may
 * be a contractor who was forwarded a link; the person who releases is a named
 * admin here. So the button is deliberately not on the phone form, and this
 * page says what it will do before it does it.
 */

type Batch = {
  id: string; title: string; status: string; createdAt: string;
  state: string | null; city: string | null;
  source: string | null; sourceRef: string | null;
  origin: string | null; storeName: string | null;
  releasedAt: string | null; releasedBy: string | null; error: string | null;
  walls: number; sqft: number; wallsWithoutPhoto: number;
  awaitingRelease: boolean;
};

const when = (s: string) =>
  new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

/** The batch vocabulary, said the way a person would say it. */
const SAY: Record<string, string> = {
  collecting: "Being measured",
  allocating: "Choosing designs",
  composing: "Rendering artwork",
  proposed: "Proposal sent",
  approved: "Approved",
  ordered: "Ordered",
  failed: "Stopped — needs us",
};

export default function SiteBatchList({ slug, isAdmin }: { slug: string; isAdmin: boolean }) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/corporate/site-batch", { cache: "no-store" });
    if (r.ok) setBatches(((await r.json()).batches ?? []) as Batch[]);
    setLoading(false);
  }, []);

  // Initial network synchronisation; load writes state only after fetch settles.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  async function release(b: Batch) {
    if (!confirm(
      `Release ${b.title}?\n\n${b.walls} walls will be read, designs chosen and artwork rendered. ` +
      `The proposal comes back to you by email.` +
      (b.wallsWithoutPhoto ? `\n\n${b.wallsWithoutPhoto} wall(s) have no photo and will be guessed at.` : ""),
    )) return;
    setBusy(b.id); setErr(null); setNote(null);
    try {
      const r = await fetch(`/api/corporate/site-batch/${b.id}/release`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) { setErr(j.error ?? "Could not release that survey."); return; }
      setNote(j.message ?? "Released.");
      await load();
    } finally { setBusy(null); }
  }

  const waiting = batches.filter((b) => b.awaitingRelease);

  return (
    <div className="container-x py-8 sm:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-extrabold leading-tight sm:text-2xl">Surveys</h1>
          <p className="truncate text-xs text-slate">Measured stores, and what happened next</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isAdmin && <Link href={`/partners/${slug}/site-batches/new`} className="btn h-10 px-4 text-[0.75rem]">New order</Link>}
          <Link href={`/partners/${slug}/stores`} className="text-sm text-slate underline">Stores</Link>
          <Link href={`/partners/${slug}/orders`} className="text-sm text-slate underline">Your orders</Link>
        </div>
      </div>

      {err && <p className="mt-4 text-sm text-red-600">{err}</p>}
      {note && <p className="mt-4 text-sm text-emerald-700">{note}</p>}

      {waiting.length > 0 && (
        <p className="mt-5 rounded-[12px] bg-amber-50 p-3 text-sm text-amber-800">
          {waiting.length === 1 ? "One survey is" : `${waiting.length} surveys are`} waiting on you.
          Nothing is designed or costed until you release it.
        </p>
      )}

      {loading ? (
        <p className="mt-6 text-sm text-slate">Loading…</p>
      ) : batches.length === 0 ? (
        <p className="mt-6 text-sm text-slate">
          Nothing measured yet.{" "}
          <Link href={`/partners/${slug}/stores`} className="underline">Send someone to a store</Link>{" "}
          and it lands here.
        </p>
      ) : (
        <div className="mt-6 space-y-3">
          {batches.map((b) => (
            <div key={b.id}
              className={`rounded-[18px] border p-4 ${
                b.awaitingRelease ? "border-amber-300 bg-amber-50/50" : "border-edge bg-surface"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-charcoal">{b.storeName ?? b.title}</p>
                  <p className="mt-0.5 text-xs text-slate">
                    {b.walls} wall{b.walls === 1 ? "" : "s"} · {b.sqft.toLocaleString("en-IN")} sq ft
                    {b.wallsWithoutPhoto > 0 && (
                      <span className="text-amber-700"> · {b.wallsWithoutPhoto} without a photo</span>
                    )}
                    {" · "}{when(b.createdAt)}
                  </p>
                  <p className="mt-0.5 text-xs text-mist">
                    {SAY[b.status] ?? b.status}
                    {b.origin && ` · ${b.origin.charAt(0).toLowerCase()}${b.origin.slice(1)}`}
                    {b.source === "measure_link" && b.sourceRef && ` · ${b.sourceRef}`}
                    {b.releasedAt && ` · released by ${b.releasedBy}`}
                  </p>
                  {b.error && <p className="mt-1 text-xs text-red-700">{b.error}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Link href={`/partners/${slug}/site-batches/${b.id}`}
                    className="text-xs text-slate underline">Open</Link>
                  {b.awaitingRelease && isAdmin && (
                    <button onClick={() => void release(b)} disabled={busy === b.id}
                      className="btn h-10 px-4 text-[0.75rem] disabled:opacity-40">
                      {busy === b.id ? "Releasing…" : "Release to design"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
