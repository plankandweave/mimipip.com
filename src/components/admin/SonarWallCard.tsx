"use client";

import type { SonarView } from "@/lib/sonar";

// One talking wall on a desk: its QR, where it is, the languages it speaks
// (struck through while still owed), its scans, and the switch.
export function SonarWallCard({ w, busy, onStatus }: { w: SonarView; busy: boolean; onStatus: (id: string, status: "live" | "off") => void }) {
  return (
    <li className="flex gap-4 rounded-[14px] border border-edge p-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <a href={w.qrPath} target="_blank" rel="noreferrer" className="flex-none"><img src={w.qrPath} alt={`QR for ${w.title}`} width={96} height={96} className="h-24 w-24 rounded bg-surface" /></a>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{w.title}{w.status === "off" ? <span className="font-normal text-mist"> · switched off</span> : null}</p>
        <p className="text-xs text-slate">{w.place ?? ""}{w.campus ? ` · ${w.campus}` : ""} · {w.scans} {w.scans === 1 ? "scan" : "scans"}</p>
        <p className="mt-1 text-xs text-slate">
          {w.languages.map((l) => <span key={l.code} className={l.spoken ? "mr-2 text-charcoal" : "mr-2 text-mist line-through"}>{l.native}</span>)}
        </p>
        {w.error && <p className="mt-1 text-xs text-red-600">{w.error}</p>}
        <p className="mt-1 flex flex-wrap gap-3 text-xs">
          <a href={w.url} target="_blank" rel="noreferrer" className="underline">Open the wall</a>
          <a href={w.qrPath} download={`zyvorah-sonar-${w.code}.svg`} className="underline">Download the QR</a>
          <button type="button" disabled={busy} onClick={() => onStatus(w.id, w.status === "live" ? "off" : "live")} className="underline">{w.status === "live" ? "Switch off" : "Switch on"}</button>
        </p>
      </div>
    </li>
  );
}

