import { serviceAvailable, requireService } from "../brand/services";
// Server-side access to the R2 buckets behind the media migration.
//
// The app runs on Cloudflare Workers, so bytes move through BINDINGS, never
// over HTTP: a Worker cannot fetch its own zone (522/1042 — the media worker
// learned this first, see media-client.ts), and a binding read is free where
// an HTTP read is an egress. `cloudflare:workers` only resolves on workerd;
// off Cloudflare (next dev, scripts) callers get null and must degrade —
// every caller here either throws a clear error or falls back to the public
// media domain.

export type R2HttpMetadata = { contentType?: string; cacheControl?: string };
export type R2Object = {
  body: ReadableStream;
  httpEtag: string;
  size: number;
  uploaded: Date;
  httpMetadata?: R2HttpMetadata;
  arrayBuffer(): Promise<ArrayBuffer>;
};
export type R2Listing = {
  objects: { key: string; size: number; uploaded: Date }[];
  delimitedPrefixes: string[];
  truncated: boolean;
  cursor?: string;
};
export type R2Bucket = {
  get(key: string, opts?: { range?: { offset: number; length: number } }): Promise<R2Object | null>;
  head(key: string): Promise<Omit<R2Object, "body" | "arrayBuffer"> | null>;
  put(
    key: string,
    value: ReadableStream | ArrayBuffer | ArrayBufferView | Blob | string,
    opts?: { httpMetadata?: R2HttpMetadata; onlyIf?: { etagDoesNotMatch: string } },
  ): Promise<unknown>;
  delete(key: string | string[]): Promise<void>;
  list(opts?: { prefix?: string; delimiter?: string; cursor?: string; limit?: number }): Promise<R2Listing>;
  createMultipartUpload(key: string, opts?: { httpMetadata?: R2HttpMetadata }): Promise<R2MultipartUpload>;
  resumeMultipartUpload(key: string, uploadId: string): R2MultipartUpload;
};
/** A file uploaded in parts — the way past Cloudflare's 100 MB request cap. */
export type R2UploadedPart = { partNumber: number; etag: string };
export type R2MultipartUpload = {
  key: string;
  uploadId: string;
  uploadPart(partNumber: number, value: ReadableStream | ArrayBuffer | ArrayBufferView | Blob | string): Promise<R2UploadedPart>;
  complete(parts: R2UploadedPart[]): Promise<unknown>;
  abort(): Promise<void>;
};

type Env = { MEDIA_R2?: R2Bucket; PRIVATE_R2?: R2Bucket };

async function env(): Promise<Env> {
  if (!serviceAvailable("storage")) return {};
  try {
    const mod = (await import(/* @vite-ignore */ "cloudflare:workers")) as { env: Env };
    return mod.env ?? {};
  } catch {
    return {};
  }
}

/** The public media bucket (`zyvorah-media`), or null off-workerd. */
export async function mediaBucket(): Promise<R2Bucket | null> {
  return (await env()).MEDIA_R2 ?? null;
}

/** The private store bucket (`zyvorah-store-private`), or null off-workerd. */
export async function privateBucket(): Promise<R2Bucket | null> {
  return (await env()).PRIVATE_R2 ?? null;
}

/**
 * fetch() that knows migrated media URLs are OUR OWN ZONE, which a Worker
 * cannot fetch over HTTP (522/1042) — those read through the R2 binding and
 * come back as a synthesized Response. Every other URL, and every runtime
 * without the binding (dev, scripts, the media container), is a plain fetch.
 */
export async function fetchMediaAware(url: string, init?: RequestInit): Promise<Response> {
  if (!serviceAvailable("storage")) requireService("storage");
  const { mediaKeyFromUrl } = await import("@/lib/media-url");
  const key = mediaKeyFromUrl(url);
  if (key) {
    const bucket = await mediaBucket();
    if (bucket) {
      const obj = await bucket.get(key);
      if (!obj) return new Response("Not found.", { status: 404 });
      return new Response(obj.body, {
        headers: { "content-type": obj.httpMetadata?.contentType ?? "application/octet-stream" },
      });
    }
  }
  return await fetch(url, init);
}

/** mediaBucket() that throws instead of null — for write paths, where a
 *  missing binding must be a loud 5xx, never a silent skip. */
export async function requireMediaBucket(): Promise<R2Bucket> {
  const b = await mediaBucket();
  if (!b) throw new Error("MEDIA_R2 binding not available (not running on Cloudflare?)");
  return b;
}
