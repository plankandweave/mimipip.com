"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The store walk-through, on the phone of whoever is doing the walking.
 *
 * Written for one situation: a person standing in a showroom with a tape
 * measure in one hand and a phone in the other, who has never seen this page
 * before and will never see it again. So:
 *
 *   · Feet and inches by default. Every shopfitter and store manager in India
 *     measures in feet; asking for millimetres invites a decimal-point error
 *     that reaches a printer. Millimetres are one tap away for anyone who
 *     works in them, and the converted value is always shown, so the number
 *     that will be printed is never hidden.
 *   · A wall is saved the moment it is added, not at the end. A dropped
 *     signal, a locked phone or a killed tab loses at most the wall being
 *     typed — the API keys on (batch, seq) so the retry overwrites.
 *   · A failed photo is loud and blocks sending. The allocator chooses artwork
 *     by LOOKING at each wall; a silently missing photo produces a confident
 *     bad answer downstream, which is worse than a stop here.
 *
 * The photo bytes never touch a Vercel function: the page asks for a signed
 * slot, PUTs the JPEG straight to storage, then asks the API to verify what
 * landed. See the route for why (a 4.5 MB request cap versus forty photos).
 */

type Wall = {
  seq: number;
  name: string;
  room: string | null;
  widthMm: number;
  heightMm: number;
  note: string | null;
  hasPhoto: boolean;
  photoError: string | null;
  photoUrl: string | null;
};

type Payload = {
  ok: true;
  state: "ok" | "submitted";
  store: { name: string; city: string | null; state: string; addressLine: string | null; floors: number | null };
  account: { name: string };
  brief: string | null;
  expiresAt: string;
  submittedAt: string | null;
  wallCap: number;
  walls: Wall[];
};

const MM_PER_IN = 25.4;
/** Downscaled on the phone before it is sent. A 12 MP camera JPEG is ~4 MB and
 *  tells the model nothing a 2200 px edge does not; the cap exists so a store
 *  with 40 walls on a 4G connection finishes in this lifetime. */
const MAX_EDGE_PX = 2200;
const JPEG_QUALITY = 0.82;

type Unit = "ft" | "mm";

