"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { StaffGate, useStaff } from "@/lib/use-staff";

// The sample desk — click a design, get a printable sheet of A4 samples.
//
// A sample is usually what decides an order: it is the only time a client sees
// our print from 30 cm instead of across a room. Making one used to be a
// hand-built file per request, so this desk standardises it: pick designs, pick
// the medium, look at the sheet, release it to the hot folder.
//
// Every design contributes a PAIR of cards, because a client asks two questions
// and neither card answers the other's — a 1:1 crop for the texture in the hand,
// and the whole design shrunk to the card for the composition. The row then
// fills the roll's width, because the roll advances the same length whether one
// card rides across it or six: the empty columns are free samples we chose not
// to print.
//
// Opened by the Google sign-in on the door (Cloudflare Access) and nothing else.

type Item = { handle: string; title: string; status: string; category: string | null; flat: string | null };
type Media = { slug: string; name: string; rollWidthMm: number | null; printableCm: number | null };
type Card = {
  key: string; card_style?: string; design_title?: string; placed?: boolean; error?: string;
  effective_dpi?: number; below_min_dpi?: boolean; material_unresolved?: string | null;
};
type Sheet = {
  ref: string; released: boolean; order_no: string | null; previewUrl: string | null;
  mediaName: string; media_width_cm: number; width_warning: string | null;
  cards: Card[]; cards_placed: number; columns: number; rows: number;
  sheet_len_cm: number; paper_m: number; quality_warning: string | null;
};

const A4_H_CM = 29.7;

