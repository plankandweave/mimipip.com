
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "@/components/SiteImage";
import { getProductsByTag, getCollectionTagSet, getTileHeroes, getAxisCollections } from "@/lib/queries";
import { frontAttrs, pickDistinctFronts } from "@/lib/index-tiles";

export const metadata: Metadata = brandMetadata({
  title: "Shop Wallpaper by Mood",
  description:
    "Start with how the room should feel. Explore Zyvorah mural wallpaper designs by mood — serene, regal, playful, dramatic, warm and fresh — each cut to your exact wall.",
  alternates: { canonical: "/moods" },
});

const cleanTitle = (t: string) => t.replace(/\s*wallpapers?$/i, "").replace(/['’]\s*$/, "").trim() || t;

/** See /rooms — how deep a tile may look for an unclaimed design. */
const TILE_CANDIDATES = 20;

/**
 * /moods — the index the By Mood column in the menu never had.
 *
 * Mood was already a filter the catalogue understood, and mood collections were
 * built so "show me something serene" would be a thing a shopper could ask. But
 * the menu renders six links per column and a column with no index page has no
 * "see all", so the seventh was unreachable — the axis was one collection away
 * from quietly losing new ones as fast as they were added.
 */
export default async function MoodsPage() {
  const moods = await getAxisCollections("mood");

  // Same three rules as the other axis indexes — an editorial pin first, then
  // no design and no collection twice. Mood overlaps heavily (a design can be
  // both Serene and Fresh), so without them one artwork fronts several tiles.
  const [shortlists, collectionTags, heroes] = await Promise.all([
    Promise.all(moods.map((m) => getProductsByTag(m.rule_tag, TILE_CANDIDATES, undefined, "wallpaper"))),
    getCollectionTagSet(),
    getTileHeroes(moods.flatMap((m) => (m.hero_product_handle ? [{ handle: m.hero_product_handle }] : []))),
  ]);
  const tiles = pickDistinctFronts(
    moods,
    (m, i) => {
      const hero = m.hero_product_handle ? heroes[`:${m.hero_product_handle}`] : undefined;
      return hero?.category === "wallpaper" ? [hero, ...shortlists[i].filter((p) => p.handle !== hero.handle)] : shortlists[i];
    },
    {
      pinnedHandle: (m) => m.hero_product_handle,
      collectionsOf: (p) => (p.tags ?? []).filter((t) => collectionTags.has(t)),
    },
  ).map((f) => ({ handle: f.row.handle, title: cleanTitle(f.row.title), image: f.front.image!, attrs: frontAttrs(f) }));

  return (
    <div className="container-x py-12">
      <div className="mx-auto max-w-2xl text-center">
        <span className="caps text-slate">Shop by mood</span>
        <h1 className="mt-3 text-[clamp(2rem,4vw,3rem)] leading-tight">Wallpaper by Mood</h1>
        <p className="mt-2 font-display text-[clamp(1.2rem,2.2vw,1.6rem)] leading-snug text-slate">Begin with a feeling.</p>
        <p className="mt-4 text-slate">
          Some rooms should settle you and some should announce themselves. Start with how the space
          ought to feel, and we&apos;ll show you every design that carries it — sized to your wall and
          cut to your exact wall.
        </p>
      </div>

      <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link
            key={t.handle}
            href={`/collections/${t.handle}`}
            {...t.attrs}
            className="group relative block aspect-[3/4] overflow-hidden rounded-[22px]"
          >
            <Image
              src={t.image}
              alt={t.title}
              fill
              sizes="(max-width:640px) 50vw, (max-width:1024px) 33vw, 25vw"
              className="object-cover transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-charcoal/65 to-transparent" />
            <p className="absolute inset-x-0 bottom-0 p-5 font-display text-lg font-bold text-surface">
              {t.title}
            </p>
          </Link>
        ))}
      </div>

      <div className="mt-14 text-center">
        <p className="text-sm text-slate">Prefer to start somewhere else?</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <Link href="/rooms" className="btn btn-ghost">Shop by room</Link>
          <Link href="/styles" className="btn btn-ghost">Shop by style</Link>
          <Link href="/collections/wall-art" className="btn btn-ghost">Explore all wallpapers</Link>
        </div>
      </div>
    </div>
  );
}
