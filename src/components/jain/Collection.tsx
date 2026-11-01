import Link from "next/link";
import { notFound } from "next/navigation";
import { JAIN_DESIGNS, JAIN_RESPECT } from "@/content/jain-temples";
import { CollectionBrowser } from "@/components/CollectionBrowser";
import { getCollectionCards } from "@/lib/queries";
import { JsonLd } from "@/components/JsonLd";
import { collectionJsonLd } from "@/lib/seo";
import { CorrectionForm } from "./CorrectionForm";

export type JainCollectionSearch = { sort?: string; page?: string };

export async function JainCollection({ surface, search = {} }: {
  surface?: "wall" | "ceiling";
  search?: JainCollectionSearch;
}) {
  const designs = JAIN_DESIGNS.filter(d => !surface || d.surface === surface);
  const title = surface === "wall" ? "Jain Temple Walls" : surface === "ceiling" ? "Jain Temple Ceilings" : "Jain Temples";
  const handle = surface ? `jain-temple-${surface === "wall" ? "walls" : "ceilings"}` : "jain-temples";
  const sort = search.sort === "featured" ? "featured" : "newest";
  if (search.page && search.page !== "1") notFound();
  // This URL is an intentional Jain collection selection. Keep the existing
  // religion opt-in read and cache entry; general discovery remains unchanged.
  const cards = (await getCollectionCards(designs.map(d => d.handle), undefined, "scene", true))
    .filter(card => card.image && !card.imageIsFlat);
  const products = sort === "newest"
    ? [...cards].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    : cards;
  return <div className="pb-16" data-jain-listing="standard"
    data-flat-cards={products.filter(card => card.imageIsFlat).map(card => card.handle).join(",")}>
    <JsonLd data={collectionJsonLd({ handle, title, kind: "curated", products })} />
    <div className="mx-4 mt-4 rounded-[32px] bg-peach/40 lg:mx-6">
      <div className="container-x py-10 text-center">
        <span className="caps text-slate">Curated collection</span>
        <h1 className="mt-3 text-[clamp(2.2rem,4vw,3.2rem)]">{title} Wallpaper</h1>
        <p className="mt-2 text-sm text-slate">{products.length} designs</p>
        <p className="mx-auto mt-3 max-w-xl text-sm text-slate">Lotus gardens, quiet arches and delicate ornament for temple walls and ceilings.</p>
        <nav aria-label="Jain Temples collections" className="mt-5 flex flex-wrap justify-center gap-3 text-sm">
          {[["jain-temples", "All designs"], ["jain-temple-walls", "Walls"], ["jain-temple-ceilings", "Ceilings"]].map(([slug, label]) =>
            <Link key={slug} href={`/collections/${slug}`} aria-current={slug === handle ? "page" : undefined} className="inline-flex min-h-10 items-center underline underline-offset-4">{label}</Link>
          )}
        </nav>
      </div>
    </div>
    <CollectionBrowser products={products} siblings={[{ handle, title }]} currentHandle={handle}
      kind="curated" facetGroups={[]} selectedTags={[]} signature={false} newOnly={false}
      childSafe={false} flagsAvailable={{ signature: false, new: false, child: false }}
      sort={sort} page={1} total={products.length} pageSize={24} />
    <section className="container-x mt-12" aria-labelledby="note-of-respect"><div className="max-w-3xl"><h2 id="note-of-respect" className="text-3xl">A Note of Respect</h2><p className="mt-4 text-sm leading-relaxed text-slate">{JAIN_RESPECT}</p><a href="#suggest-a-correction" className="mt-3 inline-flex min-h-11 items-center text-sm underline underline-offset-4">Suggest a Correction ↓</a></div></section>
    <section id="suggest-a-correction" className="container-x mt-10 scroll-mt-24" aria-labelledby="correction-heading"><div className="max-w-2xl"><h2 id="correction-heading" className="text-3xl">Suggest a Correction</h2><p className="mt-3 text-sm leading-relaxed text-slate">Help us learn. Please tell us what needs attention and share a reference where possible. Suggestions are recorded for review.</p><CorrectionForm /></div></section>
  </div>;
}
