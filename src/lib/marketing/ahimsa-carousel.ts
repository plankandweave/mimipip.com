/** Exact approved catalogue sources for the owner's October 3/4 carousels.
 * Explicit delivery metadata opts in; source-preview metadata alone does not. */
export type AhimsaFrame = { handle: string; image_url: string; width: number; height: number };

export function ahimsaCarouselSources(value: unknown): AhimsaFrame[] {
  if (!Array.isArray(value) || ![5, 6].includes(value.length)) throw new Error("AHIMSA needs exactly five or six supplied designs");
  const seen = new Set<string>();
  return value.map(f => {
    if (!f || typeof f.handle !== "string" || !/^ahimsa-[a-z-]+$/.test(f.handle)
      || f.image_url !== `https://media.zyvorah.com/ahimsa/${f.handle}/flat.png`
      || f.width !== 1536 || f.height !== 1024 || seen.has(f.handle)) {
      throw new Error("AHIMSA carousel needs distinct exact whole catalogue artworks at native 1536×1024");
    }
    seen.add(f.handle);
    return { handle: f.handle, image_url: f.image_url, width: f.width, height: f.height };
  });
}
