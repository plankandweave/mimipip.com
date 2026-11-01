"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Lightbox, { type LightboxImage } from "@/components/Lightbox";
import VoiceNote, { type Recording } from "@/components/VoiceNote";
import WalkthroughPanel from "./walkthrough-panel";
import { areaLabel, type AreaRow } from "@/lib/portfolio";
import {
  feetFromMm, mmFromFeet, num, showFeet, sizeProblem, sqft,
} from "@/lib/wall-measure";

// Capturing the walls of one space.
//
// This opens INSIDE the dashboard — it is a panel, not a page, so nothing
// navigates and the back button still means "leave the portal", not "undo one
// click". The building and floor above it stay on screen for the same reason.
//
// Two things the retail survey did not need, and this does:
//   · a BRIEF — what the wall should say — spoken or typed
//   · sizes that read naturally at commercial scale (a 30 m lobby run)
//
// The measurements are saved BEFORE the photo or the recording is attached.
// That ordering is the whole reliability story on a lift-lobby connection: a
// failed upload becomes a retry against a wall that already exists, never a
// lost wall.

const MAX_EDGE_PX = 2200;
const JPEG_QUALITY = 0.82;

type Wall = {
  id: string; seq: number; name: string;
  width_mm: number; height_mm: number;
  photo_path: string | null; photo_error: string | null;
  photoUrl: string | null;
  notes: string | null; brief: string | null;
  voice_path: string | null; voice_seconds: number | null;
  voice_transcript: string | null; voice_error: string | null;
  voiceUrl: string | null;
};

/** Re-encode through a canvas so what leaves the phone is a right-way-up JPEG of
 *  known size. An iPhone hands over HEIC otherwise, which the server rejects.
 *  createImageBitmap applies EXIF orientation for us. */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const blob = await new Promise<Blob | null>((res) =>
    canvas.toBlob(res, "image/jpeg", JPEG_QUALITY));
  if (!blob) throw new Error("could not read that photo");
  return blob;
}

const field =
  "w-full rounded-[12px] border border-edge bg-wash px-3 py-2.5 text-sm outline-none focus:border-charcoal";

