import { serviceFetch } from '@/brand/service-transport';
const fetch: typeof globalThis.fetch = (input, init) => serviceFetch('storage', input, init);
import "server-only";

/**
 * Read a file from the site's own `public/` from server code.
 *
 * The site runs as a Cloudflare Worker, and a Worker CANNOT fetch its own zone's
 * public URL (`https://zyvorah.com/…`) — a same-zone subrequest loops and times
 * out (observed as 522, and the media worker's analogous case as 1042). Static
 * assets must be read worker-to-assets through the ASSETS binding instead. Off
 * workerd (next dev, Vercel, the media container) the `cloudflare:workers`
 * import throws and we fall back to a plain fetch, so the same call works
 * everywhere.
 *
 * Pass an absolute URL (typically `new URL("/fonts/x.ttf", req.url).toString()`);
 * the ASSETS binding matches on the path. This is the same shape as
 * `assetFetch` in src/lib/pdf-brand.ts (PR #218), lifted here so any route that
 * needs a bundled asset uses one implementation.
 */
export async function assetFetch(url: string): Promise<Response> {
  try {
    const { env } = (await import(/* @vite-ignore */ "cloudflare:workers")) as {
      env: { ASSETS?: { fetch(req: Request): Promise<Response> } };
    };
    if (env?.ASSETS) return await env.ASSETS.fetch(new Request(url));
  } catch {
    /* not on workerd — fall through to plain fetch */
  }
  return await fetch(url);
}
