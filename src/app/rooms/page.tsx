
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "@/components/SiteImage";
import { getProductsByTag, getCollectionTagSet, getTileHeroes, getAxisCollections } from "@/lib/queries";
import { pickDistinctFronts } from "@/lib/index-tiles";
import { sceneKeyForRoom, showsRoom } from "@/lib/rooms";
import { frontAttrs } from "@/lib/index-tiles";

export const metadata: Metadata = brandMetadata({
  title: "Shop Wallpaper by Room",
  description:
    "Begin with the space, not a product category. Explore Zyvorah mural wallpaper designs for living rooms, bedrooms, kids' rooms, offices, hospitality and more.",
  alternates: { canonical: "/rooms" },
});

/**
 * Room collections that are a PLACE OF WORK rather than a home.
 *
 * Split out because an office buyer arriving on a list that opens with Living
 * Room, Bedroom, Kids' and Nursery concludes they are on a residential site and
 * leaves — Office Wallpaper used to sit thirteenth in that list. Grouping costs
 * nothing and is the cheapest half of the fix; /office is the other half.
 */
const BUSINESS_HANDLES = new Set([
  "office-wallpaper",
  "hotels",
  "cafes-restaurants",
  "restaurants",
  "fine-dining",
  "retail-showroom-spaces",
  "wellness-spa-interiors",
  "play-school-wallpaper",
  "college-hostel-room",
]);

/** How deep a tile may look for a design no other tile has taken. Twenty
 *  covers every overlap the catalogue actually has without pulling a whole
 *  collection across the wire for one picture. */
const TILE_CANDIDATES = 20;

export default async function RoomsPage() {
  // Every room collection that actually has designs — begin with the space.
  const rooms = await getAxisCollections("room");
  // Resolved once per room, the same way every room surface resolves it.
  const roomKeyOf = (r: (typeof rooms)[number]) => sceneKeyForRoom(r.handle, r.rule_tag);

  // What fronts each room's tile is an editorial decision first and a ranking
  // second — see index-tiles.ts. The shortlist is deep enough that the rules
  // there have somewhere to go when a design or a collection is already spent.
  const [shortlists, collectionTags, heroes] = await Promise.all([
    Promise.all(rooms.map((r) => getProductsByTag(r.rule_tag, TILE_CANDIDATES, roomKeyOf(r)))),
    getCollectionTagSet(),
    // Fetched by handle: a pinned design usually ranks far below the shortlist
    // — that is why the room needed pinning.
    getTileHeroes(
      rooms.flatMap((r) => (r.hero_product_handle ? [{ handle: r.hero_product_handle, roomKey: roomKeyOf(r) }] : [])),
    ),
  ]);
  const heroFor = (r: (typeof rooms)[number]) =>
    r.hero_product_handle ? heroes[`${roomKeyOf(r) ?? ""}:${r.hero_product_handle}`] : undefined;

  const tiles = pickDistinctFronts(
    rooms,
    // A room tile shows a design IN THAT ROOM — never another room's render,
    // never the swatch. Filtered before pickDistinctFronts so neither the pin
    // nor the shortlist can slip past it; a room with no render of itself
    // drops out of the grid rather than wear someone else's picture (the
    // Powder Bathroom tile showed a toddler's room, 30 September 2026).
    (r, i) => {
      const key = roomKeyOf(r);
      const hero = heroFor(r);
      const list = hero ? [hero, ...shortlists[i].filter((p) => p.handle !== hero.handle)] : shortlists[i];
      return list.filter((p) => showsRoom(p, key));
    },
    {
      pinnedHandle: (r) => r.hero_product_handle,
      collectionsOf: (p) => (p.tags ?? []).filter((t) => collectionTags.has(t)),
    },
  ).map((f) => ({ handle: f.row.handle, title: f.row.title, image: f.front.image!, room: roomKeyOf(f.row) ?? "", scene: f.front.imageScene ?? "", attrs: frontAttrs(f) }));

  const homes = tiles.filter((t) => !BUSINESS_HANDLES.has(t.handle));
  const business = tiles.filter((t) => BUSINESS_HANDLES.has(t.handle));

  const grid = (list: typeof tiles) => (
    <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
      {list.map((t) => (
        <Link
          key={t.handle}
          href={`/collections/${t.handle}`}
          // Checked against the live page by scripts/verify-room-pictures.mjs.
          {...t.attrs}
          data-room={t.room}
          data-scene={t.scene}
          className="group relative block aspect-[3/4] overflow-hidden rounded-[22px]"
        >
          <Image
            src={t.image}
            alt={t.title}
            fill
            sizes="(max-width:768px) 50vw, 25vw"
            className="object-cover transition-transform duration-700 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-charcoal/65 to-transparent" />
          <p className="absolute inset-x-0 bottom-0 p-5 font-display text-lg font-bold text-surface">
            {t.title}
          </p>
        </Link>
      ))}
    </div>
  );

  return (
    <div className="container-x py-12">
      <div className="mx-auto max-w-2xl text-center">
        <span className="caps text-slate">Shop by room</span>
        <h1 className="mt-3 text-[clamp(2rem,4vw,3rem)] leading-tight">Wallpaper by Room</h1>
        <p className="mt-2 font-display text-[clamp(1.2rem,2.2vw,1.6rem)] leading-snug text-slate">Begin with the space.</p>
        <p className="mt-4 text-slate">
          A wall in a living room and a wall in a hotel lobby serve very different purposes. Start
          with the room, and we&apos;ll help you find a design composed for it — and cut to your exact wall.
        </p>
      </div>

      <section className="mt-12">
        <h2 className="font-display text-xl font-bold">Homes</h2>
        {grid(homes)}
      </section>

      {business.length > 0 && (
        <section className="mt-14">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-xl font-bold">Workspaces &amp; business</h2>
              <p className="mt-1.5 text-sm text-slate">
                Offices, hospitality, retail and institutional interiors — priced by the square
                foot and cut to the elevation.
              </p>
            </div>
            <Link href="/office" className="btn btn-ghost text-sm">
              Office wallpaper, by workspace →
            </Link>
          </div>
          {grid(business)}
        </section>
      )}

      <div className="mt-14 text-center">
        <p className="text-sm text-slate">Not sure where to start?</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <Link href="/design-with" className="btn">Find My Wallpaper</Link>
          <Link href="/collections/wall-art" className="btn btn-ghost">Explore all wallpapers</Link>
        </div>
      </div>
    </div>
  );
}
