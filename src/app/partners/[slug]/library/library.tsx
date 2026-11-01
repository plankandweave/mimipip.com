"use client";

import Image from "@/components/SiteImage";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { uploadToLibrary } from "@/lib/library-upload";

/**
 * The partner's design library.
 *
 * Shaped around the fact that this library is now large — a hundred-odd live
 * designs across a dozen collections — and getting larger, because the partner
 * uploads their own artwork straight into it.
 *
 * So the page opens as a CONTACT SHEET OF COLLECTIONS: every collection shut,
 * one cover image each, four across. A collection of ten designs costs one
 * tile until you ask for it. Opening one swaps the sheet for that collection
 * alone, where the designs are shown whole and wide — these are 2:1 and 4:1
 * panels and a square crop throws most of the artwork away.
 *
 * The old page stacked every collection open down one column, which meant
 * scrolling past sixty full-width images to reach the bottom of the library.
 *
 * Approval is gone (migration 0084): everything here is orderable. What is
 * left of the old workflow is the CONVERSATION — ask the studio for a change
 * and the design stays orderable while they work on it.
 *
 * Every image is served watermarked through /image, so there is no clean
 * original to protect and nothing here blocks saving one. The download button
 * hands over exactly what is on screen: marked `zyvorah.com · ZYVS-XXXXXX`.
 */

type Message = {
  id: string;
  author_kind: "studio" | "approver";
  author_email: string | null;
  body: string | null;
  attachment_url: string | null;
  created_at: string;
};

type Design = {
  id: string;
  title: string;
  design_code: string | null;
  series_name: string | null;
  /** The studio's note on what this series/design concept is. */
  concept_note: string | null;
  status: "pending" | "changes_requested" | "approved" | "archived";
  /** 'studio', 'Roheena', a backfill note — or, for artwork the partner added
   *  themselves, the email of the person who uploaded it. */
  uploaded_by: string | null;
  approved_at: string | null;
  created_at: string;
  corporate_design_messages: Message[];
};

type Can = { upload: boolean; build: boolean; order: boolean; admin: boolean };

const when = (s: string) =>
  new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

const imgUrl = (id: string) => `/api/corporate/designs/${id}/image`;

const LOOSE = "__loose__";

/**
 * Whoever added it, in the form a person would say out loud.
 *
 * `uploaded_by` holds three sorts of thing after years of this table: the
 * literal 'studio', a backfill note from before the portal existed, or — for
 * anything the partner uploaded themselves — the person's email.
 */
function credit(d: Design): string | null {
  const by = (d.uploaded_by ?? "").trim();
  if (!by) return null;
  if (by === "studio" || by.toLowerCase().startsWith("backfill")) return "Added by Zyvorah";
  return `Added by ${by}`;
}

type Collection = { key: string; name: string; items: Design[] };

/**
 * Group designs into collections, newest collection FIRST — Series 3 above
 * Series 2 above Series 1 — with the collectionless pile last.
 *
 * Sorted on the name, not on upload time: the older series were loaded into
 * the system after the newer one, so "most recently uploaded" would put Series
 * 1 on top, which is the opposite of what anyone means by newest.
 */
function collect(designs: Design[]): Collection[] {
  const m = new Map<string, Design[]>();
  for (const d of designs) {
    const k = d.series_name?.trim() || LOOSE;
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(d);
  }
  return [...m.entries()]
    .sort((a, b) =>
      a[0] === LOOSE ? 1 : b[0] === LOOSE ? -1 : b[0].localeCompare(a[0], undefined, { numeric: true }),
    )
    .map(([key, items]) => ({
      key,
      name: key === LOOSE ? "Individual designs" : key,
      items,
    }));
}

