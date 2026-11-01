// The browser half of recording a walk, shared by the partner walkthrough
// panel (src/app/partners/[slug]/walkthrough-panel.tsx) and the guest
// walkthrough link (src/app/walk/[token]). Client-safe: no server imports.
//
// Two recorders on one microphone: the video is the record, and a parallel
// audio-only track exists because transcription caps at 25 MB while three
// minutes of speech is about a megabyte.

export const VIDEO_TYPES = ["video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
export const AUDIO_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

/** The first container this browser can record; "" for the browser's own
 *  default; null when there is no MediaRecorder at all. */
export function pickMime(candidates: string[]): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const t of candidates) if (MediaRecorder.isTypeSupported?.(t)) return t;
  return "";
}

/** Stop a recorder and hand back everything it recorded as one blob. */
export function settleRecorder(
  rec: MediaRecorder | null,
  chunks: { current: Blob[] },
  fallbackType: string,
): Promise<{ blob: Blob; type: string } | null> {
  return new Promise((resolve) => {
    if (!rec || rec.state === "inactive") return resolve(null);
    rec.onstop = () => {
      const type = (rec.mimeType || "").split(";")[0] || fallbackType;
      resolve({ blob: new Blob(chunks.current, { type }), type });
    };
    rec.stop();
  });
}

/** The frame on screen right now, as a JPEG. */
export async function grabStill(el: HTMLVideoElement): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = el.videoWidth || 1280;
  canvas.height = el.videoHeight || 720;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
  return await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
}

/** sign → PUT straight to storage → commit. `onProgress` gets 0–1 for the PUT
 *  when given (XHR, because fetch cannot report upload progress). */
export async function twoStepUpload(o: {
  endpoint: string;
  sign: Record<string, unknown>;
  commit: Record<string, unknown>;
  blob: Blob;
  contentType: string;
  onProgress?: (fraction: number) => void;
}) {
  const signRes = await fetch(o.endpoint, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "sign", ...o.sign, bytes: o.blob.size, contentType: o.contentType }),
  });
  const sign = await signRes.json();
  if (!signRes.ok || !sign.ok) throw new Error(sign.error ?? "Could not prepare the upload.");

  if (o.onProgress) {
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", sign.signedUrl as string);
      xhr.setRequestHeader("Content-Type", o.contentType);
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) o.onProgress!(e.loaded / e.total); };
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error("That didn't upload — check your signal and try again.")));
      xhr.onerror = () => reject(new Error("That didn't upload — check your signal and try again."));
      xhr.send(o.blob);
    });
  } else {
    const put = await fetch(sign.signedUrl as string, {
      method: "PUT", headers: { "Content-Type": o.contentType }, body: o.blob,
    });
    if (!put.ok) throw new Error("That didn't upload — check your signal and try again.");
  }

  const commitRes = await fetch(o.endpoint, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "commit", ...o.commit, contentType: o.contentType }),
  });
  const commit = await commitRes.json();
  if (!commitRes.ok || !commit.ok) throw new Error(commit.error ?? "That didn't save.");
  return commit;
}
