import Link from "next/link";
import Image from "@/components/SiteImage";
import type { IndexTile } from "@/lib/collection-index";

/** The tile grid shared by /collections and /series. See getIndexTiles for why
 *  every tile carries a design from the collection rather than a name alone. */
export function CollectionIndexGrid({ tiles }: { tiles: IndexTile[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
      {/* prefetch off: scrolling the grid brings every tile into the viewport
          and the default prefetch fires one request per collection — a burst
          that edge rate limiting reads as scraping (it 403'd a real shopper
          on 5 Sep). */}
      {tiles.map((t) => (
        <Link key={t.handle} href={(t.handle === "ink" || t.handle === "new-york") ? `/collection/${t.handle}` : `/collections/${t.handle}`} prefetch={false} {...t.attrs} className="group block">
          <div className="relative aspect-[3/4] overflow-hidden rounded-[22px]">
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
          </div>
          <p className="mt-2.5 text-xs text-mist">
            {t.count} {t.count === 1 ? "design" : "designs"}
          </p>
          {/* A collection's own copy runs from one line to six paragraphs
              (Dwadasha). Three lines is the tile's job — say what it is; the
              collection page says the rest. */}
          {t.description && (
            <p className="mt-1 line-clamp-3 text-[0.82rem] leading-snug text-slate">{t.description}</p>
          )}
        </Link>
      ))}
    </div>
  );
}
