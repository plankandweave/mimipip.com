import { MAGNITUDE_BACKEND_ORIGIN } from './backend';
import type { ServiceName } from './contract';
export class ServiceNotConfigured extends Error {
  readonly code = 'BRAND_SERVICE_NOT_CONFIGURED';
  constructor(readonly service: ServiceName) { super(`This brand has no isolated ${service} connection configured`); }
}
/** Called before creating a service client, never after a network request. */
export function requireService(service: ServiceName): void {
  if (!serviceAvailable(service)) throw new ServiceNotConfigured(service);
}
export function serviceAvailable(service: ServiceName): boolean {
  const database = process.env.NEXT_PUBLIC_SUPABASE_URL === MAGNITUDE_BACKEND_ORIGIN &&
    !!(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  switch (service) {
    case 'database': return database;
    case 'storage': return database;
    case 'ai': return process.env.MIMIPIP_SHOPPER_SERVICES === "1" || !!process.env.ANTHROPIC_KEY_SHOPPERS;
    case 'email': return !!process.env.RESEND_API_KEY && /@(?:mail\.)?mimipip\.com>?$/.test(process.env.EMAIL_FROM ?? '');
    // Payment and OS access are the existing scoped STORE_PAY service binding.
    // Never grant ambient access to publishing, DNS or messaging merely because
    // a storefront database exists.
    default: return false;
  }
}
