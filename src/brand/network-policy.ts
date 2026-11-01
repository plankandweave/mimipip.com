/** Disconnected browser policy. Internal UI/API requests and bundled assets remain usable. */
export const offlineContentSecurityPolicy = [
  "default-src 'self'", "connect-src 'self'", "img-src 'self' data: blob:",
  "media-src 'self' blob:", "font-src 'self' data:", "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'", "frame-src 'none'",
  "object-src 'none'", "form-action 'self'", "base-uri 'self'",
].join('; ');
/** Explicit registration at runtime entry points, never an import-time global mutation.
 * All ambient fetch users (including SDKs) fail closed. Reviewed scoped transports
 * remain injectable directly; no original transport is retained for accidental use.
 */
export function installOfflineFetchBoundary(target: { fetch: typeof fetch } = globalThis): void {
  target.fetch = async () => { throw new Error('BRAND_NETWORK_DISCONNECTED: configure an explicit isolated service transport'); };
}
export function withOfflineBrowserPolicy(response: Response): Response {
 const headers = new Headers(response.headers);
 headers.set('Content-Security-Policy', offlineContentSecurityPolicy);
 return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
}
