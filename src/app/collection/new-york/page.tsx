
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "@/components/SiteImage";
import { NewYorkDesignGallery } from "@/components/NewYorkDesignGallery";
import { NEW_YORK_DESIGNS, newYorkImage } from "@/lib/new-york-collection";
import { supabase } from "@/lib/supabase";

export const revalidate = 300;
export const metadata: Metadata = editorialMetadata("/collection/new-york");

  async function NewYorkCollectionPage() {
  const { data, error } = await supabase.from("products").select("handle")
    .in("handle", NEW_YORK_DESIGNS.map(d => `new-york-${d.slug}`)).eq("status", "active");
  if (error) throw error;
  const active = new Set((data ?? []).map(p => p.handle));
  const designs = NEW_YORK_DESIGNS.filter(d => active.has(`new-york-${d.slug}`));
  return (
    <div className="bg-[#f7f3eb] text-charcoal" data-new-york-count={designs.length}>
      <header className="container-x pb-10 pt-10 md:pb-14 md:pt-16">
        <Link href="/collections" className="text-xs text-slate underline underline-offset-4">All collections</Link>
        <div className="mt-8 grid gap-8 md:grid-cols-[1.1fr_1fr] md:items-end">
          <div><p className="caps text-slate">Zyvorah · A city remembered</p>
            <h1 className="mt-4 text-[clamp(3.8rem,10vw,9rem)] leading-[0.98]">New York<span className="mt-5 block font-display text-[clamp(1.5rem,3vw,2.6rem)] leading-tight">The Skyline He Carried</span></h1></div>
          <div className="max-w-xl"><p className="font-display text-2xl leading-snug md:text-3xl">He remembered the skyline.<br />She remembered how he spoke about it.</p>
            <p className="mt-4 leading-relaxed text-slate">Eleven murals inspired by a wife’s gift to her husband, his years on Wall Street and the city he carried with him.</p>
            <a href="#designs" className="mt-6 inline-block border-b border-charcoal pb-1 text-sm">Explore the eleven designs ↓</a></div>
        </div>
      </header>
      <figure className="container-x">
        <Image src={newYorkImage("the-view-he-kept", 1)} alt="The View He Kept mural in a grand living salon with a curved ivory sofa, walnut and travertine"
          width={1536} height={1024} priority sizes="100vw" className="h-auto w-full object-contain object-bottom" />
        <figcaption className="mt-3 text-xs text-slate">The View He Kept · Grand living salon</figcaption>
      </figure>
      <section className="container-x grid gap-8 py-16 md:grid-cols-[1fr_1.3fr] md:py-24" aria-labelledby="collection-story">
        <h2 id="collection-story" className="max-w-md font-display text-4xl leading-tight md:text-5xl">A city in his stories.<br />A place in their home.</h2>
        <div className="max-w-2xl space-y-5 text-base leading-relaxed text-slate">
          <p>This collection began with a wife listening to her husband’s memories of New York, the city where he grew up and worked on Wall Street. The Colgate Clock, the river and the Twin Towers were familiar parts of the world he described. She began to imagine those memories across a wall.</p>
          <p>Eleven murals move from the broad skyline to neighbourhood streets, stone façades and quiet rooftops. Fine architectural drawing meets soft painted light. Limestone, weathered brick and charcoal hold the collection together; blue, a colour that came up in their conversations, gives the river and sky room to breathe.</p>
          <p>The Twin Towers appear intact within the remembered skyline. Each scene is an artistic interpretation, bringing familiar forms and the atmosphere of a city into a new composition.</p>
          <p>Created by a wife for her husband, New York: The Skyline He Carried speaks to anyone who carries a city with them. Explore three interiors for every design, and find the setting that feels like yours.</p>
        </div>
      </section>
      <nav id="designs" aria-label="Choose a New York design" className="container-x scroll-mt-24 border-y border-charcoal/15 py-6">
        <p className="caps mb-4 text-slate">{designs.length} designs · Three settings per design</p>
        <div className="flex flex-wrap gap-x-5 gap-y-3">{designs.map(d => (
          <a key={d.slug} href={`#${d.slug}`} className="inline-flex min-h-10 items-center text-sm underline-offset-4 hover:underline">{d.name}</a>
        ))}</div>
      </nav>
      <div className="container-x">
        {designs.map((d, index) => (
          <section id={d.slug} key={d.slug} data-new-york-design={d.slug} className="scroll-mt-24 border-b border-charcoal/15 py-12 md:py-20">
            <div className="grid gap-7 lg:grid-cols-[1fr_2.5fr] lg:gap-12">
              <div><p className="caps text-slate">{String(index + 1).padStart(2, "0")} / New York</p>
                <h2 className="mt-3 font-display text-4xl md:text-5xl">{d.name}</h2>
                <p className="mt-5 max-w-sm text-sm leading-relaxed text-slate">{d.description}</p>
                <Link href={`/products/new-york-${d.slug}`} prefetch={false} className="btn mt-6">Shop this design</Link>
                <p className="mt-3 text-xs text-slate">Made to your wall size.</p>
                <p className="mt-6 max-w-sm text-xs leading-relaxed text-slate">Suggested settings: {d.settings.join(" · ")}.</p>
              </div>
              <NewYorkDesignGallery slug={d.slug} place={d.name} settings={d.settings} />
            </div>
          </section>
        ))}
      </div>
      <section className="container-x py-16 text-center md:py-24">
        <p className="caps text-slate">Bring your city home</p>
        <h2 className="mt-4 font-display text-4xl">A remembered view. A wall of your own.</h2>
        <p className="mx-auto mt-5 max-w-2xl leading-relaxed text-slate">Choose a design, enter your dimensions and explore it on your wall. We prepare the mural layout for your space before printing.</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <a href="#designs" className="btn">Find your New York</a><Link href="/how-to-measure" className="btn btn-ghost">Measure your wall</Link>
        </div>
        <p className="mx-auto mt-8 max-w-xl text-xs leading-relaxed text-slate">Room images are design visualisations. The final mural crop and layout depend on your wall dimensions.</p>
      </section>
    </div>
  );
}


export default withBrandEditorial("/collection/new-york", NewYorkCollectionPage);
