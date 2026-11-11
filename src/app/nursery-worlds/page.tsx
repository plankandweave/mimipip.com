import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Hush & Wander nursery wallpaper collection | MimiPip',
  description: 'Shop eleven softly painted nursery wallpaper murals from the Hush & Wander collection, and explore each design by color.',
  alternates: { canonical: '/nursery-worlds/' },
};

const worlds = [
  { slug: 'little-fox-orchard', title: 'Little Fox Orchard', description: 'A sleepy fox family beneath blossoming apple trees.', colors: ['Peach', 'Green'] },
  { slug: 'duckling-pond', title: 'Duckling Pond', description: 'A small procession across a luminous blue pond.', colors: ['Blue', 'Peach'], revised: true },
  { slug: 'bear-and-bee-meadow', title: 'Bear and Bee Meadow', description: 'A curious bear cub in a soft clover meadow.', colors: ['Yellow', 'Green'] },
  { slug: 'gentle-whale-bay', title: 'Gentle Whale Bay', description: 'Two gentle whales in a calm coastal scene.', colors: ['Blue', 'Neutral'] },
  { slug: 'little-lamb-pasture', title: 'Little Lamb Pasture', description: 'A pair of lambs resting beside a country wall.', colors: ['Green', 'Neutral'] },
  { slug: 'hedgehog-garden', title: 'Hedgehog Garden', description: 'A little woodland walk through ferns and mushrooms.', colors: ['Peach', 'Green'], revised: true },
  { slug: 'fawn-in-ferns', title: 'Fawn in Ferns', description: 'A quiet moment between deer in a leafy glade.', colors: ['Green', 'Neutral'] },
  { slug: 'otter-riverbank', title: 'Otter Riverbank', description: 'A parent and pup floating along a winding stream.', colors: ['Blue', 'Green'], revised: true },
  { slug: 'turtle-garden', title: 'Turtle Garden', description: 'A slow, sunny journey along a flower-lined path.', colors: ['Green', 'Peach'], revised: true },
  { slug: 'koala-eucalyptus', title: 'Koala Eucalyptus', description: 'A sleepy cuddle in the eucalyptus branches.', colors: ['Neutral', 'Green'] },
  { slug: 'penguin-snowdrift', title: 'Penguin Snowdrift', description: 'A cozy embrace among soft winter hills.', colors: ['Blue', 'Neutral'] },
] as const;

export default function NurseryWorldsPage() {
  return <main className="bg-[#fffaf2] text-[#493d32]">
    <section className="container-x pb-10 pt-12 text-center md:pb-16 md:pt-20">
      <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[#aa7c57]">MimiPip · Hush & Wander collection</p>
      <h1 className="mx-auto max-w-4xl text-4xl leading-tight md:text-6xl">A little world to come home to</h1>
      <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[#6d6257]">Eleven softly painted stories for the nursery wall. Explore each scene in a warm room, look closely at its artwork, then choose the one that feels like home.</p>
      <p className="mx-auto mt-4 max-w-2xl text-xs text-[#81776d]">Illustrative room renders. Furniture and accessories are shown for inspiration.</p>
    </section>
    <section className="container-x grid gap-12 pb-20 md:grid-cols-2 md:gap-x-8 md:gap-y-16" aria-label="Hush and Wander nursery wallpapers">
      {worlds.map((world, index) => {
        const key = `${String(index + 1).padStart(2, '0')}-${world.slug}`;
        const version = 'revised' in world && world.revised ? 'v3' : 'v2';
        return <article key={world.slug} className="overflow-hidden rounded-[28px] bg-white shadow-[0_12px_48px_rgba(86,65,43,0.08)]">
          <Link href={`/products/hush-and-wander-${world.slug}`} aria-label={`Shop ${world.title} wallpaper`}>
            <img src={`/nursery-worlds/${key}-room-${version}.webp`} alt={`${world.title} wallpaper shown on a feature wall in an illustrative lived-in baby nursery`} width={1536} height={1024} loading={index < 2 ? 'eager' : 'lazy'} className="aspect-[3/2] w-full object-cover" />
          </Link>
          <div className="p-5 md:p-7">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a28060]">{String(index + 1).padStart(2, '0')} / 11 · Hush & Wander</p>
            <h2 className="mt-2 text-2xl md:text-3xl">{world.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#6d6257]">{world.description}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs" aria-label={`${world.title} color collections`}>
              <span className="mr-1 text-[#75695e]">Colors</span>
              {world.colors.map(color => <Link key={color} href={`/collections/color-${color.toLowerCase()}`} className="rounded-full border border-[#d9c9b7] px-3 py-1.5 text-[#5c5145] hover:bg-[#f8efe3]">{color}</Link>)}
            </div>
            <figure className="mt-5 overflow-hidden rounded-2xl bg-[#faf4e9]">
              <img src={`/nursery-worlds/${key}-art-${version}.webp`} alt={`${world.title} flat wallpaper artwork`} width={1672} height={941} loading="lazy" className="aspect-[2/1] w-full object-cover" />
              <figcaption className="px-4 py-3 text-xs text-[#75695e]">The artwork, before it meets the room</figcaption>
            </figure>
            <Link href={`/products/hush-and-wander-${world.slug}`} className="mt-5 inline-flex min-h-11 items-center rounded-full bg-[#fa6b48] px-6 py-3 text-sm font-semibold text-white hover:bg-[#d75030]">Shop {world.title} <span aria-hidden="true" className="ml-2">↗</span></Link>
          </div>
        </article>;
      })}
    </section>
    <div className="container-x pb-16 text-center"><Link href="/collections/hush-and-wander" className="inline-flex rounded-full border border-[#a28060] px-7 py-3 text-sm font-semibold text-[#493d32] hover:bg-[#f8efe3]">Shop all Hush & Wander wallpapers</Link></div>
  </main>;
}
