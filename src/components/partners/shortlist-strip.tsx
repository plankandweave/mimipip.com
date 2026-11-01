"use client";
import { useEffect, useState } from "react";

type Tile = { handle: string; title: string; image: string | null };

/** Shukra / Venus — the Sales family of the Navagraha palette. A shortlist is
 *  a sales gesture (designs this partner liked, set by our team from the OS),
 *  so it wears Sales: Rani Pink bar, Rose Quartz edge, Wine text, Blush blank.
 *  Named shades only — no opacity tints (Navagraha rule). */
const SHUKRA = {
  blush: "#F3C6D3",
  roseQuartz: "#E8A0B4",
  raniPink: "#C2185B",
  wine: "#8B1A4A",
} as const;

/** "Shortlisted for you": the designs on this account's shortlist, above the
 *  catalogue, in the order our team set them. Shows nothing at all when the
 *  account has no shortlist (or every handle on it has gone stale), so a
 *  partner without one sees the portal exactly as before. Picking a tile is
 *  the same as picking it from the catalogue grid below. */
export default function ShortlistStrip({
  onPick,
  selectedHandle,
  picking,
}: {
  onPick: (handle: string) => void;
  selectedHandle?: string | null;
  picking?: string | null;
}) {
  const [tiles, setTiles] = useState<Tile[]>([]);
  useEffect(() => {
    let live = true;
    fetch("/api/corporate/catalogue?shortlist=1", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { results: [] }))
      .then((v) => { if (live) setTiles(Array.isArray(v.results) ? v.results : []); })
      // The strip is a convenience: a failed load leaves the catalogue as it was.
      .catch(() => {});
    return () => { live = false; };
  }, []);
  if (!tiles.length) return null;
  return (
    <section
      aria-labelledby="shortlist-heading"
      data-shortlist={tiles.map((t) => t.handle).join(",")}
      className="mt-4 rounded border p-4"
      style={{ borderColor: SHUKRA.roseQuartz, borderTop: `4px solid ${SHUKRA.raniPink}` }}
    >
      <h3 id="shortlist-heading" className="flex items-center gap-2 text-base font-semibold" style={{ color: SHUKRA.wine }}>
        <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: SHUKRA.raniPink }} />
        Shortlisted for you
      </h3>
      <p className="mt-1 text-sm text-stone-600">
        Designs you liked, picked out by the Zyvorah team. Tap one to specify it for this wall.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-6">
        {tiles.map((t) => {
          const on = selectedHandle === t.handle;
          return (
            <button
              key={t.handle}
              type="button"
              disabled={picking != null}
              aria-pressed={on}
              onClick={() => onPick(t.handle)}
              className={`overflow-hidden rounded border bg-white text-left disabled:cursor-wait ${picking === t.handle ? "opacity-60" : ""}`}
              style={on ? { boxShadow: `0 0 0 2px ${SHUKRA.raniPink}`, borderColor: SHUKRA.raniPink } : { borderColor: SHUKRA.roseQuartz }}
            >
              {t.image ? (
                <img src={t.image} alt="" loading="lazy" className="aspect-[3/4] w-full object-cover object-bottom" />
              ) : (
                <span className="block aspect-[3/4] w-full" style={{ background: SHUKRA.blush }} />
              )}
              <span className="block p-2 text-sm">{picking === t.handle ? "Opening…" : t.title}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