const mmFromFeet = (ft: number, inch: number) => Math.round((ft * 12 + inch) * MM_PER_IN);
const feetFromMm = (mm: number) => {
  const totalIn = mm / MM_PER_IN;
  let ft = Math.floor(totalIn / 12);
  let inch = Math.round(totalIn - ft * 12);
  // Carry. 2743 mm is 107.99 inches, which floors to 8 ft and rounds to 12 in —
  // so a wall entered as 9 ft read back as "8′ 12″". The stored millimetres
  // were right, but the person who had just typed 9 was being told they had
  // measured something else, on the one screen whose whole job is to be
  // trusted about numbers.
  if (inch >= 12) { ft += 1; inch = 0; }
  return { ft, inch };
};
const showFeet = (mm: number) => {
  const { ft, inch } = feetFromMm(mm);
  return inch ? `${ft}′ ${inch}″` : `${ft}′`;
};
const sqft = (w: number, h: number) => (w / 304.8) * (h / 304.8);
const num = (v: string) => {
  const n = Number(v.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** Re-encode through a canvas so what leaves the phone is a right-way-up JPEG
 *  of known size. An iPhone hands over HEIC otherwise, which the server would
 *  have to reject. createImageBitmap applies EXIF orientation for us. */
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

export default function MeasureSurvey({ token, plausible }: { token: string; plausible: boolean }) {
  const api = `/api/measure/${encodeURIComponent(token)}`;

  const [data, setData] = useState<Payload | null>(null);
  const [dead, setDead] = useState<string | null>(plausible ? null : "This link is not active.");
  const [loading, setLoading] = useState(plausible);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  // The wall being typed. Kept out of `data` so a background refresh cannot
  // wipe half-entered measurements.
  const [unit, setUnit] = useState<Unit>("ft");
  const [name, setName] = useState("");
  const [room, setRoom] = useState("");
  const [wFt, setWFt] = useState(""); const [wIn, setWIn] = useState("");
  const [hFt, setHFt] = useState(""); const [hIn, setHIn] = useState("");
  const [wMm, setWMm] = useState(""); const [hMm, setHMm] = useState("");
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const pendingPhoto = useRef<File | null>(null);
  const [pendingName, setPendingName] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(api, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || !j.ok) { setDead(j.error ?? "This link is not active."); return; }
      setData(j as Payload);
    } catch {
      setErr("No signal just then — your saved walls are safe. Try again in a moment.");
    } finally { setLoading(false); }
  }, [api]);

  useEffect(() => { if (plausible) void load(); }, [load, plausible]);

  const widthMm = unit === "ft" ? mmFromFeet(num(wFt), num(wIn)) : Math.round(num(wMm));
  const heightMm = unit === "ft" ? mmFromFeet(num(hFt), num(hIn)) : Math.round(num(hMm));
  const sized = widthMm > 0 && heightMm > 0;

  function resetForm() {
    setName(""); setRoom(""); setNote("");
    setWFt(""); setWIn(""); setHFt(""); setHIn(""); setWMm(""); setHMm("");
    setEditing(null); pendingPhoto.current = null; setPendingName(null);
  }

  function startEdit(w: Wall) {
    setEditing(w.seq);
    setName(w.name); setRoom(w.room ?? ""); setNote(w.note ?? "");
    if (unit === "ft") {
      const a = feetFromMm(w.widthMm), b = feetFromMm(w.heightMm);
      setWFt(String(a.ft)); setWIn(a.inch ? String(a.inch) : "");
      setHFt(String(b.ft)); setHIn(b.inch ? String(b.inch) : "");
    } else { setWMm(String(w.widthMm)); setHMm(String(w.heightMm)); }
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /** sign → PUT straight to storage → commit. Returns the error to show on the
   *  wall, or null. Never throws: a photo failure must not lose the wall. */
  async function sendPhoto(seq: number, file: File): Promise<string | null> {
    try {
      const blob = await shrink(file);
      const signRes = await fetch(`${api}/photo`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sign", seq, bytes: blob.size, contentType: "image/jpeg" }),
      });
      const sign = await signRes.json();
      if (!signRes.ok || !sign.ok) return sign.error ?? "Could not start the upload.";

      // Bare bytes, not multipart: /api/media-upload stores the request body
      // verbatim in R2. The old Supabase Storage contract wrapped the file in a
      // FormData envelope, and that envelope is what got stored — sharp then
      // rejected every wall photo as "unreadable image".
      const put = await fetch(sign.signedUrl as string, {
        method: "PUT", headers: { "content-type": "image/jpeg" }, body: blob,
      });
      if (!put.ok) return "The photo didn't upload — check your signal and try again.";

      const commitRes = await fetch(`${api}/photo`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "commit", seq }),
      });
      const commit = await commitRes.json();
      if (!commitRes.ok || !commit.ok) return commit.error ?? "That photo didn't save.";
      return null;
    } catch (e) {
      return e instanceof Error && e.message ? e.message : "Could not read that photo.";
    }
  }

  async function addWall() {
    if (!sized) return;
    setBusy("wall"); setErr(null); setSent(null);
    try {
      const r = await fetch(`${api}/wall`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seq: editing ?? undefined,
          name: name.trim() || undefined,
          room: room.trim() || undefined,
          note: note.trim() || undefined,
          widthMm, heightMm,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) { setErr(j.error ?? "Could not save that wall."); return; }

      // The wall is safe from here. The photo is a second, separate step, and
      // its failure is reported on the wall rather than losing the entry.
      const file = pendingPhoto.current;
      if (file) {
        setBusy("photo");
        const photoErr = await sendPhoto(j.seq as number, file);
        if (photoErr) setErr(`Wall saved. The photo didn't: ${photoErr}`);
      }
      resetForm();
      await load();
    } catch {
      setErr("No signal just then. Try that again.");
    } finally { setBusy(null); }
  }

  async function replacePhoto(seq: number, file: File) {
    setBusy(`photo-${seq}`); setErr(null);
    const photoErr = await sendPhoto(seq, file);
    if (photoErr) setErr(photoErr);
    await load();
    setBusy(null);
  }

  async function removeWall(seq: number) {
    if (!confirm(`Remove wall ${seq}? Its photo goes with it.`)) return;
    setBusy(`del-${seq}`); setErr(null);
    try {
      const r = await fetch(`${api}/wall?seq=${seq}`, { method: "DELETE" });
      if (!r.ok) setErr((await r.json()).error ?? "Could not remove that wall.");
      if (editing === seq) resetForm();
      await load();
    } finally { setBusy(null); }
  }

  async function submit(allowMissingPhotos = false) {
    setBusy("submit"); setErr(null);
    try {
      const r = await fetch(`${api}/submit`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowMissingPhotos }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        if (j.needs === "photos") {
          const which = (j.missing as number[]).join(", ");
          if (confirm(
            `${j.error}\n\nWall ${which} will be measured but not designed from a photo — ` +
            `head office will see that it was sent without one.\n\nSend anyway?`,
          )) { await submit(true); return; }
          setErr(j.error);
          return;
        }
        setErr(j.error ?? "Could not send that.");
        return;
      }
      setSent(j.message ?? "Sent to head office.");
      await load();
    } catch {
      setErr("No signal just then — nothing was sent. Try again.");
    } finally { setBusy(null); }
  }

  // ── Screens that are not the form ──────────────────────────────────────────
  if (loading) {
    return <div className="container-x py-16 text-center text-sm text-slate">Opening…</div>;
  }
  if (dead) {
    return (
      <div className="container-x py-16 text-center">
        <h1 className="font-display text-xl font-extrabold">This link isn&apos;t active</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm text-slate">{dead}</p>
        <p className="mx-auto mt-2 max-w-sm text-xs text-mist">
          Ask whoever sent it to you for a new one — they can issue it in a few seconds.
        </p>
      </div>
    );
  }
  if (!data) return null;

  const walls = data.walls;
  const totalSqft = Math.round(walls.reduce((s, w) => s + sqft(w.widthMm, w.heightMm), 0));
  const missing = walls.filter((w) => !w.hasPhoto).length;
  const done = data.state === "submitted" || Boolean(sent);
  const full = walls.length >= data.wallCap;

  if (done) {
    return (
      <div className="container-x py-16 text-center">
        <h1 className="font-display text-xl font-extrabold">Sent to head office</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm text-slate">
          {walls.length} walls at {data.store.name} · about {totalSqft.toLocaleString("en-IN")} sq ft.
          Nothing more to do here — they&apos;ll take it from here.
        </p>
        <p className="mx-auto mt-2 max-w-sm text-xs text-mist">
          You can close this page. If something was wrong, tell head office — they can send a fresh link.
        </p>
      </div>
    );
  }

  return (
    <div className="container-x max-w-2xl py-6 sm:py-8">
      <header>
        <p className="caps text-mist">{data.account.name}</p>
        <h1 className="font-display text-xl font-extrabold leading-tight sm:text-2xl">
          Measure {data.store.name}
        </h1>
        <p className="mt-1 text-xs text-slate">
          {[data.store.city, data.store.state].filter(Boolean).join(", ")}
          {data.store.floors ? ` · ${data.store.floors} floors` : ""}
        </p>
      </header>

      <div className="mt-4 rounded-[18px] border border-edge bg-wash p-4">
        <p className="text-sm text-charcoal">
          Walk the store <b>clockwise from the entrance</b> and add each wall as you reach it.
          The order you add them in is the order they&apos;ll be designed in.
        </p>
        {data.brief && (
          <p className="mt-2 border-t border-edge pt-2 text-sm text-slate">
            <span className="font-semibold text-charcoal">From head office:</span> {data.brief}
          </p>
        )}
        <p className="mt-2 text-xs text-mist">
          Every wall is saved as you add it. You can stop and come back on any phone until{" "}
          {new Date(data.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", timeZone: "Asia/Kolkata" })}.
        </p>
      </div>

      {err && <p className="mt-4 rounded-[12px] bg-red-50 p-3 text-sm text-red-700">{err}</p>}

      {/* ── The walls so far ─────────────────────────────────────────────── */}
      {walls.length > 0 && (
        <section className="mt-6 space-y-3">
          {walls.map((w) => (
            <div key={w.seq}
              className={`rounded-[18px] border p-3 ${
                w.hasPhoto ? "border-edge bg-surface" : "border-amber-300 bg-amber-50/60"}`}>
              <div className="flex gap-3">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[12px] bg-wash">
                  {w.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={w.photoUrl} alt={`Wall ${w.seq}`} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-center text-[10px] text-mist">
                      no photo
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-charcoal">
                    <span className="text-mist">{w.seq}.</span> {w.name}
                  </p>
                  <p className="mt-0.5 text-xs text-slate">
                    {showFeet(w.widthMm)} × {showFeet(w.heightMm)}
                    <span className="text-mist"> · {w.widthMm} × {w.heightMm} mm · {Math.round(sqft(w.widthMm, w.heightMm))} sq ft</span>
                  </p>
                  {w.room && <p className="mt-0.5 truncate text-xs text-mist">{w.room}</p>}
                  {w.note && <p className="mt-0.5 text-xs text-slate">{w.note}</p>}
                  {!w.hasPhoto && (
                    <p className="mt-1 text-xs font-semibold text-amber-700">
                      {w.photoError ? `Photo failed — ${w.photoError}.` : "No photo yet."} The design is
                      chosen from the photo, so this wall needs one.
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <label className="cursor-pointer text-xs text-slate underline">
                      {busy === `photo-${w.seq}` ? "Sending…" : w.hasPhoto ? "Retake photo" : "Add photo"}
                      <input type="file" accept="image/*" capture="environment" className="hidden"
                        disabled={busy !== null}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f) void replacePhoto(w.seq, f);
                        }} />
                    </label>
                    <button onClick={() => startEdit(w)} disabled={busy !== null}
                      className="text-xs text-slate underline disabled:opacity-40">Edit size</button>
                    <button onClick={() => void removeWall(w.seq)} disabled={busy !== null}
                      className="text-xs text-red-700 underline disabled:opacity-40">Remove</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ── Add / edit ───────────────────────────────────────────────────── */}
      <div ref={formRef} className="mt-6 rounded-[18px] border border-edge bg-wash p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-display text-base font-bold">
            {editing ? `Edit wall ${editing}` : `Add wall ${walls.length + 1}`}
          </p>
          <div className="flex overflow-hidden rounded-full border border-edge text-xs">
            {(["ft", "mm"] as Unit[]).map((u) => (
              <button key={u} type="button" onClick={() => setUnit(u)}
                className={`px-3 py-1 ${unit === u ? "bg-charcoal text-white" : "bg-surface text-slate"}`}>
                {u === "ft" ? "Feet" : "mm"}
              </button>
            ))}
          </div>
        </div>

        {full && !editing ? (
          <p className="mt-3 text-sm text-amber-700">
            That&apos;s {data.wallCap} walls — the most one survey holds. Send this one, then ask head
            office for a second link to carry on.
          </p>
        ) : (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs text-slate">Width</span>
                {unit === "ft" ? (
                  <div className="mt-1 flex gap-2">
                    <input inputMode="decimal" value={wFt} onChange={(e) => setWFt(e.target.value)}
                      placeholder="ft" className="h-12 w-full rounded-[12px] border border-edge bg-surface px-3 text-base" />
                    <input inputMode="decimal" value={wIn} onChange={(e) => setWIn(e.target.value)}
                      placeholder="in" className="h-12 w-full rounded-[12px] border border-edge bg-surface px-3 text-base" />
                  </div>
                ) : (
                  <input inputMode="numeric" value={wMm} onChange={(e) => setWMm(e.target.value)}
                    placeholder="mm" className="mt-1 h-12 w-full rounded-[12px] border border-edge bg-surface px-3 text-base" />
                )}
              </label>
              <label className="block">
                <span className="text-xs text-slate">Height</span>
                {unit === "ft" ? (
                  <div className="mt-1 flex gap-2">
                    <input inputMode="decimal" value={hFt} onChange={(e) => setHFt(e.target.value)}
                      placeholder="ft" className="h-12 w-full rounded-[12px] border border-edge bg-surface px-3 text-base" />
                    <input inputMode="decimal" value={hIn} onChange={(e) => setHIn(e.target.value)}
                      placeholder="in" className="h-12 w-full rounded-[12px] border border-edge bg-surface px-3 text-base" />
                  </div>
                ) : (
                  <input inputMode="numeric" value={hMm} onChange={(e) => setHMm(e.target.value)}
                    placeholder="mm" className="mt-1 h-12 w-full rounded-[12px] border border-edge bg-surface px-3 text-base" />
                )}
              </label>
            </div>

            {/* The number that will actually be printed, never hidden behind the
                unit the measurer happens to be typing in. */}
            <p className="mt-2 text-xs text-mist">
              {sized
                ? `${widthMm} × ${heightMm} mm · ${Math.round(sqft(widthMm, heightMm))} sq ft`
                : "Measure the full wall, edge to edge, floor to ceiling."}
            </p>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs text-slate">What is it? (optional)</span>
                <input value={name} onChange={(e) => setName(e.target.value)}
                  placeholder={`Wall ${editing ?? walls.length + 1}`}
                  className="mt-1 h-12 w-full rounded-[12px] border border-edge bg-surface px-3 text-base" />
              </label>
              <label className="block">
                <span className="text-xs text-slate">Area or floor (optional)</span>
                <input value={room} onChange={(e) => setRoom(e.target.value)}
                  placeholder="Ground floor · TV section"
                  className="mt-1 h-12 w-full rounded-[12px] border border-edge bg-surface px-3 text-base" />
              </label>
            </div>

            <label className="mt-3 block">
              <span className="text-xs text-slate">Anything to know? (optional)</span>
              <input value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="Switchboard 3 ft from the left edge"
                className="mt-1 h-12 w-full rounded-[12px] border border-edge bg-surface px-3 text-base" />
            </label>

            {!editing && (
              <label className="mt-3 flex cursor-pointer items-center justify-between rounded-[12px] border border-dashed border-edge bg-surface px-3 py-3">
                <span className="text-sm text-slate">
                  {pendingName ? `Photo ready · ${pendingName}` : "Photograph the wall"}
                </span>
                <span className="text-xs font-semibold text-charcoal underline">
                  {pendingName ? "Change" : "Take photo"}
                </span>
                <input type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    pendingPhoto.current = f;
                    setPendingName(f ? f.name.slice(0, 28) : null);
                  }} />
              </label>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button onClick={() => void addWall()} disabled={!sized || busy !== null}
                className="btn h-12 px-6 text-[0.8rem] disabled:opacity-40">
                {busy === "wall" ? "Saving…" : busy === "photo" ? "Sending photo…"
                  : editing ? "Save changes" : "Add this wall"}
              </button>
              {editing && (
                <button onClick={resetForm} disabled={busy !== null}
                  className="text-sm text-slate underline disabled:opacity-40">Cancel</button>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Send ─────────────────────────────────────────────────────────── */}
      <div className="mt-6 rounded-[18px] border border-edge bg-surface p-4">
        <p className="text-sm text-charcoal">
          <b>{walls.length} {walls.length === 1 ? "wall" : "walls"}</b>
          {walls.length > 0 && ` · about ${totalSqft.toLocaleString("en-IN")} sq ft`}
          {missing > 0 && <span className="text-amber-700"> · {missing} without a photo</span>}
        </p>
        <p className="mt-1 text-xs text-mist">
          Sending closes this link and tells head office. Nothing is designed, ordered or charged
          until someone there approves it.
        </p>
        <button onClick={() => void submit()} disabled={walls.length === 0 || busy !== null}
          className="btn mt-3 h-12 w-full px-6 text-[0.8rem] disabled:opacity-40">
          {busy === "submit" ? "Sending…" : "Send to head office"}
        </button>
      </div>
    </div>
  );
}