export default function DesignLibrary({
  slug, accountName, logoPath, email,
}: {
  slug: string; accountName: string; logoPath: string | null; email: string;
}) {
  const [designs, setDesigns] = useState<Design[]>([]);
  const [can, setCan] = useState<Can>({ upload: false, build: false, order: false, admin: false });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /** The one collection that is open. Null — the default — is everything shut. */
  const [open, setOpen] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/corporate/designs", { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      setDesigns((j.designs ?? []) as Design[]);
      if (j.can) setCan(j.can as Can);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const collections = collect(designs);
  const current = open ? collections.find((c) => c.key === open) ?? null : null;

  return (
    <div className="container-x py-8 sm:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {logoPath && (
            <Image src={logoPath} alt="" width={40} height={40} className="shrink-0 rounded-[10px]" />
          )}
          <div className="min-w-0">
            <h1 className="font-display text-xl font-extrabold leading-tight sm:text-2xl">Design library</h1>
            <p className="truncate text-xs text-slate">{accountName} · {email}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {can.upload && (
            <button onClick={() => setShowUpload((v) => !v)}
              className="h-11 rounded-full border border-edge px-4 text-[0.8rem] font-semibold hover:bg-wash">
              {showUpload ? "Cancel" : "+ Add designs"}
            </button>
          )}
          {can.build && (
            <Link href={`/partners/${slug}/new`} className="btn h-11 px-5 text-[0.8rem]">New print order</Link>
          )}
          <Link href={`/partners/${slug}/orders`} className="text-sm text-slate underline">Your orders</Link>
          <Link href={`/partners/${slug}/team`} className="text-sm text-slate underline">Team</Link>
          <Link href={`/partners/${slug}/settings`} className="text-sm text-slate underline">Account</Link>
        </div>
      </div>

      {err && <p className="mt-4 text-sm text-red-600">{err}</p>}
      {note && <p className="mt-4 text-sm text-emerald-700">{note}</p>}

      {showUpload && can.upload && (
        <UploadPanel
          onDone={(msg) => { setNote(msg); setShowUpload(false); void load(); }}
          onError={setErr}
        />
      )}

      {loading ? (
        <p className="mt-8 text-sm text-slate">Loading the library…</p>
      ) : designs.length === 0 ? (
        <div className="mt-8 rounded-[18px] border border-dashed border-edge bg-wash p-12 text-center">
          <p className="font-display text-lg font-bold">Nothing here yet</p>
          <p className="mt-1 text-sm text-slate">
            {can.upload
              ? "Add your own artwork with the button above, and designs the Zyvorah studio sends will appear here too."
              : "Designs the Zyvorah studio sends will appear here, ready to order."}
          </p>
        </div>
      ) : current ? (
        <OpenCollection
          collection={current} allCollections={collections} slug={slug} can={can}
          onClose={() => setOpen(null)}
          onChanged={load}
          onError={setErr}
        />
      ) : (
        <ContactSheet collections={collections} onOpen={setOpen} />
      )}
    </div>
  );
}

/**
 * Every collection, shut, four across.
 *
 * The tile is deliberately a whole image letterboxed into a fixed box rather
 * than a crop filling it: the grid stays even, and a 4:1 panel is still
 * recognisable as itself. Cropping to fill would make half the tiles a
 * close-up of a leaf.
 */
