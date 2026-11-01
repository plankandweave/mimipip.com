
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Image from "@/components/SiteImage";
import { OfficeConceptBuilder } from "@/components/office/OfficeConceptBuilder";
import { getConceptOffers } from "@/lib/office-concept-server";
import { fetchPrintRules } from "@/lib/print-rules";
import { getShopConcept } from "@/lib/shop-concepts";
import { hiddenConceptSlugs } from "@/lib/concept-availability";
import { mediaUrl } from "@/lib/project-media";
import { createLookPath } from "@/lib/concept-copy";

export const dynamic = "force-dynamic";
const slug = "blue-and-clay";
const path = `/concepts/${slug}`;
const rooms = [
  { key: "living-room", name: "Living room", title: "Blue, in Balance", note: "Generous ink-blue shapes meet chalk and clay. A confident composition that works with a familiar sofa and warm wood." },
  { key: "dining-area", name: "Dining area", title: "Clay in Motion", note: "Tall clay ribbons and narrow blue strokes give the dining wall its own rhythm, connected to the living room through colour." },
  { key: "master-bedroom", name: "Master bedroom", title: "A Quieter Line", note: "Broad blue-grey brushwork and a fine clay line bring a calmer expression of the same palette to the master bedroom." },
];
export const metadata: Metadata = editorialMetadata("/concepts/blue-and-clay");

  async function Page({ searchParams }: { searchParams: Promise<{ shop?: string }> }) {
  if ((await hiddenConceptSlugs()).has(slug)) notFound();
  const concept = getShopConcept(slug)!;
  if ((await searchParams).shop === "1") {
    const [catalogue, rules] = await Promise.all([getConceptOffers(slug), fetchPrintRules()]);
    return <OfficeConceptBuilder {...catalogue} rules={rules} concept={concept} exploreHref={path} />;
  }
  return <section className="container-x py-10 sm:py-14">
    <Link href="/concepts?space=homes" className="text-sm underline underline-offset-4">← Concepts for your home</Link>
    <header className="mt-8 max-w-3xl">
      <p className="caps text-slate">A contemporary 2-bedroom apartment concept</p>
      <h1 className="mt-3 text-[clamp(2.5rem,6vw,4.8rem)]">Blue & Clay</h1>
      <p className="mt-5 text-lg text-slate">Ink blue, warm clay and walnut. Three distinct wallpaper compositions bring the living room, dining area and master bedroom together.</p>
      <p className="mt-3 text-sm text-slate">Explore the three spaces below. Choose one wall or combine them for your home. Wallpaper only; furniture and styling are not included. Room images are design visualisations.</p>
      <div className="mt-6 flex flex-wrap gap-4">
        <Link href={`${path}?shop=1`} className="rounded-lg bg-charcoal px-5 py-3 text-sm font-semibold text-white">Choose your walls →</Link>
        <Link href={createLookPath(slug)} className="rounded-lg border border-charcoal px-5 py-3 text-sm font-semibold">Create a look for your space →</Link>
      </div>
    </header>
    <div className="mt-12 space-y-16">
      {rooms.map((room, index) => <section key={room.key} aria-labelledby={`${room.key}-title`}>
        <p className="caps text-slate">0{index + 1} · {room.name}</p>
        <h2 id={`${room.key}-title`} className="mt-2 text-3xl sm:text-4xl">{room.title}</h2>
        <p className="mt-3 max-w-2xl text-slate">{room.note}</p>
        <div className="relative mt-6 aspect-[3/2] overflow-hidden rounded-2xl bg-wash">
          <Image src={mediaUrl(`first-proper-home/${room.key}-room.jpg`)} alt={`${room.name} — ${room.title} wallpaper in a contemporary Indian apartment`} fill priority={index === 0} sizes="(max-width: 768px) 100vw, 1200px" className="object-contain object-bottom" />
        </div>
        <details className="mt-4 rounded-xl border border-edge p-4 sm:p-6" open>
          <summary className="cursor-pointer font-semibold">View the flat wallpaper · {room.title}</summary>
          <div className="relative mt-4 aspect-[3/2] max-w-3xl overflow-hidden rounded-lg bg-wash">
            <Image src={mediaUrl(`first-proper-home/${room.key}-artwork.jpg`)} alt={`${room.title} — flat wallpaper artwork without furniture`} fill sizes="(max-width: 768px) 100vw, 768px" className="object-contain" />
          </div>
          <p className="mt-3 text-sm text-slate">Choose your wall size and adjust the artwork to fit.</p>
        </details>
        <Link href={`${path}?shop=1&design=${encodeURIComponent(room.name)}`} className="mt-5 inline-flex rounded-lg border border-charcoal px-5 py-3 text-sm font-semibold">Choose this wallpaper →</Link>
      </section>)}
    </div>
    <footer className="mt-14 rounded-2xl bg-wash p-6 sm:p-8">
      <h2 className="text-3xl">Bring the rooms together</h2>
      <p className="mt-3 max-w-2xl text-slate">Select the designs you want, enter your wall measurements and review your total. Each wallpaper is sized to your wall for your space.</p>
      <Link href={`${path}?shop=1`} className="mt-5 inline-flex rounded-lg bg-charcoal px-5 py-3 text-sm font-semibold text-white">Size your walls →</Link>
    </footer>
  </section>;
}

export default withBrandEditorial("/concepts/blue-and-clay", Page);
