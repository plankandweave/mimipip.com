"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { coachWalker } from "@/lib/walk-coach";
import { closedWalkMessage, mmss, type WalkLinkState } from "@/lib/prospect-walk";
import { AUDIO_TYPES, grabStill, pickMime, settleRecorder, twoStepUpload, VIDEO_TYPES } from "@/lib/walk-recorder";

/**
 * "Walk us through your space" — for a prospect who has never seen this page
 * and has no account with us. One button to start, one big "This wall" button
 * to tap at each wall, one to finish; then another walk, or send.
 *
 *   · The walk row exists before recording starts, and each tap is written the
 *     moment it happens, so a phone that dies mid-walk keeps every wall marked.
 *   · A finished recording that fails to upload stays on the phone with a
 *     "Try again" button; nothing is thrown away until the server confirms it.
 *   · The bytes go straight to storage on a signed slot; the API confirms what
 *     landed (the same two-step as the partner walkthrough).
 */

type Walk = {
  id: string;
  seconds: number | null;
  hasVideo: boolean;
  videoError: string | null;
  note: string | null;
  submittedAt: string | null;
  marks: { seq: number; atSeconds: number; label: string | null; stillUrl: string | null }[];
};

type Payload = {
  ok: true;
  state: WalkLinkState;
  company: string;
  recipientName: string | null;
  brief: string | null;
  expiresAt: string;
  maxSeconds: number;
  maxMarks: number;
  maxWalks: number;
  walks: Walk[];
};

type Phase = "loading" | "closed" | "ready" | "live" | "saving" | "sent";
type Pending = { id: string; video: { blob: Blob; type: string } | null; audio: { blob: Blob; type: string } | null; seconds: number };

const THEME = `
.zw-walk { --color-cloud:#FAFAF8; --color-surface:#FFFFFF; --color-charcoal:#2D2D2D; --color-slate:#6B6B6B; --color-mist:#8C8C8C; --color-edge:#E0E0E0; --color-wash:#F5F5F3; --zw-accent:#8C7B6B; }
@media (prefers-color-scheme: dark) {
  .zw-walk { --color-cloud:#1C1B1A; --color-surface:#262524; --color-charcoal:#EDEBE7; --color-slate:#B5B1AA; --color-mist:#8F8B85; --color-edge:#3A3836; --color-wash:#2E2D2B; --zw-accent:#C4B3A2; }
}
`;

