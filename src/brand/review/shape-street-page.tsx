import Link from 'next/link';
import { ProductCard } from '@/components/ProductCard';
import { card, collectionDesigns } from './data';

export function ShapeStreetPage() {
  const designs = collectionDesigns('shape-street');
  return <main className="bg-[#f8f4ec] text-[#593b2c]">
    <section className="container-x grid items-center gap-8 py-10 md:grid-cols-[0.8fr_1.2fr] md:gap-14 md:py-16">
      <div className="max-w-xl">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.28em] text-[#a65d3b]">A little world to grow into</p>
        <h1 className="font-serif text-5xl leading-[1.05] md:text-7xl">Shape Street</h1>
        <p className="mt-6 text-xl leading-relaxed md:text-2xl">A town full of small adventures, made for the walls where childhood happens.</p>
        <a href="#explore-shape-street" className="mt-8 inline-block rounded-full bg-[#704832] px-7 py-3 text-sm font-semibold text-white hover:bg-[#573522]">Explore the designs</a>
      </div>
      <div className="overflow-hidden rounded-[2rem] shadow-[0_24px_70px_rgba(78,49,30,.15)]">
        <img src="/collection-headers/shape-street.webp" alt="A child playing in a Shape Street wallpaper room" className="aspect-[4/3] h-full w-full object-cover" />
      </div>
    </section>
    <section className="border-y border-[#e9ddcd] bg-[#f2e8d7] py-10 md:py-14">
      <div className="container-x grid gap-6 md:grid-cols-[1fr_1fr] md:items-center md:gap-16">
        <p className="font-serif text-3xl leading-tight md:text-4xl">The market wakes. The tram arrives. A new favourite corner appears every day.</p>
        <p className="max-w-xl text-lg leading-relaxed">Look closely and there is always more to find: a garden above the rooftops, boats at the harbour, a park picnic, and a town that glows after dark. Each design gives children somewhere to let their stories begin.</p>
      </div>
    </section>
    <section id="explore-shape-street" className="container-x py-12 md:py-20">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
        <div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-[#a65d3b]">Find their favourite place</p><h2 className="font-serif text-3xl md:text-5xl">Explore Shape Street</h2></div>
        <p className="max-w-sm text-sm leading-relaxed">See each design on a room wall and in its full front view. Choose the one that feels like theirs.</p>
      </div>
      <div className="grid grid-cols-2 gap-5 md:grid-cols-4">{designs.map(p=><ProductCard key={p.id} product={card(p)}/>)}</div>
      <div className="mt-12 rounded-3xl bg-white px-6 py-7 md:flex md:items-center md:justify-between md:gap-8 md:px-10">
        <div><h3 className="font-serif text-2xl">Made for your wall</h3><p className="mt-2 max-w-2xl leading-relaxed">Smooth matte wallpaper, made to your measurements. Enter your wall size on a design page for its exact price.</p></div>
        <p className="mt-5 shrink-0 text-sm font-semibold md:mt-0">India: ₹200/sq ft + 18% GST</p>
      </div>
      <Link href="/how-to-measure" className="mt-5 inline-block text-sm underline underline-offset-4">How to measure your wall</Link>
    </section>
  </main>;
}
