import type { ProductCardData } from "./types";
import { SITE_URL } from "./seo";

const abs = (u: string) => (u.startsWith("/") ? `${SITE_URL}${u}` : u);

/**
 * The "Shot for this space" grid as structured data: an ItemList whose items
 * each name the design page and the photographed image. The grid's <img> tags
 * are lazy and carry no page-level signal that they are the point of the page,
 * and the sitemap used to list no images for space pages (22 Oct 2026: Google
 * could not image-crawl /hospitality/cafes-restaurants#designs). This is the
 * on-page half; the sitemap entry is the other.
 */
export function spaceImageLd(label: string, path: string, cards: ProductCardData[]) {
  const items = cards.filter((c) => c.image);
  if (!items.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${label} wallpaper designs`,
    url: `${SITE_URL}${path}`,
    numberOfItems: items.length,
    itemListElement: items.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE_URL}/products/${c.handle}`,
      name: c.title ?? c.handle,
      image: {
        "@type": "ImageObject",
        contentUrl: abs(c.image as string),
        caption: c.imageAlt,
        representativeOfPage: i === 0,
      },
    })),
  };
}
