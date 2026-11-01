"use client";

import { useCallback, useEffect, useState } from "react";
import Lightbox, { type LightboxImage } from "@/components/Lightbox";
import { uploadToLibrary } from "@/lib/library-upload";

// The designs put together for this portfolio.
//
// A compact read of the same library the reseller portal has a whole page for,
// living inside the dashboard so nothing navigates. Grouped by collection,
// because that is how the set was chosen and how it gets discussed — and every
// tile opens full-screen, since a 4:1 panel judged at thumbnail size is not
// judged at all.
//
// Every image comes through the watermarking proxy, so there is no clean
// original here to protect and nothing to stop anyone saving what they see.

type Design = {
  id: string;
  title: string;
  design_code: string | null;
  series_name: string | null;
  concept_note: string | null;
};

const COLLECTION_FALLBACK = "Individual designs";

/** A direction from a proposal we sent this client — already a named set of
 *  designs, which is exactly the shape a library series wants to be. */
type Direction = {
  id: string;
  title: string;
  tagline: string | null;
  designs: number;
  imported: boolean;
};

export default function LibraryPanel({ canUpload }: { canUpload: boolean }) {
  const [designs, setDesigns] = useState<Design[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [openSeries, setOpenSeries] = useState<string | null>(null);
  const [zoom, setZoom] = useState<LightboxImage | null>(null);
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const fetchDesigns = useCallback(async () => {
    const r = await fetch("/api/corporate/designs", { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? "Could not load the library.");
    return (j.designs ?? []) as Design[];
  }, []);

  const reload = useCallback(async () => {
    try { setDesigns(await fetchDesigns()); setErr(null); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not load the library."); }
  }, [fetchDesigns]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const d = await fetchDesigns();
        if (alive) { setDesigns(d); setErr(null); }
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : "Could not load the library.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [fetchDesigns]);

  if (loading) return <p className="mt-6 text-sm text-slate">Loading the library…</p>;
  if (err) return <p className="mt-6 text-sm text-red-600">{err}</p>;

  if (designs.length === 0) {
    return (
      <div className="mt-6">
        {adding ? (
          <AddDesigns onDone={async (m) => { setAdding(false); setMsg(m); await reload(); }}
            onCancel={() => setAdding(false)} onError={setErr} />
        ) : (
          <div className="rounded-[18px] border border-dashed border-edge bg-wash px-6 py-12 text-center">
            <p className="font-display text-base font-bold">
              {canUpload ? "This library is empty" : "Your library is being put together"}
            </p>
            <p className="mx-auto mt-2 max-w-[46ch] text-sm text-slate">
              {canUpload
                ? "Add the designs chosen for this portfolio. Once they are here they can be studied on any wall that has been captured."
                : "The designs chosen for this portfolio will appear here, and can then be studied on any wall you have captured."}
            </p>
            {canUpload && (
              <button onClick={() => setAdding(true)} className="btn mt-4 h-10 px-5 text-[0.8rem]">
                Add designs
              </button>
            )}
          </div>
        )}
        {msg && <p className="mt-3 text-sm">{msg}</p>}
      </div>
    );
  }

  // Grouped by collection, newest collection first — the library's own rule.
  const groups = new Map<string, Design[]>();
  for (const d of designs) {
    const key = d.series_name?.trim() || COLLECTION_FALLBACK;
    const list = groups.get(key);
    if (list) list.push(d); else groups.set(key, [d]);
  }
  // The loose pile last, whatever order it arrived in.
  const names = [...groups.keys()].filter((n) => n !== COLLECTION_FALLBACK);
  if (groups.has(COLLECTION_FALLBACK)) names.push(COLLECTION_FALLBACK);

  const shown = openSeries ? names.filter((n) => n === openSeries) : names;

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-[52ch] text-sm text-slate">
          {designs.length} {designs.length === 1 ? "design" : "designs"} across{" "}
          {names.length} {names.length === 1 ? "collection" : "collections"}. Tap
          any one to see it full-screen.
        </p>
        <div className="flex items-center gap-3">
          {openSeries && (
            <button onClick={() => setOpenSeries(null)} className="text-xs text-slate underline">
              ← All collections
            </button>
          )}
          {canUpload && !adding && (
            <button onClick={() => setAdding(true)}
              className="rounded-[10px] border border-edge px-4 py-2 text-xs">
              Add designs
            </button>
          )}
        </div>
      </div>

      {adding && (
        <AddDesigns onDone={async (m) => { setAdding(false); setMsg(m); await reload(); }}
          onCancel={() => setAdding(false)} onError={setErr} />
      )}
      {msg && <p className="mt-3 text-sm">{msg}</p>}

      <div className="mt-6 space-y-8">
        {shown.map((name) => {
          const items = groups.get(name)!;
          const visible = openSeries ? items : items.slice(0, 4);
          return (
            <section key={name}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-display text-base font-bold">{name}</h3>
                <p className="text-xs text-slate">
                  {items.length} {items.length === 1 ? "design" : "designs"}
                  {!openSeries && items.length > visible.length && (
                    <>
                      {" · "}
                      <button onClick={() => setOpenSeries(name)} className="underline">
                        see all
                      </button>
                    </>
                  )}
                </p>
              </div>

              {/* Wide tiles, not squares: these are panels and murals, and a
                  square crop throws most of the artwork away. */}
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {visible.map((d) => (
                  <li key={d.id}>
                    <button type="button"
                      onClick={() => setZoom({
                        src: `/api/corporate/designs/${d.id}/image`,
                        alt: d.title,
                        caption: [d.title, d.design_code].filter(Boolean).join(" · "),
                      })}
                      className="block w-full overflow-hidden rounded-[14px] border border-edge text-left">
                      {/* eslint-disable-next-line @next/next/no-img-element --
                          the watermarking proxy already sizes and caches this. */}
                      <img src={`/api/corporate/designs/${d.id}/image`} alt={d.title}
                        className="aspect-[2/1] w-full object-cover" />
                      <span className="block px-3 py-2">
                        <span className="block text-sm font-medium">{d.title}</span>
                        {d.design_code && (
                          <span className="mt-0.5 block text-xs text-slate">{d.design_code}</span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <Lightbox image={zoom} onClose={() => setZoom(null)} />
    </div>
  );
}

/* ────────────────────────── Adding designs ────────────────────────────── */

/** Putting artwork into a portfolio's library.
 *
 *  The same endpoint the reseller portal's library page uses — a portfolio
 *  account simply never had a way to reach it, which is why Knowledge Realty's
 *  library sat empty with the dashboard correctly telling them WE were the
 *  hold-up. Offered to whoever holds the upload right, which for this account
 *  is us signing in as staff.
 *
 *  The collection name is asked for up front rather than edited afterwards,
 *  because it is what the library groups by and a pile of ungrouped designs is
 *  the thing the contact sheet was built to avoid. */
function AddDesigns({
  onDone, onCancel, onError,
}: {
  onDone: (message: string) => Promise<void>;
  onCancel: () => void;
  onError: (e: string | null) => void;
}) {
  // Two ways a design gets into a library, and they PRICE differently — so the
  // choice is made here, in the open, rather than inferred later from whether a
  // product handle happens to be set.
  const [mode, setMode] = useState<"proposal" | "website" | "commissioned">("proposal");
  const [directions, setDirections] = useState<Direction[]>([]);
  const [pickedDirections, setPickedDirections] = useState<Set<string>>(new Set());
  const [files, setFiles] = useState<File[]>([]);
  const [series, setSeries] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<{ handle: string; title: string; imageUrl: string | null }[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  // Loaded when the form opens, because it opens on this mode — the directions
  // we already showed a client are the likeliest thing to be adding.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r = await fetch("/api/corporate/designs/from-proposal", { cache: "no-store" });
        const j = await r.json();
        if (alive && r.ok) setDirections((j.directions ?? []) as Direction[]);
      } catch {
        // A missing list costs one of three ways in, not the form.
      }
    })();
    return () => { alive = false; };
  }, []);

  async function importDirections(e: React.FormEvent) {
    e.preventDefault();
    if (pickedDirections.size === 0) return;
    setBusy(true); onError(null);
    try {
      const r = await fetch("/api/corporate/designs/from-proposal", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionIds: [...pickedDirections] }),
      });
      const j = await r.json();
      if (!r.ok && !j.added) throw new Error(j.error ?? "Could not bring those in.");
      await onDone(`${j.added} design${j.added === 1 ? "" : "s"} added, kept in their own series.`);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not bring those in.");
    } finally { setBusy(false); }
  }

  async function search() {
    if (query.trim().length < 2) return;
    setSearching(true); onError(null);
    try {
      const r = await fetch(`/api/corporate/designs/catalogue?q=${encodeURIComponent(query.trim())}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not search the catalogue.");
      setHits(j.results ?? []);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not search the catalogue.");
    } finally { setSearching(false); }
  }

  async function addFromWebsite(e: React.FormEvent) {
    e.preventDefault();
    if (picked.size === 0) return;
    setBusy(true); onError(null);
    try {
      const r = await fetch("/api/corporate/designs/catalogue", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handles: [...picked], series: series.trim() || undefined }),
      });
      const j = await r.json();
      if (!r.ok && !j.added) throw new Error(j.error ?? "Could not add those designs.");
      // Partial success is normal — name the ones that did not make it rather
      // than throwing away the ones that did.
      const failed = ((j.results ?? []) as { ok: boolean; handle: string; error?: string }[])
        .filter((x) => !x.ok);
      if (failed.length) {
        onError(`Couldn't add: ${failed.map((f) => `${f.handle} (${f.error})`).join("; ")}`);
      }
      await onDone(`${j.added} design${j.added === 1 ? "" : "s"} added from the website.`);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not add those designs.");
    } finally { setBusy(false); }
  }

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (files.length === 0) return;
    setBusy(true); onError(null);
    try {
      // Batched and, for print masters, sent in parts — see library-upload.ts.
      const j = await uploadToLibrary(files, { series });

      // Partial success is the normal case with a folder drag, so name the
      // files that did not make it rather than reporting a count.
      const failed = ((j.results ?? []) as { ok: boolean; name: string; error: string }[])
        .filter((x) => !x.ok);
      if (failed.length) {
        onError(`Couldn't add: ${failed.map((f) => `${f.name} (${f.error})`).join("; ")}`);
      }
      await onDone(`${j.added} design${j.added === 1 ? "" : "s"} added.`);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Upload failed.");
    } finally { setBusy(false); }
  }

  const field = "w-full rounded-[12px] border border-edge bg-wash px-4 py-2.5 text-sm outline-none focus:border-charcoal";

  return (
    <form onSubmit={mode === "proposal" ? importDirections : mode === "website" ? addFromWebsite : upload}
      className="mt-5 rounded-[18px] border border-edge bg-surface p-5">
      <p className="font-display text-sm font-bold">Add designs to this library</p>
      <p className="mt-1 max-w-[54ch] text-xs text-slate">
        They become available immediately, and can be studied on any captured
        wall. Every image is shown watermarked wherever it appears.
      </p>

      {/* The ways in, labelled by what they COST — that is the difference that
          matters, and it is invisible once the design is in the list. */}
      <div className="mt-3 flex flex-wrap gap-1 rounded-[12px] bg-wash p-1">
        {([
          ["proposal", "From a proposal", "the directions we showed them"],
          ["website", "From the website", "priced as that design"],
          ["commissioned", "Commissioned artwork", "priced at this account's rate"],
        ] as const).map(([id, label, note]) => (
          <button key={id} type="button" onClick={() => { setMode(id); onError(null); }}
            className={`flex-1 rounded-[10px] px-3 py-2 text-left text-xs ${
              mode === id ? "bg-surface font-semibold" : "text-slate"}`}>
            <span className="block">{label}</span>
            <span className="mt-0.5 block text-[0.68rem] font-normal text-mist">{note}</span>
          </button>
        ))}
      </div>
      {mode !== "proposal" && (
        <label className="mt-3 block">
          <span className="text-xs text-slate">
            Collection <span className="text-mist">(optional — groups them on this page)</span>
          </span>
          <input value={series} onChange={(e) => setSeries(e.target.value)}
            placeholder="Arrival · calm" className={`mt-1 ${field}`} />
        </label>
      )}
      {mode === "proposal" ? (
        <>
          {directions.length === 0 ? (
            <p className="mt-3 text-sm text-slate">
              No proposal directions to bring in — nothing has been put together
              for this account yet, or it has all been added already.
            </p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {directions.map((d) => {
                const on = pickedDirections.has(d.id);
                return (
                  <li key={d.id}>
                    <button type="button" disabled={d.imported}
                      onClick={() => setPickedDirections((s) => {
                        const next = new Set(s);
                        if (on) next.delete(d.id); else next.add(d.id);
                        return next;
                      })}
                      className={`flex w-full items-center justify-between gap-3 rounded-[12px] border px-4 py-3 text-left disabled:opacity-50 ${
                        on ? "border-charcoal bg-surface" : "border-edge bg-wash"}`}>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">
                          {on ? "✓ " : ""}{d.title}
                        </span>
                        {d.tagline && (
                          <span className="mt-0.5 block text-xs text-slate">{d.tagline}</span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs text-slate">
                        {d.imported ? "already added" : `${d.designs} designs`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {/* Each direction keeps its own name, so the library reads the way the
              deck did rather than as one undifferentiated pile. */}
          <p className="mt-2 text-xs text-mist">
            Each direction comes in as its own collection, under its own name.
          </p>
        </>
      ) : mode === "website" ? (
        <>
          <div className="mt-3 flex gap-2">
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void search(); } }}
              placeholder="Search the website — a name, a mood, a colour"
              className={field} />
            <button type="button" onClick={() => void search()} disabled={searching}
              className="rounded-[10px] border border-edge px-4 py-2 text-xs disabled:opacity-50">
              {searching ? "Searching…" : "Search"}
            </button>
          </div>

          {hits.length > 0 && (
            <ul className="mt-3 grid gap-2 sm:grid-cols-3">
              {hits.map((h) => {
                const on = picked.has(h.handle);
                return (
                  <li key={h.handle}>
                    <button type="button"
                      onClick={() => setPicked((s) => {
                        const next = new Set(s);
                        if (on) next.delete(h.handle); else next.add(h.handle);
                        return next;
                      })}
                      className={`block w-full overflow-hidden rounded-[12px] border text-left ${
                        on ? "border-charcoal" : "border-edge"}`}>
                      {h.imageUrl && (
                        /* eslint-disable-next-line @next/next/no-img-element --
                           a catalogue thumbnail, already sized by the CDN. */
                        <img src={h.imageUrl} alt={h.title} className="aspect-[3/2] w-full object-cover" />
                      )}
                      <span className="block px-2 py-1.5 text-xs">
                        {on ? "✓ " : ""}{h.title}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {picked.size > 0 && <p className="mt-2 text-xs text-slate">{picked.size} chosen.</p>}
        </>
      ) : (
        <>
          <label className="mt-3 block">
            <span className="text-xs text-slate">Artwork</span>
            <input type="file" accept="image/*" multiple
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              className={`mt-1 ${field}`} />
          </label>
          {files.length > 0 && (
            <p className="mt-2 text-xs text-slate">
              {files.length} file{files.length === 1 ? "" : "s"} ready.
            </p>
          )}
        </>
      )}

      <div className="mt-4 flex gap-2">
        <button type="submit"
          disabled={busy || (
            mode === "proposal" ? pickedDirections.size === 0
            : mode === "website" ? picked.size === 0
            : files.length === 0
          )}
          className="btn h-10 px-5 text-[0.8rem] disabled:opacity-50">
          {busy ? "Adding…" : "Add to library"}
        </button>
        <button type="button" onClick={onCancel}
          className="rounded-[10px] border border-edge px-4 py-2 text-xs">Cancel</button>
      </div>
    </form>
  );
}
