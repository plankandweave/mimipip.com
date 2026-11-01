"use client";

import { useEffect, useRef, useState } from "react";

// Say what the wall is for.
//
// The brief for a commercial space is held as a thought, not as prose — "this
// is the arrival for the whole building, it should feel calm before anyone
// reads a word". Asking someone standing in that lobby to type it produces two
// words; asking them to say it produces the brief.
//
// Typing stays available everywhere this is used and is never second-class: a
// marble lobby at 9am is not always somewhere you want to talk to your phone.

/** Container preference. Chrome and Android give webm/opus; iOS Safari supports
 *  neither MediaRecorder option above and needs mp4. The order matters — Safari
 *  will happily accept a webm mimeType string and then produce nothing. */
const PREFERRED = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

/** Long enough for a real brief, short enough that nobody uploads a meeting.
 *  The walkthrough recording is a different feature with different limits. */
const MAX_SECONDS = 180;

function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const t of PREFERRED) {
    if (MediaRecorder.isTypeSupported?.(t)) return t;
  }
  // Safari has reported an empty string here and still recorded correctly —
  // letting the browser choose beats refusing to record at all.
  return "";
}

export type Recording = { blob: Blob; contentType: string; seconds: number };

export default function VoiceNote({
  existingUrl, existingSeconds, transcript, note, disabled, onRecorded, onRemove,
}: {
  /** A note already saved on this wall, for playback. */
  existingUrl?: string | null;
  existingSeconds?: number | null;
  /** The transcript, when one could be made. */
  transcript?: string | null;
  /** Why there is no transcript for audio that does exist. */
  note?: string | null;
  disabled?: boolean;
  onRecorded: (r: Recording) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const started = useRef<number>(0);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);

  // Support is NOT feature-detected up front. On the server MediaRecorder is
  // always undefined, so detecting during render would paint "this browser
  // can't record" and then correct itself on hydration — every visitor would
  // see the wrong answer first. The button is offered to everyone and start()
  // reports the truth on the one click that actually needs it.

  // Release the microphone if the component goes away mid-recording — a browser
  // that keeps showing a recording indicator after the panel closed reads as
  // the site listening to you.
  useEffect(() => () => {
    if (ticker.current) clearInterval(ticker.current);
    recorder.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  async function start() {
    setErr(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setErr("This browser can't record audio — type the brief above instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMimeType();
      const rec = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      chunks.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (ticker.current) clearInterval(ticker.current);
        setRecording(false);

        // What the recorder actually produced, not what we asked for — Safari
        // hands back mp4 having been asked for something else.
        const type = (rec.mimeType || mimeType || "audio/webm").split(";")[0];
        const blob = new Blob(chunks.current, { type });
        const elapsed = Math.max(1, Math.round((Date.now() - started.current) / 1000));
        if (!blob.size) { setErr("Nothing was recorded. Try again."); return; }

        setBusy(true);
        try {
          await onRecorded({ blob, contentType: type, seconds: elapsed });
        } catch {
          setErr("That didn't save. Your recording is still here — try again.");
        } finally { setBusy(false); }
      };

      started.current = Date.now();
      setSeconds(0);
      rec.start();
      recorder.current = rec;
      setRecording(true);

      ticker.current = setInterval(() => {
        const elapsed = Math.round((Date.now() - started.current) / 1000);
        setSeconds(elapsed);
        if (elapsed >= MAX_SECONDS) stop();
      }, 250);
    } catch {
      // Almost always a denied permission prompt. Say which, and say what to do.
      setErr("We couldn't reach the microphone. Allow it in your browser, or type the brief instead.");
    }
  }

  function stop() {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="rounded-[12px] border border-edge bg-surface p-3">
      {existingUrl ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium">
              Voice note{existingSeconds ? ` · ${mmss(existingSeconds)}` : ""}
            </p>
            <button type="button" onClick={() => void onRemove()} disabled={disabled || busy}
              className="text-xs text-slate underline disabled:opacity-50">
              Remove
            </button>
          </div>
          {/* The transcript rendered below is this recording's caption. */}
          <audio src={existingUrl} controls className="w-full" />

          {transcript ? (
            <div>
              <p className="text-[0.7rem] uppercase tracking-wide text-mist">Transcript</p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm">{transcript}</p>
            </div>
          ) : (
            // The recording is safe; only the derived step is missing. Say that
            // plainly rather than letting it read as a lost note.
            <p className="text-xs text-slate">
              {note
                ? `Saved, not yet written out — ${note}.`
                : "Saved. The written version will follow."}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {recording ? (
            <>
              <button type="button" onClick={stop}
                className="btn h-9 px-4 text-[0.78rem]">Stop</button>
              <span className="flex items-center gap-2 text-xs text-slate">
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" aria-hidden />
                Recording {mmss(seconds)}
                {seconds > MAX_SECONDS - 30 && ` · stops at ${mmss(MAX_SECONDS)}`}
              </span>
            </>
          ) : (
            <>
              <button type="button" onClick={() => void start()} disabled={disabled || busy}
                className="rounded-[10px] border border-edge px-4 py-2 text-xs disabled:opacity-50">
                {busy ? "Saving…" : "Record the brief"}
              </button>
              <span className="text-xs text-mist">Or just type it above.</span>
            </>
          )}
        </div>
      )}

      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
    </div>
  );
}
