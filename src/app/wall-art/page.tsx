
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/seo";
import { CANVAS_FIXED_SIZE_STATEMENT } from "@/lib/product-facts";
import { canvasSizeAliases, canvasSizeLabel, getCanvasSizes } from "@/lib/canvas-size-pages";

export const revalidate = 3600;

const TITLE = "Canvas Wall Art & Paintings by Size | Zyvorah";
const DESCRIPTION =
  "Shop canvas wall art and paintings by finished size — every size we print, each with the designs available in it. Fixed finished sizes, shipped rolled.";

export const metadata: Metadata = brandMetadata({
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/wall-art` },
  openGraph: { type: "website", title: TITLE, description: DESCRIPTION, url: `${SITE_URL}/wall-art`, siteName: "Zyvorah" },
});

/** Every canvas size that has designs behind it, read from the catalogue. */
export default async function CanvasSizesIndex() {
  let sizes: Awaited<ReturnType<typeof getCanvasSizes>> = [];
  try {
    sizes = await getCanvasSizes();
  } catch (err) {
    // The page still says what it is and points at the full range; a transient
    // read failure must not turn the hub into a 500.
    console.error("[wall-art] size index read failed:", err instanceof Error ? err.message : err);
  }

  return (
    <div>
      <div className="mx-4 mt-4 rounded-[32px] bg-peach/40 lg:mx-6">
        <div className="container-x py-10 text-center">
          <Link href="/collections/canvas-art" className="caps text-slate">
            Canvas art
          </Link>
          <h1 className="mt-3 text-[clamp(2.2rem,4vw,3.2rem)]">Canvas Wall Art by Size</h1>
          <p className="mx-auto mt-3 max-w-xl text-xs text-slate">{CANVAS_FIXED_SIZE_STATEMENT}</p>
        </div>
      </div>

      <section className="container-x py-10">
        <Link href="/wall-art/religion" className="mb-8 block rounded-[22px] bg-wash p-6 transition-colors hover:bg-edge">
          <span className="caps text-slate">Religion</span>
          <h2 className="mt-2 text-2xl">Shop by Religion →</h2>
          <p className="mt-2 text-sm text-slate">Explore devotional wall art by faith and deity.</p>
        </Link>
        {sizes.length ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {sizes.map((s) => (
              <Link
                key={s.slug}
                href={`/wall-art/${s.slug}`}
                className="block rounded-[22px] bg-wash p-5 transition-colors hover:bg-edge"
              >
                <span className="font-display text-xl font-semibold">{canvasSizeLabel(s)}</span>
                <span className="mt-1 block text-sm text-slate">
                  {canvasSizeAliases(s).join(" · ")}
                </span>
                <span className="mt-2 block text-xs text-mist">
                  {s.handles.length} {s.handles.length === 1 ? "artwork" : "artworks"}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="rounded-[22px] bg-wash p-6 text-sm text-slate">
            <Link href="/collections/canvas-art" className="link-underline">
              Browse every canvas artwork
            </Link>
            .
          </p>
        )}
      </section>

      <section className="container-x pb-16">
        <div className="rounded-[22px] bg-wash p-6 lg:p-8">
          <h2 className="text-xl lg:text-2xl">Need a different size?</h2>
          <p className="mt-2 max-w-xl text-sm text-slate">
            For a whole wall — any width, any height — our wallpapers and murals are sized to your wall.
          </p>
          <Link href="/collections/wall-art" className="link-underline mt-4 inline-block text-sm">
            Any wall, sized to your wall →
          </Link>
        </div>
      </section>
    </div>
  );
}
