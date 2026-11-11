import Link from 'next/link';

/** Real studio photos; the owner confirmed these use MimiPip's wallpaper material. */
export function MimiMaterialPhotos() {
  return <section id="real-print-closeups" className="my-10 scroll-mt-28" aria-labelledby="material-photos-title">
    <h2 id="material-photos-title" className="text-2xl font-semibold">See the wallpaper up close</h2>
    <p className="my-3 leading-relaxed">Real photographs of the self-adhesive wallpaper used for MimiPip. The studio sample designs shown here illustrate the material; choose your artwork from our collections.</p>
    <div className="grid gap-5 sm:grid-cols-2">
      <figure>
        <a href="/materials/self-adhesive-floral-detail.jpg" target="_blank" rel="noopener noreferrer" aria-label="View the floral wallpaper sample photograph at full size">
          <img src="/materials/self-adhesive-floral-detail.jpg" alt="Real floral wallpaper sample on the studio printer, showing colour and surface detail" width="1600" height="900" loading="lazy" className="aspect-[4/3] w-full rounded-xl object-cover" />
        </a>
        <figcaption className="mt-2 text-sm text-slate">Floral sample: colour and surface detail. Tap to enlarge.</figcaption>
      </figure>
      <figure>
        <a href="/materials/self-adhesive-foliage-detail.jpg" target="_blank" rel="noopener noreferrer" aria-label="View the foliage wallpaper sample photograph at full size">
          <img src="/materials/self-adhesive-foliage-detail.jpg" alt="Real foliage wallpaper sample on the studio printer, showing fine artwork detail" width="1200" height="1600" loading="lazy" className="aspect-[4/3] w-full rounded-xl object-cover" />
        </a>
        <figcaption className="mt-2 text-sm text-slate">Foliage sample: fine artwork detail. Tap to enlarge.</figcaption>
      </figure>
    </div>
    <p className="mt-4 text-sm leading-relaxed">Colour varies with your screen and room lighting. For a closer look before choosing, order a sample from your chosen wallpaper’s page.</p>
    <Link href="/browse/collection" className="mt-3 inline-block underline">Choose a wallpaper</Link>
  </section>;
}
