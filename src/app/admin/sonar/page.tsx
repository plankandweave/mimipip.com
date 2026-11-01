"use client";

import { useCallback, useEffect, useState } from "react";
import { StaffGate, useStaff } from "@/lib/use-staff";
import type { SonarView } from "@/lib/sonar";
import { SonarWallCard } from "@/components/admin/SonarWallCard";

// The Sonar desk: every talking wall across every campus, its QR, its
// languages and its scans — and the house demo wall, whose QR goes into a
// college's first email.

async function api(body?: Record<string, unknown>, query = "") {
  const r = await fetch(`/api/admin/sonar${query}`, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? "Something went wrong.");
  return j;
}

export default function SonarDesk() {
  const staff = useStaff();
  const [walls, setWalls] = useState<SonarView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => { setWalls((await api() as { walls: SonarView[] }).walls); }, []);
  useEffect(() => {
    if (staff !== "in") return;
    const ac = new AbortController();
    fetch("/api/admin/sonar", { cache: "no-store", signal: ac.signal })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error ?? "Could not load."); setWalls((j as { walls: SonarView[] }).walls); })
      .catch((e) => { if (!ac.signal.aborted) setError(e instanceof Error ? e.message : "Could not load."); });
    return () => ac.abort();
  }, [staff]);

  async function act(label: string, body: Record<string, unknown>) {
    setBusy(label); setError(null);
    try { const j = await api(body) as { error?: string | null }; await load(); if (j.error) setError(j.error); }
    catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); }
    finally { setBusy(null); }
  }

  if (staff !== "in") return <StaffGate state={staff} title="Sonar" />;
  if (!walls) return <main className="container-x py-8 text-sm text-slate">{error ?? "Opening the desk…"}</main>;

  const demo = walls.find((w) => w.kind === "demo") ?? null;
  const byCampus = new Map<string, SonarView[]>();
  for (const w of walls.filter((x) => x.kind === "wall")) byCampus.set(w.campus ?? "—", [...(byCampus.get(w.campus ?? "—") ?? []), w]);

  return (
    <main className="container-x max-w-4xl space-y-6 py-8">
      <div>
        <p className="caps text-[0.68rem] tracking-[0.18em] text-mist">Sonar 1.0</p>
        <h1 className="mt-1 font-display text-2xl font-bold">Talking walls</h1>
        <p className="mt-1 text-sm text-slate">A QR on the wall; scan it and the wall speaks in Timbre&rsquo;s voice, in English, Hindi and the campus language. Walls are given their voice from the Prism desk; the demo wall lives here.</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="rounded-[18px] border border-edge bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-mist">The demo wall</p>
            <p className="mt-1 text-sm text-slate">What a college hears before any wall of theirs exists. English, Hindi, Tamil and Kannada. Put its QR in the first email.</p>
          </div>
          <button type="button" disabled={busy !== null} onClick={() => void act("demo", { action: "demo" })} className={demo ? "rounded-full border border-edge px-4 py-2 text-xs" : "btn h-10 px-4 text-[0.78rem]"}>
            {busy === "demo" ? "Speaking…" : demo ? "Speak any missing language" : "Make the demo wall"}
          </button>
        </div>
        {demo && <ul className="mt-4"><SonarWallCard w={demo} busy={busy !== null} onStatus={(id, status) => void act("status", { action: "status", id, status })} /></ul>}
      </section>

      {[...byCampus.entries()].map(([campus, list]) => (
        <section key={campus} className="rounded-[18px] border border-edge bg-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-mist">{campus} · {list.length} {list.length === 1 ? "wall" : "walls"} · {list.reduce((n, w) => n + w.scans, 0)} scans</p>
          <ul className="mt-3 space-y-3">
            {list.map((w) => <SonarWallCard key={w.id} w={w} busy={busy !== null} onStatus={(id, status) => void act("status", { action: "status", id, status })} />)}
          </ul>
        </section>
      ))}
      {byCampus.size === 0 && <p className="text-sm text-slate">No campus wall speaks yet. On a campus&rsquo;s Prism desk, press &ldquo;Make the walls talk&rdquo;.</p>}
    </main>
  );
}
