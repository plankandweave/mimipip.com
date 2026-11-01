import Image from "next/image";
import { getInstalledWallPhotos } from "@/lib/installed-walls";
import { mediaRendition } from "@/lib/media-url";

/**
 * "On real walls" — photos of this design as customers actually hung it,
 * each captioned with just the city and month. Every photo was consented to
 * by the customer and approved by Roheena in the OS before it reached this
 * site (src/lib/installed-walls.ts). Renders nothing when there are none:
 * never a render or a stock photo in its place.
 */
export async function InstalledWalls({ productHandle, designName }: { productHandle: string; designName: string }) {
  const photos = await getInstalledWallPhotos(productHandle);
  if (photos.length === 0) return null;

  return (
    <section className="container-x py-12" aria-labelledby="installed-walls-heading">
      <h2 id="installed-walls-heading" className="mb-6 text-2xl">On real walls</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {photos.map((p) => (
          <figure key={p.url} className="overflow-hidden rounded-[14px]">
            <div className="relative aspect-[4/3] w-full bg-stone-100">
              <Image
                src={mediaRendition(p.url, 480)}
                alt={`${designName} installed in a home in ${p.city}`}
                fill
                unoptimized
                sizes="(min-width: 640px) 33vw, 50vw"
                className="object-cover object-bottom"
              />
            </div>
            <figcaption className="mt-1.5 text-xs text-mist">
              {p.city} · {p.month}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