export default function AreaWalls({
  area, buildingName, onBack, canEdit,
}: {
  area: AreaRow;
  buildingName: string;
  onBack: () => void;
  canEdit: boolean;
}) {
  const [walls, setWalls] = useState<Wall[]>([]);
  const [released, setReleased] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [zoom, setZoom] = useState<LightboxImage | null>(null);
  // The walkthrough replaces this panel in place — it is another way to fill
  // the same space with walls, not a different part of the portal.
  const [walking, setWalking] = useState(false);

  const fetchWalls = useCallback(async () => {
    const r = await fetch(`/api/corporate/walls?areaId=${encodeURIComponent(area.id)}`, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok || !j.ok) throw new Error(j.error ?? "Could not load these walls.");
    return { walls: (j.walls ?? []) as Wall[], released: Boolean(j.released) };
  }, [area.id]);

  /** Re-read after a change. */
  const load = useCallback(async () => {
    try {
      const { walls, released } = await fetchWalls();
      setWalls(walls); setReleased(released); setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load these walls.");
    }
  }, [fetchWalls]);

  // The first read. `alive` is not ceremony: these photos carry signed URLs and
  // someone flicking between two lobbies on a slow connection can have the
  // earlier response land after the later one, painting the wrong space's walls
  // under the right space's heading.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const { walls, released } = await fetchWalls();
        if (!alive) return;
        setWalls(walls); setReleased(released); setErr(null);
      } catch (e) {
        if (!alive) return;
        setErr(e instanceof Error ? e.message : "Could not load these walls.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [fetchWalls]);

  const editable = canEdit && !released;
  const total = walls.reduce((n, w) => n + sqft(w.width_mm, w.height_mm), 0);

  if (walking) {
    return (
      <WalkthroughPanel
        area={area}
        canEdit={editable}
        onBack={() => setWalking(false)}
        onWallsAdded={load}
      />
    );
  }

  return (
    <div className="mt-6">
      <button onClick={onBack} className="text-xs text-slate underline">
        ← All buildings
      </button>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold leading-tight">{areaLabel(area)}</h2>
          <p className="mt-0.5 text-xs text-slate">
            {buildingName}
            {walls.length > 0 && ` · ${walls.length} ${walls.length === 1 ? "wall" : "walls"} · ${total.toFixed(0)} sq ft`}
          </p>
        </div>
        {editable && !adding && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setWalking(true)}
              className="rounded-[10px] border border-edge px-4 py-2 text-xs">
              Walk this space
            </button>
            <button onClick={() => { setAdding(true); setEditing(null); }}
              className="btn h-10 px-4 text-[0.8rem]">Add a wall</button>
          </div>
        )}
      </div>

      {area.brief && (
        <p className="mt-3 rounded-[12px] bg-wash px-4 py-3 text-sm text-slate">{area.brief}</p>
      )}

      {released && (
        // Not a permissions error — a state. Say what happened and who can undo
        // it, because the person reading this did not do it.
        <p className="mt-3 rounded-[12px] border border-edge bg-surface px-4 py-3 text-sm">
          This space has been sent for design. Ask us to reopen it to change a wall.
        </p>
      )}

      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

      {adding && (
        <WallForm areaId={area.id} onDone={async () => { setAdding(false); await load(); }}
          onCancel={() => setAdding(false)} />
      )}

      {loading ? (
        <p className="mt-6 text-sm text-slate">Loading…</p>
      ) : walls.length === 0 && !adding ? (
        <div className="mt-6 rounded-[18px] border border-dashed border-edge bg-wash px-6 py-10 text-center">
          <p className="font-display text-base font-bold">No walls captured yet</p>
          <p className="mx-auto mt-1.5 max-w-[46ch] text-sm text-slate">
            The quickest way is to walk the space once with your phone, talking as
            you go — it marks the walls and photographs them for you. Or add them
            one at a time.
          </p>
          {editable && (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button onClick={() => setWalking(true)} className="btn h-10 px-5 text-[0.8rem]">
                Walk this space
              </button>
              <button onClick={() => setAdding(true)}
                className="rounded-[10px] border border-edge px-4 py-2 text-xs">
                Add one wall
              </button>
            </div>
          )}
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {walls.map((w) => (
            <li key={w.id}>
              {editing === w.seq ? (
                <WallForm
                  areaId={area.id} wall={w}
                  onDone={async () => { setEditing(null); await load(); }}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <WallCard
                  wall={w} areaId={area.id} editable={editable}
                  onEdit={() => { setEditing(w.seq); setAdding(false); }}
                  onChanged={load}
                  onZoom={setZoom}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      <Lightbox image={zoom} onClose={() => setZoom(null)} />
    </div>
  );
}

/* ────────────────────────── One wall ──────────────────────────────────── */

function WallCard({
  wall, areaId, editable, onEdit, onChanged, onZoom,
}: {
  wall: Wall; areaId: string; editable: boolean;
  onEdit: () => void;
  onChanged: () => Promise<void>;
  onZoom: (i: LightboxImage) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const size = `${showFeet(wall.width_mm)} × ${showFeet(wall.height_mm)} · ${sqft(wall.width_mm, wall.height_mm).toFixed(0)} sq ft`;

  /** sign → PUT straight to storage → commit. Never throws: a photo failure
   *  must not take the wall with it. */
  async function sendPhoto(file: File) {
    setErr(null); setBusy("photo");
    try {
      const blob = await shrink(file);
      const signRes = await fetch("/api/corporate/walls/photo", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sign", areaId, seq: wall.seq, bytes: blob.size, contentType: "image/jpeg" }),
      });
      const sign = await signRes.json();
      if (!signRes.ok || !sign.ok) throw new Error(sign.error ?? "Could not start the upload.");

      // Straight to storage. No auth header — the signed URL carries its own.
      const put = await fetch(sign.signedUrl as string, {
        method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: blob,
      });
      if (!put.ok) throw new Error("The photo didn't upload — check your signal and try again.");

      const commitRes = await fetch("/api/corporate/walls/photo", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "commit", areaId, seq: wall.seq }),
      });
      const commit = await commitRes.json();
      if (!commitRes.ok || !commit.ok) throw new Error(commit.error ?? "That photo didn't save.");
      await onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That photo didn't save.");
    } finally { setBusy(null); }
  }

  async function sendVoice(r: Recording) {
    setErr(null); setBusy("voice");
    try {
      const signRes = await fetch("/api/corporate/walls/voice", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sign", areaId, seq: wall.seq,
          bytes: r.blob.size, contentType: r.contentType,
        }),
      });
      const sign = await signRes.json();
      if (!signRes.ok || !sign.ok) throw new Error(sign.error ?? "Could not start the upload.");

      const put = await fetch(sign.signedUrl as string, {
        method: "PUT", headers: { "Content-Type": r.contentType }, body: r.blob,
      });
      if (!put.ok) throw new Error("The recording didn't upload — check your signal and try again.");

      const commitRes = await fetch("/api/corporate/walls/voice", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "commit", areaId, seq: wall.seq,
          contentType: r.contentType, seconds: r.seconds,
        }),
      });
      const commit = await commitRes.json();
      if (!commitRes.ok || !commit.ok) throw new Error(commit.error ?? "That recording didn't save.");
      await onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That recording didn't save.");
    } finally { setBusy(null); }
  }

  async function removeVoice() {
    setBusy("voice");
    try {
      await fetch("/api/corporate/walls/voice", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", areaId, seq: wall.seq }),
      });
      await onChanged();
    } finally { setBusy(null); }
  }

  async function removeWall() {
    if (!confirm(`Remove "${wall.name}"? Its photo and recording go too.`)) return;
    setBusy("delete");
    try {
      const r = await fetch("/api/corporate/walls", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", areaId, seq: wall.seq }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Could not remove that wall.");
      await onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not remove that wall.");
    } finally { setBusy(null); }
  }

  return (
    <div className="rounded-[16px] border border-edge bg-surface p-4">
      <div className="flex flex-wrap gap-4">
        {/* Photo. A thumbnail that opens full-screen and comes back. */}
        <div className="w-full sm:w-[168px]">
          {wall.photoUrl ? (
            <button type="button"
              onClick={() => onZoom({
                src: wall.photoUrl!, alt: wall.name, caption: `${wall.name} · ${size}`,
              })}
              className="block w-full overflow-hidden rounded-[12px] border border-edge">
              {/* eslint-disable-next-line @next/next/no-img-element -- signed
                  storage URL, expires in minutes; the optimiser cannot fetch it. */}
              <img src={wall.photoUrl} alt={wall.name}
                className="h-[120px] w-full object-cover sm:h-[112px]" />
            </button>
          ) : (
            <div className="flex h-[120px] w-full items-center justify-center rounded-[12px] border border-dashed border-edge bg-wash px-3 text-center sm:h-[112px]">
              <p className="text-xs text-slate">
                {wall.photo_error ? `Photo failed — ${wall.photo_error}` : "No photo yet"}
              </p>
            </div>
          )}
          {editable && (
            <>
              <button type="button" onClick={() => fileRef.current?.click()} disabled={Boolean(busy)}
                className="mt-2 w-full rounded-[10px] border border-edge px-3 py-1.5 text-xs disabled:opacity-50">
                {busy === "photo" ? "Uploading…" : wall.photoUrl ? "Replace photo" : "Add photo"}
              </button>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void sendPhoto(f);
                }} />
            </>
          )}
        </div>

        {/* The wall itself. */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium">
                <span className="text-slate">{wall.seq}.</span> {wall.name}
              </p>
              <p className="mt-0.5 text-xs text-slate">{size}</p>
            </div>
            {editable && (
              <div className="flex gap-2">
                <button onClick={onEdit} className="text-xs text-slate underline">Edit</button>
                <button onClick={() => void removeWall()} disabled={Boolean(busy)}
                  className="text-xs text-slate underline disabled:opacity-50">Remove</button>
              </div>
            )}
          </div>

          {wall.brief && <p className="mt-2 whitespace-pre-wrap text-sm">{wall.brief}</p>}
          {wall.notes && (
            <p className="mt-1.5 text-xs text-slate">Site note: {wall.notes}</p>
          )}

          <div className="mt-3">
            <VoiceNote
              existingUrl={wall.voiceUrl}
              existingSeconds={wall.voice_seconds}
              transcript={wall.voice_transcript}
              note={wall.voice_error}
              disabled={!editable || Boolean(busy)}
              onRecorded={sendVoice}
              onRemove={removeVoice}
            />
          </div>

          {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────── Add / edit ────────────────────────────────── */

function WallForm({
  areaId, wall, onDone, onCancel,
}: {
  areaId: string; wall?: Wall;
  onDone: () => Promise<void>; onCancel: () => void;
}) {
  // Seeded once, at mount, from the wall being edited. Deliberately initialisers
  // rather than an effect that syncs from props: the form is unmounted when
  // editing stops, so there is no later prop change to track — and a sync effect
  // would overwrite half-typed measurements the moment anything re-rendered.
  const seedFt = wall ? feetFromMm(wall.width_mm) : null;
  const seedHt = wall ? feetFromMm(wall.height_mm) : null;

  const [unit, setUnit] = useState<"ft" | "mm">("ft");
  const [name, setName] = useState(wall?.name ?? "");
  const [brief, setBrief] = useState(wall?.brief ?? "");
  const [notes, setNotes] = useState(wall?.notes ?? "");
  const [wFt, setWFt] = useState(seedFt ? String(seedFt.ft) : "");
  const [wIn, setWIn] = useState(seedFt?.inch ? String(seedFt.inch) : "");
  const [hFt, setHFt] = useState(seedHt ? String(seedHt.ft) : "");
  const [hIn, setHIn] = useState(seedHt?.inch ? String(seedHt.inch) : "");
  const [wMm, setWMm] = useState(wall ? String(wall.width_mm) : "");
  const [hMm, setHMm] = useState(wall ? String(wall.height_mm) : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const widthMm = unit === "ft" ? mmFromFeet(num(wFt), num(wIn)) : Math.round(num(wMm));
  const heightMm = unit === "ft" ? mmFromFeet(num(hFt), num(hIn)) : Math.round(num(hMm));
  const problem = sizeProblem(widthMm, heightMm);
  const area = widthMm > 0 && heightMm > 0 ? sqft(widthMm, heightMm) : 0;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      const r = await fetch("/api/corporate/walls", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save", areaId, seq: wall?.seq,
          name, widthMm, heightMm, brief, notes,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Could not save that wall.");
      await onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save that wall.");
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={save} className="rounded-[16px] border border-edge bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-display text-sm font-bold">
          {wall ? `Wall ${wall.seq}` : "New wall"}
        </p>
        <div className="flex gap-1 rounded-[10px] bg-wash p-1">
          {(["ft", "mm"] as const).map((u) => (
            <button key={u} type="button" onClick={() => setUnit(u)}
              className={`rounded-[8px] px-2.5 py-1 text-xs ${unit === u ? "bg-surface font-semibold" : "text-slate"}`}>
              {u === "ft" ? "feet" : "mm"}
            </button>
          ))}
        </div>
      </div>

      <label className="mt-3 block">
        <span className="text-xs text-slate">Which wall?</span>
        <input required autoFocus value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Facing the entrance" className={`mt-1 ${field}`} />
      </label>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <span className="text-xs text-slate">Width</span>
          {unit === "ft" ? (
            <div className="mt-1 flex gap-2">
              <input inputMode="decimal" value={wFt} onChange={(e) => setWFt(e.target.value)}
                placeholder="ft" className={field} aria-label="Width in feet" />
              <input inputMode="decimal" value={wIn} onChange={(e) => setWIn(e.target.value)}
                placeholder="in" className={field} aria-label="Width in inches" />
            </div>
          ) : (
            <input inputMode="numeric" value={wMm} onChange={(e) => setWMm(e.target.value)}
              placeholder="mm" className={`mt-1 ${field}`} aria-label="Width in millimetres" />
          )}
        </div>
        <div>
          <span className="text-xs text-slate">Height</span>
          {unit === "ft" ? (
            <div className="mt-1 flex gap-2">
              <input inputMode="decimal" value={hFt} onChange={(e) => setHFt(e.target.value)}
                placeholder="ft" className={field} aria-label="Height in feet" />
              <input inputMode="decimal" value={hIn} onChange={(e) => setHIn(e.target.value)}
                placeholder="in" className={field} aria-label="Height in inches" />
            </div>
          ) : (
            <input inputMode="numeric" value={hMm} onChange={(e) => setHMm(e.target.value)}
              placeholder="mm" className={`mt-1 ${field}`} aria-label="Height in millimetres" />
          )}
        </div>
      </div>

      {area > 0 && (
        <p className="mt-2 text-xs text-slate">
          {showFeet(widthMm)} × {showFeet(heightMm)} · {area.toFixed(0)} sq ft
        </p>
      )}

      <label className="mt-3 block">
        <span className="text-xs text-slate">
          What should this wall say? <span className="text-mist">(you can record it instead, once saved)</span>
        </span>
        <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={3}
          placeholder="First thing anyone sees walking in — should feel calm and confident, not loud."
          className={`mt-1 ${field}`} />
      </label>

      <label className="mt-3 block">
        <span className="text-xs text-slate">
          Anything on the wall itself? <span className="text-mist">(optional)</span>
        </span>
        <input value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="Socket at 400 mm, column returns 300 mm" className={`mt-1 ${field}`} />
      </label>

      {problem && (widthMm > 0 || heightMm > 0) && (
        <p className="mt-3 text-sm text-red-600">{problem}</p>
      )}
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={busy || Boolean(problem) || !name.trim()}
          className="btn h-10 px-5 text-[0.8rem] disabled:opacity-50">
          {busy ? "Saving…" : wall ? "Save wall" : "Add wall"}
        </button>
        <button type="button" onClick={onCancel}
          className="rounded-[10px] border border-edge px-4 py-2 text-xs">Cancel</button>
      </div>
      {!wall && (
        <p className="mt-2 text-xs text-mist">
          Save it first, then add the photo and the spoken brief.
        </p>
      )}
    </form>
  );
}
