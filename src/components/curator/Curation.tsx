"use client";

import { useState } from "react";
import { parseDimensions } from "@/lib/curator-flow";
import type { CuratorSession } from "./types";
import { PickCard } from "./PickCard";

export function Curation({
  session,
  onRestart,
  onNudge,
}: {
  session: CuratorSession;
  onRestart: () => void;
  onNudge: (direction: "quieter" | "bolder") => Promise<void>;
}) {
  const [nudging, setNudging] = useState<"quieter" | "bolder" | null>(null);
  const picks = session.picks ?? [];
  const a = session.analysis;
  const dims = parseDimensions(session.answers.dimensions ?? "");

  const runNudge = async (d: "quieter" | "bolder") => {
    setNudging(d);
    await onNudge(d);
    setNudging(null);
  };

  return (
    <div className="mx-auto max-w-6xl">
      <header className="max-w-2xl">
        <span className="caps text-slate">Your curation</span>
        <h1 className="mt-3 text-[clamp(2rem,4vw,3rem)]">
          {picks.length} {picks.length === 1 ? "wallpaper" : "wallpapers"}, chosen for {a?.roomType || "your room"}.
        </h1>
        {a?.summary && <p className="mt-3 text-slate">{a.summary}</p>}
        {session.note && (
          <p className="mt-4 rounded-2xl bg-sky/60 px-5 py-3.5 text-[0.95rem] leading-relaxed text-charcoal">{session.note}</p>
        )}
        {(a?.palette?.length ?? 0) > 0 && (
          <div className="mt-5 flex gap-2">
            {a!.palette.slice(0, 6).map((c, i) => (
              <span key={i} className="h-8 w-8 rounded-full border border-black/5" style={{ background: c }} title={c} />
            ))}
          </div>
        )}
        {picks.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            <button disabled={nudging !== null} onClick={() => runNudge("quieter")} className="btn btn-ghost text-[0.78rem] disabled:opacity-50">
              {nudging === "quieter" ? "Adjusting…" : "Make it quieter"}
            </button>
            <button disabled={nudging !== null} onClick={() => runNudge("bolder")} className="btn btn-ghost text-[0.78rem] disabled:opacity-50">
              {nudging === "bolder" ? "Adjusting…" : "Make it bolder"}
            </button>
          </div>
        )}
      </header>

      {picks.length === 0 ? (
        <p className="mt-10 text-slate">
          I couldn&rsquo;t find a confident match this time — try describing the feeling or colours a little differently.
        </p>
      ) : (
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {picks.map((p, i) => (
            <div key={p.handle} className={i === 0 ? "sm:col-span-2" : ""}>
              <PickCard pick={p} lead={i === 0} dims={dims} />
            </div>
          ))}
        </div>
      )}

      <div className="mt-12 border-t border-edge pt-6">
        <button className="btn btn-ghost" onClick={onRestart}>
          Start a new curation
        </button>
      </div>
    </div>
  );
}
