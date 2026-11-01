"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import TraceFileUpload from "./file-upload";
import { coachWalker } from "@/lib/walk-coach";
import { closedLinkMessage, mmss, MAX_WALK_SECONDS, type TraceLinkState } from "@/lib/trace";

/**
 * Trace: walking a campus with a phone, for somebody who has never seen this
 * page and will never see it again.
 *
 *   · One button to start, one to mark a wall, one to finish. The page talks
 *     them through it (lib/walk-coach.ts); nobody is trained first.
 *   · The walk is recorded in PIECES of a few minutes. Each finished piece is
 *     uploaded while the next is being recorded, so a dead battery or a killed
 *     browser loses minutes, never the walk. The walker sees nothing of this
 *     beyond a quiet "saving piece 3".
 *   · Two recorders on one microphone: the video is the record; a parallel
 *     audio-only track is what gets transcribed, because speech is a megabyte
 *     where video is thirty.
 *   · A tap is the point. The walker knows which walls matter; a tap is
 *     cheaper and more certain than asking a model to find them later.
 *
 * The bytes never pass through a function: the page asks for a signed slot,
 * PUTs straight to the store, then asks the API to confirm what landed.
 */

const VIDEO_TYPES = ["video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
const AUDIO_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

function pick(candidates: string[]): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const t of candidates) if (MediaRecorder.isTypeSupported?.(t)) return t;
  return "";
}

type Payload = {
  ok: true;
  campus: { name: string; city: string | null };
  account: { name: string };
  recipient: string | null;
  brief: string | null;
  expiresAt: string;
  canUploadPlans?: boolean;
  pieceSeconds: number;
  maxPieces: number;
  maxMarks: number;
  walks: { id: string; walker: string | null; where: string | null; status: string; startedAt: string; seconds: number; pieces: number; walls: number; stillUrl: string | null }[];
};

type Phase = "loading" | "closed" | "ready" | "live" | "finishing" | "done";

export default function TraceRecorder({ token, plausible }: { token: string; plausible: boolean }) {
  const [phase, setPhase] = useState<Phase>(plausible ? "loading" : "closed");
  const [closed, setClosed] = useState<string>(plausible ? "" : closedLinkMessage("unknown")!);
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const base = `/api/trace/${encodeURIComponent(token)}`;

  const load = useCallback(async () => {
    const r = await fetch(base, { cache: "no-store" });
    const j = await r.json().catch(() => ({})) as Partial<Payload> & { ok?: boolean; state?: TraceLinkState };
    if (!r.ok || !j.ok) {
      setClosed(closedLinkMessage(j.state ?? "unknown") ?? "This link is not active.");
      setPhase("closed");
      return;
    }
    setData(j as Payload);
    setPhase((p) => (p === "loading" ? "ready" : p));
  }, [base]);

  useEffect(() => {
    if (!plausible) return;
    let alive = true;
    void (async () => {
      try {
        const r = await fetch(base, { cache: "no-store" });
        const j = await r.json().catch(() => ({})) as Partial<Payload> & { ok?: boolean; state?: TraceLinkState };
        if (!alive) return;
        if (!r.ok || !j.ok) {
          setClosed(closedLinkMessage(j.state ?? "unknown") ?? "This link is not active.");
          setPhase("closed");
          return;
        }
        setData(j as Payload);
        setPhase((p) => (p === "loading" ? "ready" : p));
      } catch {
        if (!alive) return;
        setClosed("Could not reach Zyvorah. Check your signal and reload.");
        setPhase("closed");
      }
    })();
    return () => { alive = false; };
  }, [plausible, base]);

  return (
    <main className="min-h-screen bg-cloud text-charcoal">
      <div className="mx-auto w-full max-w-md px-4 pb-16 pt-6">
        <p className="caps text-[0.68rem] tracking-[0.18em] text-mist">Zyvorah · Trace</p>

        {phase === "loading" && <p className="mt-8 text-sm text-slate">One moment…</p>}

        {phase === "closed" && (
          <div className="mt-8 rounded-[18px] border border-edge bg-surface p-5">
            <h1 className="font-display text-xl font-bold leading-tight">This link isn&rsquo;t open</h1>
            <p className="mt-2 text-sm text-slate">{closed}</p>
          </div>
        )}

        {data && phase === "ready" && (
          <Ready data={data} base={base} onSaved={load} onStart={() => setPhase("live")} />
        )}

        {data && (phase === "live" || phase === "finishing" || phase === "done") && (
          <Live
            base={base}
            data={data}
            phase={phase}
            setPhase={setPhase}
            onSaved={async () => { await load().catch(() => {}); }}
            setErr={setErr}
          />
        )}

        {err && <p className="mt-4 text-sm text-[color:var(--color-alert)]">{err}</p>}
      </div>
    </main>
  );
}

