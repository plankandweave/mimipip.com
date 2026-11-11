import Link from 'next/link';

/** Illustrative design previews, never physical-print or material evidence. */
export function MimiMaterialPhotos() {
  return <section id="real-print-closeups" className="my-10 scroll-mt-56" aria-labelledby="material-photos-title">
    <h2 id="material-photos-title" className="text-2xl font-semibold">Explore the designs up close</h2>
    <p className="my-3 leading-relaxed">Sunny petals and little garden stories. Take a closer look at two MimiPip favourites.</p>
    <div className="grid gap-5 sm:grid-cols-2">
      <figure>
        <a href="/materials/happy-petals-illustrative-preview.webp" target="_blank" rel="noopener noreferrer" aria-label="Enlarge the Happy Petals illustrative preview">
          <img src="/materials/happy-petals-illustrative-preview.webp" alt="Illustrative Happy Petals wallpaper preview with yellow flowers, peach hearts and green leaves" width="1440" height="1080" loading="lazy" className="aspect-[4/3] w-full rounded-xl object-cover" />
        </a>
        <figcaption className="mt-3 text-sm"><Link className="underline" href="/products/happy-petals-sunny-yellow">Happy Petals · Sunny Yellow</Link><p className="mt-1 text-slate">Soft yellow flowers, peach hearts and leafy greens.</p></figcaption>
      </figure>
      <figure>
        <a href="/materials/bunny-garden-illustrative-preview.webp" target="_blank" rel="noopener noreferrer" aria-label="Enlarge the Bunny Garden illustrative preview">
          <img src="/materials/bunny-garden-illustrative-preview.webp" alt="Illustrative Bunny Garden wallpaper preview with uncoloured bunnies, flowers and butterflies" width="1440" height="1080" loading="lazy" className="aspect-[4/3] w-full rounded-xl object-cover" />
        </a>
        <figcaption className="mt-3 text-sm"><Link className="underline" href="/products/colour-create-bunny-garden">Bunny Garden</Link><p className="mt-1 text-slate">Flowers, butterflies and bunnies, ready for their colours.</p></figcaption>
      </figure>
    </div>
    <p className="mt-4 text-sm leading-relaxed text-slate">Illustrative previews created from our designs. Order a physical sample from your chosen wallpaper’s page to check colour and finish in your room.</p>
    <Link href="/browse/collection" className="mt-3 inline-block underline">Choose a wallpaper</Link>
  </section>;
}
