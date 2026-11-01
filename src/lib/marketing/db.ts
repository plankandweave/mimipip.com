import { serviceAvailable, requireService } from "../../brand/services";
// Server-only Supabase access for the marketing engine: the service-role client
// that writes the ledger and uploads composed media. NEVER import this into a
// client component — it holds the service-role key, which bypasses RLS.
//
// Catalogue reads still go through the anon client (src/lib/supabase.ts); only
// writes/uploads need this.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { toUploadBody } from "@/lib/storage-body";
import { mediaBucket } from "@/lib/r2-media";
import { R2_DOMAIN_BASE } from "@/lib/media-url";

const MEDIA_BUCKET = "marketing-media";

let cached: SupabaseClient | null = null;

/** Lazily construct the service-role client. Throws a clear error if the key
 *  isn't configured, so callers can degrade to "generate but don't persist." */
export function serviceClient(): SupabaseClient {
  if (!serviceAvailable("database")) requireService("database");
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY (and NEXT_PUBLIC_SUPABASE_URL) required for marketing writes/uploads.",
    );
  }
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

export function hasServiceRole(): boolean {
  return serviceAvailable("database") && !!process.env.SUPABASE_SERVICE_ROLE_KEY && !!process.env.NEXT_PUBLIC_SUPABASE_URL;
}

/**
 * Upload a composed media buffer to the public marketing bucket and return its
 * public URL — the URL the publishers hand to Instagram/YouTube/LinkedIn.
 *
 * Writes to R2, not Supabase Storage. A composed batch is the heaviest thing
 * this site stores — a twelve-reel opening is ~40 MB of MP4 — and every read
 * of it (each publisher, the plan preview, the platform's own fetch) was a
 * Supabase egress: on 25 Sep 2026 the marketing bucket alone accounted for
 * 78 MB of the day's 96 MB and helped blow the free-plan quota. R2 egress is
 * free, which is why product-images moved there first (lib/media-url.ts).
 *
 * The URL is the bare R2 custom domain rather than this Worker's /media route
 * on purpose: that route buffers whole objects and answers no Range request,
 * which is fine for a JPEG and wrong for a video the plan preview scrubs.
 *
 * Objects ALREADY on Supabase keep their URLs and are not touched — the two
 * spellings coexist, exactly as the product-image migration left them, so
 * nothing already published can break. Off Cloudflare (next dev, scripts)
 * there is no binding, so the upload falls back to Supabase and dev still
 * works end to end.
 */
export async function uploadMedia(
  path: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<string> {
  const bucket = await mediaBucket();
  if (bucket) {
    const key = `${MEDIA_BUCKET}/${path}`;
    await bucket.put(key, new Uint8Array(body), {
      httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" },
    });
    return `${R2_DOMAIN_BASE}/${key}`;
  }
  const sb = serviceClient();
  const { error } = await sb.storage.from(MEDIA_BUCKET).upload(path, toUploadBody(body, contentType), {
    contentType,
    upsert: true,
  });
  if (error) throw new Error(`uploadMedia(${path}): ${error.message}`);
  const { data } = sb.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
