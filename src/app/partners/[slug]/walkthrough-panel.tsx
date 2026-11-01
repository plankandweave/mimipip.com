"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Lightbox, { type LightboxImage } from "@/components/Lightbox";
import { areaLabel, type AreaRow } from "@/lib/portfolio";
import { feetFromMm, mmFromFeet, num, showFeet } from "@/lib/wall-measure";
import { coachWalker } from "@/lib/walk-coach";
import { AUDIO_TYPES, pickMime, twoStepUpload, VIDEO_TYPES } from "@/lib/walk-recorder";

// Walking the space instead of visiting it.
//
// Their person records once, talking as they go, and taps each wall they want
// treated. The recording is kept forever — it is the thing a site visit would
// have produced — and the taps are what turn it into a list of walls.
//
// TWO RECORDERS ON ONE MICROPHONE. The video is the record; a parallel
// audio-only track exists because transcription caps at 25 MB and three minutes
// of video is well past that while three minutes of speech is about a megabyte.
//
// THE TAP IS THE POINT. The person holding the phone already knows which walls
// matter, and a tap is cheaper and far more certain than asking a model to find
// them in the footage. It is also what keeps this useful when the clever half is
// unavailable: taps alone give a photographed, ordered list of walls with no
// model in the loop at all.

const MAX_SECONDS = 180;

const pick = pickMime;

type Mark = {
  id: string;
  seq: number;
  atSeconds: number;
  stillUrl: string | null;
  stillError: string | null;
  name: string | null;
  brief: string | null;
  widthMm: number | null;
  heightMm: number | null;
  sizeEstimated: boolean;
  confirmedWallSeq: number | null;
};

