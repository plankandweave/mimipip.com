import { serviceFetch, transportAvailable } from '@/brand/service-transport';
const fetch: typeof globalThis.fetch = (input, init) => serviceFetch('storage', input, init);
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Order documents and cart previews used to live in PUBLIC buckets, so every
// stored `*_url` column holds a `/storage/v1/object/public/<bucket>/<path>`
// URL. Those buckets are closed now, which would 404 the stored links — so the
// stored URL is treated as a stable *reference* and a short-lived signed URL is
// minted from it at read time.
//
// Nothing in the database was rewritten: the reference is the same string it
// always was, and re-opening a bucket would make every stored link work again
// untouched. That is deliberate — it keeps the rollback to one flag.

/** Buckets that are no longer world-readable and are read with the SERVICE
 *  role. `board-images` is deliberately absent: those are signed in the browser
 *  with the customer's own session against an owner-scoped policy, so the
 *  service role never sees them. */
const PRIVATE_DOC_BUCKETS = new Set(["order-copies", "order-previews", "print-files"]);

/**
 * The client that WRITES into the document buckets.
 *
 * These buckets carried an unconditional `INSERT ... to public` policy, which
 * let anyone upload into them — an open file drop, not just a public read. That
 * policy is gone, so the writes must carry the service role.
 *
 * Falls back to the anon client when the key is not configured, so a local dev
 * without secrets behaves exactly as it did before.
 */
export function docStorageClient(): SupabaseClient {
  return supabaseAdmin() ?? supabase;
}

/** Matches both the public form we stored and the signed form we now mint, so
 *  re-signing an already-signed URL resolves to the same object. */
const REF = /\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/;

export type DocRef = { bucket: string; path: string };

/** The bucket and path a stored document URL points at, or null when it is not
 *  a Supabase storage URL at all. */
export function docRef(url: string | null | undefined): DocRef | null {
  const m = REF.exec(url ?? "");
  return m ? { bucket: m[1], path: decodeURIComponent(m[2]) } : null;
}

/** One hour — long enough to read an order page and open the PDF, short enough
 *  that a link left in a browser history stops working the same day. */
const TTL_SECONDS = 3600;

/**
 * A signed, expiring URL for a stored document.
 *
 * Returns the URL it was given, unchanged, when there is nothing to do: the URL
 * is not a storage URL, its bucket is still public, or the service key is not
 * configured (local dev without secrets). Callers never have to branch on any
 * of that — they sign and render.
 *
 * Server-only: it reaches for the service role. Never import into a Client
 * Component.
 */
export async function signDoc(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;

  const ref = docRef(url);
  if (!ref || !PRIVATE_DOC_BUCKETS.has(ref.bucket)) return url;

  const admin = supabaseAdmin();
  if (!admin) return url;

  const { data, error } = await admin.storage.from(ref.bucket).createSignedUrl(ref.path, TTL_SECONDS);
  if (error || !data?.signedUrl) {
    console.error(`[private-doc] sign ${ref.bucket}/${ref.path} failed:`, error?.message);
    return null;
  }
  return data.signedUrl;
}

/**
 * The bytes of a stored document, read with the service role.
 *
 * For the places where the server consumes the file itself rather than handing
 * a link to a browser — the order-copy PDF embeds the cart preview, and a plain
 * fetch of the public URL stopped working when the bucket closed.
 */
export async function readDoc(url: string | null | undefined): Promise<Buffer | null> {
  if (!url) return null;

  const ref = docRef(url);
  if (!ref || !PRIVATE_DOC_BUCKETS.has(ref.bucket)) {
    const r = await fetch(url).catch(() => null);
    return r?.ok ? Buffer.from(await r.arrayBuffer()) : null;
  }

  const admin = supabaseAdmin();
  if (!admin) return null;

  const { data, error } = await admin.storage.from(ref.bucket).download(ref.path);
  if (error || !data) {
    console.error(`[private-doc] read ${ref.bucket}/${ref.path} failed:`, error?.message);
    return null;
  }
  return Buffer.from(await data.arrayBuffer());
}
