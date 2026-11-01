// The PRIVATE `presentations` store, now in R2 (`zyvorah-store-private`,
// binding PRIVATE_R2, keys prefixed `presentations/`) — the replacement for
// the Supabase Storage bucket of the same name. It holds client decks and
// films, the Proposal Studio's pictures, and the staff-only finished reviews.
//
// Why it moved: every read of the Supabase bucket was metered egress. A staff
// review is 4–15 MB per asset and was downloaded by the Worker on EVERY view;
// a studio deck's pictures were fetched by browsers straight from storage
// signed URLs. A binding read is free.
//
// READ-THROUGH. Objects written before the move are still in the Supabase
// bucket (nothing there is deleted). A read that misses R2 copies that one
// object across — once — and serves it from R2 ever after, so no backfill has
// to run before a deploy and nothing ever 404s for having been written early.
//
// Off workerd (next dev, scripts) there is no binding; every call here falls
// back to the Supabase bucket, which is what those runtimes always used.
//
// Shaped like storage-js ({data, error} results) so call sites swapped
// mechanically — same approach as corporate-art-store.ts.

import "server-only";
import { privateBucket, type R2Bucket, type R2Object } from "@/lib/r2-media";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { toUploadBody } from "@/lib/storage-body";
import { mintUploadToken } from "@/lib/upload-token";
import { presSignedUrlFor, type ByteRange } from "@/lib/presentation-sign";

const BUCKET = "presentations";
const PREFIX = "presentations/";

type StoreError = { message: string } | null;
const NOT_FOUND = "Object not found";
export const presIsNotFound = (e: StoreError) => !!e && /not found/i.test(e.message);

const errOf = (e: unknown): StoreError => ({ message: String((e as Error)?.message ?? e) });

async function toBytes(body: Buffer | Uint8Array | ArrayBuffer | Blob): Promise<Uint8Array<ArrayBuffer>> {
  if (body instanceof Blob) return new Uint8Array(await body.arrayBuffer());
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  return new Uint8Array(body); // copy — detaches from any Buffer pool slice
}

/** Copy one legacy object from the Supabase bucket into R2. "missing" is a
 *  CONFIRMED absence; anything else that goes wrong throws, because callers
 *  (the review import) treat only a confirmed miss as permission to write. */
async function mirror(bucket: R2Bucket, path: string): Promise<"copied" | "missing"> {
  const sb = supabaseAdmin();
  if (!sb) throw new Error("service role unavailable");
  const { data, error } = await sb.storage.from(BUCKET).download(path);
  if (error || !data) {
    if (!error || presIsNotFound(error)) return "missing";
    throw new Error(error.message);
  }
  await bucket.put(PREFIX + path, await data.arrayBuffer(), {
    httpMetadata: { contentType: data.type || "application/octet-stream" },
  });
  return "copied";
}

/** The object from R2, copying it over from the legacy bucket on a miss.
 *  Null is a confirmed absence in both. */
export async function presObject(path: string, range?: ByteRange): Promise<R2Object | null> {
  const bucket = await privateBucket();
  if (!bucket) throw new Error("PRIVATE_R2 binding not available");
  const opts = range ? { range } : undefined;
  const hit = await bucket.get(PREFIX + path, opts);
  if (hit) return hit;
  if ((await mirror(bucket, path)) === "missing") return null;
  return await bucket.get(PREFIX + path, opts);
}

/** Size + type without the body — after the same read-through, so a Range
 *  request can be answered against an object that was only in Supabase. */
export async function presHead(path: string): Promise<{ size: number; contentType: string } | null> {
  const bucket = await privateBucket();
  if (!bucket) throw new Error("PRIVATE_R2 binding not available");
  let head = await bucket.head(PREFIX + path);
  if (!head) {
    if ((await mirror(bucket, path)) === "missing") return null;
    head = await bucket.head(PREFIX + path);
    if (!head) return null;
  }
  return {
    size: head.size,
    contentType: head.httpMetadata?.contentType ?? "application/octet-stream",
  };
}

/** `.download()` replacement — a Blob carrying the stored content type. */
export async function presDownload(path: string): Promise<{ data: Blob | null; error: StoreError }> {
  try {
    const bucket = await privateBucket();
    if (!bucket) {
      const sb = supabaseAdmin();
      if (!sb) return { data: null, error: { message: "service role unavailable" } };
      const { data, error } = await sb.storage.from(BUCKET).download(path);
      return { data: data ?? null, error: error ? { message: error.message } : null };
    }
    const obj = await presObject(path);
    if (!obj) return { data: null, error: { message: NOT_FOUND } };
    return {
      data: new Blob([await obj.arrayBuffer()], {
        type: obj.httpMetadata?.contentType ?? "application/octet-stream",
      }),
      error: null,
    };
  } catch (e) {
    return { data: null, error: errOf(e) };
  }
}

