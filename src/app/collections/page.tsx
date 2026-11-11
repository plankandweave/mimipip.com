
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import { MORE_ROOM_COLLECTIONS, PRODUCT_FAMILY_COLLECTIONS } from "@/lib/collection-directory-navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getIndexTiles } from "@/lib/collection-index";
import { CollectionIndexGrid } from "@/components/CollectionIndexGrid";

export const revalidate = 3600;

export const metadata: Metadata = brandMetadata({
  title: "Wallpaper Collections",
  description:
    "Every Zyvorah collection in one place — Verdant Sanctuary, Maharaja's Court, TAASH and the rest — each shown with a design from it, so you can see what a collection is before you open it.",
  alternates: { canonical: "/collections" },
});

/**
 * The index for the Shop menu's "Collections" axis.
 *
 * A collection is an AESTHETIC and nothing else. A price tier (Autograph) and a
 * set of panels cut for a lift bank (Triple Lift) are not looks, and listing
 * them here asked the shopper to compare a price with a mood; they now live on
 * /series. See migration 0145 for the three kinds.
 *
 * Sibling of /rooms, /colours and /series, which do the same for their axes.
 */
export default async function CollectionsIndexPage() {
  if(process.env.MIMIPIP_LOCAL_REVIEW==="1"){
    const {options,filter,label,collectionDesigns}=await import('@/brand/review/data');
    const {CollectionPhotoHeader}=await import('@/brand/review/CollectionPhotoHeader');
    const tiles=options('collection').map(handle=>{const items=filter('collection',handle);return {handle,title:label(handle),kind:'collection',description:null,image:items[0].image,count:items.length,attrs:{}};});
    const headerDesigns=['happy-petals','hush-and-wander','playroom-stories','hopscotch'].map(handle=>collectionDesigns(handle)[0]).filter((design):design is NonNullable<typeof design>=>Boolean(design));
    return <div className="container-x py-12"><CollectionPhotoHeader handle="collection-directory" title="Collections" designs={headerDesigns}/><CollectionIndexGrid tiles={tiles}/></div>;
  }
  const tiles = await getIndexTiles(["curated"], true);

  return (
    <div className="container-x py-12">
      <div className="mx-auto max-w-2xl text-center">
        <span className="caps text-slate">Collections</span>
        <h1 className="mt-3 text-[clamp(2rem,4vw,3rem)] leading-tight">Wallpaper Collections</h1>
        <p className="mt-2 font-display text-[clamp(1.2rem,2.2vw,1.6rem)] leading-snug text-slate">Every collection, at a glance.</p>
        <p className="mt-4 text-slate">
          A collection is a set of designs drawn to sit together. Here they are with a design from
          each, so you can see what one is before you open it — every design sized to your wall and cut
          to your exact wall.
        </p>
      </div>

      <div className="mt-12">
        <CollectionIndexGrid tiles={tiles} />
      </div>

      <section className="mt-14 border-t border-edge pt-8" aria-label="More ways to browse">
        <h2 className="text-2xl">More ways to browse</h2>
        {[{ label: "More rooms & spaces", entries: MORE_ROOM_COLLECTIONS }, { label: "Canvas art & borders", entries: PRODUCT_FAMILY_COLLECTIONS }].map(({ label, entries }) => (
          <details key={label} className="mt-5 rounded-[18px] border border-edge p-4">
            <summary className="min-h-10 cursor-pointer py-2 text-sm font-semibold">{label}</summary>
            <nav aria-label={label} className="mt-3 grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
              {entries.map(([handle, title]) => <Link key={handle} href={`/collections/${handle}`} className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">{title}</Link>)}
            </nav>
          </details>
        ))}
      </section>

      <div className="mt-14 text-center">
        <p className="text-sm text-slate">Looking for something in particular?</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <Link href="/rooms" className="btn btn-ghost">Shop by room</Link>
          <Link href="/colours" className="btn btn-ghost">Shop by colour</Link>
          <Link href="/styles" className="btn btn-ghost">Shop by style</Link>
          <Link href="/moods" className="btn btn-ghost">Shop by mood</Link>
          <Link href="/series" className="btn btn-ghost">Series &amp; sets</Link>
          <Link href="/collections/wall-art" className="btn">Explore all wallpapers</Link>
        </div>
      </div>
    </div>
  );
}
