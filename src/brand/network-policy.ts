/** Disconnected browser policy. Internal UI/API requests and bundled assets remain usable. */
export const offlineContentSecurityPolicy = [
  "default-src 'self'", "connect-src 'self' https://qrtznwnhuzkpynjetygg.supabase.co", "img-src 'self' data: blob: https://qrtznwnhuzkpynjetygg.supabase.co",
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

export function withCheckoutBrowserPolicy(response:Response):Response {
 const headers=new Headers(response.headers);
 const extend=(directive:string,values:string[],remove:string[]=[]) => (_match:string,current:string)=>
  directive+' '+[...new Set([...current.trim().split(/\s+/).filter(v=>!remove.includes(v)),...values])].join(' ');
 headers.set('Content-Security-Policy', (headers.get('Content-Security-Policy') || offlineContentSecurityPolicy)
  .replace(/connect-src ([^;]*)/,extend('connect-src',['https://*.razorpay.com']))
  .replace(/script-src ([^;]*)/,extend('script-src',['https://checkout.razorpay.com'],["'unsafe-eval'"]))
  .replace(/frame-src ([^;]*)/,extend('frame-src',['https://api.razorpay.com','https://checkout.razorpay.com'],["'none'"])));
 headers.set('Cache-Control','no-store');headers.set('Referrer-Policy','no-referrer');
 return new Response(response.body,{status:response.status,headers});
}