type Walkthrough = {
  id: string;
  title: string | null;
  createdAt: string;
  createdBy: string | null;
  seconds: number | null;
  videoUrl: string | null;
  videoError: string | null;
  transcript: string | null;
  transcriptError: string | null;
  draftedAt: string | null;
  draftError: string | null;
  marks: Mark[];
};

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function WalkthroughPanel({
  area, canEdit, onBack, onWallsAdded,
}: {
  area: AreaRow;
  canEdit: boolean;
  onBack: () => void;
  onWallsAdded: () => Promise<void>;
}) {
  const [walks, setWalks] = useState<Walkthrough[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [zoom, setZoom] = useState<LightboxImage | null>(null);

  const fetchWalks = useCallback(async () => {
    const r = await fetch(`/api/corporate/walkthrough?areaId=${encodeURIComponent(area.id)}`, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok || !j.ok) throw new Error(j.error ?? "Could not load the walkthroughs.");
    return (j.walkthroughs ?? []) as Walkthrough[];
  }, [area.id]);

  const reload = useCallback(async () => {
    try { setWalks(await fetchWalks()); setErr(null); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not load the walkthroughs."); }
  }, [fetchWalks]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const w = await fetchWalks();
        if (alive) { setWalks(w); setErr(null); }
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : "Could not load the walkthroughs.");
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [fetchWalks]);

  return (
    <div className="mt-6">
      <button onClick={onBack} className="text-xs text-slate underline">← Back to walls</button>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold leading-tight">Walk this space</h2>
          <p className="mt-0.5 max-w-[56ch] text-xs text-slate">
            Record once, talking as you go, and tap each wall as you stand in
            front of it. Nobody needs to visit afterwards.
          </p>
        </div>
        {canEdit && !recording && (
          <button onClick={() => setRecording(true)} className="btn h-10 px-4 text-[0.8rem]">
            Start a walkthrough
          </button>
        )}
      </div>

      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

      {recording && (
        <Recorder
          area={area}
          onDone={async () => { setRecording(false); await reload(); }}
          onCancel={() => setRecording(false)}
        />
      )}

      {loading ? (
        <p className="mt-6 text-sm text-slate">Loading…</p>
      ) : walks.length === 0 && !recording ? (
        <div className="mt-6 rounded-[18px] border border-dashed border-edge bg-wash px-6 py-10 text-center">
          <p className="font-display text-base font-bold">No walkthrough yet</p>
          <p className="mx-auto mt-1.5 max-w-[46ch] text-sm text-slate">
            A walkthrough replaces the site visit — the recording stays with the
            project, so anything we need to check later is scrubbed for rather
            than asked for.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {walks.map((w) => (
            <WalkCard key={w.id} walk={w} area={area} canEdit={canEdit}
              onChanged={reload} onWallsAdded={onWallsAdded} onZoom={setZoom} />
          ))}
        </div>
      )}

      <Lightbox image={zoom} onClose={() => setZoom(null)} />
    </div>
  );
}

/* ────────────────────────── Recording ─────────────────────────────────── */

function Recorder({
  area, onDone, onCancel,
}: { area: AreaRow; onDone: () => Promise<void>; onCancel: () => void }) {
  const [phase, setPhase] = useState<"idle" | "live" | "saving">("idle");
  const [seconds, setSeconds] = useState(0);
  const [marks, setMarks] = useState<number>(0);
  /** When the last wall was marked, so the coaching can say "wall 3 marked —
   *  now say what it should do" while they are still standing in front of it. */
  const [lastMarkAt, setLastMarkAt] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const videoEl = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const vRec = useRef<MediaRecorder | null>(null);
  const aRec = useRef<MediaRecorder | null>(null);
  const vChunks = useRef<Blob[]>([]);
  const aChunks = useRef<Blob[]>([]);
  const started = useRef(0);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const walkId = useRef<string | null>(null);

  const stopTracks = useCallback(() => {
    if (ticker.current) clearInterval(ticker.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  // The camera and microphone must not stay live if this panel goes away — a
  // phone still showing a recording indicator reads as the site watching you.
  useEffect(() => () => stopTracks(), [stopTracks]);

  async function start() {
    setErr(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setErr("This browser can't record video. Capture the walls one at a time instead.");
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 } },
        audio: true,
      });
      stream.current = s;
      if (videoEl.current) {
        videoEl.current.srcObject = s;
        await videoEl.current.play().catch(() => {});
      }

      // The row exists before a single frame is recorded, so every tap from
      // here on has somewhere to land even if the phone dies mid-walk.
      const r = await fetch("/api/corporate/walkthrough", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", areaId: area.id, title: areaLabel(area) }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Could not start a walkthrough.");
      walkId.current = j.id as string;

      const vType = pick(VIDEO_TYPES);
      const aType = pick(AUDIO_TYPES);

      const v = vType ? new MediaRecorder(s, { mimeType: vType }) : new MediaRecorder(s);
      vChunks.current = [];
      v.ondataavailable = (e) => { if (e.data.size) vChunks.current.push(e.data); };
      v.start();
      vRec.current = v;

      // The second recorder reads the SAME live microphone track, so the
      // narration it captures is the narration in the video — not a re-take.
      const audioOnly = new MediaStream(s.getAudioTracks());
      const a = aType ? new MediaRecorder(audioOnly, { mimeType: aType }) : new MediaRecorder(audioOnly);
      aChunks.current = [];
      a.ondataavailable = (e) => { if (e.data.size) aChunks.current.push(e.data); };
      a.start();
      aRec.current = a;

      started.current = Date.now();
      setSeconds(0); setMarks(0); setLastMarkAt(null); setPhase("live");
      ticker.current = setInterval(() => {
        const el = Math.round((Date.now() - started.current) / 1000);
        setSeconds(el);
        if (el >= MAX_SECONDS) void stop();
      }, 250);
    } catch (e) {
      stopTracks();
      setErr(e instanceof Error && e.message.includes("walkthrough")
        ? e.message
        : "We couldn't reach the camera. Allow it in your browser, or capture the walls one at a time.");
    }
  }

  /** A tap: create the mark, grab the frame, send it. Recording never pauses. */
  async function markWall() {
    const id = walkId.current;
    const el = videoEl.current;
    if (!id || !el) return;
    const at = (Date.now() - started.current) / 1000;
    setMarks((n) => n + 1);
    setLastMarkAt(at);
    try {
      const r = await fetch("/api/corporate/walkthrough", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark", areaId: area.id, id, atSeconds: at }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Could not mark that wall.");

      const canvas = document.createElement("canvas");
      canvas.width = el.videoWidth || 1280;
      canvas.height = el.videoHeight || 720;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
      if (!blob) return;

      await upload({
        kind: "still", areaId: area.id, id, markId: j.markId as string,
        blob, contentType: "image/jpeg",
      });
    } catch (e) {
      // The mark itself may well have been written; the walk must not stop for
      // a failed still, so this is reported quietly and the walk continues.
      setErr(e instanceof Error ? e.message : "That tap didn't save.");
    }
  }

  async function stop() {
    if (phase !== "live") return;
    if (ticker.current) clearInterval(ticker.current);
    setPhase("saving");

    const elapsed = Math.max(1, Math.round((Date.now() - started.current) / 1000));
    const id = walkId.current;

    const settle = (rec: MediaRecorder | null, chunks: React.RefObject<Blob[]>) =>
      new Promise<{ blob: Blob; type: string } | null>((resolve) => {
        if (!rec || rec.state === "inactive") return resolve(null);
        rec.onstop = () => {
          const type = (rec.mimeType || "").split(";")[0] || "video/webm";
          resolve({ blob: new Blob(chunks.current, { type }), type });
        };
        rec.stop();
      });

    try {
      const [video, audio] = await Promise.all([
        settle(vRec.current, vChunks),
        settle(aRec.current, aChunks),
      ]);
      stopTracks();

      if (id && video?.blob.size) {
        setStatus("Saving the walk…");
        await upload({ kind: "video", areaId: area.id, id, blob: video.blob, contentType: video.type, seconds: elapsed });
      }
      if (id && audio?.blob.size) {
        setStatus("Saving the narration…");
        await upload({ kind: "audio", areaId: area.id, id, blob: audio.blob, contentType: audio.type });
      }
      setStatus(null);
      await onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "The walk was recorded but could not be saved.");
      setPhase("idle");
    }
  }

  return (
    <div className="mt-5 rounded-[18px] border border-edge bg-surface p-4">
      <div className="overflow-hidden rounded-[14px] bg-black">
        {/* A live camera preview of the room the person is standing in. */}
        <video ref={videoEl} muted playsInline className="aspect-[3/4] w-full object-cover sm:aspect-video" />
      </div>

      {phase === "idle" && (
        <div className="mt-3">
          <p className="font-display text-base font-bold">Three things, and that is the whole visit</p>
          {/* Numbered, in the order they happen, in the second person. Someone
              reading this once should not need to read it again. */}
          <ol className="mt-2 space-y-1.5 text-sm text-slate">
            <li><strong className="text-charcoal">1.</strong> Press start, then just talk — say where you are and what the space is for.</li>
            <li><strong className="text-charcoal">2.</strong> Walk to a wall you want done. While you are facing it, press <strong className="text-charcoal">Mark this wall</strong>.</li>
            <li><strong className="text-charcoal">3.</strong> Say what that wall should do, then walk to the next one and mark it too.</li>
          </ol>
          <p className="mt-2 text-xs text-mist">
            Up to {MAX_SECONDS / 60} minutes. We will tell you what to do at each
            point, so there is nothing to remember.
          </p>
          <div className="mt-3 flex gap-2">
            <button onClick={() => void start()} className="btn h-11 px-5 text-[0.85rem]">
              Start recording
            </button>
            <button onClick={onCancel} className="rounded-[10px] border border-edge px-4 py-2 text-xs">
              Cancel
            </button>
          </div>
        </div>
      )}

      {phase === "live" && (() => {
        const coach = coachWalker({
          seconds, marks, maxSeconds: MAX_SECONDS,
          sinceMark: lastMarkAt == null ? null : seconds - lastMarkAt,
        });
        return (
          <div className="mt-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-xs text-slate">
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" aria-hidden />
                Recording {mmss(seconds)} · {marks} {marks === 1 ? "wall" : "walls"} marked
              </span>
            </div>

            {/* The instruction for THIS moment. aria-live so it is spoken by a
                screen reader as it changes, since the person is looking at the
                room rather than at the phone. */}
            <p aria-live="polite"
              className={`mt-2 rounded-[12px] px-4 py-3 text-sm ${
                coach.urging ? "bg-charcoal text-surface" : "bg-wash text-charcoal"}`}>
              {coach.say}
            </p>

            <div className="mt-3 flex gap-2">
              <button onClick={() => void markWall()}
                className={`h-14 flex-1 rounded-[12px] text-[0.9rem] font-semibold ${
                  coach.urging
                    ? "bg-charcoal text-surface"
                    : "border border-charcoal bg-surface text-charcoal"}`}>
                Mark this wall
              </button>
              <button onClick={() => void stop()}
                className="rounded-[12px] border border-edge px-5 py-2 text-sm">
                Finish
              </button>
            </div>
          </div>
        );
      })()}

      {phase === "saving" && (
        <p className="mt-3 text-sm text-slate">{status ?? "Saving…"}</p>
      )}

      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
    </div>
  );
}

