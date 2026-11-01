
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import Link from "next/link";
import { InkDesignGallery } from "@/components/InkDesignGallery";
import { INK_DESIGNS, inkImage } from "@/lib/ink-collection";
import { supabase } from "@/lib/supabase";

export const revalidate = 300;
export const metadata: Metadata = editorialMetadata("/collection/ink");

  async function InkCollectionPage() {
  const { data, error } = await supabase.from("products").select("handle")
    .in("handle", INK_DESIGNS.map(d => `ink-${d.slug}`)).eq("status", "active");
  if (error) throw error;
  const active = new Set((data ?? []).map(p => p.handle));
  const designs = INK_DESIGNS.filter(d => active.has(`ink-${d.slug}`));
  return (
    <div className="bg-[#f7f3eb] text-charcoal" data-ink-count={designs.length}>
      <header className="container-x pb-10 pt-10 md:pb-14 md:pt-16">
        <Link href="/collections" className="text-xs text-slate underline underline-offset-4">All collections</Link>
        <div className="mt-8 grid gap-6 md:grid-cols-[1.1fr_1fr] md:items-end">
          <div><p className="caps text-slate">Zyvorah · Architectural murals</p>
            <h1 className="mt-4 text-[clamp(3rem,8vw,7rem)] leading-[0.98]">Ink Collection</h1></div>
          <div className="max-w-xl"><p className="font-display text-2xl leading-snug md:text-3xl">A world held in a line.</p>
            <p className="mt-4 leading-relaxed text-slate">Quiet lanes, carved courtyards, garden verandahs and waterside houses.
              Twenty-one places, each with its own character, brought together in sepia, charcoal and warm ivory.</p>
            <a href="#places" className="mt-6 inline-block border-b border-charcoal pb-1 text-sm">Explore the places ↓</a></div>
        </div>
      </header>
      <div className="container-x">
        <video controls playsInline preload="none" poster={inkImage("venice", 1)}
          aria-label="Ink Collection film: twenty-one places, carried home"
          className="aspect-[9/16] w-full bg-charcoal object-cover object-bottom md:aspect-video">
          <source media="(max-width: 767px)" src="/media/marketing-media/ink/Ink-21-vertical-film.mp4" type="video/mp4" />
          <source src="/media/marketing-media/ink/Ink-21-horizontal-film.mp4" type="video/mp4" />
          <a href="/media/marketing-media/ink/Ink-21-horizontal-film.mp4">Watch the Ink Collection film</a>
        </video>
        <div className="mt-3 flex flex-wrap justify-between gap-3 text-xs text-slate">
          <p>Twenty-one places, carried home. · A film with music · 1 minute</p>
          <a href="/media/marketing-media/ink/Ink-21-vertical-film.mp4" className="underline underline-offset-4">Watch the vertical film</a>
        </div>
      </div>
      <section className="container-x grid gap-8 py-16 md:grid-cols-[1fr_1.3fr] md:py-24" aria-labelledby="art-of-ink">
        <h2 id="art-of-ink" className="max-w-md font-display text-4xl leading-tight md:text-5xl">The art of looking<br />a little closer.</h2>
        <div className="max-w-2xl space-y-5 text-base leading-relaxed text-slate">
          <p>Ink gives a place its shape through the smallest marks. A fine line follows a window;
            close hatching gathers beneath an arch; a delicate wash lets a shadow settle.
            The ivory left between those marks brings light and space into the drawing.</p>
          <p>Every place in Ink is somewhere founder Roheena Nagpal has personally visited.
            The collection brings those journeys home through the architecture of twenty-one places,
            translated into murals for the spaces we live in.</p>
          <p>This collection takes its cue from architectural sketches and the fine detail of etching.
            Venice’s little bridges begin the journey. From there, it moves through coastal lanes,
            Indian courtyards and verandahs, Asian shophouses and the quieter streets of Rome and London.
            Each mural is an artistic interpretation, with the place’s own architecture at its heart.</p>
          <p>Across a wall, that intimate detail finds a new scale. A staircase becomes a promenade.
            A listening room opens onto a canal. A dressing salon holds a glimpse of another city.
            Explore three different settings for every design, then imagine where yours belongs.</p>
        </div>
      </section>
      <nav id="places" aria-label="Choose a place" className="container-x scroll-mt-24 border-y border-charcoal/15 py-6">
        <p className="caps mb-4 text-slate">{designs.length} places · Three settings per design</p>
        <div className="flex flex-wrap gap-x-5 gap-y-3">{designs.map(d => (
          <a key={d.slug} href={`#${d.slug}`} className="text-sm underline-offset-4 hover:underline">{d.place}</a>
        ))}</div>
      </nav>
      <div className="container-x">
        {designs.map((d, index) => (
          <section id={d.slug} key={d.slug} data-ink-design={d.slug} className="scroll-mt-24 border-b border-charcoal/15 py-12 md:py-20">
            <div className="grid gap-7 lg:grid-cols-[1fr_2.5fr] lg:gap-12">
              <div><p className="caps text-slate">{String(index + 1).padStart(2, "0")} / Ink Collection</p>
                <h2 className="mt-3 font-display text-4xl md:text-5xl">{d.place}</h2>
                <p className="mt-3 font-display text-xl">{d.subtitle}</p>
                <p className="mt-5 max-w-sm text-sm leading-relaxed text-slate">{d.description}</p>
                <Link href={`/products/ink-${d.slug}`} prefetch={false} className="btn mt-6">Shop {d.place}</Link>
                <p className="mt-3 text-xs text-slate">Made to your wall size.</p>
              </div>
              <InkDesignGallery slug={d.slug} place={d.place} settings={d.settings} />
            </div>
          </section>
        ))}
      </div>
      <section className="container-x py-16 text-center md:py-24">
        <p className="caps text-slate">Your place in the picture</p>
        <h2 className="mt-4 font-display text-4xl">Give the drawing a wall of its own.</h2>
        <p className="mx-auto mt-5 max-w-2xl leading-relaxed text-slate">Choose a design, enter your dimensions and explore it on your wall.
          We prepare the mural layout for your space before printing.</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <a href="#places" className="btn">Choose your place</a><Link href="/how-to-measure" className="btn btn-ghost">Measure your wall</Link>
        </div>
        <p className="mx-auto mt-8 max-w-xl text-xs leading-relaxed text-slate">Room images are design visualisations.
          The final mural crop and layout depend on your wall dimensions.</p>
      </section>
    </div>
  );
}

export default withBrandEditorial("/collection/ink", InkCollectionPage);
