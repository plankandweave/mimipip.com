import type { MetadataRoute } from "next";
import { supabase } from "@/lib/supabase";
import { SITE_URL } from "@/lib/seo";
import { getProductCategories } from "@/lib/product-category";
import { cachedCatalogue, CATALOGUE_REVALIDATE } from "@/lib/catalogue-cache";
import { getCanvasSizes } from "@/lib/canvas-size-pages";
import { SHOP_CONCEPTS, conceptPath } from "@/lib/shop-concepts";
import { WORKSPACES } from "@/content/workspaces";
import { HOSPITALITY_SPACES } from "@/content/hospitality";
import { HEALTHCARE_SPACES } from "@/content/healthcare";
import { RETAIL_SPACES } from "@/content/retail";
import { REAL_ESTATE_SPACES } from "@/content/real-estate";
import { SEGMENTS } from "@/content/segments";
import { hiddenConceptSlugs } from "@/lib/concept-availability";
import { PROJECTS } from "@/content/projects";
import { PROJECT_CATEGORIES } from "@/content/project-categories";

export const dynamic = "force-dynamic";

// Canonical public content pages (the individual room/style/colour/collection
// listings come from the DB below). Transactional/account/search pages are
// intentionally excluded.
const STATIC_PATHS: { path: string; priority: number; freq: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "", priority: 1.0, freq: "daily" },
  { path: "/collections/wall-art", priority: 0.9, freq: "daily" },
  // Canvas shop-by-size hub; the per-size pages are listed from the catalogue.
  { path: "/wall-art", priority: 0.7, freq: "weekly" },
  // The four browse-axis indexes. Their CHILDREN were already listed from the
  // DB, but the pages that gather them were not — so the four hubs a shopper
  // actually navigates by ("wallpaper collections", "wallpaper by colour") were
  // the only part of the catalogue search could not see. They change whenever a
  // collection is added or empties out, i.e. as often as the catalogue does.
  { path: "/collections", priority: 0.8, freq: "weekly" },
  { path: "/collection/ink", priority: 0.8, freq: "weekly" },
  { path: "/collection/new-york", priority: 0.8, freq: "weekly" },
  { path: "/rooms", priority: 0.8, freq: "weekly" },
  // The L'Orange Kids shop (src/lib/lorange-kids.ts) — /kids redirects here.
  { path: "/lorange-kids", priority: 0.7, freq: "weekly" },
  { path: "/colours", priority: 0.8, freq: "weekly" },
  { path: "/styles", priority: 0.8, freq: "weekly" },
  // The concept index is the visual discovery tool: it shows the breadth of
  // rooms and applications, while each concept remains individually shoppable.
  { path: "/concepts", priority: 0.8, freq: "weekly" },
  { path: "/moods", priority: 0.7, freq: "weekly" },
  { path: "/series", priority: 0.7, freq: "weekly" },
  { path: "/new", priority: 0.8, freq: "daily" },
  { path: "/lookbook", priority: 0.7, freq: "weekly" },
  { path: "/design-with", priority: 0.7, freq: "monthly" },
  { path: "/match-a-photo", priority: 0.7, freq: "monthly" },
  { path: "/see-it-in-my-room", priority: 0.7, freq: "monthly" },
  { path: "/print-your-own", priority: 0.7, freq: "monthly" },
  { path: "/bespoke", priority: 0.7, freq: "monthly" },
  { path: "/office", priority: 0.8, freq: "weekly" },
  // Each workspace page targets its own search ("meeting room wallpaper",
  // "phone booth wallpaper") and is catalogue-backed, so it changes as often as
  // the edit behind it does.
  ...WORKSPACES.map((w) => ({
    path: `/office/${w.slug}`,
    priority: 0.7,
    freq: "weekly" as const,
  })),
  { path: "/hospitality", priority: 0.8, freq: "weekly" },
  // Same reasoning as the office workspace pages above, one per hospitality
  // space — each targets its own search and is catalogue-backed.
  ...HOSPITALITY_SPACES.map((s) => ({
    path: `/hospitality/${s.slug}`,
    priority: 0.7,
    freq: "weekly" as const,
  })),
  // The remaining sector hubs and their space pages. /office and /hospitality
  // were listed from the day they shipped; healthcare, retail and real estate
  // were built to the same catalogue-backed pattern afterwards and never got
  // added — so three whole families of landing pages, each targeting its own
  // search ("clinic wallpaper", "showroom wallpaper", "lobby wallpaper"), were
  // invisible to every crawler that trusts the sitemap.
  { path: "/hospitals", priority: 0.8, freq: "weekly" },
  ...HEALTHCARE_SPACES.map((s) => ({ path: `/hospitals/${s.slug}`, priority: 0.7, freq: "weekly" as const })),
  { path: "/retail", priority: 0.8, freq: "weekly" },
  ...RETAIL_SPACES.map((s) => ({ path: `/retail/${s.slug}`, priority: 0.7, freq: "weekly" as const })),
  { path: "/real-estate", priority: 0.8, freq: "weekly" },
  ...REAL_ESTATE_SPACES.map((s) => ({ path: `/real-estate/${s.slug}`, priority: 0.7, freq: "weekly" as const })),

  { path: "/commercial", priority: 0.7, freq: "monthly" },
  // One page per commercial sector (workplaces, hospitality, healthcare…).
  ...SEGMENTS.map((s) => ({ path: `/commercial/${s.slug}`, priority: 0.6, freq: "monthly" as const })),

  // The case-study books. These are the site's strongest evidence pages — a
  // real brief, a real building, the work — and they are exactly what an
  // answer engine quotes when asked whether we have done this before.
  { path: "/projects", priority: 0.8, freq: "weekly" },
  ...PROJECT_CATEGORIES.map((category) => ({ path: `/projects/${category.slug}`, priority: 0.7, freq: "monthly" as const })),
  ...PROJECTS.map((p) => ({ path: `/projects/${p.slug}`, priority: 0.7, freq: "monthly" as const })),

  // Flagship collection landing page (TAASH), and the buying-intent pages that
  // were written but never registered.
  { path: "/mati", priority: 0.8, freq: "weekly" },
  { path: "/nafas", priority: 0.8, freq: "weekly" },
  { path: "/custom-sizing", priority: 0.7, freq: "monthly" },
  { path: "/where-to-buy", priority: 0.6, freq: "monthly" },
  { path: "/founders-note", priority: 0.5, freq: "monthly" },
  { path: "/become-an-installer", priority: 0.4, freq: "monthly" },
  { path: "/trade", priority: 0.6, freq: "monthly" },
  { path: "/gift-card", priority: 0.6, freq: "monthly" },
  { path: "/wallpaper-buying-guide", priority: 0.7, freq: "monthly" },
  { path: "/materials", priority: 0.6, freq: "monthly" },
  { path: "/samples", priority: 0.6, freq: "monthly" },
  { path: "/how-to-measure", priority: 0.6, freq: "monthly" },
  { path: "/installation", priority: 0.6, freq: "monthly" },
  { path: "/our-story", priority: 0.5, freq: "monthly" },
  { path: "/press", priority: 0.5, freq: "monthly" },
  { path: "/collaborate", priority: 0.5, freq: "monthly" },
  { path: "/sustainability", priority: 0.5, freq: "monthly" },
  { path: "/faq", priority: 0.5, freq: "monthly" },
  { path: "/contact", priority: 0.5, freq: "monthly" },
  { path: "/shipping-policy", priority: 0.4, freq: "monthly" },
  { path: "/shipping-returns", priority: 0.4, freq: "monthly" },
  { path: "/refund-policy", priority: 0.4, freq: "monthly" },
  { path: "/terms", priority: 0.3, freq: "yearly" },
  { path: "/privacy", priority: 0.3, freq: "yearly" },
];

