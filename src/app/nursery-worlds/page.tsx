import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Nursery worlds | MimiPip',
  description: 'Explore eleven gentle wallpaper worlds in warm, lived-in nursery settings.',
  alternates: { canonical: '/nursery-worlds/' },
};

const worlds = [
  ['little-fox-orchard', 'Little Fox Orchard', 'A sleepy fox family beneath blossoming apple trees.'],
  ['duckling-pond', 'Duckling Pond', 'A small procession across a quiet blue pond.'],
  ['bear-and-bee-meadow', 'Bear and Bee Meadow', 'A curious bear cub in a soft clover meadow.'],
  ['gentle-whale-bay', 'Gentle Whale Bay', 'Two gentle whales in a calm coastal scene.'],
  ['little-lamb-pasture', 'Little Lamb Pasture', 'A pair of lambs resting beside a country wall.'],
  ['hedgehog-garden', 'Hedgehog Garden', 'A little woodland walk through ferns and mushrooms.'],
  ['fawn-in-ferns', 'Fawn in Ferns', 'A quiet moment between deer in a leafy glade.'],
  ['otter-riverbank', 'Otter Riverbank', 'A parent and pup floating along a winding stream.'],
  ['turtle-garden', 'Turtle Garden', 'A slow, sunny journey down a garden path.'],
  ['koala-eucalyptus', 'Koala Eucalyptus', 'A sleepy cuddle in the eucalyptus branches.'],
  ['penguin-snowdrift', 'Penguin Snowdrift', 'A cozy embrace among soft winter hills.'],
] as const;

export default function NurseryWorldsPage() {
  return <main className="bg-[#fffaf2] text-[#493d32]">
    <section className="container-x pb-10 pt-12 text-center md:pb-16 md:pt-20">
      <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[#aa7c57]">MimiPip nursery worlds</p>
      <h1 className="mx-auto max-w-4xl text-4xl leading-tight md:text-6xl">A little world to come home to</h1>
      <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[#6d6257]">Gentle stories, familiar comforts and room for the first years to unfold. Explore each wallpaper in a warm nursery, then see its artwork up close.</p>
      <p className="mx-auto mt-4 max-w-2xl text-xs text-[#81776d]">Illustrative room renders. Furniture and accessories are shown for inspiration.</p>
    </section>
    <section className="container-x grid gap-12 pb-20 md:grid-cols-2 md:gap-x-8 md:gap-y-16" aria-label="Eleven nursery wallpaper worlds">
      {worlds.map(([slug, title, description], index) => {
        const key = `${String(index + 1).padStart(2, '0')}-${slug}`;
        return <article key={slug} className="overflow-hidden rounded-[28px] bg-white shadow-[0_12px_48px_rgba(86,65,43,0.08)]">
          <img src={`/nursery-worlds/${key}-room-v2.webp`} alt={`${title} wallpaper shown on a feature wall in an illustrative lived-in baby nursery`} width={1536} height={1024} loading={index < 2 ? 'eager' : 'lazy'} className="aspect-[3/2] w-full object-cover" />
          <div className="p-5 md:p-7">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a28060]">{String(index + 1).padStart(2, '0')} / 11</p>
            <h2 className="mt-2 text-2xl md:text-3xl">{title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#6d6257]">{description}</p>
            <figure className="mt-5 overflow-hidden rounded-2xl bg-[#faf4e9]">
              <img src={`/nursery-worlds/${key}-art-v2.webp`} alt={`${title} flat wallpaper artwork`} width={1672} height={941} loading="lazy" className="aspect-[2/1] w-full object-cover" />
              <figcaption className="px-4 py-3 text-xs text-[#75695e]">The artwork, before it meets the room</figcaption>
            </figure>
          </div>
        </article>;
      })}
    </section>
    <div className="container-x pb-16 text-center"><Link href="/browse/age?value=baby" className="inline-flex rounded-full bg-[#fa6b48] px-7 py-3 text-sm font-semibold text-white hover:bg-[#d75030]">Explore baby wallpapers</Link></div>
  </main>;
}
