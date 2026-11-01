"use client";

import { MAX_TRACE_PLAN_BYTES } from "@/lib/trace-plan";
import { useEffect, useRef, useState } from "react";
import { checkTraceVideoDuration, saveTraceFile, traceFileType, type TraceUploadProgress } from "@/lib/trace-file-upload";

async function prepare(file: File): Promise<{ kind: "photo" | "video" | "plan"; blob: Blob; seconds: number }> {
  if (file.type === "application/pdf") {
    if (!file.size || file.size > MAX_TRACE_PLAN_BYTES) throw new Error("Choose a nonempty PDF of at most 20 MiB.");
    return { kind: "plan", blob: file, seconds: 0 };
  }
  const kind = traceFileType(file);
  const url = URL.createObjectURL(file);
  try {
    if (kind === "video") {
      const video = document.createElement("video");
      try {
        const seconds = await new Promise<number>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("Could not read this video. Try an MP4 export.")), 15000);
          video.onloadedmetadata = () => { clearTimeout(timer); resolve(video.duration); };
          video.onerror = () => { clearTimeout(timer); reject(new Error("This browser cannot read that video. Try an MP4 export.")); };
          video.preload = "metadata";
          video.src = url;
        });
        checkTraceVideoDuration(seconds);
        return { kind, blob: file, seconds };
      } finally { video.removeAttribute("src"); video.load(); }
    }
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 2560 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot prepare the photo.");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (b) => b ? resolve(b) : reject(new Error("Could not prepare the photo.")), "image/jpeg", 0.9,
    ));
    traceFileType(blob);
    return { kind, blob, seconds: 0 };
  } finally { URL.revokeObjectURL(url); }
}

export default function TraceFileUpload({ base, recipient, allowPlans, onSaved, onPending }: {
  base: string; recipient: string | null; allowPlans: boolean; onSaved: () => Promise<void>; onPending: (pending: boolean) => void;
}) {
  const [pickerKey, setPickerKey] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [where, setWhere] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const progress = useRef<TraceUploadProgress>({});
  const prepared = useRef<Awaited<ReturnType<typeof prepare>> | null>(null);
  const planKey = useRef<string | null>(null);
  const documentId = useRef<string | null>(null);
  const started = Boolean(progress.current.walkId || planKey.current);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (file && !receipt) e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [file, receipt]);

  async function save() {
    if (!file || busy) return;
    setBusy(true); setError(null);
    try {
      prepared.current ??= await prepare(file);
      if (prepared.current.kind === "plan") {
        if (!allowPlans) throw new Error("Plan uploads are not enabled on this link.");
        planKey.current ??= crypto.randomUUID();
        const response = await fetch(`${base}/documents`, {
          method: "POST", headers: { "Content-Type": "application/pdf", "x-trace-request-id": planKey.current, "x-file-name": encodeURIComponent(file.name) }, body: prepared.current.blob,
        });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error ?? "Plan upload failed. Retry below.");
        documentId.current = result.id;
      } else await saveTraceFile({
        ...prepared.current, kind: prepared.current.kind as "photo" | "video", name: recipient ?? "", where: where.trim() || file.name,
        progress: progress.current,
        post: async (path, body) => {
          const response = await fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
          const result = await response.json();
          if (!response.ok || !result.ok) throw new Error(result.error ?? "Could not save. Keep this page open and retry.");
          return result;
        },
        put: async (url, blob) => {
          const response = await fetch(url, { method: "PUT", headers: { "Content-Type": blob.type }, body: blob });
          if (!response.ok) throw new Error("Upload interrupted. Keep this page open and press Retry upload.");
        },
      });
      setReceipt(`${file.name} saved. Reference: ${documentId.current ?? progress.current.walkId}`);
      onPending(false);
      await onSaved().catch(() => {});
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed. Retry below."); }
    finally { setBusy(false); }
  }

  return <section className="mt-6 rounded-[18px] border border-edge bg-surface p-5">
    <h2 className="font-display text-base font-bold">Add photos, videos{allowPlans ? " or a site plan" : ""}</h2>
    <p className="mt-2 text-sm text-slate">Choose one file at a time. Photos: JPEG, PNG or WebP, up to 6 MiB; converted to JPEG for review. Videos: MP4, MOV or WebM, up to 96 MiB and 3 minutes each. Trim longer videos into shorter clips first.</p>
    <p className="mt-2 text-xs text-slate">Uploaded video retains its original sound and is not automatically transcribed. {allowPlans ? "Optional site plans: PDF, up to 20 MiB." : "Plans and documents cannot be uploaded here yet."}</p>
    {!receipt && <>
      <label className="mt-4 block text-sm">Photo, video{allowPlans ? " or PDF" : ""}
        <input key={pickerKey} type="file" accept={`image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm${allowPlans ? ",application/pdf" : ""}`} disabled={busy || started}
          className="mt-2 block w-full text-sm" onChange={(e) => {
            setFile(e.target.files?.[0] ?? null); setError(null); prepared.current = null; progress.current = {};
            onPending(Boolean(e.target.files?.[0]));
          }} />
      </label>
      <label className="mt-4 block text-sm">Where is this wall or space?
        <input value={where} disabled={busy || started} onChange={(e) => setWhere(e.target.value)} className="mt-2 h-12 w-full rounded-[12px] border border-edge bg-surface px-3 text-base" />
      </label>
      <button type="button" disabled={!file || busy} onClick={save} className="btn mt-4 min-h-12 w-full disabled:opacity-50">
        {busy ? "Saving — keep this page open…" : error ? "Retry upload" : "Upload file"}
      </button>
    </>}
    {error && <>
      <p role="alert" className="mt-3 text-sm text-[color:var(--color-alert)]">{error}</p>
      {!busy && <button type="button" className="mt-3 text-sm underline" onClick={() => {
        setFile(null); setError(null); setWhere(""); setPickerKey(k => k + 1);
        progress.current = {}; prepared.current = null; planKey.current = null; documentId.current = null; onPending(false);
      }}>Choose a different file</button>}
    </>}
    {receipt && <>
      <p role="status" className="mt-3 break-words text-sm">{receipt}</p>
      <button type="button" className="mt-3 text-sm underline" onClick={() => {
        setFile(null); setReceipt(null); setWhere(""); progress.current = {}; prepared.current = null; planKey.current = null; documentId.current = null;
      }}>Upload another file</button>
    </>}
  </section>;
}
