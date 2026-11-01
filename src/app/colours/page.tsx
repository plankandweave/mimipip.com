
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "@/components/SiteImage";
import { getProductsByTag, getCollectionTagSet, getTileHeroes, getAxisCollections } from "@/lib/queries";
import { frontAttrs, pickDistinctFronts } from "@/lib/index-tiles";

export const metadata: Metadata = brandMetadata({
  title: "Shop Wallpaper by Colour",
  description:
    "Start with a colour. Explore Zyvorah mural wallpaper designs by shade — neutral and beige, green, blue, black, black-and-white, pastel and more — each cut to your exact wall size.",
  alternates: { canonical: "/colours" },
});

// Colour names read cleaner without the "Wallpaper" suffix on a tile.
const cleanTitle = (t: string) => t.replace(/\s*wallpapers?$/i, "").replace(/['’]\s*$/, "").trim() || t;

/** See /rooms — how deep a tile may look for an unclaimed design. */
const TILE_CANDIDATES = 20;

export default async function ColoursPage() {
  // Every colour collection that actually has designs — begin with a shade.
  const colours = await getAxisCollections("color");

  // Same three rules as /rooms — an editorial pin first, then no design and no
  // collection twice. A design carries several colour tags, so without them one
  // artwork fronts Brown, Dark and Neutral at once.
  const [shortlists, collectionTags, heroes] = await Promise.all([
    Promise.all(colours.map((c) => getProductsByTag(c.rule_tag, TILE_CANDIDATES))),
    getCollectionTagSet(),
    getTileHeroes(colours.flatMap((c) => (c.hero_product_handle ? [{ handle: c.hero_product_handle }] : []))),
  ]);
  const tiles = pickDistinctFronts(
    colours,
    (c, i) => {
      const hero = c.hero_product_handle ? heroes[`:${c.hero_product_handle}`] : undefined;
      return hero ? [hero, ...shortlists[i].filter((p) => p.handle !== hero.handle)] : shortlists[i];
    },
    {
      pinnedHandle: (c) => c.hero_product_handle,
      collectionsOf: (p) => (p.tags ?? []).filter((t) => collectionTags.has(t)),
    },
  ).map((f) => ({ handle: f.row.handle, title: cleanTitle(f.row.title), image: f.front.image!, attrs: frontAttrs(f) }));

  return (
    <div className="container-x py-12">
      <div className="mx-auto max-w-2xl text-center">
        <span className="caps text-slate">Shop by colour</span>
        <h1 className="mt-3 text-[clamp(2rem,4vw,3rem)] leading-tight">Wallpaper by Colour</h1>
        <p className="mt-2 font-display text-[clamp(1.2rem,2.2vw,1.6rem)] leading-snug text-slate">Begin with a colour.</p>
        <p className="mt-4 text-slate">
          Working to a palette? Start with the shade you have in mind — a wall, a sofa, a mood — and
          we&apos;ll show you every design in it, sized to your wall and cut to your exact wall.
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
        <p className="text-sm text-slate">Prefer to start with the space?</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <Link href="/rooms" className="btn btn-ghost">Shop by room</Link>
          <Link href="/collections/wall-art" className="btn btn-ghost">Explore all wallpapers</Link>
        </div>
      </div>
    </div>
  );
}
