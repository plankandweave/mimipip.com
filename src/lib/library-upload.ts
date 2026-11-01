// Browser side of adding designs to a partner's library. One request may
// carry only so much (Cloudflare refuses a body over 100 MB), so a folder
// drag goes as several requests: small files batched under LARGE_ART_FROM,
// and each big print master in parts through /api/corporate/upload/large,
// then registered. Every file ends in the same results list either way.

import { LARGE_ART_FROM } from "@/lib/large-art-upload-rules";
import { uploadLargeArt } from "@/lib/large-art-upload";

export type LibraryResult = { ok: boolean; name: string; error?: string };
export type LibraryUpload = { added: number; results: LibraryResult[] };

const MAX_FILES_PER_REQUEST = 25;

async function send(init: RequestInit): Promise<LibraryUpload> {
  const r = await fetch("/api/corporate/designs/upload", { method: "POST", ...init });
  const j = (await r.json().catch(() => ({}))) as Partial<LibraryUpload> & { error?: string };
  if (!r.ok && !j.added) {
    if (Array.isArray(j.results) && j.results.length) return { added: 0, results: j.results };
    throw new Error(j.error ?? `Upload failed (${r.status}) — please try again.`);
  }
  return { added: j.added ?? 0, results: j.results ?? [] };
}

export async function uploadToLibrary(
  files: File[],
  opts: { series?: string; note?: string; onProgress?: (label: string) => void },
): Promise<LibraryUpload> {
  const series = opts.series?.trim() ?? "";
  const note = opts.note?.trim() ?? "";
  const small = files.filter((f) => f.size < LARGE_ART_FROM);
  const large = files.filter((f) => f.size >= LARGE_ART_FROM);
  const out: LibraryUpload = { added: 0, results: [] };
  const take = (r: LibraryUpload) => { out.added += r.added; out.results.push(...r.results); };

  // Small files: as many per request as stay under the one-request size.
  let batch: File[] = [];
  let bytes = 0;
  const flush = async () => {
    if (!batch.length) return;
    const fd = new FormData();
    for (const f of batch) fd.append("files", f);
    if (series) fd.append("series", series);
    if (note) fd.append("note", note);
    take(await send({ body: fd }));
    batch = []; bytes = 0;
  };
  for (const f of small) {
    if (batch.length && (bytes + f.size >= LARGE_ART_FROM || batch.length >= MAX_FILES_PER_REQUEST)) await flush();
    batch.push(f); bytes += f.size;
  }
  await flush();

  // Big files: each in parts, then registered together.
  const uploaded: { path: string; name: string }[] = [];
  for (const [i, f] of large.entries()) {
    try {
      const art = await uploadLargeArt(f, (pct) => opts.onProgress?.(`Uploading ${f.name} (${i + 1} of ${large.length})… ${pct}%`));
      if (art.path) uploaded.push({ path: art.path, name: f.name });
      else out.results.push({ ok: false, name: f.name, error: "upload failed — please try again" });
    } catch (e) {
      out.results.push({ ok: false, name: f.name, error: e instanceof Error ? e.message : "upload failed" });
    }
  }
  if (uploaded.length) {
    take(await send({
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uploaded, series, note }),
    }));
  }
  return out;
}
