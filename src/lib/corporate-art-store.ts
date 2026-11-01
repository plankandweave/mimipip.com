// The PRIVATE `corporate-art` store, now in R2 (`zyvorah-store-private`,
// binding PRIVATE_R2, keys prefixed `corporate-art/`) — the replacement for
// the Supabase Storage bucket of the same name.
//
// Shaped like storage-js on purpose ({error} results, Blob downloads) so the
// two dozen call sites swapped mechanically. Two runtimes use this module:
//
//   · workerd (every route handler): bytes move through the PRIVATE_R2
//     binding — a Worker cannot fetch its own zone (522/1042), and a binding
//     read is free where an HTTP read is an egress.
//   · the media container (band-compose libs, bundled verbatim from this
//     tree): no bindings there, but it holds SUPABASE_SERVICE_ROLE_KEY — the
//     same secret every signature here is keyed by — so it self-signs and
//     moves bytes over HTTP through the site's own routes
//     (/api/files/corporate-art for reads, /api/media-upload for writes).
//     A container is an ordinary network client, not a Worker, so fetching
//     zyvorah.com is fine from there.
//
// Signed URLs replace storage's createSignedUrl: an HMAC (keyed by the
// service-role key, which never reaches a client) over exactly
// `corporate-art/<path>|<exp>|<dl>|<w>`, verified by
// /api/files/corporate-art/[...path]. Binding the dl/w options into the
// signature means a signed view link cannot be flipped into a download link
// (or re-sized) by editing the query string.

import { createHmac, timingSafeEqual } from "node:crypto";
import { privateBucket, type R2Bucket } from "@/lib/r2-media";
import { mintUploadToken } from "@/lib/upload-token";

const PREFIX = "corporate-art/";
/** Absolute, because signed links leave the app (proposal emails, the OS). */
const SITE_BASE = "https://zyvorah.com";

const secret = () => {
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("corporate-art signing secret not configured");
  return s;
};

// ── the pure signing core (node:test-covered; no workerd needed) ───────────

/** The exact byte-string the HMAC covers. dl/w are "" when absent. */
export function caSigPayload(path: string, exp: number, dl: string, w: string): string {
  return `${PREFIX}${path}|${exp}|${dl}|${w}`;
}

export function caSign(path: string, exp: number, dl: string, w: string): string {
  return createHmac("sha256", secret()).update(caSigPayload(path, exp, dl, w)).digest("base64url");
}

