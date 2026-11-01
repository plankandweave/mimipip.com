
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "@/components/SiteImage";
import { getProductsByTag, getCollectionTagSet, getTileHeroes, getAxisCollections } from "@/lib/queries";
import { frontAttrs, pickDistinctFronts } from "@/lib/index-tiles";

export const metadata: Metadata = brandMetadata({
  title: "Shop Wallpaper by Style",
  description:
    "Start with a style. Explore Zyvorah mural wallpaper designs by look — botanical, geometric, textured, landscape, vintage, abstract and more — each cut to your exact wall.",
  alternates: { canonical: "/styles" },
});

// A style reads cleaner without the "Wallpaper" suffix on a tile.
const cleanTitle = (t: string) => t.replace(/\s*wallpapers?$/i, "").replace(/['’]\s*$/, "").trim() || t;

/** See /rooms — how deep a tile may look for an unclaimed design. */
const TILE_CANDIDATES = 20;

/**
 * /styles — the index the By Style column in the menu never had.
 *
 * The mega-menu renders six links per column, ordered by position, and a column
 * without an index page has no "see all". There are 26 style collections, so
 * TWENTY of them were live and unreachable from the nav: published, indexed,
 * and findable only by knowing the URL. Every other axis already had its index
 * (/rooms, /colours, /collections, /series); this one and /moods did not.
 */
export default async function StylesPage() {
  const styles = await getAxisCollections("category");

  // Same three rules as /rooms and /colours — an editorial pin first, then no
  // design and no collection twice. A design carries several style tags, so
  // without them one artwork fronts Botanical, Textured and Traditional at once.
  const [shortlists, collectionTags, heroes] = await Promise.all([
    Promise.all(styles.map((s) => getProductsByTag(s.rule_tag, TILE_CANDIDATES, undefined, "wallpaper"))),
    getCollectionTagSet(),
    getTileHeroes(styles.flatMap((s) => (s.hero_product_handle ? [{ handle: s.hero_product_handle }] : []))),
  ]);
  const tiles = pickDistinctFronts(
    styles,
    (s, i) => {
      const hero = s.hero_product_handle ? heroes[`:${s.hero_product_handle}`] : undefined;
      return hero?.category === "wallpaper" ? [hero, ...shortlists[i].filter((p) => p.handle !== hero.handle)] : shortlists[i];
    },
    {
      pinnedHandle: (s) => s.hero_product_handle,
      collectionsOf: (p) => (p.tags ?? []).filter((t) => collectionTags.has(t)),
    },
  ).map((f) => ({ handle: f.row.handle, title: cleanTitle(f.row.title), image: f.front.image!, attrs: frontAttrs(f) }));

  return (
    <div className="container-x py-12">
      <div className="mx-auto max-w-2xl text-center">
        <span className="caps text-slate">Shop by style</span>
        <h1 className="mt-3 text-[clamp(2rem,4vw,3rem)] leading-tight">Wallpaper by Style</h1>
        <p className="mt-2 font-display text-[clamp(1.2rem,2.2vw,1.6rem)] leading-snug text-slate">Begin with a look.</p>
        <p className="mt-4 text-slate">
          Botanical or geometric, quiet texture or a painted landscape — start with the language you
          want the wall to speak, and we&apos;ll show you every design in it, sized to your wall and cut
          to your exact wall.
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
          <Link href="/colours" className="btn btn-ghost">Shop by colour</Link>
          <Link href="/collections/wall-art" className="btn btn-ghost">Explore all wallpapers</Link>
        </div>
      </div>
    </div>
  );
}
