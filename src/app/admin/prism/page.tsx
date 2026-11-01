"use client";

import { useEffect, useState } from "react";
import { StaffGate, useStaff } from "@/lib/use-staff";
import type { BlueprintReadiness } from "@/lib/pulse";

// Prism's front page: every campus project, where its Pulse stands and
// which direction is on the table.

type Row = {
  id: string; name: string; city: string | null; language: string; status: string;
  accountName: string; accountSlug: string | null; readiness: BlueprintReadiness;
  latest: { revision: number; direction: string; status: string; created_at: string } | null;
};

const STATUS: Record<string, string> = {
  collecting: "collecting", ready: "ready for Prism", designing: "designing", presented: "presented", closed: "closed",
};

export default function PrismIndex() {
  const staff = useStaff();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (staff !== "in") return;
    const ac = new AbortController();
    fetch("/api/admin/prism", { cache: "no-store", signal: ac.signal })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error ?? "Could not load."); setRows(j.blueprints); })
      .catch((e) => { if (!ac.signal.aborted) setError(e instanceof Error ? e.message : "Could not load."); });
    return () => ac.abort();
  }, [staff]);

  if (staff !== "in") return <StaffGate state={staff} title="Prism" />;

  return (
    <main className="container-x max-w-4xl space-y-6 py-8">
      <div>
        <p className="caps text-[0.68rem] tracking-[0.18em] text-mist">Prism 1.0</p>
        <h1 className="mt-1 font-display text-2xl font-bold">Campus projects</h1>
        <p className="mt-1 text-sm text-slate">A direction for the whole campus, wall by wall, written from the Vault and revised with you. A proposal reaches the college only once every wall is ready.</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {rows === null ? <p className="text-sm text-slate">Loading…</p> : rows.length === 0 ? (
        <p className="text-sm text-slate">No campus projects yet.</p>
      ) : (
        <ul className="divide-y divide-edge rounded-[18px] border border-edge bg-surface">
          {rows.map((r) => (
            <li key={r.id}>
              <a href={`/admin/prism/${r.id}`} className="flex flex-wrap items-start justify-between gap-3 p-4 hover:bg-wash">
                <div className="min-w-0">
                  <p className="font-display text-base font-bold">{r.name}</p>
                  <p className="text-xs text-slate">{r.accountName}{r.city ? ` · ${r.city}` : ""} · {STATUS[r.status] ?? r.status}</p>
                  <p className="mt-1 text-sm text-slate">{r.readiness.headline}</p>
                  {r.latest && <p className="mt-1 text-xs text-charcoal">Rev. {r.latest.revision} · {r.latest.direction} · {r.latest.status}</p>}
                </div>
                <span className="text-xs underline">Open</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