/** Constant-time check of a presented signature for exactly path/exp/dl/w. */
export function caVerify(path: string, exp: number, dl: string, w: string, sig: string): boolean {
  let expected: string;
  try {
    expected = caSign(path, exp, dl, w);
  } catch {
    return false;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ── the storage-js-shaped adapter ──────────────────────────────────────────

type StoreError = { message: string } | null;

async function toBytes(body: Buffer | Uint8Array | ArrayBuffer | Blob): Promise<Uint8Array<ArrayBuffer>> {
  if (body instanceof Blob) return new Uint8Array(await body.arrayBuffer());
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  return new Uint8Array(body); // copy — detaches from any Buffer pool slice
}

/** storage's `cacheControl` was seconds-as-a-string; R2 stores a real header. */
const asCacheHeader = (v: string | undefined) =>
  v === undefined ? undefined : /^\d+$/.test(v) ? `max-age=${v}` : v;

/** `.upload()` replacement. `upsert:false` mirrors storage's 409 — a NEW
 *  object must never land on an existing key. */
export async function caUpload(
  path: string,
  body: Buffer | Uint8Array | ArrayBuffer | Blob,
  opts: { contentType: string; upsert?: boolean; cacheControl?: string },
): Promise<{ error: StoreError }> {
  try {
    const bucket = await privateBucket();
    if (bucket) {
      if (!opts.upsert && (await bucket.head(PREFIX + path))) {
        return { error: { message: "The resource already exists" } };
      }
      await bucket.put(PREFIX + path, await toBytes(body), {
        httpMetadata: { contentType: opts.contentType, cacheControl: asCacheHeader(opts.cacheControl) },
      });
      return { error: null };
    }
    // Off workerd (media container, scripts): self-mint the same token a
    // browser upload would carry and push the bytes through the site route.
    const token = mintUploadToken(path, {
      upsert: opts.upsert ?? false,
      ttlSeconds: 900,
      bucket: "corporate-art",
    });
    const res = await fetch(`${SITE_BASE}/api/media-upload?token=${encodeURIComponent(token)}`, {
      method: "PUT",
      headers: { "content-type": opts.contentType },
      body: new Blob([await toBytes(body)], { type: opts.contentType }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      return { error: { message: j?.error ?? `upload failed (${res.status})` } };
    }
    return { error: null };
  } catch (e) {
    return { error: { message: String((e as Error)?.message ?? e) } };
  }
}

/** `.download()` replacement — a Blob carrying the stored content type, so
 *  existing `.data.arrayBuffer()` / `.data.type` call sites are unchanged. */
export async function caDownload(path: string): Promise<{ data: Blob | null; error: StoreError }> {
  try {
    const bucket = await privateBucket();
    if (bucket) {
      const obj = await bucket.get(PREFIX + path);
      if (!obj) return { data: null, error: { message: "Object not found" } };
      return {
        data: new Blob([await obj.arrayBuffer()], {
          type: obj.httpMetadata?.contentType ?? "application/octet-stream",
        }),
        error: null,
      };
    }
    // Off workerd: fetch through the serving route with a short self-signature.
    const url = await caSignedUrl(path, 300);
    if (!url) return { data: null, error: { message: "signing unavailable" } };
    const res = await fetch(url);
    if (!res.ok) return { data: null, error: { message: `fetch failed (${res.status})` } };
    return {
      data: new Blob([await res.arrayBuffer()], {
        type: res.headers.get("content-type") ?? "application/octet-stream",
      }),
      error: null,
    };
  } catch (e) {
    return { data: null, error: { message: String((e as Error)?.message ?? e) } };
  }
}

/** `.remove()` replacement. Deleting a missing key is not an error — same as
 *  storage, where orphan-reclaim sweeps must never fail a request. */
export async function caRemove(paths: string[]): Promise<{ error: StoreError }> {
  if (!paths.length) return { error: null };
  try {
    const bucket = await privateBucket();
    if (!bucket) return { error: { message: "PRIVATE_R2 binding not available" } };
    await bucket.delete(paths.map((p) => PREFIX + p));
    return { error: null };
  } catch (e) {
    return { error: { message: String((e as Error)?.message ?? e) } };
  }
}

/** `.createSignedUrl()` replacement. Null when signing fails — callers treat
 *  that as "no link", never fall back to a public form (there isn't one). */
export async function caSignedUrl(
  path: string,
  expiresInSeconds: number,
  opts?: { download?: string | boolean; maxEdge?: number },
): Promise<string | null> {
  try {
    const exp = Math.floor(Date.now() / 1000) + Math.max(60, Math.round(expiresInSeconds));
    const dl = opts?.download === undefined || opts.download === false
      ? ""
      : opts.download === true ? "1" : opts.download;
    const w = opts?.maxEdge ? String(Math.round(opts.maxEdge)) : "";
    const sig = caSign(path, exp, dl, w);
    const q = new URLSearchParams({ exp: String(exp), sig });
    if (dl) q.set("dl", dl);
    if (w) q.set("w", w);
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    return `${SITE_BASE}/api/files/corporate-art/${encodedPath}?${q}`;
  } catch (e) {
    console.error("[corporate-art-store] sign failed:", path, (e as Error)?.message);
    return null;
  }
}

/** `.createSignedUploadUrl()` replacement: a one-path token for
 *  /api/media-upload, same trust shape as product-images' signers. The
 *  browser PUTs to `signedUrl` with only a Content-Type header — identical
 *  contract to the Supabase signed-upload URL it replaces. */
export function caSignedUploadUrl(
  path: string,
  opts: { upsert: boolean; ttlSeconds: number },
): { signedUrl: string; token: string } {
  const token = mintUploadToken(path, { ...opts, bucket: "corporate-art" });
  return { signedUrl: `/api/media-upload?token=${encodeURIComponent(token)}`, token };
}

export type { R2Bucket };
