// The `product-images` store, post-R2-migration.
//
// Mirrors the two-call shape every upload site used against Supabase Storage
// (`upload()` then `getPublicUrl()`), so call sites change mechanically. All
// writes go through the MEDIA_R2 binding — the Worker's own credential-free
// path — and public URLs come out in the /media form that media-url.ts maps
// reads to.
//
// Renditions: each image upload also writes `<key>@480.webp` / `<key>@1200.webp`
// via the media container (the only place sharp runs). They are a weight
// optimisation, never a correctness gate — the /media route serves the master
// when one is missing — but a missing one is a 3 MB PNG where a 90 KB webp
// belongs, on whatever page shows it. On 26 Sep 2026 two Wildflower Reverie
// scenes (the homepage's among them) lost theirs to a container blip at upload,
// and nothing ever retried: this file only logged a warning. So now:
//   - the upload tries twice before giving up;
//   - a re-upload of a fixed key DELETES the old renditions first, so a
//     failure falls back to the new master rather than the previous render;
//   - whatever still slips through is healed by the /media route the first
//     time anyone asks for it (healRenditions below).
// scripts/rendition-audit.mjs is the outside check across the whole catalogue.

import { MEDIA_BASE, RENDITION_WIDTHS } from "@/lib/media-url";
import { requireMediaBucket, mediaBucket } from "@/lib/r2-media";
import { renditionRemote } from "@/lib/media-client";

const BUCKET_PREFIX = "product-images/";

/** storage-body.ts's CACHE_* values are bare seconds (storage-js dialect);
 *  R2 stores a real header. Accept both spellings. */
function asCacheControl(v: string | undefined): string {
  if (!v) return "public, max-age=31536000, immutable";
  if (/^\d+$/.test(v)) {
    const s = Number(v);
    return s >= 31536000 ? "public, max-age=31536000, immutable" : `public, max-age=${s}`;
  }
  return v;
}

export function productImagePublicUrl(key: string): string {
  return `${MEDIA_BASE}/${BUCKET_PREFIX}${key}`;
}

const IMG_RE = /\.(jpe?g|png|webp)$/i;

export async function putProductImage(
  key: string,
  bytes: Buffer | Uint8Array | ArrayBuffer,
  opts: { contentType: string; cacheControl?: string },
): Promise<{ publicUrl: string }> {
  const bucket = await requireMediaBucket();
  const cacheControl = asCacheControl(opts.cacheControl);
  const body = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  const isImage = IMG_RE.test(key);
  // Scene renders upsert a fixed key. Old renditions left beside new bytes
  // would keep showing the PREVIOUS render wherever a card asks for @480/@1200
  // — drop them before the master changes, so the worst case is the new master.
  if (isImage) await bucket.delete(RENDITION_WIDTHS.map((w) => `${BUCKET_PREFIX}${key}@${w}.webp`));
  await bucket.put(`${BUCKET_PREFIX}${key}`, body, {
    httpMetadata: { contentType: opts.contentType, cacheControl },
  });
  if (isImage) {
    const ab = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
    for (let attempt = 1; ; attempt++) {
      try {
        await writeRenditions(`${BUCKET_PREFIX}${key}`, ab, cacheControl);
        break;
      } catch (e) {
        if (attempt >= 2) {
          // Not fatal: the /media route serves the master and heals the gap on
          // the first request for it.
          console.warn(`renditions deferred to first request for ${key}: ${e instanceof Error ? e.message : e}`);
          break;
        }
      }
    }
  }
  return { publicUrl: productImagePublicUrl(key) };
}

/** Write both renditions of a master. `fullKey` includes the bucket prefix. */
async function writeRenditions(fullKey: string, master: ArrayBuffer, cacheControl: string) {
  const bucket = await requireMediaBucket();
  for (const w of RENDITION_WIDTHS) {
    const { bytes, contentType } = await renditionRemote(master, w);
    await bucket.put(`${fullKey}@${w}.webp`, bytes, { httpMetadata: { contentType, cacheControl } });
  }
}

const healing = new Map<string, number>();
const HEAL_BACKOFF_MS = 10 * 60_000;

// A heal that FAILS must not be retried by every visitor. The stand-in master
// goes out with a five-minute max-age and `healing` is per isolate, so one
// master sharp cannot read woke the media container every few minutes, from
// every isolate, for ever — and a container that is always being woken is
// never idle, and is billed round the clock. A failure is therefore recorded
// in R2 (shared by every isolate) and the key is left alone for a day.
// `_heal-failed/` is outside the /media route's SERVABLE prefixes.
const HEAL_FAILED_PREFIX = "_heal-failed/";
const HEAL_FAILED_BACKOFF_MS = 24 * 60 * 60_000;

/**
 * Generate the renditions of a master the /media route found without them.
 * Called post-response with the master bytes the route already read, so it
 * costs one container call per width and never delays the image. Throttled
 * per isolate — a busy page asking for the same missing rendition must not
 * queue a container job per visitor; if the container is down the next
 * attempt waits out the backoff.
 */
export async function healRenditions(
  fullKey: string,
  master: ArrayBuffer,
  cacheControl: string | undefined,
): Promise<void> {
  const last = healing.get(fullKey);
  if (last && Date.now() - last < HEAL_BACKOFF_MS) return;
  healing.set(fullKey, Date.now());
  const bucket = await requireMediaBucket();
  const marker = `${HEAL_FAILED_PREFIX}${fullKey}`;
  const failedAt = await bucket
    .get(marker)
    .then(async (o) => (o ? Number(new TextDecoder().decode(await o.arrayBuffer())) : 0))
    .catch(() => 0);
  if (failedAt && Date.now() - failedAt < HEAL_FAILED_BACKOFF_MS) return;
  try {
    await writeRenditions(fullKey, master, asCacheControl(cacheControl));
    console.log(`renditions healed for ${fullKey}`);
    if (failedAt) await bucket.delete(marker).catch(() => {});
  } catch (e) {
    console.warn(`rendition heal failed for ${fullKey}: ${e instanceof Error ? e.message : e}`);
    await bucket.put(marker, String(Date.now())).catch(() => {});
  }
}

/** Raw bytes of an object, or null when absent. */
export async function getProductImage(key: string): Promise<Buffer | null> {
  const bucket = await requireMediaBucket();
  const obj = await bucket.get(`${BUCKET_PREFIX}${key}`);
  if (!obj) return null;
  return Buffer.from(await obj.arrayBuffer());
}

export async function productImageExists(key: string): Promise<boolean> {
  const bucket = await requireMediaBucket();
  return (await bucket.head(`${BUCKET_PREFIX}${key}`)) !== null;
}

/** Delete objects and their renditions. Best-effort on the renditions. */
export async function removeProductImages(keys: string[]): Promise<void> {
  const bucket = await mediaBucket();
  if (!bucket) return;
  const full = keys.flatMap((k) => [
    `${BUCKET_PREFIX}${k}`,
    ...RENDITION_WIDTHS.map((w) => `${BUCKET_PREFIX}${k}@${w}.webp`),
  ]);
  await bucket.delete(full);
}
