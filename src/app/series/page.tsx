
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import Link from "next/link";
import { getIndexTiles } from "@/lib/collection-index";
import { CollectionIndexGrid } from "@/components/CollectionIndexGrid";

export const revalidate = 3600;

export const metadata: Metadata = brandMetadata({
  title: "Series & Sets",
  description:
    "Zyvorah's series and sets — Autograph, and the panel sets drawn for a bank of lift doors or an office phone booth. Each shown with a design from it.",
  alternates: { canonical: "/series" },
});

/**
 * The index for the two axes that are NOT aesthetics.
 *
 * A shopper browsing /collections is asking "what does it look like". A series
 * answers "where does it come from and what does it cost" (Autograph is a price
 * tier, enforced as one), and a set answers "what wall is it cut for" (three
 * panels for a lift bank, one tall panel for a phone booth). Mixing all three
 * into one grid — which is what kind='curated' used to do — made every name on
 * it a guess. They keep the same /collections/<handle> pages; only the index
 * they are gathered under is different.
 */
export default async function SeriesIndexPage() {
  const [series, sets] = await Promise.all([getIndexTiles(["series"], true), getIndexTiles(["set"])]);

  return (
    <div className="container-x py-12">
      <div className="mx-auto max-w-2xl text-center">
        <span className="caps text-slate">Series &amp; Sets</span>
        <h1 className="mt-3 text-[clamp(2rem,4vw,3rem)] leading-tight">Wallpaper Series &amp; Sets</h1>
        <p className="mt-2 font-display text-[clamp(1.2rem,2.2vw,1.6rem)] leading-snug text-slate">Not a look — a lineage, or a fit.</p>
        <p className="mt-4 text-slate">
          A series is where a design comes from: signature work, a collaboration, a price band. A set
          is what it is cut for: three panels for a bank of lift doors, one tall panel for a phone
          booth. Both sit apart from the collections, which are about how a wall looks.
        </p>
      </div>

      {series.length > 0 && (
        <section className="mt-12">
          <h2 className="font-display text-xl font-bold">Series</h2>
          <p className="mt-1 text-sm text-slate">Signature work, collaborations and price bands.</p>
          <div className="mt-6">
            <CollectionIndexGrid tiles={series} />
          </div>
        </section>
      )}

      {sets.length > 0 && (
        <section className="mt-14">
          <h2 className="font-display text-xl font-bold">Sets</h2>
          <p className="mt-1 text-sm text-slate">
            Panels drawn for one physical thing — for hospitality and commercial interiors.
          </p>
          <div className="mt-6">
            <CollectionIndexGrid tiles={sets} />
          </div>
        </section>
      )}

      <div className="mt-14 text-center">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/collections" className="btn btn-ghost">Shop by collection</Link>
          <Link href="/collections/wall-art" className="btn">Explore all wallpapers</Link>
        </div>
      </div>
    </div>
  );
}
