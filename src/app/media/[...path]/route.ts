import { NextResponse, after } from "next/server";
import { mediaBucket } from "@/lib/r2-media";
import { healRenditions } from "@/lib/product-images-store";

// Public media, served from the `zyvorah-media` R2 bucket through the site
// Worker — the storefront's replacement for Supabase Storage's public-object
// and render/image CDN (see lib/media-url.ts for the URL mapping).
//
// Why a route on THIS Worker rather than the bare media.zyvorah.com R2
// domain: renditions. Migrated objects all carry pre-generated `@480.webp` /
// `@1200.webp` neighbours, but a fresh upload's renditions come from the
// media container, which can be down at upload time. A bare R2 domain would
// 404 those; this route falls back to the original bytes, so a missing
// rendition costs weight, never a broken image — and then, after the response,
// generates the missing rendition from those same bytes, so the weight is paid
// once rather than on every visit for ever (26 Sep 2026: the homepage's
// Wildflower Reverie shot had shipped its 3 MB master in the 1200px slot since
// its upload, silently, because nothing retried).
//
// Caching: the response carries the OBJECT'S stored cache-control (uploads
// choose immutable for content-addressed keys, a day for upserted scene
// renders — exactly the split storage-body.ts documents), and Cloudflare's
// edge respects it for repeat visitors. No extra cache layer on top: an
// upserted key must not be pinned at the edge beyond what its own policy
// says.

/** Bucket prefixes this route will serve. Everything else in zyvorah-media
 *  (case-study frames at their bare keys) stays on media.zyvorah.com.
 *  installed-walls: customer install photos pushed by the OS
 *  (src/lib/installed-walls-intake.ts) — stored metadata-stripped, with a
 *  one-hour cache-control so a takedown clears quickly.
 *  marketing-media: already public on media.zyvorah.com; served here too so a
 *  Library film's captions load from this origin — a <video>'s <track> is a
 *  CORS request, which the bare media domain does not answer.
 *  fridge-scenes: the appliance-wrap hero photographs — see lib/media-url.ts. */
const SERVABLE = new Set(["product-images", "installed-walls", "marketing-media", "fridge-scenes"]);

const RENDITION_RE = /@(?:480|1200)\.webp$/;

export async function GET(
  _request: Request,
  context: { params: Promise<{ path?: string[] }> },
) {
  const { path } = await context.params;
  const key = (path ?? []).map(decodeURIComponent).join("/");
  if (!key || key.includes("..") || !SERVABLE.has(key.split("/", 1)[0])) {
    return new NextResponse("Not found.", { status: 404 });
  }

  const bucket = await mediaBucket();
  if (!bucket) {
    // Off-workerd (next dev): the same objects are publicly readable on the
    // R2 custom domain, minus the rendition fallback. Good enough for dev.
    return NextResponse.redirect(`https://media.zyvorah.com/${key}`, 302);
  }

  let object = await bucket.get(key);
  let healMaster: string | null = null;
  if (!object && RENDITION_RE.test(key)) {
    // Rendition not (yet) generated — serve the master instead.
    healMaster = key.replace(RENDITION_RE, "");
    object = await bucket.get(healMaster);
  }
  if (!object) return new NextResponse("Not found.", { status: 404 });

  // The stored cache-control only survives because /media is OUTSIDE the
  // proxy matcher (src/proxy.ts): a middleware-eligible path is vinext's
  // first no-store veto, ahead of everything below.
  //
  // No conditional-GET handling, deliberately: reading a request header marks
  // the route dynamic, and vinext stamps dynamic app-routes `no-store` —
  // which threw away the object cache-control below and made every browser
  // refetch every image. The etag still goes out; long max-ages carry the
  // real caching.
  //
  // BUFFERED, not streamed, for the same reason: vinext only admits a
  // replayable body to its cacheability pass — a stream comes back
  // `no-store` even with an explicit public policy (observed in prod;
  // the buffered brand-icon route keeps its header, this one didn't).
  // Largest masters are ~20MB, well inside the Worker's memory.
  const body = await object.arrayBuffer();
  if (healMaster && /\.(jpe?g|png|webp)$/i.test(healMaster)) {
    const master = healMaster;
    const cacheControl = object.httpMetadata?.cacheControl;
    after(() => healRenditions(master, body.slice(0), cacheControl));
  }
  return new NextResponse(body, {
    headers: {
      "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
      // A master standing in for a missing rendition must NOT inherit the
      // master's policy (often a year, immutable): the edge and every browser
      // would keep the multi-MB stand-in long after the heal above wrote the
      // real rendition. Five minutes, then they ask again and get the webp.
      "cache-control": healMaster
        ? "public, max-age=300"
        : (object.httpMetadata?.cacheControl ?? "public, max-age=86400"),
      etag: object.httpEtag,
      // Visualizer canvases draw these images cross-origin (www ↔ apex) with
      // crossOrigin="anonymous" — same allowance Supabase's CDN gave them.
      "access-control-allow-origin": "*",
      "x-content-type-options": "nosniff",
    },
  });
}
