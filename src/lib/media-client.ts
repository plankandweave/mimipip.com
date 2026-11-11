import { shopperServiceFetch } from "./shopper-service";
import { serviceAvailable, requireService } from "../brand/services";
// Client for the media worker — the container that owns every native-binary
// operation (sharp, onnxruntime, ffmpeg) now that the app runs on workerd.
//
// Contract mirrors the reel worker the app already spoke: bearer token, JSON
// or raw-bytes bodies, errors as non-2xx with a JSON {error}. The worker side
// retries container cold-boots for up to ~90s, so callers here see either an
// answer or a real failure, not a boot 1101.
//
// Env: MEDIA_WORKER_URL (e.g. https://zyvorah-media.….workers.dev) and
// MEDIA_TOKEN. Both absent → every call throws; callers that must degrade
// gracefully already wrap their calls (occlusion → score 0, print → verify
// sweep retries).

import type { CropData } from "./visualizer";

const TIMEOUT_MS = 240_000; // band-compose and 200MP print queues take minutes

function base(): { url: string; token: string } {
  if (process.env.MIMIPIP_SHOPPER_SERVICES === "1") return { url: "https://mimipip-tools.internal/media", token: "private-service-binding" };
  const url = process.env.MEDIA_WORKER_URL;
  const token = process.env.MEDIA_TOKEN;
  if (!url || !token) throw new Error("MEDIA_WORKER_URL / MEDIA_TOKEN not configured");
  return { url: url.replace(/\/$/, ""), token };
}

/** On Cloudflare, a Worker cannot fetch another Worker's public workers.dev
 *  URL (error 1042) — the MEDIA service binding routes the same Request
 *  worker-to-worker instead. Off Cloudflare (next dev, Vercel until cutover,
 *  the container itself) the import fails and plain fetch is used. */
export async function mediaFetch(url: string, init: RequestInit): Promise<Response> {
  if (!serviceAvailable("storage")) requireService("storage");
  if (process.env.MIMIPIP_SHOPPER_SERVICES === "1") {
    const target = new URL(url);
    if (target.origin !== "https://mimipip-tools.internal" || !target.pathname.startsWith("/media/")) throw new Error("Unsupported room-image destination");
    return shopperServiceFetch(target.pathname + target.search, init);
  }
  try {
    const { env } = (await import(/* @vite-ignore */ "cloudflare:workers")) as {
      env: { MEDIA?: { fetch(req: Request): Promise<Response> } };
    };
    if (env?.MEDIA) return await env.MEDIA.fetch(new Request(url, init));
  } catch {
    /* not on workerd — fall through to plain fetch */
  }
  return await fetch(url, init);
}

/** The deadline, enforced twice. AbortSignal.timeout is handed to the fetch,
 *  but on 12 October 2026 a wedged /measured-reel held two compose runs open
 *  for over an hour each — through the MEDIA service binding the signal did
 *  not end the wait. A timer race does, whatever the transport honours. */
function withDeadline<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const bound = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`media ${what} did not answer within ${Math.round(ms / 1000)}s`)), ms + 5_000);
  });
  return Promise.race([p, bound]).finally(() => clearTimeout(timer));
}

