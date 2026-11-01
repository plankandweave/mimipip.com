
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ProductCard } from "@/components/ProductCard";
import { JsonLd } from "@/components/JsonLd";
import { getCollectionCards } from "@/lib/queries";
import { SITE_URL } from "@/lib/seo";
import { CANVAS_FIXED_SIZE_STATEMENT } from "@/lib/product-facts";
import {
  canvasSizeAliases,
  canvasSizeAltLabel,
  canvasSizeLabel,
  getCanvasSizes,
  parseCanvasSizeSlug,
  type CanvasSize,
} from "@/lib/canvas-size-pages";

// Same hour of staleness the collection listings declare; the catalogue reads
// underneath are cached (catalogue-cache) and deadline-bounded.
export const revalidate = 3600;

type Props = { params: Promise<{ size: string }> };

async function resolve(raw: string): Promise<{ size: CanvasSize | null; canonical: string | null }> {
  const canonical = parseCanvasSizeSlug(raw);
  if (!canonical) return { size: null, canonical: null };
  const sizes = await getCanvasSizes();
  return { size: sizes.find((s) => s.slug === canonical) ?? null, canonical };
}

 async function buildPageMetadata({ params }: Props): Promise<Metadata> {
  const { size: raw } = await params;
  const { size } = await resolve(raw);
  if (!size) return { title: "Not found", robots: { index: false } };
  const label = canvasSizeLabel(size);
  const alt = canvasSizeAltLabel(size);
  const title = `${label} Canvas Wall Art & Paintings (${alt}) | Zyvorah`;
  const n = size.handles.length;
  const description = `${label} (${canvasSizeAliases(size).join(", ")}) canvas wall art and paintings — ${n} ${n === 1 ? "design" : "designs"} available in exactly this finished size and shipped rolled.`;
  const url = `${SITE_URL}/wall-art/${size.slug}`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", title, description, url, siteName: "Zyvorah" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function CanvasSizePage({ params }: Props) {
  const { size: raw } = await params;
  const { size, canonical } = await resolve(raw);
  if (!size) notFound();
  // "6x4-ft" and "72x48-in" are the same page as "4x6-ft" — one URL per size.
  if (canonical && raw !== canonical) permanentRedirect(`/wall-art/${canonical}`);

  // Forced "scene": every handle here was admitted for having a room render
  // (getCanvasSizes), so each card shows it. The filter is belt-and-braces —
  // a card that still lands on its flat is left out rather than shown bare.
  const cards = (await getCollectionCards(size.handles, undefined, "scene")).filter((c) => c.image && !c.imageIsFlat);
  if (!cards.length) notFound();

  const label = canvasSizeLabel(size);
  const others = (await getCanvasSizes()).filter((s) => s.slug !== size.slug);
  const url = `${SITE_URL}/wall-art/${size.slug}`;

  return (
    <div>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: `${label} Canvas Wall Art`,
          url,
          mainEntity: {
            "@type": "ItemList",
            itemListElement: cards.map((c, i) => ({
              "@type": "ListItem",
              position: i + 1,
              url: `${SITE_URL}/products/${c.handle}`,
              name: c.title,
            })),
          },
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Canvas Art", item: `${SITE_URL}/collections/canvas-art` },
            { "@type": "ListItem", position: 2, name: "Shop by size", item: `${SITE_URL}/wall-art` },
            { "@type": "ListItem", position: 3, name: label, item: url },
          ],
        }}
      />

      <div className="mx-4 mt-4 rounded-[32px] bg-peach/40 lg:mx-6">
        <div className="container-x py-10 text-center">
          <Link href="/wall-art" className="caps text-slate">
            Canvas art · Shop by size
          </Link>
          <h1 className="mt-3 text-[clamp(2.2rem,4vw,3.2rem)]">{label} Canvas Wall Art</h1>
          <p className="mt-2 text-sm text-slate">
            {`${canvasSizeAliases(size).join(" · ")} · ${cards.length} ${cards.length === 1 ? "artwork" : "artworks"}`}
          </p>
          <p className="mx-auto mt-3 max-w-xl text-xs text-slate">{CANVAS_FIXED_SIZE_STATEMENT}</p>
        </div>
      </div>

      <section className="container-x py-10">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {cards.map((p) => {
            const sel = size.sizeParam[p.handle];
            return (
              <ProductCard
                key={p.handle}
                product={p}
                href={sel ? `/products/${p.handle}?size=${sel}` : undefined}
              />
            );
          })}
        </div>
      </section>

      {others.length > 0 && (
        <section className="container-x pb-8">
          <span className="caps text-slate">Other sizes</span>
          <div className="mt-3 flex flex-wrap gap-2">
            {others.map((s) => (
              <Link
                key={s.slug}
                href={`/wall-art/${s.slug}`}
                className="rounded-full border border-edge bg-surface px-4 py-2 text-sm transition-colors hover:bg-charcoal hover:text-surface"
              >
                {canvasSizeLabel(s)}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="container-x pb-16">
        <div className="rounded-[22px] bg-wash p-6 lg:p-8">
          <h2 className="text-xl lg:text-2xl">Need a different size?</h2>
          <p className="mt-2 max-w-xl text-sm text-slate">
            Canvas pieces come in fixed finished sizes. For a whole wall — any width, any height —
            our wallpapers and murals are sized to your wall.
          </p>
          <Link href="/collections/wall-art" className="link-underline mt-4 inline-block text-sm">
            Any wall, sized to your wall →
          </Link>
        </div>
      </section>
    </div>
  );
}

export const generateMetadata = withBrandMetadata(buildPageMetadata);
