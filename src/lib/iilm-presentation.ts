/** Access to this commissioned, unpublished client proposal is exact-address only. */
export const IILM_PRESENTATION_EMAILS = new Set([
  "parul.dogra@iilm.edu",
  "anish.dasgupta@iilm.edu",
  "jevariyar@iilm.edu",
  "nihar.amoncar@iilm.edu",
  "aswani.rs@iilm.edu",
  "registrar.gn@iilm.edu",
]);

export const IILM_ASSETS = new Set([
  "worlds-flat.jpg",
  "worlds-vertical.jpg",
  "world-flat.jpg",
  "world-vertical.jpg",
  "photo-8365.jpg",
  "photo-8367.jpg",
  "photo-8378.jpg",
  "photo-8381.jpg",
  "photo-8382.jpg",
  "photo-8383.jpg",
  "photo-8360.jpg",
  "photo-8364.jpg",
  "photo-8368.jpg",
  "photo-8372.jpg",
  "photo-8375.jpg",
  "photo-8380.jpg",
]);

export function hasIilmPresentationAccess(email: string | null | undefined): boolean {
  return !!email && IILM_PRESENTATION_EMAILS.has(email.trim().toLowerCase());
}
