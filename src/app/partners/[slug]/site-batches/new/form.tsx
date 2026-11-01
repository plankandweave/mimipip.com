"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Store = {
  id: string; name: string; city: string | null; state: string;
  address_line: string | null; pincode: string | null; gps: string | null; series_names: string[];
};

type SeriesOption = { name: string; designs: number; local: boolean };

export default function NewSiteBatchForm({ slug, accountName, embedded = false }: { slug: string; accountName: string; embedded?: boolean }) {
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState("");
  // The series the AI may draw from, in the order ticked: the allocator
  // prefers them in this order (site-batch.ts rule 2). Offered from the same
  // pool the allocator uses, so a ticked series can never come back empty.
  const [seriesOptions, setSeriesOptions] = useState<SeriesOption[]>([]);
  const [series, setSeries] = useState<string[]>([]);
  const [brief, setBrief] = useState("");
  const [suggestions, setSuggestions] = useState("");
  const [receivedFrom, setReceivedFrom] = useState("");
  const [atEntrance, setAtEntrance] = useState(true);
  const [measurements, setMeasurements] = useState<File | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [video, setVideo] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; message: string } | null>(null);

  useEffect(() => {
    void fetch("/api/corporate/stores", { cache: "no-store" }).then(async (r) => {
      if (!r.ok) throw new Error("Could not load stores.");
      const rows = ((await r.json()).stores ?? []) as Store[];
      setStores(rows);
    }).catch((e) => setErr(e instanceof Error ? e.message : "Could not load stores."));
  }, []);

  const selected = useMemo(() => stores.find((s) => s.id === storeId) ?? null, [stores, storeId]);

  function chooseStore(id: string) {
    setStoreId(id);
    setSeriesOptions([]);
    const store = stores.find((s) => s.id === id);
    if (!id) { setSeries([]); return; }
    void fetch(`/api/corporate/designs/series?storeId=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error("Could not load the design series.");
        const opts = ((await r.json()).series ?? []) as SeriesOption[];
        setSeriesOptions(opts);
        // Pre-tick the store's standing brief, keeping only series that still
        // have approved designs this store can use.
        const usable = new Set(opts.map((o) => o.name));
        setSeries((store?.series_names ?? []).filter((n) => usable.has(n)));
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load the design series."));
  }

  const toggleSeries = (name: string) =>
    setSeries((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setDone(null);
    if (!storeId || !measurements || !photos.length) {
      setErr("Choose a store, attach the measurement PDF, and attach one photograph of every measured wall.");
      return;
    }
    if (!window.confirm(`Create and release this survey (${photos.length} wall photograph${photos.length === 1 ? "" : "s"}${atEntrance ? "" : ", interior walls only"}) to the AI?`)) return;
    const form = new FormData();
    form.set("storeId", storeId);
    form.set("seriesNames", series.join(","));
    form.set("brief", brief);
    form.set("suggestions", suggestions);
    form.set("receivedFrom", receivedFrom);
    form.set("entrance", atEntrance ? "yes" : "no");
    form.set("measurements", measurements);
    photos.forEach((file) => form.append("photos", file));
    if (video) form.set("video", video);
    setBusy(true);
    try {
      const r = await fetch("/api/corporate/site-batch/import", { method: "POST", body: form });
      const j = await r.json();
      if (!r.ok) { setErr(j.error ?? "Could not create this order."); return; }
      setDone({ id: j.batchId, message: j.message });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "The upload did not complete.");
    } finally { setBusy(false); }
  }

  return (
    <div className={embedded ? "" : "container-x py-8 sm:py-10"}>
      {!embedded && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="caps text-slate">{accountName}</p>
            <h1 className="mt-1 font-display text-2xl font-extrabold">New measured order</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate">
              Upload the site evidence. The AI reads the PDF, matches each photograph to its wall,
              chooses the requested series, composes every print master and prepares the proposal.
            </p>
          </div>
          <Link href={`/partners/${slug}/site-batches`} className="text-sm text-slate underline">Back to surveys</Link>
        </div>
      )}

      {done ? (
        <div className="mt-6 rounded-[18px] border border-emerald-300 bg-emerald-50 p-5">
          <p className="font-semibold text-emerald-900">Order intake created</p>
          <p className="mt-1 text-sm text-emerald-800">{done.message}</p>
          <Link href={`/partners/${slug}/site-batches/${done.id}`}
            className="btn mt-4 inline-flex h-11 items-center px-5 text-[0.8rem]">Open the live proposal</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 max-w-3xl space-y-5 rounded-[20px] border border-edge bg-surface p-5">
          <div>
            <label className="text-sm font-semibold">Store</label>
            <select required value={storeId} onChange={(e) => chooseStore(e.target.value)}
              className="mt-2 h-12 w-full rounded-[12px] border border-edge bg-white px-3 text-sm">
              <option value="">Choose the physical store</option>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name} · {[s.city, s.state].filter(Boolean).join(", ")}</option>)}
            </select>
            {selected && (
              <div className="mt-2 text-xs text-slate">
                <p>{[selected.address_line, selected.city, selected.state, selected.pincode].filter(Boolean).join(", ") || "No address saved."}</p>
                {selected.gps && <a href={selected.gps} target="_blank" rel="noreferrer" className="underline">Open Google Maps</a>}
              </div>
            )}
            <p className="mt-2 text-xs text-mist">
              Wrong or missing location? <Link href={`/partners/${slug}/stores`} className="underline">Add or edit the store first</Link>—including its Google Maps link.
            </p>
          </div>

          <fieldset>
            <legend className="text-sm font-semibold">Design series</legend>
            {!storeId ? (
              <p className="mt-2 text-xs text-mist">Choose the store first — the list shows only series with approved designs that store can use.</p>
            ) : seriesOptions.length === 0 ? (
              <p className="mt-2 text-xs text-mist">Loading the series…</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {seriesOptions.map((o) => {
                  const on = series.includes(o.name);
                  const rank = series.indexOf(o.name) + 1;
                  return (
                    <label key={o.name}
                      className={`flex min-h-[40px] cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-sm ${on ? "border-charcoal bg-charcoal text-white" : "border-edge bg-white"}`}>
                      <input type="checkbox" checked={on} onChange={() => toggleSeries(o.name)} className="sr-only" />
                      {on && <span className="text-[11px] font-semibold opacity-80">{rank}</span>}
                      <span>{o.name}</span>
                      <span className={`text-[11px] ${on ? "opacity-70" : "text-mist"}`}>{o.local ? "local · " : ""}{o.designs}</span>
                    </label>
                  );
                })}
              </div>
            )}
            <p className="mt-1 text-xs text-mist">
              Tick in order of preference — the AI uses the first ticked series most and moves to the next when it runs out. No design repeats in the store either way.
              {series.length === 0 && storeId ? " Nothing ticked: the AI chooses from the whole approved library." : ""}
            </p>
          </fieldset>

          <div>
            <label className="text-sm font-semibold">Order received from <span className="font-normal text-mist">(optional)</span></label>
            <input value={receivedFrom} onChange={(e) => setReceivedFrom(e.target.value)} maxLength={160}
              placeholder="Who sent this order, e.g. Amit (WhatsApp group)"
              className="mt-2 w-full rounded-[12px] border border-edge px-3 py-3 text-sm" />
          </div>

          <div>
            <label className="text-sm font-semibold">Head-office brief</label>
            <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={3}
              placeholder="What should the AI understand about this store?"
              className="mt-2 w-full rounded-[12px] border border-edge px-3 py-3 text-sm" />
          </div>

          {/* Where the survey starts decides which walls lead with the city
              collection: a whole floor begins at the door (wall 1 on the
              left, last wall on the right); interior walls have no entrance
              wall at all. The allocator cannot see this — the uploader can. */}
          <div className="rounded-[12px] border border-edge p-3">
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" checked={atEntrance} onChange={(e) => setAtEntrance(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-charcoal" />
              <span>
                <span className="font-semibold">This survey starts at the store entrance</span>
                <span className="mt-0.5 block text-xs text-mist">
                  Ticked: wall 1 is the first wall on the left of the door and the last wall is the first on the right — both lead with the city&rsquo;s own collection.
                  Untick for interior walls only (a washing-machine run, a refrigerator run): no wall is treated as the entrance and none carries city artwork.
                </span>
              </span>
            </label>
          </div>

          <FileField label="Measurement drawing (PDF)" accept="application/pdf"
            note="The AI reads dimensions only from this drawing—never from photographs. Every area the drawing marks for wallpaper becomes one wall."
            onFiles={(files) => setMeasurements(files[0] ?? null)} />
          <FileField label="Wall photographs" accept="image/*" multiple
            note="One clear photograph of each physical wall. A wall carrying several wallpaper bands needs just one photograph — the bands share it. Filenames do not need to match the drawing."
            onFiles={setPhotos} />

          <div>
            <label className="text-sm font-semibold">Zyvorah&rsquo;s suggestions <span className="font-normal text-mist">(optional)</span></label>
            <textarea value={suggestions} onChange={(e) => setSuggestions(e.target.value)} rows={3}
              placeholder={"A wall on the drawing that is not marked for wallpaper but should be, and why — e.g. \"the lower right-hand panel under Wallpaper 6, 9'-2\" × 6'-10\": it is seen through the staircase from the entrance\"."}
              className="mt-2 w-full rounded-[12px] border border-edge px-3 py-3 text-sm" />
            <p className="mt-1 text-xs text-mist">
              Each suggestion is measured from the drawing, given a creative like every other wall, and shown to the approver below their own walls as an optional addition with your reason. It is never released to print unless they tick it.
            </p>
          </div>
          <FileField label="Walkthrough video (optional)" accept="video/*"
            note="Kept with the survey as site evidence; the wall photographs drive placement. Maximum 25 MB."
            onFiles={(files) => setVideo(files[0] ?? null)} />

          {err && <p className="text-sm text-red-700">{err}</p>}
          <button type="submit" disabled={busy}
            className="btn h-12 w-full px-6 text-[0.82rem] disabled:opacity-50">
            {busy ? "Reading measurements and matching walls…" : "Create & release to AI"}
          </button>
          <p className="text-center text-xs text-mist">
            This authorises the AI workflow immediately. You still approve the finished proposal before anything prints.
          </p>
        </form>
      )}
    </div>
  );
}

function FileField({
  label, accept, multiple = false, note, onFiles,
}: { label: string; accept: string; multiple?: boolean; note: string; onFiles: (files: File[]) => void }) {
  return (
    <div>
      <label className="text-sm font-semibold">{label}</label>
      <input type="file" accept={accept} multiple={multiple} onChange={(e) => onFiles(Array.from(e.target.files ?? []))}
        className="mt-2 block w-full rounded-[12px] border border-edge p-3 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-charcoal file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white" />
      <p className="mt-1 text-xs text-mist">{note}</p>
    </div>
  );
}
