import "server-only";
import { rasterizeSvgRemote, thumbnailBytesRemote, imageMetaRemote } from "./media-client";
import { assetFetch } from "./asset-fetch";

/**
 * Brand assets and image prep for the case-study PDF lockup.
 *
 * This replaced a diagonal tiled watermark. The tile was better at making a
 * cropped screenshot traceable; the lockup is far better at the thing that
 * actually matters here — someone looking at a forwarded PDF, liking the
 * work, and being able to reach us in one scan rather than hunting the site.
 * That is a deliberate trade, not an oversight.
 *
 * Nothing here renders text. Text is drawn by pdf-lib on the page itself,
 * using an embedded standard font, because librsvg on Vercel has no system
 * fonts and renders <text> as tofu boxes — a failure this codebase has
 * already been bitten by once (see the marketing cron notes in next.config).
 */

// The wordmark WITHOUT the "wallpapers" tagline. zyvorah-logo.svg carries the
// tagline and is the right file at poster scale, but the lockup draws the mark
// 74pt wide, where the tagline is roughly a point tall and renders as a smudge
// rather than a word. Small sizes get the mark alone.
// workerd has no filesystem — brand assets are fetched from the site's own
// public/ over HTTP (module-cached below, so once per isolate).
const ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://zyvorah.com").replace(/\/$/, "");
const LOGO_URL = `${ORIGIN}/brand/zyvorah-wordmark.svg`;
const QR_URL = `${ORIGIN}/brand/contact-qr.png`;

async function fetchAsset(url: string): Promise<Buffer> {
  const res = await assetFetch(url);
  if (!res.ok) throw new Error(`brand asset ${url} -> ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Where the QR points, and what the lockup invites. Kept beside the asset it
 *  describes so the two can never drift apart silently. */
export const CONTACT_URL = "https://zyvorah.com/commercial";

const cache = new Map<string, Promise<Buffer>>();
function once(key: string, make: () => Promise<Buffer>): Promise<Buffer> {
  let hit = cache.get(key);
  if (!hit) { hit = make(); cache.set(key, hit); }
  return hit;
}

/** The wordmark rasterised in one ink. The brand SVGs are authored with
 *  fill="currentColor", so recolouring is a substitution rather than a
 *  redraw — which is why no white variant needs to exist as a file. */
export function logoPng(ink: "white" | "black"): Promise<Buffer> {
  return once(`logo-${ink}`, async () => {
    const svg = (await fetchAsset(LOGO_URL)).toString("utf8");
    const painted = svg.replace(/currentColor/g, ink === "white" ? "#FFFFFF" : "#111111");
    // density 600 keeps the rasterisation crisp before the 480px resize,
    // exactly as the in-process sharp call did.
    return Buffer.from(await rasterizeSvgRemote(painted, 480, undefined, 600));
  });
}

export function qrPng(): Promise<Buffer> {
  return once("qr", () => fetchAsset(QR_URL));
}

/** Resized for embedding, with its pixel dimensions so a caller can map a
 *  point-space rectangle back onto the actual pixels. */
export async function prepareImage(
  image: Buffer,
  maxWidth: number,
): Promise<{ jpeg: Buffer; width: number; height: number }> {
  const ab = image.buffer.slice(image.byteOffset, image.byteOffset + image.byteLength) as ArrayBuffer;
  const jpeg = await thumbnailBytesRemote(ab, { width: maxWidth, quality: 90, mozjpeg: true });
  const meta = await imageMetaRemote(
    jpeg.buffer.slice(jpeg.byteOffset, jpeg.byteOffset + jpeg.byteLength) as ArrayBuffer,
  );
  return { jpeg, width: meta.width ?? 0, height: meta.height ?? 0 };
}
