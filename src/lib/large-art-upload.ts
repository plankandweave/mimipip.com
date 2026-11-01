// Browser side of /api/corporate/upload/large: start, send each 20 MB part
// (retried, since one dropped request must not lose a 300 MB upload), then
// complete. Resolves to the same answer /api/corporate/upload gives.

export type UploadedArt = { url: string; path?: string; previewUrl?: string | null; width: number; height: number; name: string };

async function readJson(r: Response): Promise<Record<string, unknown>> {
  return (await r.json().catch(() => ({}))) as Record<string, unknown>;
}

async function post(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const r = await fetch("/api/corporate/upload/large", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await readJson(r);
  if (!r.ok) throw new Error(String(j.error ?? `Upload failed (${r.status}) — please try again.`));
  return j;
}

export async function uploadLargeArt(file: File, onProgress: (pct: number) => void): Promise<UploadedArt> {
  const start = await post({ action: "start", name: file.name, size: file.size });
  const path = String(start.path);
  const uploadId = String(start.uploadId);
  const partBytes = Number(start.partBytes);
  const total = Math.ceil(file.size / partBytes);
  const parts: { partNumber: number; etag: string }[] = [];
  try {
    for (let n = 1; n <= total; n++) {
      const chunk = file.slice((n - 1) * partBytes, Math.min(file.size, n * partBytes));
      let last: unknown = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const q = new URLSearchParams({ path, uploadId, part: String(n) });
          const r = await fetch(`/api/corporate/upload/large?${q}`, {
            method: "PUT",
            headers: { "content-type": "application/octet-stream" },
            body: chunk,
          });
          const j = await readJson(r);
          if (!r.ok) throw new Error(String(j.error ?? `Upload failed (${r.status})`));
          parts.push({ partNumber: Number(j.partNumber), etag: String(j.etag) });
          last = null;
          break;
        } catch (e) {
          last = e;
        }
      }
      if (last) throw last;
      onProgress(Math.round((n / total) * 95));
    }
    const done = await post({ action: "complete", path, uploadId, parts, name: file.name });
    onProgress(100);
    return done as unknown as UploadedArt;
  } catch (e) {
    void post({ action: "abort", path, uploadId }).catch(() => {});
    throw e;
  }
}
