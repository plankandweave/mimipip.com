"use client";

import { useEffect, useRef, useState } from "react";
import {
  audioType,
  isPicture,
  MAX_AUDIO_BYTES,
  MAX_RECORDING_SECONDS,
  parseImageNotes,
  TRANSCRIPTION_NOTICE,
  type ImageMark,
  type ImageNotes,
} from "@/lib/vault-image-notes";
import { MAX_VAULT_FILE_BYTES, vaultFileExtension } from "@/lib/vault-kinds";
import type { VaultDocument } from "@/lib/vault";

const field =
  "mt-1 min-h-11 w-full rounded-xl border border-edge bg-white px-3 py-2 text-sm";
const button =
  "min-h-11 rounded-xl border border-edge px-3 py-2 text-sm disabled:opacity-50";
async function post(body: Record<string, unknown>) {
  const r = await fetch("/api/corporate/vault", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok || !j.ok)
    throw new Error(j.error ?? "Could not save. Please retry.");
  return j as {
    id: string;
    signedUrl?: string;
    contentType?: string;
    complete?: boolean;
  };
}
export async function sendVaultFile(
  file: File,
  uploadKey: string,
  details: Record<string, unknown>,
) {
  const slot = await post({
    action: "sign",
    ...details,
    uploadKey,
    fileName: file.name,
    contentType: file.type,
    bytes: file.size,
  });
  if (slot.complete) return slot.id;
  if (!slot.signedUrl) throw new Error("Could not prepare the upload.");
  const r = await fetch(slot.signedUrl, {
    method: "PUT",
    headers: { "Content-Type": slot.contentType ?? file.type },
    body: file,
  });
  // A previous interrupted response may already have committed the slot.
  if (!r.ok && r.status !== 409)
    throw new Error("Upload interrupted. Keep this page open and retry.");
  await post({ action: "commit", id: slot.id });
  return slot.id;
}
function usePreview(file: File | null) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true;
    const u = file ? URL.createObjectURL(file) : "";
    queueMicrotask(() => {
      if (active) setUrl(u);
    });
    return () => {
      active = false;
      if (u) URL.revokeObjectURL(u);
    };
  }, [file]);
  return url;
}

/** Coordinates are normalized to the whole image, never a cropped thumbnail. */
export function MarkedPicture({
  url,
  notes,
  onPoint,
}: {
  url: string;
  notes: ImageNotes;
  onPoint?: (x: number, y: number) => void;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const broken = Boolean(url && failedUrl === url);
  return (
    <div>
      <div className="relative overflow-hidden rounded-xl border border-edge bg-wash">
        {url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={url}
            src={url}
            alt={`${notes.space || "Space"} — ${notes.wall || "wall"}`}
            onError={() => setFailedUrl(url)}
            className="block h-auto w-full"
          />
        )}
        {url && !broken && (
          <svg
            viewBox="0 0 1000 1000"
            preserveAspectRatio="none"
            aria-label="Picture annotations"
            className="pointer-events-none absolute inset-0 h-full w-full"
          >
            {notes.marks
              .filter((m) => m.kind === "arrow")
              .map(
                (m, i) =>
                  m.kind === "arrow" && (
                    <g
                      key={i}
                      fill="none"
                      stroke="#9e422d"
                      strokeWidth="5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path
                        d={`M ${m.x * 1000} ${m.y * 1000} Q ${(m.x + m.x2) * 500 + 8} ${(m.y + m.y2) * 500 - 8} ${m.x2 * 1000} ${m.y2 * 1000}`}
                      />
                      <path
                        d={`M ${m.x2 * 1000 - 22 * Math.cos(Math.atan2(m.y2 - m.y, m.x2 - m.x) - 0.5)} ${m.y2 * 1000 - 22 * Math.sin(Math.atan2(m.y2 - m.y, m.x2 - m.x) - 0.5)} L ${m.x2 * 1000} ${m.y2 * 1000} L ${m.x2 * 1000 - 22 * Math.cos(Math.atan2(m.y2 - m.y, m.x2 - m.x) + 0.5)} ${m.y2 * 1000 - 22 * Math.sin(Math.atan2(m.y2 - m.y, m.x2 - m.x) + 0.5)}`}
                      />
                    </g>
                  ),
              )}
          </svg>
        )}
        {url &&
          !broken &&
          notes.marks.map(
            (m, i) =>
              m.kind === "note" && (
                <span
                  key={i}
                  className="vault-handwriting pointer-events-none absolute line-clamp-3 max-w-[45%] whitespace-pre-wrap break-words rounded bg-[#fff8dc]/95 px-2 text-lg leading-tight text-[#682c20]"
                  style={{
                    left: `${m.x * 100}%`,
                    top: `${m.y * 100}%`,
                    transform: `translate(${m.x > 0.5 ? "-100%" : "0"},${m.y > 0.5 ? "-100%" : "0"})`,
                  }}
                >
                  {m.text}
                </span>
              ),
          )}
        {onPoint && url && !broken && (
          <button
            type="button"
            aria-label="Place annotation on picture"
            className="absolute inset-0 h-full w-full cursor-crosshair"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              onPoint(
                (e.clientX - r.left) / r.width,
                (e.clientY - r.top) / r.height,
              );
            }}
          />
        )}
      </div>
      {broken && (
        <p className="mt-2 text-sm text-slate">
          This browser cannot preview this image. Labels still save; use JPEG,
          PNG or WebP to place notes and arrows.
        </p>
      )}
    </div>
  );
}

