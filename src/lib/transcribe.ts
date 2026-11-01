import "server-only";

// ─── Speech to text ─────────────────────────────────────────────────────────
//
// The first server-side transcription on this site. What already existed only
// looked like one: VoiceCall.tsx receives transcript STRINGS from VAPI, whose
// cloud does the listening, and /api/admin/crm/dictate is a misnomer — it takes
// typed text. Neither can transcribe a file we hold.
//
// Whisper over raw fetch, with the key and the shape the image provider already
// uses (src/lib/marketing/providers/openai.ts). No SDK is added for one call.
//
// EVERY FAILURE IS RETURNED, NEVER THROWN. That is the contract that matters:
// the audio is the record and the transcript is a derived view of it, so a
// transcription that cannot run right now must degrade to "no transcript yet,
// here is why" and leave the recording untouched and re-runnable. It must never
// fail the request that saved the recording — losing what somebody said on site
// means sending them back to the building, which is the thing this feature
// exists to abolish.

const ENDPOINT = "https://api.openai.com/v1/audio/transcriptions";
const DEFAULT_MODEL = "whisper-1";
/** Whisper's own limit. A per-wall note is seconds long; anything near this is
 *  a walkthrough recording that belongs in a different flow. */
const MAX_BYTES = 25 * 1024 * 1024;
const TIMEOUT_MS = 120_000;

/** A stretch of speech with the seconds it occupied.
 *
 *  Wanted for a walkthrough and pointless for a per-wall note: a walk is one
 *  continuous narration covering several walls, so knowing WHEN something was
 *  said is what lets it be attached to the wall the walker was standing in
 *  front of at the time. */
export type TranscriptSegment = { start: number; end: number; text: string };

export type Transcription =
  | { ok: true; text: string; segments?: TranscriptSegment[] }
  | { ok: false; error: string };

/**
 * Transcribe a site recording.
 *
 * The default stays on Whisper because walkthrough callers can request its
 * timestamped verbose segments. Callers that only need accurate text can opt
 * into a newer transcription model without changing that response contract.
 */
export async function transcribeAudio(
  audio: ArrayBuffer,
  filename: string,
  contentType: string,
  opts: {
    language?: string;
    model?: "whisper-1" | "gpt-transcribe";
    prompt?: string;
    segments?: boolean;
  } = {},
): Promise<Transcription> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false, error: "transcription is not configured" };
  if (audio.byteLength === 0) return { ok: false, error: "the recording was empty" };
  if (audio.byteLength > MAX_BYTES) {
    return { ok: false, error: "the recording is too long to transcribe" };
  }

  const form = new FormData();
  form.append("model", opts.model ?? DEFAULT_MODEL);
  form.append("file", new Blob([new Uint8Array(audio)], { type: contentType }), filename);
  if (opts.language !== "auto") form.append("language", opts.language ?? "en");
  // verbose_json is the only shape that carries segment timings. Asked for only
  // when a caller wants them, so a per-wall note keeps the smaller response.
  if (opts.segments) form.append("response_format", "verbose_json");
  // Steers spelling toward the vocabulary of the room rather than a homophone —
  // "lift lobby" over "left lobby", and the building's own name intact.
  if (opts.prompt) form.append("prompt", opts.prompt.slice(0, 800));

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[transcribe] ${res.status}: ${body.slice(0, 300)}`);
      // Said in terms of what the reader can do about it. A billing failure is
      // ours to fix and theirs to wait out; it must not read as "your recording
      // was bad", because the recording is fine and is still there.
      return {
        ok: false,
        error: res.status === 429 || res.status === 402
          ? "transcription is unavailable just now — the recording is saved and can be transcribed later"
          : `transcription failed (${res.status})`,
      };
    }
    const json = (await res.json()) as {
      text?: string;
      segments?: { start?: number; end?: number; text?: string }[];
    };
    const text = (json.text ?? "").trim();
    if (!text) return { ok: false, error: "nothing audible in the recording" };

    const segments = json.segments
      ?.map((s) => ({
        start: Number(s.start) || 0,
        end: Number(s.end) || 0,
        text: (s.text ?? "").trim(),
      }))
      .filter((s) => s.text);

    return { ok: true, text, ...(segments?.length ? { segments } : {}) };
  } catch (e) {
    const why = e instanceof Error && e.name === "TimeoutError"
      ? "transcription timed out" : "transcription could not be reached";
    console.error("[transcribe]", why, e);
    return { ok: false, error: `${why} — the recording is saved and can be transcribed later` };
  }
}

/** Audio types a browser's MediaRecorder actually produces, mapped to the file
 *  extension we store them under.
 *
 *  An allow-list because the storage path is derived server-side from this: the
 *  caller says what it recorded, and anything not on the list is refused rather
 *  than becoming part of a path. Chrome and Android give webm/opus; iOS Safari
 *  gives mp4/aac, which is why both are here and why the recorder tries them in
 *  that order. */
export const AUDIO_TYPES: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
};

/** The extension for a recorded MIME type, or null if we do not accept it.
 *  Codec parameters are stripped — MediaRecorder reports
 *  'audio/webm;codecs=opus' and the container is what decides the extension. */
export function audioExtension(contentType: string): string | null {
  const base = String(contentType ?? "").split(";")[0].trim().toLowerCase();
  return AUDIO_TYPES[base] ?? null;
}
