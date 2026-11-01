import type { Metadata } from 'next';
import { brand } from './current';
/** Public metadata is presentation data, never a provider endpoint or schema identifier. */
export function brandMetadata(input: Metadata): Metadata {
 const visit = (value: unknown): unknown => {
  if (typeof value === 'string') return value
   .replace(/https?:\/\/(?:[a-z0-9-]+\.)?zyvorah\.com/gi, brand.origin)
   .replace(/Zyvorah/gi, brand.name);
  if (Array.isArray(value)) return value.map(visit);
  if (value instanceof URL) return new URL(String(visit(value.href)));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,visit(item)]));
  return value;
 };
 return visit(input) as Metadata;
}
export function withBrandMetadata<Args extends unknown[]>(build: (...args: Args) => Metadata | Promise<Metadata>) {
 return async (...args: Args): Promise<Metadata> => brandMetadata(await build(...args));
}
