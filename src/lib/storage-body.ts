/**
 * Wrap a Node Buffer/Uint8Array as a Blob before handing it to
 * @supabase/storage-js's `.upload()`.
 *
 * storage-js's uploadOrUpdate() branches on the body type: a Blob gets
 * wrapped in FormData, a FormData is used as-is, and anything else (a bare
 * Buffer included) is passed straight through as the raw fetch body. That
 * third path is the one that silently corrupts binary payloads on our
 * production runtime — every byte ≥0x80 comes back on the other end
 * replaced with the 3-byte UTF-8 replacement character (EF BF BD) while
 * ASCII bytes pass through untouched. That's the signature of the body
 * getting coerced through a UTF-8 string somewhere before it reaches the
 * wire (confirmed: local Node reproduces byte-perfect, so this is specific
 * to the deployed runtime, not the library version). Forcing the Blob
 * branch — the same path the browser's own Blob uploads already take
 * safely — avoids it.
 *
 * Found corrupted in production via this bug: custom-uploads/* (Print Your
 * Own previews), print-files/* (actual print masters sent to the RIP),
 * order-previews/*. Every server-side `supabase.storage.upload(path,
 * buffer, ...)` call must go through this wrapper, not a raw Buffer.
 */
export function toUploadBody(buf: Buffer | Uint8Array, contentType: string): Blob {
  return new Blob([new Uint8Array(buf)], { type: contentType });
}

/**
 * `cacheControl` values (seconds, as storage-js expects) for `.upload()`.
 * Without an explicit value, objects land as `no-cache` or `max-age=3600` and
 * Supabase's CDN BYPASSes them — every storefront visit re-downloads every
 * image from origin.
 *
 * CACHE_IMMUTABLE is only safe on keys whose content can never change:
 * content-hash names (studio flats), UUID/timestamped names. A fixed path
 * that gets upserted with new bytes (studio scene renders) must use
 * CACHE_MUTABLE instead, or browsers hold the stale render for a year.
 */
export const CACHE_IMMUTABLE = "31536000";
export const CACHE_MUTABLE = "86400";
