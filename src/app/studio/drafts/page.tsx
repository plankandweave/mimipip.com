"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { StylingKey } from "@/lib/studio-scenes";
import { StaffGate, useStaff } from "@/lib/use-staff";

// Studio drafts — every unpublished design in one place, with its flat
// thumbnail and enough signal to decide publish-vs-bin. The batch pipeline
// drops each design here as a `draft`; this is where a human triages them.
// Opened by the Google sign-in on the door (Cloudflare Access) and nothing else.

type Draft = {
  handle: string;
  title: string;
  created_at: string;
  flat_verified: boolean;
  flat_url: string | null;
  thumb_url: string | null;
  furniture_score: number | null;
  image_count: number;
  scene_count: number;
};

// The flat looks like it already has a room/furniture in it (bad flat). Heuristic
// from ADE20k segmentation — busy patterns can false-positive — so it's a hint.
const FURNISHED = 0.15;

type Filter = "all" | "ready" | "needs-work";

// A draft is publishable when the DB will actually let it go live: it has a
// flat and that flat is verified. Scenes are a quality signal, not a hard gate.
const isReady = (d: Draft) => d.flat_verified && !!d.flat_url;

export default function StudioDraftsPage() {
  const staff = useStaff();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, string>>({}); // handle -> action label
  const [queued, setQueued] = useState<Set<string>>(new Set()); // handles re-cued this session
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/studio/drafts");
    if (!res.ok) {
      setError("Couldn't load the drafts — your sign-in may have lapsed. Reload the page.");
      setLoading(false);
      return;
    }
    setError(null);
    setDrafts((await res.json()).items ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (staff === "in") load();
  }, [staff, load]);

  const publish = async (d: Draft) => {
    setError(null);
    setBusy((b) => ({ ...b, [d.handle]: "Publishing…" }));
    const res = await fetch("/api/studio/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle: d.handle, status: "active" }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(`Couldn't publish “${d.title}”: ${j.error ?? res.statusText}`);
      setBusy((b) => { const n = { ...b }; delete n[d.handle]; return n; });
      return;
    }
    setDrafts((prev) => prev.filter((x) => x.handle !== d.handle));
    setBusy((b) => { const n = { ...b }; delete n[d.handle]; return n; });
  };

  const finish = async (d: Draft, styling?: StylingKey) => {
    setError(null);
    setBusy((b) => ({ ...b, [d.handle]: "Queuing…" }));
    const res = await fetch("/api/studio/finish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Omitted unless forced, so the default stays "read the design's tags".
      body: JSON.stringify({ handle: d.handle, ...(styling ? { styling } : {}) }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(`Couldn't re-cue “${d.title}”: ${j.error ?? res.statusText}`);
      setBusy((b) => { const n = { ...b }; delete n[d.handle]; return n; });
      return;
    }
    setQueued((q) => new Set(q).add(d.handle));
    setBusy((b) => { const n = { ...b }; delete n[d.handle]; return n; });
  };

  const remove = async (d: Draft) => {
    if (!window.confirm(`Delete “${d.title}” for good? This removes the design and all its images. It can't be undone.`)) return;
    setError(null);
    setBusy((b) => ({ ...b, [d.handle]: "Deleting…" }));
    const res = await fetch("/api/studio/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle: d.handle }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(`Couldn't delete “${d.title}”: ${j.error ?? res.statusText}`);
      setBusy((b) => { const n = { ...b }; delete n[d.handle]; return n; });
      return;
    }
    setDrafts((prev) => prev.filter((x) => x.handle !== d.handle));
    setBusy((b) => { const n = { ...b }; delete n[d.handle]; return n; });
  };

  const counts = useMemo(() => ({
    all: drafts.length,
    ready: drafts.filter((d) => isReady(d) && d.scene_count > 0).length,
    needsWork: drafts.filter((d) => !isReady(d) || d.scene_count === 0).length,
  }), [drafts]);

  const shown = useMemo(() => drafts.filter((d) => {
    if (filter === "ready") return isReady(d) && d.scene_count > 0;
    if (filter === "needs-work") return !isReady(d) || d.scene_count === 0;
    return true;
  }), [drafts, filter]);

  if (staff !== "in") return <StaffGate state={staff} title="Studio · Drafts" />;

  const FILTERS: { key: Filter; label: string; n: number }[] = [
    { key: "all", label: "All", n: counts.all },
    { key: "ready", label: "Ready to publish", n: counts.ready },
    { key: "needs-work", label: "Needs work", n: counts.needsWork },
  ];

  return (
    <div className="container-x py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Draft designs</h1>
          <p className="mt-1 text-xs text-slate">
            Every unpublished design. Publish the good ones, delete the duds. Deletes are permanent.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/studio" className="text-xs text-slate underline underline-offset-2">← Studio</Link>
        </div>
      </div>

      {/* how-to + rules — a permanent reference so the workflow is never a mystery */}
      <details className="mt-5 rounded-[16px] border border-edge bg-wash/60 px-5 py-4 text-sm">
        <summary className="cursor-pointer select-none font-display font-bold">
          How to use this page &amp; the rules — read me
        </summary>

        <p className="mt-3 font-semibold">The one rule</p>
        <p className="mt-1 text-slate">
          Every wallpaper that goes live must have <strong>one clean, furniture-free flat</strong> — just the
          pattern or artwork, with no room and no furniture in it. That flat is what &ldquo;See it in my room&rdquo;
          and the printer use. A styled or furnished photo can <strong>never</strong> be the flat.
        </p>

        <p className="mt-4 font-semibold">What the tags mean, and what to do</p>
        <ul className="mt-2 space-y-2.5 text-slate">
          <li>
            <span className="mr-2 inline-block rounded-full bg-mist/40 px-2 py-0.5 text-[0.6rem] font-semibold uppercase">No rooms</span>
            Clean pattern, just no styled shots yet. → Click <strong>Finish rooms</strong>. It builds the room
            images on the server; come back later and <strong>Publish</strong> once they appear.
          </li>
          <li>
            <span className="mr-2 inline-block rounded-full bg-blush px-2 py-0.5 text-[0.6rem] font-semibold uppercase">Furniture?</span>
            The flat already has furniture or a room baked into it, so it is <strong>not</strong> a clean flat.
            <strong> Do not Finish rooms and do not Publish.</strong> It needs a clean, pattern-only flat uploaded in
            Studio first. If it&rsquo;s a one-off framed picture (not a repeatable pattern), it&rsquo;s
            <strong> wall art</strong> — leave it for now; wall art comes later.
          </li>
          <li>
            <span className="mr-2 inline-block rounded-full bg-charcoal/70 px-2 py-0.5 text-[0.6rem] font-semibold uppercase text-surface">Unverified</span>
            Nobody has confirmed the flat is clean yet. It cannot go live until it&rsquo;s verified in Studio.
          </li>
          <li>
            <span className="mr-2 inline-block rounded-full bg-sage/60 px-2 py-0.5 text-[0.6rem] font-semibold uppercase">Ready</span>
            Has room shots and no warning tags. → Click <strong>Publish</strong> to put it live.
          </li>
        </ul>

        <p className="mt-4 font-semibold">Buttons</p>
        <ul className="mt-2 space-y-1 text-slate">
          <li><strong>Finish rooms</strong> — generate the styled room images for a clean flat.</li>
          <li><strong>Publish</strong> — put the design live on the site.</li>
          <li><strong>Delete</strong> — remove it for good. Permanent, no undo — use it for duds.</li>
          <li><strong>Click the picture</strong> — opens the full-size flat so you can check it up close.</li>
        </ul>

        <p className="mt-4 font-semibold">Filters (top)</p>
        <p className="mt-1 text-slate">
          <strong>Ready to publish</strong> = done, just needs a click. <strong>Needs work</strong> = missing rooms,
          a furnished flat, or unverified. <strong>All</strong> = everything.
        </p>
      </details>

      {/* filter chips */}
      <div className="mt-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3.5 py-1.5 text-[0.75rem] font-semibold ${filter === f.key ? "bg-charcoal text-surface" : "bg-wash text-slate hover:text-charcoal"}`}
          >
            {f.label} <span className="opacity-60">{f.n}</span>
          </button>
        ))}
      </div>

      {error && <p className="mt-4 rounded-[12px] bg-blush/50 px-4 py-3 text-sm">{error}</p>}
      {loading && <p className="mt-6 text-sm text-mist">Loading drafts…</p>}
      {!loading && drafts.length === 0 && <p className="mt-6 text-sm text-mist">No drafts. Everything’s published or the queue is empty.</p>}

      {/* draft grid */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {shown.map((d) => {
          const incomplete = d.scene_count === 0;
          const unverified = !d.flat_verified;
          const furnished = d.furniture_score != null && d.furniture_score > FURNISHED;
          const label = busy[d.handle];
          return (
            <div key={d.handle} className="overflow-hidden rounded-[16px] bg-wash">
              {/* thumbnail — click to open the full flat image in a new tab */}
              <a
                href={d.flat_url ?? d.thumb_url ?? "#"}
                target="_blank" rel="noopener noreferrer"
                className="relative block aspect-square bg-surface"
              >
                {d.thumb_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.thumb_url} alt={d.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full place-items-center text-[0.7rem] text-mist">no image</div>
                )}
                <span className="absolute left-2 top-2 flex flex-wrap gap-1">
                  {furnished && <span className="rounded-full bg-blush px-2 py-0.5 text-[0.58rem] font-semibold uppercase" title={`Flat may already contain furniture/a room (furniture score ${d.furniture_score?.toFixed(2)}). It needs a clean pattern-only flat before it can be published or room-mapped.`}>Furniture?</span>}
                  {incomplete && <span className="rounded-full bg-wash/90 px-2 py-0.5 text-[0.58rem] font-semibold uppercase text-slate">No rooms</span>}
                  {unverified && <span className="rounded-full bg-charcoal/70 px-2 py-0.5 text-[0.58rem] font-semibold uppercase text-surface">Unverified</span>}
                </span>
              </a>

              <div className="p-3">
                <p className="truncate text-sm font-semibold" title={d.title}>{d.title}</p>
                <p className="mt-0.5 text-[0.68rem] text-slate">
                  {d.scene_count > 0 ? `${d.scene_count} room${d.scene_count === 1 ? "" : "s"}` : "no rooms yet"}
                  {" · "}
                  {new Date(d.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}
                </p>

                {queued.has(d.handle) ? (
                  <p className="mt-3 rounded-full bg-sage/60 px-3 py-2 text-center text-[0.72rem] font-semibold">
                    Re-cued ✓ — rooms generating
                  </p>
                ) : (
                  <div className="mt-3 flex gap-2">
                    {/* thin/incomplete drafts get "Finish rooms"; ready ones get "Publish" */}
                    {d.scene_count < 2 ? (
                      <>
                        <button
                          onClick={() => finish(d)}
                          disabled={!!label}
                          className="btn h-9 flex-1 text-[0.72rem] disabled:opacity-40"
                          title="Clear any partial scenes and generate a fresh room set on the server, in the register this design's own tags imply."
                        >
                          {label === "Queuing…" ? "Queuing…" : "Finish rooms"}
                        </button>
                        {/* Force the editorial register on a design whose tags
                            don't say "statement piece" but which you want shot
                            like one. The tags describe the ARTWORK, so this is
                            deliberately a render choice, not a retag. */}
                        <button
                          onClick={() => finish(d, "bold")}
                          disabled={!!label}
                          className="h-9 shrink-0 rounded-full border border-charcoal px-3 text-[0.72rem] font-semibold transition-colors hover:bg-charcoal hover:text-surface disabled:opacity-40"
                          title="Same, but dressed as a bold editorial interior: one saturated statement piece, hard light, no beige."
                        >
                          Bold
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => publish(d)}
                        disabled={!!label}
                        className="btn h-9 flex-1 text-[0.72rem] disabled:opacity-40"
                        title="Publish live"
                      >
                        {label === "Publishing…" ? "Publishing…" : "Publish"}
                      </button>
                    )}
                    <button
                      onClick={() => remove(d)}
                      disabled={!!label}
                      className="h-9 rounded-full border border-edge px-3 text-[0.72rem] font-semibold text-slate hover:border-charcoal hover:text-charcoal disabled:opacity-40"
                    >
                      {label === "Deleting…" ? "…" : "Delete"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