export default function SampleDeskPage() {
  const staff = useStaff();
  const [items, setItems] = useState<Item[] | null>(null);
  const [media, setMedia] = useState<Media[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [mediaSlug, setMediaSlug] = useState<string>("");
  const [wallW, setWallW] = useState("10");
  const [wallH, setWallH] = useState("9");
  const [copies, setCopies] = useState("");
  const [rows, setRows] = useState("1");
  const [ref, setRef] = useState("");
  const [search, setSearch] = useState("");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [busy, setBusy] = useState<"" | "compose" | "release">("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (staff !== "in") return;
    (async () => {
      try {
        const res = await fetch("/api/studio/samples-items");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "could not load the catalogue");
        setItems(json.items ?? []);
        setMedia(json.media ?? []);
        setMediaSlug((json.media ?? [])[0]?.slug ?? "");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load the catalogue.");
        setItems([]);
      }
    })();
  }, [staff]);

  const chosenMedia = media.find((m) => m.slug === mediaSlug) ?? null;

  // Mirror the engine's own column arithmetic so the desk can say what a
  // release will produce BEFORE it renders anything: A4 across the web, 8 mm
  // between columns, 25 mm of uncut rail at each edge.
  const layout = useMemo(() => {
    const printable = chosenMedia?.printableCm ?? null;
    if (!printable) return null;
    const cols = Math.max(1, Math.floor((printable - 5 + 0.8) / (21 + 0.8)));
    const pairs = Math.floor(cols / 2);
    return { cols, pairs };
  }, [chosenMedia]);

  // A preview describes one exact payload. Change the payload and it no longer
  // does — dropping it is what stops a release printing something the person
  // pressing the button never looked at.
  const invalidate = () => setSheet(null);

  const toggle = (handle: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(handle)) next.delete(handle); else next.add(handle);
      return next;
    });
    invalidate();
  };

  const run = async (release: boolean) => {
    setError(null);
    setBusy(release ? "release" : "compose");
    try {
      const res = await fetch("/api/studio/sample-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          picks: (items ?? []).filter((i) => picked.has(i.handle)).map((i) => ({ handle: i.handle, title: i.title })),
          mediaSlug,
          printableCm: chosenMedia?.printableCm ?? undefined,
          wallWidthFt: Number(wallW) || undefined,
          wallHeightFt: Number(wallH) || undefined,
          copies: Number(copies) > 0 ? Number(copies) : undefined,
          rows: Number(rows) > 0 ? Number(rows) : 1,
          ref: ref.trim() || undefined,
          release,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "the sheet was refused");
      setSheet(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy("");
    }
  };

  const release = async () => {
    if (!sheet) return;
    const ok = window.confirm(
      `Release ${sheet.cards_placed} sample card(s) on ${sheet.mediaName}?\n\n` +
      `${sheet.columns} across × ${sheet.rows} row(s) — ${sheet.sheet_len_cm} cm of roll (${sheet.paper_m} m).\n\n` +
      "This prints. Releasing again prints again.",
    );
    if (ok) await run(true);
  };

  const visible = (items ?? []).filter((i) =>
    !search.trim() || i.title.toLowerCase().includes(search.trim().toLowerCase()));

  if (staff !== "in") return <StaffGate state={staff} title="Sample desk" />;

  return (
    <div className="container-x py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Sample desk</h1>
          <p className="mt-1 text-sm text-slate">
            Pick designs and a medium, look at the sheet, release it to the hot folder. Each design prints
            twice — once at actual size, once as the whole design — with its own QR back to the design page.
          </p>
        </div>
        <Link href="/studio" className="text-xs text-slate underline underline-offset-2">← Studio</Link>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-[16px] bg-wash p-4">
        <span className="text-xs font-semibold text-slate">Medium</span>
        <div className="flex flex-wrap gap-1.5">
          {media.map((m) => (
            <button
              key={m.slug} type="button"
              title={m.printableCm ? `${m.printableCm} cm printable` : "no roll width on record"}
              onClick={() => { setMediaSlug(m.slug); invalidate(); }}
              className={`rounded-full border px-3 py-1.5 text-[0.7rem] font-semibold transition-colors ${
                mediaSlug === m.slug ? "border-charcoal bg-charcoal text-surface" : "border-edge text-slate hover:border-slate"
              }`}
            >
              {m.name}
            </button>
          ))}
        </div>

        <span className="text-xs font-semibold text-slate">Scaled against</span>
        <div className="flex items-center gap-1.5">
          <input
            value={wallW} onChange={(e) => { setWallW(e.target.value); invalidate(); }}
            inputMode="decimal" aria-label="Reference wall width in feet"
            className="h-9 w-14 rounded-[8px] border border-edge bg-surface px-2 text-center text-xs outline-none focus:border-charcoal"
          />
          <span className="text-xs text-mist">×</span>
          <input
            value={wallH} onChange={(e) => { setWallH(e.target.value); invalidate(); }}
            inputMode="decimal" aria-label="Reference wall height in feet"
            className="h-9 w-14 rounded-[8px] border border-edge bg-surface px-2 text-center text-xs outline-none focus:border-charcoal"
          />
          <span className="text-xs text-mist">ft wall</span>
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-xs font-semibold text-slate" htmlFor="copies">Copies</label>
          <input
            id="copies" value={copies} onChange={(e) => { setCopies(e.target.value); invalidate(); }}
            placeholder="fill" inputMode="numeric"
            className="h-9 w-16 rounded-[8px] border border-edge bg-surface px-2 text-center text-xs outline-none focus:border-charcoal"
          />
          <label className="text-xs font-semibold text-slate" htmlFor="rows">Rows</label>
          <input
            id="rows" value={rows} onChange={(e) => { setRows(e.target.value); invalidate(); }}
            inputMode="numeric"
            className="h-9 w-14 rounded-[8px] border border-edge bg-surface px-2 text-center text-xs outline-none focus:border-charcoal"
          />
        </div>

        <input
          value={ref} onChange={(e) => { setRef(e.target.value); invalidate(); }}
          placeholder="Pack name, e.g. LIVSPACE-01" aria-label="Pack reference"
          className="h-9 min-w-52 flex-1 rounded-[10px] border border-edge bg-surface px-3 text-xs outline-none focus:border-charcoal"
        />
      </div>

      {layout && (
        <p className="mt-2 text-[0.68rem] text-mist">
          {chosenMedia?.name} runs {chosenMedia?.printableCm} cm printable — {layout.cols} A4 columns across.
          {!copies && ` Filling the width prints ${layout.pairs} pair${layout.pairs === 1 ? "" : "s"} per row.`}
          {" "}One row is {A4_H_CM} cm of roll.
        </p>
      )}
      {chosenMedia && !chosenMedia.printableCm && (
        <p className="mt-2 text-[0.68rem] text-red-600">
          {chosenMedia.name} has no roll width on record, so the engine would preview on a fallback narrower
          than any roll we load. Set its roll width before releasing on it.
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          onClick={() => run(false)}
          disabled={!picked.size || !mediaSlug || busy !== ""}
          className="rounded-full bg-charcoal px-5 py-2.5 text-xs font-semibold text-surface disabled:opacity-40"
        >
          {busy === "compose" ? "Composing…" : `Compose preview (${picked.size} design${picked.size === 1 ? "" : "s"})`}
        </button>
        <button
          onClick={release}
          disabled={!sheet || sheet.released || busy !== ""}
          title={sheet ? "" : "Compose a preview first — a release prints what you looked at"}
          className="rounded-full border-2 border-charcoal px-5 py-2.5 text-xs font-semibold disabled:opacity-40"
        >
          {busy === "release" ? "Releasing…" : "Release to hot folder"}
        </button>
        {picked.size > 0 && (
          <button onClick={() => { setPicked(new Set()); invalidate(); }} className="text-[0.68rem] text-slate underline underline-offset-2">
            Clear selection
          </button>
        )}
      </div>

      {error && <p className="mt-4 rounded-[12px] bg-red-50 p-3 text-xs text-red-600">{error}</p>}

      {sheet && (
        <div className="mt-6 rounded-[16px] border border-edge bg-surface p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="font-semibold">
              {sheet.released ? "Released" : "Preview"} — {sheet.ref} on {sheet.mediaName}
            </p>
            <p className="text-[0.68rem] text-slate">
              {sheet.cards_placed} card(s) · {sheet.columns} across × {sheet.rows} row(s) ·
              {" "}{sheet.sheet_len_cm} cm ({sheet.paper_m} m of roll)
            </p>
          </div>

          {sheet.released && sheet.order_no && (
            <p className="mt-2 rounded-[10px] bg-sage/15 p-2.5 text-xs">
              Queued as <span className="font-mono">{sheet.order_no}</span> — the bridge drops it in the hot
              folder on its next poll, and the roll and ink are booked when it confirms.
            </p>
          )}
          {sheet.width_warning && <p className="mt-2 text-[0.68rem] text-red-600">{sheet.width_warning}</p>}
          {sheet.quality_warning && (
            <p className="mt-2 rounded-[10px] bg-red-50 p-2.5 text-xs text-red-600">
              {sheet.quality_warning} — a card is inspected at 30 cm, not across a room.
            </p>
          )}

          {sheet.previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={sheet.previewUrl} alt={`Sample sheet ${sheet.ref}`} className="mt-3 w-full rounded-[10px] border border-edge" />
          )}

          <div className="mt-3 flex flex-wrap gap-1.5">
            {sheet.cards.map((c, i) => (
              <span
                key={`${c.key}-${i}`}
                className={`rounded-full border px-2.5 py-1 text-[0.65rem] ${
                  c.error || c.below_min_dpi ? "border-red-400 text-red-600" : "border-edge text-slate"
                }`}
              >
                {c.design_title ?? c.key}
                {c.card_style === "fit" ? " · whole" : " · actual size"}
                {c.error ? ` · ${c.error}` : c.effective_dpi ? ` · ${c.effective_dpi} DPI` : ""}
                {c.material_unresolved ? " · medium unnamed" : ""}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 flex items-center justify-between gap-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-mist">Designs</h2>
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search designs" aria-label="Search designs"
          className="h-9 w-56 rounded-[10px] border border-edge bg-surface px-3 text-xs outline-none focus:border-charcoal"
        />
      </div>

      {items === null ? (
        <p className="mt-4 text-sm text-mist">Loading designs…</p>
      ) : visible.length === 0 ? (
        <p className="mt-4 text-sm text-mist">No designs match.</p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {visible.map((it) => {
            const on = picked.has(it.handle);
            return (
              <button
                key={it.handle} onClick={() => toggle(it.handle)} type="button"
                className={`overflow-hidden rounded-[14px] border-2 text-left transition-colors ${
                  on ? "border-charcoal" : "border-edge hover:border-slate"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {it.flat && <img src={it.flat} alt={it.title} className="aspect-square w-full object-cover" />}
                <div className="p-2.5">
                  <p className="truncate text-xs font-semibold">{on ? "✓ " : ""}{it.title}</p>
                  <p className="mt-0.5 text-[0.6rem] uppercase tracking-wide text-mist">
                    {it.status}{it.status !== "active" && " — draft"}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <p className="mt-8 text-[0.68rem] text-mist">
        Cards print with dashed trim guides and are cut on the bench, never by the machine — a loose A4 inside
        the web lifts into the head. The one cut the sheet does carry is the sever that takes it off the roll.
      </p>
    </div>
  );
}