async function call(
  path: string,
  body: BodyInit,
  contentType: string,
  timeoutMs = TIMEOUT_MS,
): Promise<Response> {
  const { url, token } = base();
  const res = await withDeadline(mediaFetch(`${url}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": contentType },
    body,
    signal: AbortSignal.timeout(timeoutMs),
  }), timeoutMs, path);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`media ${path} ${res.status}: ${text.slice(0, 300)}`);
  }
  return res;
}

const json = (path: string, payload: unknown, timeoutMs?: number) =>
  call(path, JSON.stringify(payload), "application/json", timeoutMs);

// ── print files ────────────────────────────────────────────────────────────
/** Queue print-file generation. Returns once the container has ACCEPTED the
 *  job (202) — generation itself is sequential inside the container and
 *  completion is visible where it always was: mark_print_job_generated. */
export async function queuePrintFile(job: {
  orderItemId: string;
  crop: CropData;
  widthCm: number;
  heightCm: number;
  materialSlug: string;
}): Promise<void> {
  await json("/print-file", job, 30_000);
}

// ── embeddings / segmentation ──────────────────────────────────────────────
export async function embedImageUrlRemote(url: string): Promise<number[]> {
  const r = await json("/embed", { url }, 120_000);
  return ((await r.json()) as { embedding: number[] }).embedding;
}

export async function embedImageBufferRemote(buf: ArrayBuffer): Promise<number[]> {
  const r = await call("/embed", buf, "application/octet-stream", 120_000);
  return ((await r.json()) as { embedding: number[] }).embedding;
}

export async function segmentWallRemote(buf: ArrayBuffer): Promise<{
  png: ArrayBuffer;
  width: number;
  height: number;
  foundWall: boolean;
}> {
  const r = await call("/segment-wall", buf, "application/octet-stream", 120_000);
  return {
    png: await r.arrayBuffer(),
    width: Number(r.headers.get("x-width") ?? 0),
    height: Number(r.headers.get("x-height") ?? 0),
    foundWall: r.headers.get("x-found-wall") === "true",
  };
}

export async function occlusionRemote(
  buf: ArrayBuffer,
  opts?: { x0?: number; x1?: number; y0?: number; y1?: number },
): Promise<{ score: number; occluder: string | null; foundWall: boolean }> {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(opts ?? {})) if (v !== undefined) q.set(k, String(v));
  const r = await call(`/occlusion${q.size ? `?${q}` : ""}`, buf, "application/octet-stream", 120_000);
  return (await r.json()) as { score: number; occluder: string | null; foundWall: boolean };
}

// ── band compose ───────────────────────────────────────────────────────────
export async function bandComposeRemote(payload: {
  accountSlug: string;
  rows: { id: string; title: string | null; design_url: string; design_code: string | null }[];
  orderedIds: string[];
  widthMm: number;
  heightMm: number;
  /** The store's fixed floor line (fraction of band height); null = not yet. */
  floorLinePct?: number | null;
  /** The Vijay Sales OpenAI key: the container completes painted patches
   *  with the image model (band-complete.ts). Over the service binding only. */
  openaiKey?: string | null;
  /** What the artwork is, for the model's instruction. */
  describe?: string | null;
  /** The wall row the container writes its stage markers — and its finished
   *  band — to, so a Worker wait cut short never loses the artwork. */
  wallId?: string | null;
  /** The rules the Worker expects; the container saves the wall only on a match. */
  rulesVersion?: string | null;
  /** Answer at once with {accepted:true} and compose in the container's own
   *  queue, saving the wall there. An older container ignores it and answers
   *  with the band, which the caller handles as before. */
  async?: boolean;
  /** Whole-wall mode: keep one design and draw the rest of the wall outward from it. */
  generate?: { seedId?: string | null } | null;
  /** Serial run: the exact pieces this wall carries (serial-run-rules.ts). */
  strips?: { id: string; from: number; to: number; atMm: number; lenMm: number }[] | null;
}): Promise<unknown> {
  const r = await json("/band-compose", payload, payload.async ? 120_000 : undefined);
  // The module's union return ({pieces,…} | {error}) passes through verbatim.
  return await r.json();
}

/** The container's own report (authed /health): the stamp it booted with and
 *  whether a print file is in hand. */
export async function mediaHealthRemote(): Promise<{ stamp: string | null; printQueue: number; printing: boolean; bandRulesVersion: string | null }> {
  const { url, token } = base();
  const res = await mediaFetch(`${url}/health`, {
    method: "GET", headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(100_000),
  });
  if (!res.ok) throw new Error(`media /health ${res.status}`);
  const h = (await res.json()) as { stamp?: string | null; printQueue?: number; printing?: boolean; bandRulesVersion?: string | null };
  return { stamp: h.stamp ?? null, printQueue: Number(h.printQueue ?? 0), printing: h.printing === true, bandRulesVersion: h.bandRulesVersion ?? null };
}

/** Tear the container instance down so the next request boots the current
 *  image. The CALLER must first make sure no print file is running. */
export async function restartMediaRemote(): Promise<void> {
  const { url, token } = base();
  const res = await mediaFetch(`${url}/admin/restart-container`, {
    method: "POST", headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`media restart ${res.status}`);
}

export async function bandComposeInteractiveRemote(payload: {
  accountSlug: string;
  designs: { id: string; title: string | null; design_url: string; design_code: string | null }[];
  ids: string[];
  widthMm: number;
  heightMm: number;
  nPieces: number;
}): Promise<unknown> {
  const r = await json("/band-compose-interactive", payload);
  return await r.json();
}

// ── documents ──────────────────────────────────────────────────────────────
export async function renderOrderCopyRemote(items: unknown[], opts: unknown): Promise<Uint8Array> {
  const r = await json("/order-copy", { items, opts }, 120_000);
  return new Uint8Array(await r.arrayBuffer());
}

// ── marketing media ────────────────────────────────────────────────────────
export async function composeStillRemote(
  sourceUrl: string,
  w: number,
  h: number,
  spec: unknown,
): Promise<Buffer> {
  const r = await json("/still", { sourceUrl, w, h, spec }, 120_000);
  return Buffer.from(await r.arrayBuffer());
}

export async function composeCarouselRemote(sceneUrls: string[], spec: unknown): Promise<Buffer[]> {
  const r = await json("/carousel", { sceneUrls, spec }, 180_000);
  const { slides } = (await r.json()) as { slides: string[] };
  return slides.map((s) => Buffer.from(s, "base64"));
}

/** The WORD beat / launch plate — drawn in the container, where the fonts are. */
export async function composePlateRemote(spec: import("./marketing/media/plate").PlateSpec): Promise<Buffer> {
  const r = await json("/plate", spec, 120_000);
  return Buffer.from(await r.arrayBuffer());
}

/** How much of a delivered video's frame is picture (the full-bleed gate). */
export async function probeVideoRemote(
  videoUrl: string,
): Promise<{ coverage: number; width: number; height: number }> {
  const r = await json("/video-probe", { url: videoUrl }, 60_000);
  return (await r.json()) as { coverage: number; width: number; height: number };
}

/** A Library film's poster frame and narration track (mono MP3), from the
 *  film's own bytes. Ten minutes: a 100 MB film is written, probed, framed and
 *  transcoded in the container before anything comes back. */
export async function filmDerivativesRemote(film: ArrayBuffer | Uint8Array | ReadableStream): Promise<{
  poster: Uint8Array;
  audio: Uint8Array | null;
  width: number;
  height: number;
  durationS: number;
}> {
  const r = await call("/film-derivatives", film as BodyInit, "video/mp4", 600_000);
  const j = (await r.json()) as { poster: string; audio: string | null; width: number; height: number; durationS: number };
  const bytes = (b64: string) => Uint8Array.from(Buffer.from(b64, "base64"));
  return { poster: bytes(j.poster), audio: j.audio ? bytes(j.audio) : null, width: j.width, height: j.height, durationS: j.durationS };
}

export async function composeClosingCardRemote(line?: string): Promise<Buffer> {
  const r = await json("/closing-card", { line }, 120_000);
  return Buffer.from(await r.arrayBuffer());
}

/** Overlay a pre-rendered PNG (Satori badge) onto an image; JPEG out. */
export async function compositeRemote(
  image: Buffer,
  overlay: Buffer,
  top: number,
  left: number,
  quality = 86,
): Promise<Buffer> {
  const r = await json(
    "/composite",
    { image: image.toString("base64"), overlay: overlay.toString("base64"), top, left, quality },
    60_000,
  );
  return Buffer.from(await r.arrayBuffer());
}

// ── small utilities ────────────────────────────────────────────────────────
export async function imageMetaRemote(
  input: ArrayBuffer | { url: string },
): Promise<{ width: number | null; height: number | null; format: string | null }> {
  const r =
    input instanceof ArrayBuffer
      ? await call("/image-meta", input, "application/octet-stream", 60_000)
      : await json("/image-meta", input, 60_000);
  return (await r.json()) as { width: number | null; height: number | null; format: string | null };
}

export async function normalizePhotoRemote(
  raw: ArrayBuffer,
): Promise<{ jpeg: ArrayBuffer; width: number; height: number } | { error: "unreadable" }> {
  try {
    const r = await call("/normalize-photo", raw, "application/octet-stream", 120_000);
    return {
      jpeg: await r.arrayBuffer(),
      width: Number(r.headers.get("x-width") ?? 0),
      height: Number(r.headers.get("x-height") ?? 0),
    };
  } catch (e) {
    if (String(e).includes(" 422")) return { error: "unreadable" };
    throw e;
  }
}

/** height omitted = preserve the SVG's aspect; density = rasterisation dpi
 *  before resize (brand lockups use 600 for crispness). */
export async function rasterizeSvgRemote(
  svg: string,
  width: number,
  height?: number,
  density?: number,
): Promise<ArrayBuffer> {
  const r = await json("/rasterize", { svg, width, height, density }, 60_000);
  return await r.arrayBuffer();
}

export async function thumbnailRemote(url: string, width: number, quality?: number): Promise<ArrayBuffer> {
  // The container fetches the source itself — hand it the /media spelling for
  // R2-migrated objects (the Supabase copy is being retired; a container is an
  // ordinary network client, so our own zone is fetchable from there).
  const { toMediaUrl } = await import("@/lib/media-url");
  const r = await json("/thumbnail", { url: new URL(toMediaUrl(url), "https://mimipip.com").href, width, quality }, 60_000);
  return await r.arrayBuffer();
}

/** Bytes-in variant for callers already holding the image (vision prep).
 *  fit:"inside" bounds both dimensions to width, like resize(N, N, {fit:"inside"}). */
export async function thumbnailBytesRemote(
  buf: ArrayBuffer,
  opts: { width: number; quality?: number; rotate?: boolean; mozjpeg?: boolean; widthOnly?: boolean },
): Promise<Buffer> {
  // widthOnly matches the migration renditions' geometry (resize by width,
  // height free) — vision-prep callers keep the both-dimension box.
  const q = new URLSearchParams({ width: String(opts.width) });
  if (!opts.widthOnly) q.set("fit", "inside");
  if (opts.quality) q.set("quality", String(opts.quality));
  if (opts.rotate) q.set("rotate", "1");
  if (opts.mozjpeg) q.set("mozjpeg", "1");
  const r = await call(`/thumbnail?${q}`, buf, "application/octet-stream", 60_000);
  return Buffer.from(await r.arrayBuffer());
}

/** One storefront rendition (`<key>@<width>.webp`): width-only resize, webp.
 *  The content-type comes back from the container rather than being assumed,
 *  so a container that predates format=webp yields honestly-labelled jpeg. */
export async function renditionRemote(
  buf: ArrayBuffer,
  width: number,
): Promise<{ bytes: Buffer; contentType: string }> {
  const r = await call(`/thumbnail?width=${width}&quality=80&format=webp`, buf, "application/octet-stream", 60_000);
  return {
    bytes: Buffer.from(await r.arrayBuffer()),
    contentType: (r.headers.get("content-type") ?? "image/jpeg").split(";")[0],
  };
}

/** EXIF-bake for customer print artwork: rotation applied, ORIGINAL format
 *  kept (a lossy re-encode would degrade the print). 422 → {error}. */
export async function bakeRotationRemote(
  raw: ArrayBuffer,
): Promise<{ bytes: ArrayBuffer; width: number; height: number; contentType: string } | { error: "unreadable" }> {
  try {
    const r = await call("/bake-rotation", raw, "application/octet-stream", 120_000);
    return {
      bytes: await r.arrayBuffer(),
      width: Number(r.headers.get("x-width") ?? 0),
      height: Number(r.headers.get("x-height") ?? 0),
      contentType: r.headers.get("content-type") ?? "image/jpeg",
    };
  } catch (e) {
    if (String(e).includes(" 422")) return { error: "unreadable" };
    throw e;
  }
}

/** Exact wall composition, including the approved lettering. */
export async function cropPreviewRemote(crop: CropData): Promise<ArrayBuffer> {
  const { toMediaUrl } = await import("@/lib/media-url");
  const r = await json("/crop-preview", { ...crop, imageUrl: new URL(toMediaUrl(crop.imageUrl), "https://mimipip.com").href }, 120_000);
  return r.arrayBuffer();
}

/** Source and measured overlays are composed together in the media container. */
export async function composeMeasuredStillRemote(sourceUrl:string,title:string,kicker?:string,opts:{sub?:string;crop?:{zoom:number;x?:number;y?:number}}={}):Promise<{bytes:Buffer;frame:import("./marketing/layout-check").LayoutFrame}>{
 const r=await json("/measured-still",{sourceUrl,title,kicker,...opts},120_000);
 const body=await r.json() as {image:string;frame:import("./marketing/layout-check").LayoutFrame};
 return {bytes:Buffer.from(body.image,"base64"),frame:body.frame};
}

/** A reel and its profile cover in the house frame, each measured in the
 *  media container (renderMeasuredReel). Encoding is tens of seconds. */
export async function renderMeasuredReelRemote(sceneUrls:string[],spec:{title:string;sub?:string;kicker?:string}):Promise<{video:Buffer;frame:import("./marketing/layout-check").LayoutFrame;cover:Buffer;coverFrame:import("./marketing/layout-check").LayoutFrame}>{
 const r=await json("/measured-reel",{sceneUrls:sceneUrls.slice(0,5),...spec},240_000);
 const b=await r.json() as {video:string;frame:import("./marketing/layout-check").LayoutFrame;cover:string;coverFrame:import("./marketing/layout-check").LayoutFrame};
 return {video:Buffer.from(b.video,"base64"),frame:b.frame,cover:Buffer.from(b.cover,"base64"),coverFrame:b.coverFrame};
}

/** A daily-cadence Story in the measured portrait frame (renderMeasuredStory). */
export async function composeMeasuredStoryRemote(sourceUrl:string,spec:{title:string;sub?:string;kicker?:string}):Promise<{bytes:Buffer;frame:import("./marketing/layout-check").LayoutFrame}>{
 const r=await json("/measured-story",{sourceUrl,...spec},120_000);
 const b=await r.json() as {image:string;frame:import("./marketing/layout-check").LayoutFrame};
 return {bytes:Buffer.from(b.image,"base64"),frame:b.frame};
}

/* ───────────────────────────── Lumen ───────────────────────────── */

export type LumenCutJob = {
  filmId: string;
  filmPath: string;
  posterPath: string;
  spec: { campus: string; direction: string; signoff: string };
  scenes: { key: string; imageUrl: string | null; audioUrl: string | null; heading: string; caption: string }[];
};

/** Ask the container to cut a Lumen film. Answers 202 at once; the container
 *  renders, writes the film and its poster to the private store, and updates
 *  the lumen_films row itself (cut, or failed with the reason). */
export async function lumenCutRemote(job: LumenCutJob): Promise<{ accepted: boolean; queue: number }> {
  const res = await call("/lumen", JSON.stringify(job), "application/json", 60_000);
  return (await res.json()) as { accepted: boolean; queue: number };
}