function ContactSheet({
  collections, onOpen,
}: {
  collections: Collection[]; onOpen: (key: string) => void;
}) {
  return (
    <section className="mt-8">
      <p className="caps text-slate">
        {collections.length} collection{collections.length === 1 ? "" : "s"} · tap one to open it
      </p>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {collections.map((c) => {
          const cover = c.items[0]!;
          return (
            <button key={c.key} onClick={() => onOpen(c.key)}
              className="group overflow-hidden rounded-[16px] border border-edge bg-surface text-left transition hover:border-charcoal/30 hover:shadow-sm">
              <div className="relative flex aspect-[3/2] items-center justify-center bg-wash">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imgUrl(cover.id)} alt="" loading="lazy"
                  className="max-h-full max-w-full object-contain" />
                {c.items.length > 1 && (
                  <span className="absolute bottom-2 right-2 rounded-full bg-charcoal/80 px-2.5 py-1 text-[11px] font-semibold text-white">
                    +{c.items.length - 1}
                  </span>
                )}
              </div>
              <div className="p-3">
                <p className="truncate text-sm font-semibold text-charcoal">{c.name}</p>
                <p className="mt-0.5 text-xs text-slate">
                  {c.items.length} design{c.items.length === 1 ? "" : "s"}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/**
 * One collection, open: its designs whole and wide, two across at most.
 *
 * Also where a design gets MOVED. Collections are not a table — a collection is
 * simply the designs sharing a series name — so putting a design in the wrong
 * one is a typo, and unpicking it should be a typo-sized job. Hence: tick the
 * designs here, name the collection they belong in, done. Multi-select because
 * the mistake is nearly always a whole batch that went in under the wrong name.
 */
function OpenCollection({
  collection, allCollections, slug, can, onClose, onChanged, onError,
}: {
  collection: Collection; allCollections: Collection[]; slug: string; can: Can;
  onClose: () => void; onChanged: () => Promise<void>; onError: (s: string | null) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  // The concept note is stored per design (a batch carries the same text on
  // every row), so the first non-empty one speaks for the lot. Only a real
  // collection gets a group note — the loose pile mixes unrelated designs
  // whose notes, shown on each card instead, may all differ.
  const note = collection.key !== LOOSE
    ? collection.items.find((d) => d.concept_note?.trim())?.concept_note
    : null;

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const stop = () => { setPicking(false); setPicked(new Set()); };

  // Start from one card: the common case is spotting a single stray design,
  // and making the person flip a mode switch and then find it again is one
  // step too many.
  const moveOne = (id: string) => { setPicking(true); setPicked(new Set([id])); };

  async function move(series: string | null) {
    onError(null);
    const ids = [...picked];
    const results = await Promise.all(ids.map(async (id) => {
      const r = await fetch(`/api/corporate/designs/${id}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "move", series }),
      });
      return r.ok;
    }));
    const failed = results.filter((ok) => !ok).length;
    if (failed > 0) onError(`${failed} design${failed === 1 ? "" : "s"} could not be moved.`);
    stop();
    await onChanged();
  }

  return (
    <section className="mt-8">
      <button onClick={onClose} className="text-sm text-slate underline">← All collections</button>
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-bold sm:text-xl">
          {collection.name} <span className="font-normal text-slate">({collection.items.length})</span>
        </h2>
        {can.upload && (
          <button
            onClick={() => (picking ? stop() : setPicking(true))}
            className="h-9 rounded-full border border-edge px-3 text-xs font-semibold hover:bg-wash">
            {picking ? "Cancel" : "Move designs…"}
          </button>
        )}
      </div>
      {note && (
        <p className="mt-3 whitespace-pre-wrap rounded-[12px] border border-edge bg-surface px-4 py-3 text-sm italic text-slate">
          {note}
        </p>
      )}

      {picking && (
        <MoveBar
          count={picked.size}
          collections={allCollections.filter((c) => c.key !== collection.key)}
          onSelectAll={() => setPicked(new Set(collection.items.map((d) => d.id)))}
          onMove={move}
          onCancel={stop}
        />
      )}

      <div className="mt-4 grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
        {collection.items.map((d) => (
          <Card
            key={d.id} d={d} slug={slug} can={can}
            picking={picking} picked={picked.has(d.id)}
            onPick={() => toggle(d.id)} onMoveOne={() => moveOne(d.id)}
            onChanged={onChanged} onError={onError}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * Where the ticked designs are going.
 *
 * An existing collection by name, a brand-new one, or out of collections
 * altogether — those are the only three destinations there can be, because a
 * collection is just a name on a row.
 */
function MoveBar({
  count, collections, onSelectAll, onMove, onCancel,
}: {
  count: number; collections: Collection[];
  onSelectAll: () => void;
  onMove: (series: string | null) => Promise<void>;
  onCancel: () => void;
}) {
  const NEW = "__new__";
  const [dest, setDest] = useState("");
  const [fresh, setFresh] = useState("");
  const [busy, setBusy] = useState(false);

  const chosen = dest === NEW ? fresh.trim() : dest === LOOSE ? "" : dest;
  const ready = count > 0 && dest !== "" && (dest !== NEW || fresh.trim().length > 0);

  async function go() {
    setBusy(true);
    try { await onMove(chosen || null); } finally { setBusy(false); }
  }

  return (
    <div className="mt-4 rounded-[16px] border border-edge bg-wash p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-sm font-semibold">
          {count === 0
            ? "Tick the designs that are in the wrong collection"
            : `${count} design${count === 1 ? "" : "s"} selected`}
        </p>
        <button onClick={onSelectAll} className="text-xs text-slate underline">Select all</button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select value={dest} onChange={(e) => setDest(e.target.value)}
          className="h-11 rounded-[12px] border border-edge bg-surface px-3 text-sm">
          <option value="">Move to…</option>
          {collections.map((c) => (
            <option key={c.key} value={c.key === LOOSE ? LOOSE : c.name}>{c.name}</option>
          ))}
          <option value={LOOSE}>Individual designs (no collection)</option>
          <option value={NEW}>New collection…</option>
        </select>

        {dest === NEW && (
          <input value={fresh} onChange={(e) => setFresh(e.target.value)}
            placeholder="Name the collection" maxLength={120}
            className="h-11 min-w-[12rem] flex-1 rounded-[12px] border border-edge bg-surface px-3 text-sm" />
        )}

        <button onClick={() => void go()} disabled={!ready || busy}
          className="btn h-11 px-5 text-[0.8rem] disabled:opacity-40">
          {busy ? "Moving…" : "Move"}
        </button>
        <button onClick={onCancel} className="text-xs text-slate underline">Cancel</button>
      </div>
    </div>
  );
}

function Card({
  d, slug, can, picking, picked, onPick, onMoveOne, onChanged, onError,
}: {
  d: Design; slug: string; can: Can;
  picking: boolean; picked: boolean;
  onPick: () => void; onMoveOne: () => void;
  onChanged: () => Promise<void>; onError: (s: string | null) => void;
}) {
  const [openThread, setOpenThread] = useState(false);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const msgs = d.corporate_design_messages ?? [];
  const namedByCode = d.title === d.design_code;
  const by = credit(d);

  async function act(action: "comment" | "remove") {
    setBusy(true); onError(null);
    try {
      const r = await fetch(`/api/corporate/designs/${d.id}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "comment" ? { action, comment } : { action }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not save that.");
      setComment("");
      await onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not save that.");
    } finally { setBusy(false); }
  }

  return (
    <div className={`overflow-hidden rounded-[16px] border bg-surface ${
      picked ? "border-charcoal ring-2 ring-charcoal/20" : "border-edge"}`}>
      {/* Whole image, never cropped — these are wide panels. While picking, the
          image itself is the checkbox: the target you aim at is the artwork,
          because the artwork is what you recognise as misfiled. */}
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imgUrl(d.id)} alt={d.title} loading="lazy" className="block w-full bg-wash" />
        {picking && (
          <button
            onClick={onPick}
            aria-pressed={picked}
            aria-label={picked ? `Deselect ${d.title}` : `Select ${d.title}`}
            className="absolute inset-0 flex items-start justify-start p-3">
            <span className={`flex h-7 w-7 items-center justify-center rounded-full border text-sm font-bold ${
              picked ? "border-charcoal bg-charcoal text-white" : "border-white/80 bg-white/80 text-transparent"}`}>
              ✓
            </span>
          </button>
        )}
      </div>

      <div className="p-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className={`min-w-0 truncate text-sm font-semibold ${namedByCode ? "font-mono tracking-tight" : ""}`}>
            {d.title}
          </p>
          {!namedByCode && d.design_code && (
            <span className="font-mono text-[10px] text-mist">{d.design_code}</span>
          )}
        </div>
        {!d.series_name?.trim() && d.concept_note?.trim() && (
          <p className="mt-1 whitespace-pre-wrap text-xs italic text-slate">{d.concept_note}</p>
        )}
        {by && <p className="mt-1 text-[11px] text-mist">{by} · {when(d.created_at)}</p>}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          {can.build && (
            <Link href={`/partners/${slug}/new?design=${d.id}`}
              className="text-xs font-semibold underline">Order this design</Link>
          )}
          <a href={`${imgUrl(d.id)}?download=1`} download={`${d.design_code ?? d.title}.jpg`}
            className="text-xs text-slate underline">Download</a>
          <button onClick={() => setOpenThread(!openThread)} className="text-xs text-slate underline">
            {openThread ? "Hide" : msgs.length > 0 ? `Conversation (${msgs.length})` : "Ask for a change"}
          </button>
          {can.upload && (
            <button onClick={onMoveOne} className="text-xs text-slate underline">
              Move to another collection
            </button>
          )}
          {can.upload && (
            <button
              onClick={() => {
                if (confirm(`Remove “${d.title}” from the library? Nothing is deleted — we keep the file.`)) {
                  void act("remove");
                }
              }}
              disabled={busy}
              className="text-xs text-red-700 underline disabled:opacity-40">
              Remove
            </button>
          )}
        </div>

        {openThread && (
          <div className="mt-3 border-t border-edge pt-3">
            {msgs.length > 0 && (
              <div className="space-y-3">
                {msgs.map((m) => (
                  <div key={m.id} className={`max-w-[90%] rounded-[14px] px-3 py-2 text-sm ${
                    m.author_kind === "approver" ? "ml-auto bg-wash" : "border border-edge bg-surface"}`}>
                    <p className="text-[11px] font-semibold text-mist">
                      {m.author_kind === "approver" ? m.author_email ?? "Your team" : "Zyvorah studio"} · {when(m.created_at)}
                    </p>
                    {m.body && <p className="mt-1 whitespace-pre-wrap break-words">{m.body}</p>}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 space-y-2">
              <textarea value={comment} onChange={(e) => setComment(e.target.value)}
                placeholder="Ask the studio for a change…" rows={2}
                className="w-full rounded-[12px] border border-edge bg-wash px-3 py-2 text-sm" />
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => void act("comment")} disabled={busy || !comment.trim()}
                  className="h-11 rounded-full border border-edge px-4 text-[0.8rem] text-slate hover:text-charcoal disabled:opacity-40">
                  Send comment
                </button>
                <span className="text-xs text-mist">This design stays orderable meanwhile.</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Drop artwork straight into the library. No approval — see the upload route. */
function UploadPanel({
  onDone, onError,
}: {
  onDone: (msg: string) => void; onError: (s: string | null) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [series, setSeries] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (files.length === 0) return;
    setBusy(true); onError(null);
    try {
      // Batched and, for print masters, sent in parts — see library-upload.ts.
      const j = await uploadToLibrary(files, { series, note });

      // Partial success is the normal case with a folder drag — say exactly
      // which files didn't make it rather than a count nobody can act on.
      const failed = (j.results ?? []).filter((x: { ok: boolean }) => !x.ok) as
        { name: string; error: string }[];
      if (failed.length > 0) {
        onError(`Couldn't add: ${failed.map((f) => `${f.name} (${f.error})`).join("; ")}`);
      }
      onDone(`${j.added} design${j.added === 1 ? "" : "s"} added to the library — ready to order.`);
      setFiles([]); setSeries(""); setNote("");
      if (inputRef.current) inputRef.current.value = "";
    } catch (e) {
      onError(e instanceof Error ? e.message : "Upload failed.");
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="mt-6 rounded-[18px] border border-edge bg-wash p-4 sm:p-5">
      <p className="font-display text-base font-bold">Add designs to the library</p>
      <p className="mt-1 text-xs text-slate">
        Your artwork goes straight in — nothing to approve, ready to print. Up to 25 files at a time,
        60 MB each.
      </p>

      <input
        ref={inputRef} type="file" accept="image/*" multiple
        onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        className="mt-4 block w-full text-sm file:mr-3 file:h-10 file:rounded-full file:border file:border-edge file:bg-surface file:px-4 file:text-[0.8rem] file:font-semibold"
      />
      {files.length > 0 && (
        <p className="mt-2 text-xs text-slate">
          {files.length} file{files.length === 1 ? "" : "s"} selected
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold text-slate">Collection (optional)</span>
          <input value={series} onChange={(e) => setSeries(e.target.value)}
            placeholder="e.g. Diwali 2026"
            className="mt-1 h-11 w-full rounded-[12px] border border-edge bg-surface px-3 text-sm" />
          <span className="mt-1 block text-[11px] text-mist">
            Files sharing a name land in one collection — one tile in the library.
          </span>
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate">Note (optional)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="What this set is for"
            className="mt-1 h-11 w-full rounded-[12px] border border-edge bg-surface px-3 text-sm" />
        </label>
      </div>

      <button type="submit" disabled={busy || files.length === 0}
        className="btn mt-4 h-11 px-5 text-[0.8rem] disabled:opacity-40">
        {busy ? "Uploading…" : `Add ${files.length || ""} to the library`}
      </button>
    </form>
  );
}