type ProdRow = {
  handle: string;
  created_at: string | null;
  updated_at: string | null;
  category: string | null;
  product_tags: { tag: string }[] | null;
  product_images: { url: string; is_featured: boolean; is_flat: boolean; position: number; scene_key: string | null }[] | null;
};

/** What the map is built from, reduced to plain JSON so it can be cached. */
type SitemapProduct = { handle: string; lastmod: string | null; category: string | null; tags: string[]; images: string[];
  /** scene_key → the room render for that scene. Absent on a copy cached before 22 Oct 2026. */
  sceneImages?: Record<string, string> };
type SitemapCollection = { handle: string; rule_tag: string | null; rule_tags: string[] | null; category_scope: string | null };
type SitemapData = { products: SitemapProduct[]; collections: SitemapCollection[] };

/**
 * The whole-catalogue read behind the map. It used to run uncached on EVERY
 * request (crawlers fetch this often, and it is the heaviest join the site
 * does) with no deadline, and any one error turned the sitemap into a 500.
 * Now it is read through the catalogue cache for an hour, bounded at 20 s, and
 * a failed read serves the last good map (kept a week) instead. With no good
 * copy at all it still throws — a partial map would tell a crawler that the
 * missing pages are gone.
 */
const getSitemapData = cachedCatalogue("sitemap-data", async (): Promise<SitemapData> => {
  // Supabase caps a response at 1,000 rows. Page before the catalogue crosses
  // that boundary, and fail on an outage instead of publishing a partial map.
  const rows: ProdRow[] = [];
  const batchSize = 500;
  for (let from = 0; ; from += batchSize) {
    const { data, error } = await supabase.from("products")
      .select("handle, created_at, updated_at, category, product_tags(tag), product_images(url, is_featured, is_flat, position, scene_key)")
      .eq("status", "active").eq("is_service", false)
      .order("handle").range(from, from + batchSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []) as ProdRow[]);
    if (!data || data.length < batchSize) break;
  }
  const { data: collections, error } = await supabase.from("collections").select("handle, rule_tag, rule_tags, category_scope");
  if (error) throw error;
  const products = rows.map((p) => {
    const imgs = [...(p.product_images ?? [])].sort(
      (a, b) => Number(b.is_featured) - Number(a.is_featured) || Number(a.is_flat) - Number(b.is_flat) || a.position - b.position,
    );
    return {
      handle: p.handle,
      lastmod: p.updated_at || p.created_at || null,
      category: p.category,
      tags: (p.product_tags ?? []).map((t) => t.tag),
      images: [...new Set(imgs.map((i) => i.url).filter(Boolean))].slice(0, 8),
      sceneImages: Object.fromEntries(
        (p.product_images ?? []).filter((i) => i.scene_key && i.url).map((i) => [i.scene_key as string, i.url]),
      ),
    };
  });
  return { products, collections: (collections ?? []) as SitemapCollection[] };
}, CATALOGUE_REVALIDATE, { deadlineMs: 20_000, staleFallbackTtl: 7 * 24 * 3600 });

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const hidden = await hiddenConceptSlugs();
  const [{ products, collections }, categories] = await Promise.all([getSitemapData(), getProductCategories()]);
  // The canvas shop-by-size pages come from the catalogue too. They are an
  // addition, not the catalogue itself, so a failed read omits them rather
  // than failing the whole map.
  let canvasSizes: { slug: string }[] = [];
  try {
    canvasSizes = await getCanvasSizes();
  } catch (err) {
    console.error("[sitemap] canvas sizes read failed:", err instanceof Error ? err.message : err);
  }

  // The "Shot for this space" grids (/hospitality/*, /hospitals/*, /retail/*,
  // /real-estate/*) are the room renders of the designs tagged for the space.
  // Their sitemap entries listed no images at all (22 Oct 2026: Google could
  // not image-crawl /hospitality/cafes-restaurants#designs), so list the same
  // renders the page shows. Built from the map's own read — no extra query.
  const spaceImages = new Map<string, string[]>();
  const sections: [string, { slug: string; tag: string; sceneKey: string }[]][] = [
    ["hospitality", HOSPITALITY_SPACES],
    ["hospitals", HEALTHCARE_SPACES],
    ["retail", RETAIL_SPACES],
    ["real-estate", REAL_ESTATE_SPACES],
  ];
  for (const [section, spaces] of sections) {
    for (const s of spaces) {
      const urls = products
        .filter((p) => p.tags.includes(s.tag) && p.sceneImages?.[s.sceneKey])
        .map((p) => p.sceneImages![s.sceneKey]);
      if (urls.length) spaceImages.set(`/${section}/${s.slug}`, [...new Set(urls)].slice(0, 100));
    }
  }

  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.filter(s => !s.path.startsWith("/projects/") || !hidden.has(s.path.slice("/projects/".length))).map((s) => ({
    url: `${SITE_URL}${s.path}`,
    changeFrequency: s.freq,
    priority: s.priority,
    ...(spaceImages.has(s.path) ? { images: spaceImages.get(s.path) } : {}),
  }));

  const collectionEntries: MetadataRoute.Sitemap = collections
    .filter((c) => {
      const landing = categories.find((family) => family.collectionHandle === c.handle);
      const category = landing?.slug ?? c.category_scope;
      const tags = landing ? [] : c.rule_tags?.length ? c.rule_tags : c.rule_tag ? [c.rule_tag] : [];
      return Boolean(category || tags.length) && products.some((p) =>
        (!category || p.category === category) &&
        (!tags.length || p.tags.some((t) => tags.includes(t))));
    })
    .map((c) => ({
      url: `${SITE_URL}/collections/${c.handle}`,
      changeFrequency: "weekly",
      priority: 0.7,
    }));

  const productEntries: MetadataRoute.Sitemap = products.map((p) => ({
    url: `${SITE_URL}/products/${p.handle}`,
    lastModified: p.lastmod ? new Date(p.lastmod) : undefined,
    changeFrequency: "monthly",
    priority: 0.8,
    ...(p.images.length ? { images: p.images } : {}),
  }));

  const sizeEntries: MetadataRoute.Sitemap = canvasSizes.map((s) => ({
    url: `${SITE_URL}/wall-art/${s.slug}`,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const conceptEntries: MetadataRoute.Sitemap = SHOP_CONCEPTS.filter((c) => !hidden.has(c.slug)).map((c) => ({
    url: `${SITE_URL}${conceptPath(c.slug)}`,
    changeFrequency: "monthly",
    priority: 0.7,
    images: [c.cover],
  }));
  return [...new Map([...staticEntries, ...collectionEntries, ...sizeEntries, ...productEntries, ...conceptEntries].map((entry) => [entry.url, entry])).values()];
}
