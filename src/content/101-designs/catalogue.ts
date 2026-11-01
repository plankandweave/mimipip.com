import type sourceRecords from '../../../fixtures/legacy-catalogue/101-catalogue.json';
import records from './catalogue.json';
import roomRecords from './rooms.json';

export type BaghRoom = { design: number; src: string; roomType: string };

import type { ProductCardData } from '@/lib/types';

export const COLLECTION_101 = '/collections/bagh';
export const EXPERIENCE_101 = '/collections/bagh';
// Names are shared with the editorial source. Namespace public handles so a
// new collection cannot replace an existing database-backed product.
export function buildEditorialDesigns(input: typeof sourceRecords, rooms: BaghRoom[], roomOrigin: string) {
const designs = input.map(({ number, id, name, handle, flat, thumbnail, room, roomType, motif, description, colours, moods, spaces, sectors, aesthetics }) => ({
  number, id, name, handle, flat, thumbnail, room, roomType, motif, description, colours, moods, sectors, aesthetics,
  spaces: [...new Set([...spaces, ...rooms.filter(r => r.design === number).map(r => r.roomType)])],
  rooms: [...(room && roomType && ['champa', 'amaltas'].includes(handle) ? [{ src: room, roomType }] : []), ...rooms.filter(r => r.design === number).map(({ src, roomType }) => ({ src: `${roomOrigin}/${src.split('/').pop()}`, roomType }))],
  productHandle: `bagh-${handle}`,
  availability: 'active' as const,
}));
return designs;
}
export const designs101 = buildEditorialDesigns(records, roomRecords, 'https://media.mimi-pip.invalid/bagh/rooms');
export type Design101 = (typeof designs101)[number];
export const design101ByHandle = new Map(designs101.map(d => [d.productHandle, d]));
export const product101Path = (d: Design101) => `/products/${d.productHandle}`;
export const launch101Design = designs101.find(d => d.handle === 'amaltas');
export const launch101Card: ProductCardData | null = launch101Design ? {
  handle: launch101Design.productHandle, title: launch101Design.name,
  image: launch101Design.room, imageAlt: `${launch101Design.name} in a room`,
  imageIsFlat: false, fromPricePerSqft: null, tags: [],
  imageWidth: 1536, imageHeight: 1024,
} : null;
