// Aangan uses the four exact artworks from its original source conversation.
// The other apartment concepts still use clearly-labelled alternatives.
export const APARTMENT_SHOPPING = {
  "angan-by-the-sea": ["aangan-coastal-living", "aangan-woven-bedroom", "aangan-stepwell-study", "aangan-botanical-foyer"],
  "raat-bagh": ["la-00036", "moonlit-winter-garden", "la-00015", "karma"],
  "extreme-modernist": ["aa-0056", "italian-apartment-foyer", "italian-apartment-study", "fa-00061"],
  "new-york-apartment": ["urban-mosaic", "italian-apartment-primary-bedroom", "flo-0001", "fa-00061"],
} satisfies Record<string, string[]>;
export type ApartmentSlug = keyof typeof APARTMENT_SHOPPING;
export function isApartmentSlug(slug: string): slug is ApartmentSlug {
  return Object.hasOwn(APARTMENT_SHOPPING, slug);
}
