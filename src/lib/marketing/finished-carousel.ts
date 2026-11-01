import type { StillSpec } from "./media/image";

/** Delivered rooms retain their exact order, but still need the house frame.
 * The legacy field name said "finished" even when it contained bare rooms. */
export function finishedCarouselUrls(art: Record<string, unknown> | undefined): string[] | null {
  const value = art?.room_carousel_urls ?? art?.finished_carousel_urls;
  if (value === undefined) return null;
  if (!Array.isArray(value) || value.length < 2 || value.length > 10) {
    throw new Error("A finished carousel needs 2–10 final slides.");
  }
  const urls = value.map((item) => {
    if (typeof item !== "string") throw new Error("Every carousel slide needs a hosted image URL.");
    const url = new URL(item);
    if (url.protocol !== "https:" || url.hostname !== "media.zyvorah.com" || url.username || url.password
      || !url.pathname.startsWith("/marketing-media/") || !/\.(jpe?g|png)$/i.test(url.pathname)) {
      throw new Error("Finished carousel slides must be image exports in the brand media library.");
    }
    return item;
  });
  if (new Set(urls).size !== urls.length) throw new Error("A carousel cannot repeat the same finished slide.");
  return urls;
}

/** There is no as-is bypass: every delivered room gets the original Z. and
 * wallpaper name through the same compositor used by catalogue posts. */
export async function brandDeliveredCarousel<T>(
  urls: string[], title: string,
  render: (url: string, width: number, height: number, spec: StillSpec) => Promise<T>,
  collection?: string,
): Promise<T[]> {
  if (!title.trim()) throw new Error("A wallpaper carousel requires its design name.");
  const result: T[] = [];
  for (const url of urls) result.push(await render(url, 1080, 1350, {
    title, sub: collection ?? "Mural wallpaper", text: "lower", wordmark: true,
    preserveSource: true, position: "centre", ...(collection ? { kicker: collection } : {}),
  }));
  return result;
}
