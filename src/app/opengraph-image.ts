import {
  getSignatureCollections,
  getSignatureProducts,
  getProductByHandle,
  sortImages,
} from "@/lib/queries";
import { logicalDayIndex } from "@/lib/dailyRotation";
import { wordmarkStandaloneSvg } from "@/lib/wordmark-svg";
import { toMediaUrl, isMediaUrl, mediaRendition } from "@/lib/media-url";
import { fetchMediaAware } from "@/lib/r2-media";

// The default social share image — a REAL mural from the catalogue, on a real
// wall, with the wordmark over it. Product & collection pages override this
// with their own imagery; everything else, the homepage above all, uses this.
//
// Two deliberate decisions:
//
// 1. The picture is one of our own published room renders, and it always comes
//    from a SIGNATURE collection — the studio's editorial picks, in their own
//    ranked order — rotating daily on the same clock as the homepage's Signature
//    row. So the card is always a design somebody can buy, and always one we
//    would choose to lead with: never stock, never a graphic standing in for
//    wallpaper, and never whatever happened to be nearest the top of the shop.
// 2. It is composed with sharp and shipped as JPEG, not through next/og:
//    ImageResponse only emits PNG, and a photograph at this size lands near a
//    megabyte — over the ~600KB where WhatsApp silently drops the preview.
//    JPEG keeps a full-bleed mural under 100KB.
//
// 1200×520 (2.31:1) rather than the usual 1200×630: WhatsApp renders a large
// preview at the image's own aspect, so a letterbox card takes noticeably less
// of the chat bubble while staying inside WhatsApp's 4:1 limit and well over
// its 300px minimum width (under that it drops to a tiny thumbnail). Facebook
// and LinkedIn centre-crop wide images towards 1.91:1 — about 85px a side here
// — so the wordmark sits well inside that, and only mural bleeds off.
//
// This route must stay STATIC (the build prints it as ○, not ƒ). That is what
// keeps sharp — and the catalogue read — out of the deployed function, and it
// means no crawler ever waits on a live composite. Hence the cacheable image
// fetch below and no `revalidate`: adding either a no-store fetch or an ISR
// window turns it into a lambda that has to carry sharp's native binaries. The
// card therefore refreshes on deploy, which is also when new designs ship.
export const size = { width: 1200, height: 520 };
export const contentType = "image/jpeg";
export const alt = "A Zyvorah mural, sized to your wall";

const { width: W, height: H } = size;

/** How far the logo sits from the bottom-left corner — inside every platform's crop. */
const PAD = 62;
const LOGO_H = 58;

/** The day's mural: the signature collections, in the daily rotation the
 *  homepage's Signature row uses, taking the best-ranked design that has been
 *  rendered into a room.
 *
 *  A signature CARD carries the flat pattern (getSignatureProducts asks toCard
 *  for no particular room), which is right for a shop row and wrong for a share
 *  card — this wants the design ON a wall. So the ranked handles are re-read for
 *  their scene renders, in the studio's own image order, and a flat is accepted
 *  only if no signature design anywhere has been rendered into a room yet. */
async function pickMural(): Promise<string | null> {
  const collections = await getSignatureCollections();
  if (!collections.length) return null;

  const start = logicalDayIndex() % collections.length;
  let flat: string | undefined;

  for (let i = 0; i < collections.length; i++) {
    const ranked = await getSignatureProducts(collections[(start + i) % collections.length], 6);

    for (const card of ranked) {
      const product = await getProductByHandle(card.handle);
      const scene = sortImages(product?.product_images ?? []).find((img) => img.scene_key && img.url);
      if (scene?.url) return scene.url;
      flat ??= card.image ?? undefined;
    }
  }
  return flat ?? null;
}

/** Pull one render off Supabase's transform CDN. Local rather than marketing's
 *  fetchImage for two reasons: that one reads with no-store, which on its own
 *  would make this route dynamic, and it takes whatever format the origin holds
 *  — a 1400px PNG scene is ~2.3MB, over Next's data-cache ceiling, where the
 *  WebP the CDN serves for the same ask is ~200KB. */