export function AnnotationEditor({
  url,
  value,
  onChange,
  disabled,
}: {
  url: string;
  value: ImageNotes;
  onChange: (n: ImageNotes) => void;
  disabled: boolean;
}) {
  const [mode, setMode] = useState<"note" | "arrow" | null>(null),
    [text, setText] = useState(""),
    [start, setStart] = useState<[number, number] | null>(null);
  const add = (mark: ImageMark) => {
    if (value.marks.length < 30)
      onChange({ ...value, marks: [...value.marks, mark] });
    setMode(null);
    setStart(null);
    setText("");
  };
  return (
    <div className="mt-4">
      <MarkedPicture
        url={url}
        notes={value}
        onPoint={
          !disabled && mode
            ? (x, y) => {
                if (mode === "note" && text.trim())
                  add({ kind: "note", x, y, text: text.trim() });
                else if (mode === "arrow") {
                  if (start)
                    add({
                      kind: "arrow",
                      x: start[0],
                      y: start[1],
                      x2: x,
                      y2: y,
                    });
                  else setStart([x, y]);
                }
              }
            : undefined
        }
      />
      <p className="mt-2 text-xs text-slate">
        Notes and arrows are optional. The original picture stays unchanged.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className={button}
          disabled={disabled || value.marks.length >= 30}
          onClick={() => {
            setMode("note");
            setStart(null);
          }}
        >
          Add note
        </button>
        <button
          type="button"
          className={button}
          disabled={disabled || value.marks.length >= 30}
          onClick={() => {
            setMode("arrow");
            setStart(null);
          }}
        >
          Add arrow
        </button>
        <button
          type="button"
          className={button}
          disabled={disabled || !value.marks.length}
          onClick={() => {
            setMode(null);
            setStart(null);
            setText("");
            onChange({ ...value, marks: value.marks.slice(0, -1) });
          }}
        >
          Undo last
        </button>
        {mode && (
          <button
            type="button"
            className={button}
            onClick={() => {
              setMode(null);
              setStart(null);
              setText("");
            }}
          >
            Cancel annotation
          </button>
        )}
      </div>
      {mode === "note" && (
        <label className="mt-2 block text-sm">
          Your note
          <input
            className={field}
            maxLength={180}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="For example: keep this switch accessible"
            disabled={disabled}
          />
          <span className="mt-1 block text-xs">
            Type, then tap the picture to place it.
          </span>
          <button
            type="button"
            className={`${button} mt-2`}
            disabled={disabled || !text.trim()}
            onClick={() =>
              add({ kind: "note", text: text.trim(), x: 0.05, y: 0.05 })
            }
          >
            Place at top left
          </button>
        </label>
      )}
      {mode === "arrow" && (
        <p role="status" className="mt-2 text-sm">
          {start
            ? "Now tap where the arrow should point."
            : "Tap where the arrow begins, then where it should point."}
        </p>
      )}
    </div>
  );
}

