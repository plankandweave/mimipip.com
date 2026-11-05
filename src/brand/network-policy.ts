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

// The only live transports: Razorpay's order/payment operations, and the OS's order door.
const liveFetch = globalThis.fetch.bind(globalThis);
export const razorpayTransport: typeof fetch = async (input, init) => {
 const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
 if (url.origin !== 'https://api.razorpay.com' || !/^\/v1\/(orders(?:\/order_[A-Za-z0-9]+(?:\/payments)?)?|payments\/pay_[A-Za-z0-9]+)$/.test(url.pathname)) throw new Error('Payment endpoint not allowed');
 return liveFetch(input, {...init, redirect:'error'});
};
export const osTransport: typeof fetch = async (input, init) => {
 const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
 if (url.origin !== 'https://os.magnitudegroup.in' || url.pathname !== '/api/zyvorah/web-order') throw new Error('OS endpoint not allowed');
 return liveFetch(input, {...init, redirect:'error'});
};
export function withCheckoutBrowserPolicy(response:Response):Response {
 const headers=new Headers(response.headers);
 headers.set('Content-Security-Policy', offlineContentSecurityPolicy
  .replace("connect-src 'self'", "connect-src 'self' https://*.razorpay.com")
  .replace("script-src 'self' 'unsafe-inline' 'unsafe-eval'", "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com")
  .replace("frame-src 'none'", "frame-src https://api.razorpay.com https://checkout.razorpay.com"));
 headers.set('Cache-Control','no-store');headers.set('Referrer-Policy','no-referrer');
 return new Response(response.body,{status:response.status,headers});
}