async function fetchRender(url: string, width: number): Promise<Buffer> {
  const src = toMediaUrl(url);
  if (isMediaUrl(src)) {
    // Own zone — read through the binding (a Worker cannot fetch itself).
    const res = await fetchMediaAware(mediaRendition(src, width));
    if (!res.ok) throw new Error(`share card source ${res.status}: ${url}`);
    return Buffer.from(await res.arrayBuffer());
  }
  // A Supabase public object that is NOT migrated is fetched as stored. Its
  // render/image transform endpoint is a paid feature this tenant lacks (403
  // FeatureNotEnabled on every call, see supabaseImageLoader.ts) — asking it
  // for a WebP would fail the whole share card, not shrink it. Every product
  // scene is on /media above; this branch only ever sees the odd small object.
  const res = await fetch(src, { cache: "force-cache", headers: { accept: "image/webp,image/*" } });
  if (!res.ok) throw new Error(`share card source ${res.status}: ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Bottom-left scrim — just enough to hold the white wordmark, never a wash
 *  over the mural itself. */
const scrimSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="up" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#0F0F0F" stop-opacity="0.62"/>
      <stop offset="0.42" stop-color="#0F0F0F" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#0F0F0F" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="across" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#0F0F0F" stop-opacity="0.34"/>
      <stop offset="0.55" stop-color="#0F0F0F" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#up)"/>
  <rect width="100%" height="100%" fill="url(#across)"/>
</svg>`;

/** sharp, loaded INSIDE the render rather than at module scope.
 *
 *  Next re-evaluates this file whenever a page's metadata is resolved at request
 *  time — product and collection pages have a dynamic generateMetadata, so that
 *  is every one of them — and a top-level `import sharp` therefore ran inside
 *  the PAGE function. Page functions carry no libvips (only the routes named in
 *  next.config's outputFileTracingIncludes do), so the import threw
 *  ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.3 on every product and collection
 *  page: a hard 500 for crawlers Next renders without streaming (Bingbot,
 *  Applebot, DuckDuckBot, Yandex, Baiduspider, Slurp, facebookexternalhit) and a
 *  swallowed error inside everyone else's 200.
 *
 *  The card itself is composed at BUILD time — this route stays ○, see below —
 *  where sharp is present, so deferring the load costs nothing. */
async function loadSharp() {
  return (await import("sharp")).default;
}

/** Last resort if the catalogue or the CDN is unreachable at build time: the
 *  wordmark on the site's own paper colour. A plain card still previews;
 *  a failed build, or a link with no preview at all, does not. */
async function paperCard(): Promise<Buffer> {
  const sharp = await loadSharp();
  const h = 92;
  return sharp({
    create: { width: W, height: H, channels: 3, background: "#FAFAF7" },
  })
    .composite([{ input: Buffer.from(wordmarkStandaloneSvg("#0F0F0F", h)), gravity: "centre" }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}

export default async function OpengraphImage(): Promise<Response> {
  const sharp = await loadSharp();
  let body: Buffer;
  try {
    const mural = await pickMural();
    if (!mural) throw new Error("no signature design with an image");

    // Crop from the top, as the homepage hero does: the wall (and so the mural)
    // is the upper part of a room render — centring would trade it for floor.
    const base = await sharp(await fetchRender(mural, 1400))
      .resize(W, H, { fit: "cover", position: "top" })
      .modulate({ saturation: 1.02 })
      .sharpen()
      .toBuffer();

    body = await sharp(base)
      .composite([
        { input: Buffer.from(scrimSvg) },
        {
          input: Buffer.from(wordmarkStandaloneSvg("#FFFFFF", LOGO_H)),
          left: PAD,
          top: H - PAD - LOGO_H,
        },
      ])
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
  } catch {
    body = await paperCard();
  }

  return new Response(new Uint8Array(body), {
    headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=0, must-revalidate" },
  });
}
