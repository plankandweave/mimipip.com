import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { ServiceName } from './contract';
import { ServiceNotConfigured } from './services';
const transports = new AsyncLocalStorage<ReadonlyMap<ServiceName, typeof fetch>>();
/** Scoped injection for a reviewed adapter or a mock. Never reads environment credentials. */
export function withServiceTransport<T>(service: ServiceName, transport: typeof fetch, operation: () => T): T {
  const next = new Map(transports.getStore()); next.set(service,transport);
  return transports.run(next,operation);
}
export function transportAvailable(service: ServiceName): boolean { return !!transports.getStore()?.has(service); }
export async function serviceFetch(service: ServiceName, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const transport=transports.getStore()?.get(service);
  if(!transport) throw new ServiceNotConfigured(service);
  return transport(input,init);
}