/* ───────────────────────────── Before the walk ─────────────────────────── */

function Ready({ data, base, onSaved, onStart }: { data: Payload; base: string; onSaved: () => Promise<void>; onStart: () => void }) {
  const [uploadPending, setUploadPending] = useState(false);
  const walked = data.walks.filter((w) => w.pieces > 0);
  return (
    <div className="mt-6">
      <h1 className="font-display text-2xl font-bold leading-tight">{data.campus.name}</h1>
      <p className="mt-1 text-sm text-slate">
        {data.campus.city ? `${data.campus.city} · ` : ""}walk for {data.account.name}
      </p>

      <div className="mt-6 rounded-[18px] border border-edge bg-surface p-5">
        <h2 className="font-display text-base font-bold">How this works</h2>
        <ol className="mt-3 space-y-2.5 text-sm text-slate">
          <li className="flex gap-3"><span className="font-display font-bold text-charcoal">1</span><span>Press <strong className="text-charcoal">Start walking</strong>. Your camera and microphone switch on.</span></li>
          <li className="flex gap-3"><span className="font-display font-bold text-charcoal">2</span><span>Walk and talk. Say where you are, what each space is for, and what you would like the wall to do.</span></li>
          <li className="flex gap-3"><span className="font-display font-bold text-charcoal">3</span><span>In front of each wall you want done, press <strong className="text-charcoal">Mark this wall</strong>.</span></li>
          <li className="flex gap-3"><span className="font-display font-bold text-charcoal">4</span><span>Press <strong className="text-charcoal">Finish</strong> when you are done. The recording saves in 3-minute pieces, up to 3 hours per walk. Wait for the saved confirmation.</span></li>
        </ol>
        {data.brief && (
          <p className="mt-4 whitespace-pre-line rounded-[12px] bg-wash px-3 py-2.5 text-sm text-slate">
            <span className="font-semibold text-charcoal">From Zyvorah: </span>{data.brief}
          </p>
        )}
        <p className="mt-4 text-xs text-mist">Keep the phone on this screen for the whole walk. Hold it upright, speak normally, and take your time.</p>
      </div>

      <p className="mt-4 text-sm text-slate">Follow your site’s recording permissions. Record empty spaces and walls only. Exclude patients, identifiable people and other people’s voices, medical records, screens and identifying labels. Live walkthrough narration is sent to OpenAI for automatic transcription. The transcript may be processed by Anthropic to organise wall notes for Zyvorah’s review. Anyone holding this link can use it; do not forward it publicly.</p>
      <TraceFileUpload base={base} recipient={data.recipient} allowPlans={data.canUploadPlans === true} onSaved={onSaved} onPending={setUploadPending} />
      <button type="button" disabled={uploadPending} onClick={onStart} className="btn mt-5 h-14 w-full text-[0.9rem] disabled:opacity-50">
        Start walking
      </button>

      {walked.length > 0 && (
        <div className="mt-8">
          <h2 className="font-display text-base font-bold">Already walked on this link</h2>
          <ul className="mt-3 space-y-2">
            {walked.map((w) => (
              <li key={w.id} className="flex items-center gap-3 rounded-[14px] border border-edge bg-surface p-3">
                {w.stillUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={w.stillUrl} alt="" className="h-12 w-16 flex-none rounded-[8px] object-cover" />
                ) : <div className="h-12 w-16 flex-none rounded-[8px] bg-wash" />}
                <div className="min-w-0 text-sm">
                  <p className="truncate font-semibold">{w.where ?? "A walk"}{w.walker ? ` · ${w.walker}` : ""}</p>
                  <p className="text-xs text-slate">{mmss(w.seconds)} · {w.walls} {w.walls === 1 ? "wall" : "walls"} marked · {new Date(w.startedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-mist">Each walk can cover a different part of the campus. Start another whenever you like.</p>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────── The walk itself ─────────────────────────── */

type Upload = { kind: "video" | "audio" | "still"; walkId: string; seq?: number; markId?: string; blob: Blob; contentType: string; seconds?: number };

function Live({
  base, data, phase, setPhase, onSaved, setErr,
}: {
  base: string; data: Payload; phase: Phase; setPhase: (p: Phase) => void;
  onSaved: () => Promise<void>; setErr: (e: string | null) => void;
}) {
  const [name, setName] = useState(data.recipient ?? "");
  const [where, setWhere] = useState("");
  const [asked, setAsked] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [piece, setPiece] = useState(1);
  const [marks, setMarks] = useState(0);
  const [lastMarkAt, setLastMarkAt] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [summary, setSummary] = useState<{ seconds: number; marks: number } | null>(null);

  const videoEl = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const vRec = useRef<MediaRecorder | null>(null);
  const aRec = useRef<MediaRecorder | null>(null);
  const vChunks = useRef<Blob[]>([]);
  const aChunks = useRef<Blob[]>([]);
  const walkStarted = useRef(0);
  const pieceStarted = useRef(0);
  const pieceSeq = useRef(1);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const walkId = useRef<string | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const rotating = useRef(false);
  const rotationJob = useRef<Promise<void> | null>(null);
  const startRequestId = useRef<string | null>(null);
  const failedJobs = useRef<Array<() => Promise<void>>>([]);
  const endedSeconds = useRef(0);
  const [saveFailed, setSaveFailed] = useState(false);
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null);
  const live = useRef(false);

  const stopTracks = useCallback(() => {
    if (ticker.current) clearInterval(ticker.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void wakeLock.current?.release().catch(() => {});
    wakeLock.current = null;
  }, []);

  // The camera and microphone must not stay live if this page goes away — a
  // phone still showing a recording light reads as the site watching you.
  useEffect(() => () => stopTracks(), [stopTracks]);

  // Leaving mid-walk is the one thing that loses something (the piece in hand).
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (live.current) { e.preventDefault(); } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const post = useCallback(async (path: string, body: Record<string, unknown>) => {
    const r = await fetch(`${base}${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({})) as { ok?: boolean; error?: string } & Record<string, unknown>;
    if (!r.ok || !j.ok) throw new Error(j.error ?? "Something didn't save.");
    return j;
  }, [base]);

  /** Sign, PUT, commit — with one retry, because a corridor's signal comes and goes. */
  const upload = useCallback(async (u: Upload) => {
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const signed = await post("/media", {
          action: "sign", kind: u.kind, walkId: u.walkId, seq: u.seq, markId: u.markId,
          bytes: u.blob.size, contentType: u.contentType,
        }) as { signedUrl: string };
        const put = await fetch(signed.signedUrl, { method: "PUT", headers: { "Content-Type": u.contentType }, body: u.blob });
        if (!put.ok) throw new Error("The upload didn't land.");
        await post("/media", {
          action: "commit", kind: u.kind, walkId: u.walkId, seq: u.seq, markId: u.markId,
          contentType: u.contentType, seconds: u.seconds,
        });
        return;
      } catch (e) {
        lastErr = e;
        await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("Could not save that piece.");
  }, [post]);

  /** Everything saves through one lane, in order, so a slow signal queues
   *  rather than floods. The counter is what the walker sees. */
  const enqueue = useCallback((label: string, job: () => Promise<void>) => {
    setPending((n) => n + 1);
    queue.current = queue.current
      .then(async () => { setStatus(label); await job(); })
      .catch((e) => { failedJobs.current.push(job); setErr(e instanceof Error ? e.message : "Something didn't save."); })
      .finally(() => { setPending((n) => Math.max(0, n - 1)); setStatus(null); });
    return queue.current;
  }, [setErr]);

  const startRecorders = useCallback((s: MediaStream) => {
    const vType = pick(VIDEO_TYPES);
    const aType = pick(AUDIO_TYPES);
    const v = vType ? new MediaRecorder(s, { mimeType: vType }) : new MediaRecorder(s);
    vChunks.current = [];
    v.ondataavailable = (e) => { if (e.data.size) vChunks.current.push(e.data); };
    v.start();
    vRec.current = v;
    const audioOnly = new MediaStream(s.getAudioTracks());
    const a = aType ? new MediaRecorder(audioOnly, { mimeType: aType }) : new MediaRecorder(audioOnly);
    aChunks.current = [];
    a.ondataavailable = (e) => { if (e.data.size) aChunks.current.push(e.data); };
    a.start();
    aRec.current = a;
    pieceStarted.current = Date.now();
  }, []);

  const settle = (rec: MediaRecorder | null, chunks: React.RefObject<Blob[]>, fallback: string) =>
    new Promise<{ blob: Blob; type: string } | null>((resolve) => {
      if (!rec || rec.state === "inactive") return resolve(null);
      rec.onstop = () => {
        const type = (rec.mimeType || "").split(";")[0] || fallback;
        resolve({ blob: new Blob(chunks.current, { type }), type });
      };
      rec.stop();
    });

  /** Close the piece in hand and hand its files to the save lane. */
  const closePiece = useCallback(async (seq: number, startNext: boolean) => {
    const id = walkId.current;
    const elapsed = Math.max(1, Math.round((Date.now() - pieceStarted.current) / 1000));
    const [video, audio] = await Promise.all([
      settle(vRec.current, vChunks, "video/webm"),
      settle(aRec.current, aChunks, "audio/webm"),
    ]);
    if (!id) return;
    if (video?.blob.size) {
      void enqueue(`Saving piece ${seq}…`, () => upload({ kind: "video", walkId: id, seq, blob: video.blob, contentType: video.type, seconds: elapsed }));
    }
    if (audio?.blob.size) {
      void enqueue(`Saving the words of piece ${seq}…`, async () => {
        await upload({ kind: "audio", walkId: id, seq, blob: audio.blob, contentType: audio.type });
        // Transcription is asked for and not waited on: it is a view of the
        // recording, and the walk must never stall on it.
        void fetch(`${base}/transcribe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ walkId: id, seq }) }).catch(() => {});
      });
    }
    if (startNext && live.current && stream.current) {
      await post("", { action: "piece", walkId: id, seq: seq + 1 });
      if (live.current && stream.current) {
        pieceSeq.current = seq + 1;
        setPiece(seq + 1);
        startRecorders(stream.current);
      }
    }
  }, [post, startRecorders, enqueue, upload, base]);

  async function begin() {
    setErr(null);
    setAsked(true);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setErr("This browser can't record video. Open the link in Safari or Chrome.");
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      stream.current = s;
      if (videoEl.current) {
        videoEl.current.srcObject = s;
        await videoEl.current.play().catch(() => {});
      }
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
        wakeLock.current = (await nav.wakeLock?.request("screen")) ?? null;
      } catch { /* a screen that sleeps is a nuisance, not a failure */ }

      // The row exists before a single frame is recorded, so every piece and
      // tap from here on has somewhere to land even if the phone dies mid-walk.
      startRequestId.current ??= crypto.randomUUID();
      const j = await post("", { action: "start", requestId: startRequestId.current, walkerName: name, where }) as { walkId: string };
      walkId.current = j.walkId;
      await post("", { action: "piece", walkId: j.walkId, seq: 1 });

      pieceSeq.current = 1;
      setPiece(1);
      startRecorders(s);
      walkStarted.current = Date.now();
      live.current = true;
      setSeconds(0); setMarks(0); setLastMarkAt(null);
      ticker.current = setInterval(() => {
        const el = Math.round((Date.now() - walkStarted.current) / 1000);
        setSeconds(el);
        const inPiece = (Date.now() - pieceStarted.current) / 1000;
        if (inPiece >= data.pieceSeconds && !rotating.current) {
          rotating.current = true;
          const seq = pieceSeq.current;
          if (seq >= data.maxPieces) { void finish(); return; }
          rotationJob.current = closePiece(seq, true).catch((e) => { setErr(e instanceof Error ? e.message : "Recording stopped while saving. Please review the saved walk."); void finish(); }).finally(() => { rotating.current = false; rotationJob.current = null; });
        }
        if (el >= MAX_WALK_SECONDS) void finish();
      }, 250);
    } catch (e) {
      stopTracks();
      setErr(e instanceof Error && !/getUserMedia|Permission|NotAllowed|NotFound/i.test(e.message)
        ? e.message
        : "We couldn't reach the camera. Allow the camera and microphone in your browser, then try again.");
    }
  }

  /** Enqueue the entire mark operation before Finish can drain the queue. */
  function markWall() {
    const id = walkId.current;
    const el = videoEl.current;
    if (!id || !el || !live.current) return;
    const walkSeconds = (Date.now() - walkStarted.current) / 1000;
    const atSeconds = (Date.now() - pieceStarted.current) / 1000;
    const seq = pieceSeq.current;
    const canvas = document.createElement("canvas");
    canvas.width = el.videoWidth || 1280;
    canvas.height = el.videoHeight || 720;
    const context = canvas.getContext("2d");
    if (!context) { setErr("Could not capture this wall. Try again."); return; }
    context.drawImage(el, 0, 0, canvas.width, canvas.height);
    const captured = new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    const requestId = crypto.randomUUID();
    let markId: string | null = null;
    setMarks((n) => n + 1);
    setLastMarkAt(walkSeconds);
    if (navigator.vibrate) navigator.vibrate(40);
    void enqueue("Saving the wall…", async () => {
      const blob = await captured;
      if (!blob) throw new Error("This wall photo could not be captured. Do not close the page; contact Zyvorah.");
      if (!markId) {
        const result = await post("", { action: "mark", requestId, walkId: id, seq, atSeconds, walkSeconds }) as { markId: string };
        markId = result.markId;
      }
      await upload({ kind: "still", walkId: id, markId, blob, contentType: "image/jpeg" });
    });
  }

  async function finish() {
    if (!live.current && !saveFailed) return;
    const retrying = saveFailed;
    setSaveFailed(false);
    live.current = false;
    if (ticker.current) clearInterval(ticker.current);
    setPhase("finishing");
    if (!retrying) endedSeconds.current = Math.max(1, Math.round((Date.now() - walkStarted.current) / 1000));
    const total = endedSeconds.current;
    setErr(null);
    try {
      await rotationJob.current;
      if (!retrying) await closePiece(pieceSeq.current, false);
      stopTracks();
      await queue.current;
      const retry = failedJobs.current.splice(0);
      for (const job of retry) {
        try { await job(); } catch { failedJobs.current.push(job); }
      }
      if (failedJobs.current.length) throw new Error("Some files have not saved. Keep this page open and press Retry saving.");
      if (walkId.current) await post("", { action: "end", walkId: walkId.current, seconds: total });
      setSummary({ seconds: total, marks });
      setPhase("done");
      await onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "The walk was recorded but part of it could not be saved. Keep this page open and try Finish again.");
      stopTracks();
      setSaveFailed(true);
      setPhase("live");
    }
  }

  const sinceMark = lastMarkAt == null ? null : seconds - lastMarkAt;
  const coach = coachWalker({ seconds, marks, maxSeconds: MAX_WALK_SECONDS, sinceMark });
  const recording = live.current && phase === "live";

  if (phase === "done" && summary) {
    return (
      <div className="mt-6">
        <h1 className="font-display text-2xl font-bold leading-tight">Walk saved</h1>
        <p className="mt-2 text-sm text-slate">
          {mmss(summary.seconds)} of walking and {summary.marks} {summary.marks === 1 ? "wall" : "walls"} marked are with Zyvorah now. Thank you — this is exactly what a site visit would have given us.
        </p>
        <div className="mt-6 rounded-[18px] border border-edge bg-surface p-5 text-sm text-slate">
          <p>Another part of the campus to show? Start another walk from this same link whenever you like.</p>
        </div>
        <button type="button" onClick={() => { setSummary(null); setAsked(false); setPhase("ready"); }} className="btn mt-5 h-14 w-full text-[0.9rem]">
          Back
        </button>
      </div>
    );
  }

  if (!asked) {
    return (
      <div className="mt-6">
        <h1 className="font-display text-2xl font-bold leading-tight">Before you start</h1>
        <label className="mt-5 block text-sm">
          <span className="font-semibold">Your name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name"
            className="mt-1.5 h-12 w-full rounded-[12px] border border-edge bg-surface px-3 text-base focus:border-charcoal focus:outline-none" />
        </label>
        <label className="mt-4 block text-sm">
          <span className="font-semibold">Where are you starting?</span>
          <span className="block text-xs text-mist">For example, main entrance, A block ground floor</span>
          <input value={where} onChange={(e) => setWhere(e.target.value)}
            className="mt-1.5 h-12 w-full rounded-[12px] border border-edge bg-surface px-3 text-base focus:border-charcoal focus:outline-none" />
        </label>
        <button type="button" onClick={begin} className="btn mt-6 h-14 w-full text-[0.9rem]">
          Switch on the camera
        </button>
        <button type="button" onClick={() => setPhase("ready")} className="mt-3 w-full py-3 text-sm text-slate underline">
          Not now
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="relative overflow-hidden rounded-[18px] bg-charcoal">
        <video ref={videoEl} muted playsInline autoPlay className="aspect-[3/4] w-full object-cover" />
        {recording && (
          <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/55 px-3 py-1 text-xs font-semibold text-white">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
            {mmss(seconds)} · piece {piece}
          </div>
        )}
        {marks > 0 && (
          <div className="absolute right-3 top-3 rounded-full bg-black/55 px-3 py-1 text-xs font-semibold text-white">
            {marks} {marks === 1 ? "wall" : "walls"}
          </div>
        )}
      </div>

      {phase === "live" && !recording && !walkId.current && (
        <p className="mt-3 text-sm text-slate">Allow the camera and microphone when your phone asks.</p>
      )}

      {saveFailed && <button type="button" onClick={finish} className="btn mt-4 h-12 w-full">Retry saving</button>}
      {recording && (
        <>
          <p className={`mt-4 min-h-[2.5rem] text-center text-sm ${coach.urging ? "font-semibold text-charcoal" : "text-slate"}`}>
            {coach.say}
          </p>
          <button type="button" onClick={markWall}
            className={`btn mt-3 h-16 w-full text-[1rem] ${coach.urging ? "" : "btn-ghost"}`}>
            Mark this wall
          </button>
          <button type="button" onClick={finish} className="mt-3 h-12 w-full rounded-full border border-edge bg-surface text-sm font-semibold">
            Finish the walk
          </button>
          <p className="mt-3 min-h-[1.25rem] text-center text-xs text-mist">
            {status ?? (pending > 0 ? `Saving… (${pending})` : "Saved so far")}
          </p>
        </>
      )}

      {phase === "finishing" && (
        <div className="mt-5 rounded-[18px] border border-edge bg-surface p-5 text-sm">
          <p className="font-display font-bold">Saving the last of the walk…</p>
          <p className="mt-1 text-slate">{status ?? "Nearly there."} Keep this page open until it says saved.</p>
        </div>
      )}
    </div>
  );
}