export default function GuestWalk({ token, plausible }: { token: string; plausible: boolean }) {
  const base = `/api/walk/${encodeURIComponent(token)}`;
  const [phase, setPhase] = useState<Phase>(plausible ? "loading" : "closed");
  const [closed, setClosed] = useState(plausible ? "" : closedWalkMessage("unknown")!);
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(base, { cache: "no-store" });
      const j = await r.json().catch(() => ({})) as Partial<Payload> & { ok?: boolean; state?: WalkLinkState };
      if (!r.ok || !j.ok) {
        setClosed(closedWalkMessage(j.state ?? "unknown") ?? "This link is not active.");
        setPhase("closed");
        return;
      }
      setData(j as Payload);
      setPhase((p) => (j.state === "submitted" ? "sent" : p === "loading" || p === "closed" ? "ready" : p));
    } catch {
      setErr("Could not reach Zyvorah. Check your signal and try again.");
      setPhase((p) => (p === "loading" ? "closed" : p));
      setClosed("Could not reach Zyvorah. Check your signal and reload this page.");
    }
  }, [base]);

  useEffect(() => {
    if (!plausible) return;
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [plausible, load]);

  /** Upload a finished walk's video then narration. Resumable: on failure the
   *  blobs stay in `pending` and the same call is made again. */
  async function save(p: Pending) {
    setPhase("saving"); setErr(null);
    try {
      if (p.video?.blob.size) {
        await twoStepUpload({
          endpoint: `${base}/media`, sign: { kind: "video", id: p.id }, commit: { kind: "video", id: p.id, seconds: p.seconds },
          blob: p.video.blob, contentType: p.video.type,
          onProgress: (f) => setProgress(`Saving your walk… ${Math.round(f * 100)}%`),
        });
      }
      if (p.audio?.blob.size) {
        setProgress("Saving your voice…");
        await twoStepUpload({
          endpoint: `${base}/media`, sign: { kind: "audio", id: p.id }, commit: { kind: "audio", id: p.id },
          blob: p.audio.blob, contentType: p.audio.type,
        });
      }
      setPending(null); setProgress(null);
      await load();
      setPhase("ready");
    } catch (e) {
      setPending(p); setProgress(null);
      setErr(e instanceof Error ? e.message : "That didn't save. Check your signal and try again.");
      setPhase("ready");
    }
  }

  async function send() {
    setErr(null); setProgress("Sending to Zyvorah…"); setPhase("saving");
    try {
      const r = await fetch(`${base}/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error ?? "That didn't send. Try again.");
      setProgress(null);
      await load();
      setPhase("sent");
    } catch (e) {
      setProgress(null);
      setErr(e instanceof Error ? e.message : "That didn't send. Try again.");
      setPhase("ready");
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this walk? Its recording and walls will be removed.")) return;
    setErr(null);
    const r = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", id }) });
    if (!r.ok) setErr("Could not delete that walk. Try again.");
    await load();
  }

  const recorded = data?.walks.filter((w) => w.hasVideo) ?? [];

  return (
    <div className="zw-walk min-h-screen bg-cloud text-charcoal">
      <style>{THEME}</style>
      <div className="mx-auto w-full max-w-md px-4 pb-16 pt-6">
        <p className="text-[0.72rem] tracking-[0.12em] text-mist">Zyvorah</p>

        {phase === "loading" && <p className="mt-8 text-sm text-slate">One moment…</p>}

        {phase === "closed" && (
          <div className="mt-8 rounded-[16px] border border-edge bg-surface p-5">
            <h1 className="font-display text-xl font-bold leading-tight">This link isn&rsquo;t open</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate">{closed}</p>
          </div>
        )}

        {data && phase === "sent" && (
          <div className="mt-8 rounded-[16px] border border-edge bg-surface p-5">
            <h1 className="font-display text-xl font-bold leading-tight">Thank you</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate">{closedWalkMessage("submitted")}</p>
            <p className="mt-3 text-xs text-mist">
              {recorded.length} {recorded.length === 1 ? "walk" : "walks"} from {data.company}
            </p>
          </div>
        )}

        {data && (phase === "ready" || phase === "saving") && (
          <div className="mt-6">
            <h1 className="font-display text-2xl font-bold leading-tight">Walk us through your space</h1>
            <p className="mt-1 text-sm text-slate">{data.company}</p>
            {data.brief && (
              <p className="mt-4 whitespace-pre-line rounded-[12px] bg-wash px-4 py-3 text-sm leading-relaxed">{data.brief}</p>
            )}

            {recorded.length === 0 && !pending && (
              <ol className="mt-5 space-y-2 text-sm leading-relaxed text-slate">
                <li><strong className="text-charcoal">1.</strong> Press start and talk as you walk — say where you are and what the space is for.</li>
                <li><strong className="text-charcoal">2.</strong> Facing a wall you would like designed, press <strong className="text-charcoal">This wall</strong>.</li>
                <li><strong className="text-charcoal">3.</strong> Tell us about that wall, then walk on to the next one.</li>
              </ol>
            )}

            {phase === "saving" && (
              <p className="mt-5 rounded-[12px] border border-edge bg-surface px-4 py-3 text-sm" aria-live="polite">{progress ?? "Saving…"}</p>
            )}

            {phase === "ready" && pending && (
              <div className="mt-5 rounded-[12px] border border-edge bg-surface p-4">
                <p className="text-sm">Your last walk is still on this phone and has not reached us yet.</p>
                <button onClick={() => void save(pending)} className="btn mt-3 h-11 w-full text-[0.9rem]">Try again</button>
              </div>
            )}

            {recorded.length > 0 && (
              <div className="mt-6 space-y-3">
                {recorded.map((w, i) => (
                  <WalkCard key={w.id} walk={w} n={i + 1} base={base} onDelete={() => void remove(w.id)} />
                ))}
              </div>
            )}

            {phase === "ready" && !pending && (
              <div className="mt-6 space-y-3">
                {recorded.length < data.maxWalks && (
                  <button onClick={() => { setErr(null); setPhase("live"); }}
                    className={recorded.length ? "h-12 w-full rounded-[12px] border border-charcoal bg-surface text-[0.95rem] font-semibold text-charcoal" : "btn h-12 w-full text-[0.95rem]"}>
                    {recorded.length ? "Add another walk" : "Start recording"}
                  </button>
                )}
                {recorded.length > 0 && (
                  <button onClick={() => void send()} className="btn h-12 w-full text-[0.95rem]">Send to Zyvorah</button>
                )}
                <p className="text-xs leading-relaxed text-mist">
                  Up to {data.maxSeconds / 60} minutes a walk. Record as many walks as the space needs, then send them together.
                </p>
              </div>
            )}
          </div>
        )}

        {data && phase === "live" && (
          <Recorder
            base={base}
            maxSeconds={data.maxSeconds}
            maxMarks={data.maxMarks}
            onCancel={() => setPhase("ready")}
            onRecorded={(p) => void save(p)}
            onError={setErr}
          />
        )}

        {err && <p className="mt-4 text-sm text-[color:var(--color-alert)]" role="alert">{err}</p>}
      </div>
    </div>
  );
}

/* ───────────────────────────── One saved walk ──────────────────────────── */

function WalkCard({ walk, n, base, onDelete }: { walk: Walk; n: number; base: string; onDelete: () => void }) {
  const [note, setNote] = useState(walk.note ?? "");
  const [saved, setSaved] = useState(false);
  async function saveNote() {
    if ((walk.note ?? "") === note.trim()) return;
    const r = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "note", id: walk.id, note }) });
    setSaved(r.ok);
  }
  return (
    <div className="rounded-[14px] border border-edge bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold">Walk {n}</p>
        <p className="text-xs text-mist">
          {walk.seconds != null ? mmss(walk.seconds) : "—"} · {walk.marks.length} {walk.marks.length === 1 ? "wall" : "walls"}
        </p>
      </div>
      {walk.marks.some((m) => m.stillUrl) && (
        <div className="mt-3 grid grid-cols-4 gap-1.5">
          {walk.marks.filter((m) => m.stillUrl).slice(0, 8).map((m) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={m.seq} src={m.stillUrl!} alt={`Wall ${m.seq}`} className="aspect-square w-full rounded-[8px] object-cover" />
          ))}
        </div>
      )}
      <label className="mt-3 block text-xs text-slate" htmlFor={`note-${walk.id}`}>Anything to add? (optional)</label>
      <textarea id={`note-${walk.id}`} value={note} rows={2} maxLength={2000}
        onChange={(e) => { setNote(e.target.value); setSaved(false); }} onBlur={() => void saveNote()}
        className="mt-1 w-full rounded-[10px] border border-edge bg-cloud px-3 py-2 text-sm text-charcoal" />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-mist">{saved ? "Saved" : ""}</span>
        <button onClick={onDelete} className="min-h-10 px-2 text-xs text-slate underline">Delete this walk</button>
      </div>
    </div>
  );
}

/* ───────────────────────────── Recording ───────────────────────────────── */

function Recorder({ base, maxSeconds, maxMarks, onCancel, onRecorded, onError }: {
  base: string; maxSeconds: number; maxMarks: number;
  onCancel: () => void; onRecorded: (p: Pending) => void; onError: (e: string | null) => void;
}) {
  const [live, setLive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [marks, setMarks] = useState(0);
  const [lastMarkAt, setLastMarkAt] = useState<number | null>(null);

  const videoEl = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const vRec = useRef<MediaRecorder | null>(null);
  const aRec = useRef<MediaRecorder | null>(null);
  const vChunks = useRef<Blob[]>([]);
  const aChunks = useRef<Blob[]>([]);
  const started = useRef(0);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const walkId = useRef<string | null>(null);
  const stills = useRef<Promise<unknown>[]>([]);
  const stopping = useRef(false);

  const stopTracks = useCallback(() => {
    if (ticker.current) clearInterval(ticker.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);
  // The camera must not stay on if this screen goes away.
  useEffect(() => () => stopTracks(), [stopTracks]);

  async function start() {
    onError(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      onError("This browser can't record video. Open the link in Chrome or Safari on your phone.");
      return;
    }
    setStarting(true);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 } }, audio: true });
      stream.current = s;
      if (videoEl.current) { videoEl.current.srcObject = s; await videoEl.current.play().catch(() => {}); }

      // The walk exists before a frame is recorded.
      const r = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start" }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Could not start the walk.");
      walkId.current = j.id as string;

      const vType = pickMime(VIDEO_TYPES);
      const aType = pickMime(AUDIO_TYPES);
      const v = vType ? new MediaRecorder(s, { mimeType: vType }) : new MediaRecorder(s);
      vChunks.current = [];
      v.ondataavailable = (e) => { if (e.data.size) vChunks.current.push(e.data); };
      v.start(1000);
      vRec.current = v;
      const audioOnly = new MediaStream(s.getAudioTracks());
      const a = aType ? new MediaRecorder(audioOnly, { mimeType: aType }) : new MediaRecorder(audioOnly);
      aChunks.current = [];
      a.ondataavailable = (e) => { if (e.data.size) aChunks.current.push(e.data); };
      a.start(1000);
      aRec.current = a;

      started.current = Date.now();
      stopping.current = false;
      setSeconds(0); setMarks(0); setLastMarkAt(null); setLive(true);
      ticker.current = setInterval(() => {
        const el = Math.round((Date.now() - started.current) / 1000);
        setSeconds(el);
        if (el >= maxSeconds) void stop();
      }, 250);
    } catch (e) {
      stopTracks();
      onError(e instanceof Error && /walk|link/i.test(e.message)
        ? e.message
        : "We couldn't reach the camera. Allow camera and microphone for this page, then try again.");
    } finally { setStarting(false); }
  }

  /** A tap: write the mark, then grab and send the frame. Recording never pauses. */
  function markWall() {
    const id = walkId.current;
    const el = videoEl.current;
    if (!id || !el || marks >= maxMarks) return;
    const at = (Date.now() - started.current) / 1000;
    setMarks((n) => n + 1);
    setLastMarkAt(at);
    const job = (async () => {
      const r = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "mark", id, atSeconds: at }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error ?? "That tap didn't save.");
      const blob = await grabStill(el);
      if (!blob) return;
      await twoStepUpload({ endpoint: `${base}/media`, sign: { kind: "still", id, seq: j.seq }, commit: { kind: "still", id, seq: j.seq }, blob, contentType: "image/jpeg" });
    })().catch((e) => onError(e instanceof Error ? e.message : "That tap didn't save."));
    stills.current.push(job);
  }

  async function stop() {
    if (stopping.current) return;
    stopping.current = true;
    if (ticker.current) clearInterval(ticker.current);
    const elapsed = Math.max(1, Math.round((Date.now() - started.current) / 1000));
    const [video, audio] = await Promise.all([
      settleRecorder(vRec.current, vChunks, "video/webm"),
      settleRecorder(aRec.current, aChunks, "audio/webm"),
    ]);
    stopTracks();
    await Promise.allSettled(stills.current);
    stills.current = [];
    setLive(false);
    if (walkId.current) onRecorded({ id: walkId.current, video, audio, seconds: elapsed });
  }

  const coach = coachWalker({ seconds, marks, maxSeconds, sinceMark: lastMarkAt == null ? null : seconds - lastMarkAt });

  return (
    <div className="mt-6">
      <div className="overflow-hidden rounded-[14px] bg-black">
        <video ref={videoEl} muted playsInline className="aspect-[3/4] w-full object-cover" />
      </div>

      {!live ? (
        <div className="mt-4 space-y-3">
          <button onClick={() => void start()} disabled={starting} className="btn h-12 w-full text-[0.95rem]">
            {starting ? "Starting…" : "Start recording"}
          </button>
          <button onClick={onCancel} className="h-11 w-full rounded-[12px] border border-edge text-sm">Back</button>
        </div>
      ) : (
        <div className="mt-3">
          <p className="flex items-center gap-2 text-xs text-slate">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" aria-hidden />
            Recording {mmss(seconds)} of {mmss(maxSeconds)} · {marks} {marks === 1 ? "wall" : "walls"}
          </p>
          <p aria-live="polite" className="mt-2 rounded-[12px] bg-wash px-4 py-3 text-sm leading-relaxed">{coach.say}</p>
          <button onClick={markWall} disabled={marks >= maxMarks}
            className="mt-3 h-20 w-full rounded-[16px] bg-charcoal text-lg font-semibold text-surface">
            This wall
          </button>
          <button onClick={() => void stop()} className="mt-3 h-12 w-full rounded-[12px] border border-edge text-sm">
            Finish this walk
          </button>
        </div>
      )}
    </div>
  );
}