/** `.upload()` replacement. `upsert:false` mirrors storage's 409 — and counts
 *  a legacy copy as existing, so an immutable key is never written twice. */
export async function presUpload(
  path: string,
  body: Buffer | Uint8Array | ArrayBuffer | Blob,
  opts: { contentType: string; upsert?: boolean },
): Promise<{ error: StoreError }> {
  try {
    const bytes = await toBytes(body);
    const bucket = await privateBucket();
    if (!bucket) {
      const sb = supabaseAdmin();
      if (!sb) return { error: { message: "service role unavailable" } };
      const { error } = await sb.storage.from(BUCKET).upload(path, toUploadBody(bytes, opts.contentType), {
        contentType: opts.contentType, upsert: opts.upsert ?? false, cacheControl: "0",
      });
      return { error: error ? { message: error.message } : null };
    }
    if (!opts.upsert && (await presExists(path))) {
      return { error: { message: "The resource already exists" } };
    }
    await bucket.put(PREFIX + path, bytes, { httpMetadata: { contentType: opts.contentType } });
    return { error: null };
  } catch (e) {
    return { error: errOf(e) };
  }
}

/** True when the object exists — in R2, or still only in the legacy bucket
 *  (a metadata listing there; no bytes move). */
export async function presExists(path: string): Promise<boolean> {
  const bucket = await privateBucket();
  if (bucket && (await bucket.head(PREFIX + path))) return true;
  const sb = supabaseAdmin();
  if (!sb) return false;
  const slash = path.lastIndexOf("/");
  const dir = slash === -1 ? "" : path.slice(0, slash);
  const name = path.slice(slash + 1);
  const { data, error } = await sb.storage.from(BUCKET).list(dir, { search: name, limit: 100 });
  if (error) throw new Error(error.message);
  return (data ?? []).some((o) => o.name === name);
}

export type PresEntry = { name: string; createdAt: string | null };

/** `.list(dir)` replacement: the immediate children of `dir` — files and
 *  sub-folders — across R2 and the legacy bucket. Where both hold a name the
 *  legacy timestamp wins: it is when the object was really written, where
 *  R2's is only when it was copied. */
export async function presList(dir: string): Promise<PresEntry[]> {
  const out = new Map<string, PresEntry>();
  const bucket = await privateBucket();
  if (bucket) {
    const base = `${PREFIX}${dir}/`;
    let cursor: string | undefined;
    do {
      const page = await bucket.list({ prefix: base, delimiter: "/", cursor });
      for (const o of page.objects) {
        out.set(o.key.slice(base.length), { name: o.key.slice(base.length), createdAt: o.uploaded.toISOString() });
      }
      for (const p of page.delimitedPrefixes) {
        const name = p.slice(base.length).replace(/\/$/, "");
        if (!out.has(name)) out.set(name, { name, createdAt: null });
      }
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
  }
  const sb = supabaseAdmin();
  if (sb) {
    const { data, error } = await sb.storage.from(BUCKET).list(dir, { limit: 1000 });
    if (error) throw new Error(error.message);
    for (const o of data ?? []) {
      out.set(o.name, { name: o.name, createdAt: o.created_at ?? out.get(o.name)?.createdAt ?? null });
    }
  } else if (!bucket) {
    throw new Error("service role unavailable");
  }
  return [...out.values()];
}

/** `.createSignedUrl()` replacement. Null when signing fails — callers treat
 *  that as "no link". Off workerd the object can only be in the legacy
 *  bucket, so that runtime keeps storage's own signed URL. */
export async function presSignedUrl(path: string, expiresInSeconds: number): Promise<string | null> {
  try {
    if (!(await privateBucket())) {
      const sb = supabaseAdmin();
      if (!sb) return null;
      const { data } = await sb.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
      return data?.signedUrl ?? null;
    }
    return presSignedUrlFor(path, expiresInSeconds);
  } catch (e) {
    console.error("[presentation-store] sign failed:", path, (e as Error)?.message);
    return null;
  }
}

/** `.createSignedUploadUrl()` replacement: a one-path, never-overwrite token
 *  for /api/media-upload. The browser PUTs the file to `signedUrl`. */
export function presSignedUploadUrl(path: string): { path: string; signedUrl: string } {
  const token = mintUploadToken(path, { upsert: false, ttlSeconds: 2 * 60 * 60, bucket: "presentations" });
  return { path, signedUrl: `/api/media-upload?token=${encodeURIComponent(token)}` };
}
