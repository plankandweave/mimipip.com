import { installOfflineFetchBoundary, withOfflineBrowserPolicy } from "../brand/network-policy";
// The Worker's two entrypoints (Cloudflare's documented gateway pattern):
//
//  default — the GATEWAY. Never cached (wrangler.json exports.default.cache.enabled
//            = false), so it runs on every request, cache hits included. It applies
//            src/edge/gate.ts, then calls Site through ctx.exports with the host in
//            ctx.props.
//  Site    — vinext. Cached (exports.Site.cache.enabled = true): a HIT is served
//            without rendering, which is what keeps Supabase out of the page view.
//
// Bundled by scripts/build-edge-entry.mjs into dist/server/entry.mjs beside
// vinext's own dist/server/index.js (kept external, imported as built), which also
// writes the exports block, `main` and the enable_ctx_exports flag into the
// generated wrangler.json.
//
// request.cf over the loopback: the gateway forwards the country it sees as the
// x-zyv-geo-country header, always overwritten (gate.ts routeRequest), and
// geoCountry() falls back to it — so currency detection does not depend on
// whether the runtime carries request.cf across ctx.exports. The facet-crawler
// ASN check runs in the gateway itself, on the original request.
import { WorkerEntrypoint } from "cloudflare:workers";
// @ts-expect-error — resolved at bundle time: vinext's built entry, beside the output.
import vinext from "./index.js";
import { requestHost, routeRequest, withHostHeaders, type SiteProps } from "./gate";

type Handler = { fetch(request: Request, env: unknown, ctx: unknown): Promise<Response> };
const inner = vinext as Handler;

// Said once per isolate, loudly: without ctx.cache in Site, a studio publish's
// revalidatePath cannot purge the edge and a changed design would stay stale
// for up to its max-age. `wrangler tail` after a deploy must not show this.
let warnedNoPurge = false;

export class Site extends WorkerEntrypoint<unknown, SiteProps> {
  async fetch(request: Request): Promise<Response> {
    // The callee's own ctx: vinext's edge-cache admission and revalidatePath
    // purges run through ctx.cache, and must act on THIS entrypoint's cache.
    const ctx = this.ctx as { cache?: { purge?: unknown } };
    if (!warnedNoPurge && typeof ctx.cache?.purge !== "function") {
      warnedNoPurge = true;
      console.error("[edge] ctx.cache.purge is unavailable in Site — revalidatePath cannot purge cached pages");
    }
    installOfflineFetchBoundary();
    return withOfflineBrowserPolicy(await inner.fetch(request, this.env, this.ctx));
  }
}

type GatewayCtx = {
  exports: { Site(options: { props: SiteProps }): { fetch(request: Request): Promise<Response> } };
};

export default {
  async fetch(request: Request, _env: unknown, ctx: GatewayCtx): Promise<Response> {
    const route = routeRequest(request);
    const response =
      route.kind === "respond" ? route.response : await ctx.exports.Site({ props: route.props }).fetch(route.request);
    // Host-wide headers (the wraps host's noindex) go on here, after Site, so
    // a cached response carries them as surely as a fresh one.
    return withOfflineBrowserPolicy(withHostHeaders(response, requestHost(request), new URL(request.url).pathname));
  },
};
