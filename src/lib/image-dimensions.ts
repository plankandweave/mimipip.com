import type { SupabaseClient } from "@/brand/database-types";
import { mediaKeyFromUrl } from "@/lib/media-url";
import { mediaBucket } from "@/lib/r2-media";

/**
 * True pixel dimensions of an image, read from its container header.
 *
 * Everything here parses the first few KB rather than decoding the file: a
 * PNG's size lives at a fixed offset in IHDR, a JPEG's in the first SOF marker,
 * a WebP's in the VP8/VP8L/VP8X chunk. That keeps recording a 5000px master's
 * size to a couple of KB over the wire instead of several MB, which is what
 * makes it affordable to do on every write.
 *
 * These land in product_images.width/height (migration 0060). Downstream they
 * are load-bearing for honesty, not decoration: the product gallery's zoom
 * refuses to scale past them, and the partner quote form divides by them for
 * its DPI verdict. A guess here becomes a lie there — so every function below
 * returns null rather than an approximation when it cannot be sure.
 */
export type Dimensions = { width: number; height: number };

export function dimensionsFromBuffer(input: ArrayBuffer | Uint8Array): Dimensions | null {
  const b = Buffer.isBuffer(input) ? input : Buffer.from(input instanceof Uint8Array ? input : new Uint8Array(input));
  return png(b) ?? jpeg(b) ?? webp(b);
}

function ok(w: number, h: number): Dimensions | null {
  // 0 or negative would violate the column's check constraint, and a NaN from a
  // truncated header would be written as null by the driver — reject both here
  // so a malformed file is "unknown", never a bogus size.
  return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 ? { width: w, height: h } : null;
}

function png(b: Buffer): Dimensions | null {
  if (b.length < 24 || b[0] !== 0x89 || b[1] !== 0x50) return null;
  return ok(b.readUInt32BE(16), b.readUInt32BE(20));
}

function jpeg(b: Buffer): Dimensions | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i < b.length - 9) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    // SOF0..SOF15 carry the frame size. DHT (c4), DAC (cc) and RST (c8) share
    // the range but are not frame headers.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xcc && marker !== 0xc8) {
      return ok(b.readUInt16BE(i + 7), b.readUInt16BE(i + 5));
    }
    const len = b.readUInt16BE(i + 2);
    if (len < 2) return null; // malformed: a zero-length segment would loop forever
    i += 2 + len;
  }
  return null;
}

function webp(b: Buffer): Dimensions | null {
  if (b.length < 30) return null;
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WEBP") return null;
  const fmt = b.toString("ascii", 12, 16);
  if (fmt === "VP8X") return ok(1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3));
  if (fmt === "VP8 ") return ok(b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff);
  if (fmt === "VP8L") {
    const n = b.readUInt32LE(21);
    return ok((n & 0x3fff) + 1, ((n >> 14) & 0x3fff) + 1);
  }
  return null;
}

/**
 * Measure a stored image by URL. Asks for the leading bytes only; widens once
 * because a JPEG with a fat EXIF/ICC block can push its SOF past 4 KB.
 */
export async function measureImageUrl(url: string): Promise<Dimensions | null> {
  if (!/^https?:/i.test(url)) return null; // relative asset (e.g. the bespoke card) — nothing to fetch
  // A migrated media URL is our own zone — a Worker cannot fetch that (522);
  // read the leading bytes through the R2 binding instead.
  const mediaKey = mediaKeyFromUrl(url);
  if (mediaKey) {
    const bucket = await mediaBucket();
    if (bucket) {
      for (const length of [4096, 65536]) {
        try {
          const obj = await bucket.get(mediaKey, { range: { offset: 0, length } });
          if (!obj) return null;
          const dims = dimensionsFromBuffer(await obj.arrayBuffer());
          if (dims) return dims;
        } catch {
          return null;
        }
      }
      return null;
    }
    // Off-workerd (scripts, dev): the public domain works over plain fetch.
  }
  for (const range of ["bytes=0-4095", "bytes=0-65535"]) {
    try {
      const res = await fetch(url, { headers: { Range: range }, cache: "no-store" });
      // A server that ignores Range answers 200 with the whole file, which is
      // still parseable — only a real failure should stop us.
      if (!res.ok && res.status !== 206) return null;
      const dims = dimensionsFromBuffer(await res.arrayBuffer());
      if (dims) return dims;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Record an image's true size against every product_images row pointing at it.
 *
 * Matching on url rather than id is deliberate: the studio dedups flats, so one
 * file can legitimately back rows on several products, and they all describe
 * the same pixels. Pass `known` when the bytes are already in hand (the scene
 * generator has them before upload) to skip the round trip entirely.
 *
 * Never throws. Recording a dimension is bookkeeping that runs after the image
 * is already saved — failing it must not fail the upload the user asked for.
 * A miss simply leaves the row null, which every reader already treats as
 * "unknown", and the backfill script picks it up later.
 */
export async function recordImageDimensions(
  db: SupabaseClient,
  url: string,
  known?: ArrayBuffer | Uint8Array | null,
): Promise<Dimensions | null> {
  try {
    const dims = (known ? dimensionsFromBuffer(known) : null) ?? (await measureImageUrl(url));
    if (!dims) {
      console.warn(`[image-dimensions] could not measure ${url}`);
      return null;
    }
    const { error } = await db
      .from("product_images")
      .update({ width: dims.width, height: dims.height })
      .eq("url", url);
    if (error) console.warn(`[image-dimensions] write failed for ${url}: ${error.message}`);
    return dims;
  } catch (e) {
    console.warn(`[image-dimensions] ${url}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}
