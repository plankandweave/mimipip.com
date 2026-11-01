import { isolation } from './current';
import type { ServiceName } from './contract';
export class ServiceNotConfigured extends Error {
  readonly code = 'BRAND_SERVICE_NOT_CONFIGURED';
  constructor(readonly service: ServiceName) { super(`This brand has no isolated ${service} connection configured`); }
}
/** Called before creating a service client, never after a network request. */
export function requireService(service: ServiceName): never {
  // Offline is deliberately fail-closed. Future sandbox adapters require a
  // reviewed extension of this contract; env variables cannot enable them.
  void isolation.services[service];
  throw new ServiceNotConfigured(service);
}
export function serviceAvailable(_service: ServiceName): boolean { return false; }
export async function isolatedFetch(service: ServiceName, _input: RequestInfo | URL, _init?: RequestInit): Promise<Response> {
  return requireService(service);
}