/** sign → PUT straight to storage → commit, for whichever file this is. */
async function upload(o: {
  kind: "video" | "audio" | "still";
  areaId: string; id: string; markId?: string;
  blob: Blob; contentType: string; seconds?: number;
}) {
  return await twoStepUpload({
    endpoint: "/api/corporate/walkthrough/media",
    sign: { kind: o.kind, areaId: o.areaId, id: o.id, markId: o.markId },
    commit: { kind: o.kind, areaId: o.areaId, id: o.id, markId: o.markId, seconds: o.seconds },
    blob: o.blob,
    contentType: o.contentType,
  });
}

/* ────────────────────────── Reviewing a walk ──────────────────────────── */

function WalkCard({
  walk, area, canEdit, onChanged, onWallsAdded, onZoom,
}: {
  walk: Walkthrough;
  area: AreaRow;
  canEdit: boolean;
  onChanged: () => Promise<void>;
  onWallsAdded: () => Promise<void>;
  onZoom: (i: LightboxImage) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [showTranscript, setShowTranscript] = useState(false);

  const open = walk.marks.filter((m) => m.confirmedWallSeq == null);
  const done = walk.marks.filter((m) => m.confirmedWallSeq != null);

  async function draft() {
    setBusy("draft"); setErr(null); setMsg(null);
    try {
      const r = await fetch("/api/corporate/walkthrough/draft", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ areaId: area.id, id: walk.id }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Could not read the walk.");
      setMsg(`Drafted ${j.drafted} ${j.drafted === 1 ? "wall" : "walls"} from what you said.`);
      await onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not read the walk.");
    } finally { setBusy(null); }
  }

  async function confirm() {
    if (ticked.size === 0) return;
    setBusy("confirm"); setErr(null); setMsg(null);
    try {
      const r = await fetch("/api/corporate/walkthrough/confirm", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ areaId: area.id, id: walk.id, markIds: [...ticked] }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Could not add those walls.");
      const skipped = (j.skipped ?? []) as { name: string; why: string }[];
      setMsg([
        j.message as string,
        ...skipped.map((s) => `${s.name} — ${s.why}.`),
      ].join(" "));
      setTicked(new Set());
      await onChanged();
      await onWallsAdded();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not add those walls.");
    } finally { setBusy(null); }
  }

  async function remove() {
    if (!confirm2(`Delete this walkthrough? The recording goes too.`)) return;
    setBusy("delete");
    try {
      await fetch("/api/corporate/walkthrough", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", areaId: area.id, id: walk.id }),
      });
      await onChanged();
    } finally { setBusy(null); }
  }

  return (
    <section className="rounded-[18px] border border-edge bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-base font-bold">
            {new Date(walk.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
          </p>
          <p className="mt-0.5 text-xs text-slate">
            {walk.seconds ? `${mmss(walk.seconds)} · ` : ""}
            {walk.marks.length} {walk.marks.length === 1 ? "wall marked" : "walls marked"}
            {done.length > 0 && ` · ${done.length} added`}
            {walk.createdBy && ` · ${walk.createdBy}`}
          </p>
        </div>
        {canEdit && (
          <button onClick={() => void remove()} disabled={Boolean(busy)}
            className="text-xs text-slate underline disabled:opacity-50">Delete</button>
        )}
      </div>

      {walk.videoUrl ? (
        <div className="mt-3 overflow-hidden rounded-[14px] bg-black">
          {/* The transcript below is this recording's caption, when there is one. */}
          <video src={walk.videoUrl} controls playsInline className="w-full" />
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate">
          {walk.videoError ? `The recording didn't save — ${walk.videoError}.` : "The recording is still uploading."}
        </p>
      )}

      {/* The transcript, or an honest account of why there isn't one. */}
      <div className="mt-3">
        {walk.transcript ? (
          <>
            <button onClick={() => setShowTranscript((v) => !v)} className="text-xs text-slate underline">
              {showTranscript ? "Hide" : "Show"} what was said
            </button>
            {showTranscript && (
              <p className="mt-2 whitespace-pre-wrap rounded-[12px] bg-wash px-4 py-3 text-sm">
                {walk.transcript}
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-slate">
            {walk.transcriptError
              ? `Not written out yet — ${walk.transcriptError}.`
              : "Not written out yet."}
            {" "}The recording and the marked walls are saved either way.
          </p>
        )}
      </div>

      {canEdit && open.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => void draft()} disabled={busy === "draft"}
            className="rounded-[10px] border border-edge px-4 py-2 text-xs disabled:opacity-50">
            {busy === "draft" ? "Reading the walk…" : walk.draftedAt ? "Read the walk again" : "Read the walk"}
          </button>
          {ticked.size > 0 && (
            <button onClick={() => void confirm()} disabled={busy === "confirm"}
              className="btn h-9 px-4 text-[0.78rem] disabled:opacity-50">
              {busy === "confirm" ? "Adding…" : `Add ${ticked.size} ${ticked.size === 1 ? "wall" : "walls"}`}
            </button>
          )}
        </div>
      )}

      {msg && <p className="mt-3 text-sm">{msg}</p>}
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

      <ul className="mt-4 space-y-3">
        {walk.marks.map((m) => (
          <MarkRow
            key={m.id} mark={m} area={area} walkId={walk.id} canEdit={canEdit}
            ticked={ticked.has(m.id)}
            onTick={(on) => setTicked((s) => {
              const next = new Set(s);
              if (on) next.add(m.id); else next.delete(m.id);
              return next;
            })}
            onZoom={onZoom}
            onChanged={onChanged}
          />
        ))}
      </ul>
    </section>
  );
}

/** window.confirm, named so the component's own `confirm` is not shadowed. */
const confirm2 = (q: string) => (typeof window === "undefined" ? false : window.confirm(q));

/* ────────────────────────── One marked wall ───────────────────────────── */

function MarkRow({
  mark, area, walkId, canEdit, ticked, onTick, onZoom, onChanged,
}: {
  mark: Mark;
  area: AreaRow;
  walkId: string;
  canEdit: boolean;
  ticked: boolean;
  onTick: (on: boolean) => void;
  onZoom: (i: LightboxImage) => void;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const confirmed = mark.confirmedWallSeq != null;
  const sized = mark.widthMm != null && mark.heightMm != null;

  return (
    <li className="rounded-[14px] border border-edge bg-wash p-3">
      <div className="flex flex-wrap gap-3">
        <div className="w-full sm:w-[120px]">
          {mark.stillUrl ? (
            <button type="button"
              onClick={() => onZoom({
                src: mark.stillUrl!, alt: mark.name ?? `Wall ${mark.seq}`,
                caption: `${mark.name ?? `Wall ${mark.seq}`} · marked at ${mmss(mark.atSeconds)}`,
              })}
              className="block w-full overflow-hidden rounded-[10px] border border-edge">
              {/* eslint-disable-next-line @next/next/no-img-element -- signed
                  storage URL, short-lived; the optimiser cannot fetch it. */}
              <img src={mark.stillUrl} alt={mark.name ?? `Wall ${mark.seq}`}
                className="aspect-[4/3] w-full object-cover" />
            </button>
          ) : (
            <div className="flex aspect-[4/3] w-full items-center justify-center rounded-[10px] border border-dashed border-edge px-2 text-center">
              <span className="text-[0.7rem] text-slate">
                {mark.stillError ? "Frame failed" : "No frame"}
              </span>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                <span className="text-slate">{mark.seq}.</span>{" "}
                {mark.name ?? <span className="text-slate">Not named yet</span>}
              </p>
              <p className="mt-0.5 text-xs text-slate">
                Marked at {mmss(mark.atSeconds)}
                {sized && ` · ${showFeet(mark.widthMm!)} × ${showFeet(mark.heightMm!)}`}
                {sized && mark.sizeEstimated && " (heard, not measured)"}
              </p>
            </div>
            {confirmed ? (
              <span className="text-xs text-slate">Added as wall {mark.confirmedWallSeq}</span>
            ) : canEdit ? (
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={ticked} onChange={(e) => onTick(e.target.checked)}
                  className="h-4 w-4 accent-charcoal" />
                Add
              </label>
            ) : null}
          </div>

          {mark.brief && <p className="mt-1.5 whitespace-pre-wrap text-sm">{mark.brief}</p>}

          {!sized && !confirmed && (
            // The honest limit of a walkthrough, said where it matters: a video
            // gives the space and the intent, never the dimensions.
            <p className="mt-1.5 text-xs text-slate">
              Needs a width and height before it can be added — a walk doesn&apos;t measure.
            </p>
          )}

          {canEdit && !confirmed && (
            <button onClick={() => setEditing((v) => !v)} className="mt-2 text-xs text-slate underline">
              {editing ? "Close" : sized ? "Edit" : "Name it and add a size"}
            </button>
          )}
        </div>
      </div>

      {editing && !confirmed && (
        <MarkForm mark={mark} area={area} walkId={walkId}
          onDone={async () => { setEditing(false); await onChanged(); }} />
      )}
    </li>
  );
}

function MarkForm({
  mark, area, walkId, onDone,
}: { mark: Mark; area: AreaRow; walkId: string; onDone: () => Promise<void> }) {
  const seedW = mark.widthMm ? feetFromMm(mark.widthMm) : null;
  const seedH = mark.heightMm ? feetFromMm(mark.heightMm) : null;

  const [name, setName] = useState(mark.name ?? "");
  const [brief, setBrief] = useState(mark.brief ?? "");
  const [wFt, setWFt] = useState(seedW ? String(seedW.ft) : "");
  const [wIn, setWIn] = useState(seedW?.inch ? String(seedW.inch) : "");
  const [hFt, setHFt] = useState(seedH ? String(seedH.ft) : "");
  const [hIn, setHIn] = useState(seedH?.inch ? String(seedH.inch) : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const widthMm = mmFromFeet(num(wFt), num(wIn));
  const heightMm = mmFromFeet(num(hFt), num(hIn));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/corporate/walkthrough", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "edit", areaId: area.id, id: walkId, markId: mark.id,
          name, brief, widthMm, heightMm,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Could not save that.");
      await onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save that.");
    } finally { setBusy(false); }
  }

  const field = "w-full rounded-[10px] border border-edge bg-surface px-3 py-2 text-sm outline-none focus:border-charcoal";

  return (
    <form onSubmit={save} className="mt-3 border-t border-edge pt-3">
      <label className="block">
        <span className="text-xs text-slate">Which wall?</span>
        <input required autoFocus value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Facing the entrance" className={`mt-1 ${field}`} />
      </label>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <span className="text-xs text-slate">Width</span>
          <div className="mt-1 flex gap-2">
            <input inputMode="decimal" value={wFt} onChange={(e) => setWFt(e.target.value)}
              placeholder="ft" className={field} aria-label="Width in feet" />
            <input inputMode="decimal" value={wIn} onChange={(e) => setWIn(e.target.value)}
              placeholder="in" className={field} aria-label="Width in inches" />
          </div>
        </div>
        <div>
          <span className="text-xs text-slate">Height</span>
          <div className="mt-1 flex gap-2">
            <input inputMode="decimal" value={hFt} onChange={(e) => setHFt(e.target.value)}
              placeholder="ft" className={field} aria-label="Height in feet" />
            <input inputMode="decimal" value={hIn} onChange={(e) => setHIn(e.target.value)}
              placeholder="in" className={field} aria-label="Height in inches" />
          </div>
        </div>
      </div>
      <label className="mt-3 block">
        <span className="text-xs text-slate">What should it say?</span>
        <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={2} className={`mt-1 ${field}`} />
      </label>
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      <button type="submit" disabled={busy || !name.trim()}
        className="btn mt-3 h-9 px-4 text-[0.78rem] disabled:opacity-50">
        {busy ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