export function AudioNote({
  parentId,
  onChanged,
}: {
  parentId: string;
  onChanged: () => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null),
    [key, setKey] = useState(""),
    [recording, setRecording] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    alive = useRef(true),
    busyRef = useRef(false);
  const url = usePreview(file);
  const stop = () => {
    if (recorder.current?.state === "recording") recorder.current.stop();
    stream.current?.getTracks().forEach((t) => t.stop());
    if (timer.current) clearTimeout(timer.current);
  };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stop();
    };
  }, []);
  function choose(f: File | null) {
    setError("");
    setSaved(false);
    if (!f) return;
    if (!audioType(f.type, f.name)) {
      setError("Choose MP3, M4A, WAV, OGG or WebM audio.");
      return;
    }
    if (!f.size || f.size > MAX_AUDIO_BYTES) {
      setError("Audio must be between 1 byte and 12 MB.");
      return;
    }
    setFile(f);
    setKey(crypto.randomUUID());
  }
  async function record() {
    if (busyRef.current) return;
    busyRef.current = true;
    setError("");
    setBusy(true);
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      )
        throw new Error(
          "Recording is unavailable in this browser. Choose an audio file instead.",
        );
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = s;
      const mime = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ].find((t) => MediaRecorder.isTypeSupported(t));
      if (!mime)
        throw new Error(
          "Recording format unavailable. Choose an audio file instead.",
        );
      const r = new MediaRecorder(s, { mimeType: mime });
      recorder.current = r;
      const chunks: Blob[] = [];
      let bytes = 0,
        tooLarge = false,
        failed = false;
      r.ondataavailable = (e) => {
        bytes += e.data.size;
        if (bytes > MAX_AUDIO_BYTES) {
          tooLarge = true;
          stop();
        } else chunks.push(e.data);
      };
      r.onerror = () => {
        failed = true;
        stop();
        if (alive.current)
          setError(
            "Recording stopped unexpectedly. Please retry or choose a file.",
          );
      };
      r.onstop = () => {
        s.getTracks().forEach((t) => t.stop());
        if (timer.current) clearTimeout(timer.current);
        if (!alive.current) return;
        setRecording(false);
        if (failed) return;
        if (tooLarge) {
          setError("Recording exceeded 12 MB. Try a shorter note.");
          return;
        }
        const format = audioType(mime, "");
        choose(
          new File(chunks, `audio-note.${format?.ext ?? "webm"}`, {
            type: mime,
          }),
        );
      };
      r.start(1000);
      setRecording(true);
      timer.current = setTimeout(stop, MAX_RECORDING_SECONDS * 1000);
    } catch (e) {
      stop();
      setError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Microphone permission was denied. You can choose an audio file instead."
          : (e as Error).message,
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function save() {
    if (!file || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await sendVaultFile(file, key, { action: "audio-sign", parentId });
      setSaved(true);
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }
  return (
    <div className="mt-4 rounded-xl border border-edge bg-wash p-3">
      <h4 className="text-sm font-semibold">Audio note · optional</h4>
      <p className="mt-1 text-xs text-slate">
        Record up to 2 minutes or choose an audio file up to 12 MB.{" "}
        {TRANSCRIPTION_NOTICE}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className={button}
          disabled={busy || saved}
          onClick={() => (recording ? stop() : void record())}
        >
          {recording ? "Stop recording" : "Record audio"}
        </button>
        <label className={`${button} cursor-pointer`}>
          Choose audio
          <input
            aria-label="Choose audio"
            type="file"
            accept="audio/*,.m4a,.mp3,.wav,.ogg,.webm"
            className="sr-only"
            disabled={busy || recording || saved}
            onChange={(e) => {
              choose(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {recording && (
        <p role="status" className="mt-2 text-sm">
          Recording… stops automatically after 2 minutes.
        </p>
      )}
      {file && url && (
        <div className="mt-3">
          <audio controls src={url} className="w-full" />
          <p className="mt-1 break-words text-xs">{file.name}</p>
          <button
            type="button"
            className={`${button} mt-2`}
            disabled={busy || recording || saved}
            onClick={() => void save()}
          >
            {saved
              ? "Audio saved"
              : busy
                ? "Saving audio…"
                : "Save audio with picture"}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

type Draft = { file: File; key: string };
function DraftFile({
  draft,
  onChanged,
}: {
  draft: Draft;
  onChanged: () => Promise<void>;
}) {
  const picture = isPicture(
    vaultFileExtension(draft.file.type, draft.file.name) ?? "",
  );
  const [notes, setNotes] = useState<ImageNotes>({
      space: "",
      wall: "",
      marks: [],
    }),
    [busy, setBusy] = useState(false),
    [locked, setLocked] = useState(false),
    [id, setId] = useState(""),
    [error, setError] = useState("");
  const busyRef = useRef(false),
    url = usePreview(picture ? draft.file : null);
  async function save() {
    if (busyRef.current || id) return;
    setError("");
    try {
      if (picture) parseImageNotes(notes);
      if (!draft.file.size || draft.file.size > MAX_VAULT_FILE_BYTES)
        throw new Error("Choose a file between 1 byte and 120 MB.");
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setLocked(true);
    try {
      const saved = await sendVaultFile(draft.file, draft.key, {
        imageNotes: picture ? notes : undefined,
      });
      setId(saved);
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  return (
    <article className="mt-4 min-w-0 rounded-2xl border border-edge p-3">
      <p className="break-words text-sm font-semibold">{draft.file.name}</p>
      {picture && (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Space <span className="text-slate">(required)</span>
              <input
                aria-label={`Space for ${draft.file.name}`}
                required
                maxLength={100}
                className={field}
                value={notes.space}
                disabled={locked}
                onChange={(e) => setNotes({ ...notes, space: e.target.value })}
                placeholder="For example: OPD consultation room 1"
              />
            </label>
            <label className="text-sm">
              Wall <span className="text-slate">(required)</span>
              <input
                aria-label={`Wall for ${draft.file.name}`}
                required
                maxLength={100}
                className={field}
                value={notes.wall}
                disabled={locked}
                onChange={(e) => setNotes({ ...notes, wall: e.target.value })}
                placeholder="For example: wall behind the desk"
              />
            </label>
          </div>
          <AnnotationEditor
            url={url}
            value={notes}
            onChange={setNotes}
            disabled={locked}
          />
        </>
      )}
      <button
        type="button"
        className="btn mt-4 min-h-11 px-5 text-sm"
        disabled={busy || Boolean(id)}
        onClick={() => void save()}
      >
        {id
          ? "Saved"
          : busy
            ? "Saving…"
            : locked
              ? "Retry upload"
              : picture
                ? "Save labelled picture"
                : "Save document"}
      </button>
      {locked && !id && (
        <p className="mt-2 text-xs text-slate">
          Keep this page open to retry the same upload. To change labels or
          notes, remove this draft and choose the file again.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {picture && id && <AudioNote parentId={id} onChanged={onChanged} />}
    </article>
  );
}
export default function VaultImageUpload({
  onChanged,
}: {
  onChanged: () => Promise<void>;
}) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  return (
    <section className="mt-6 rounded-2xl border border-edge bg-surface p-4">
      <h3 className="font-display text-lg font-bold">Add pictures and plans</h3>
      <p className="mt-1 text-sm text-slate">
        Give every picture a space and wall label. Notes, arrows and audio are
        optional. Plans and documents can be added as they are.
      </p>
      <label className="btn mt-3 inline-flex min-h-11 cursor-pointer items-center px-5 text-sm">
        Choose files
        <input
          aria-label="Choose Vault files"
          type="file"
          multiple
          className="sr-only"
          accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.svg,.dwg,.dxf,.docx,.pptx,.xlsx,.doc,.ppt,.txt,.zip"
          onChange={(e) => {
            // Snapshot before clearing the input: React may run the updater later.
            const files = Array.from(e.target.files ?? []);
            setDrafts((d) => [
              ...d,
              ...files.map((file) => ({
                file,
                key: crypto.randomUUID(),
              })),
            ]);
            e.target.value = "";
          }}
        />
      </label>
      <p className="mt-2 text-xs text-slate">
        Up to 120 MB per file. Review each picture before saving.
      </p>
      {drafts.map((d) => (
        <div key={d.key}>
          <DraftFile draft={d} onChanged={onChanged} />
          <button
            type="button"
            className={`${button} mt-2`}
            onClick={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))}
          >
            Close this draft
          </button>
        </div>
      ))}
    </section>
  );
}

export function PictureDetails({
  doc,
  audio,
  onChanged,
}: {
  doc: VaultDocument;
  audio: VaultDocument[];
  onChanged: () => Promise<void>;
}) {
  if (!doc.imageNotes || !doc.url) return null;
  return (
    <div className="mt-3">
      <p className="mb-2 text-sm font-medium">
        {doc.imageNotes.space} · {doc.imageNotes.wall}
      </p>
      <MarkedPicture url={doc.url} notes={doc.imageNotes} />
      {doc.imageNotes.marks.some((m) => m.kind === "note") && (
        <ul className="mt-2 space-y-1 text-sm">
          {doc.imageNotes.marks.map(
            (m, i) =>
              m.kind === "note" && (
                <li key={i} className="break-words">
                  {m.text}
                </li>
              ),
          )}
        </ul>
      )}
      {doc.canAddAudio && <AudioNote parentId={doc.id} onChanged={onChanged} />}{" "}
      {audio.map((a) => (
        <div key={a.id} className="mt-3 rounded-xl bg-wash p-3">
          <p className="text-sm font-medium">Audio note</p>
          {a.url && (
            <audio
              controls
              preload="none"
              src={a.url}
              className="mt-2 w-full"
            />
          )}
          <p className="mt-2 whitespace-pre-wrap text-sm">
            {a.body || TRANSCRIPTION_NOTICE}
          </p>
        </div>
      ))}
    </div>
  );
}
