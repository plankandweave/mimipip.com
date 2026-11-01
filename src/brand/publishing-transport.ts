import { withServiceTransport, transportAvailable, serviceFetch } from './service-transport';
export function withPublishingTransport<T>(transport: typeof fetch, operation: () => T): T {
  return withServiceTransport('publishing',transport,operation);
}
export function publishingAvailable(): boolean { return transportAvailable('publishing'); }
export const publishingFetch: typeof fetch = (input,init)=>serviceFetch('publishing',input,init);
