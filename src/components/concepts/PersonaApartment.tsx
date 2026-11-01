import Link from "next/link";
import Image from "@/components/SiteImage";
import type { PersonaApartment as Apartment } from "@/content/persona-apartments";
import { mediaUrl } from "@/lib/project-media";

export function PersonaApartment({ home }: { home: Apartment }) {
  const path = `/concepts/${home.slug}`;
  return <section className="container-x py-10 sm:py-14">
    <Link href="/concepts?space=homes&bedrooms=2" className="text-sm underline underline-offset-4">← 2-bedroom home concepts</Link>
    <header className="mt-8 max-w-3xl">
      <p className="caps text-slate">A 2-bedroom Bombay apartment</p>
      <h1 className="mt-3 text-[clamp(2.5rem,6vw,4.8rem)]">{home.title}</h1>
      <p className="mt-5 text-lg text-slate">{home.description}</p>
      <p className="mt-4 text-slate">{home.story}</p>
      <p className="mt-4 text-sm text-slate">Choose one wall or bring the rooms together. Wallpaper only; furniture and styling are not included. Room images are design visualisations.</p>
      <Link href={`${path}?shop=1`} className="mt-6 inline-flex rounded-lg bg-charcoal px-5 py-3 text-sm font-semibold text-white">Choose your walls →</Link>
    </header>
    <div className="mt-12 space-y-16">
      {home.rooms.map((room, index) => <section key={room.key} aria-labelledby={`${room.key}-title`}>
        <p className="caps text-slate">0{index + 1} · {room.name}</p>
        <h2 id={`${room.key}-title`} className="mt-2 text-3xl sm:text-4xl">{room.title}</h2>
        <p className="mt-3 max-w-2xl text-slate">{room.note}</p>
        <div className="relative mt-6 aspect-[3/2] overflow-hidden rounded-2xl bg-wash">
          <Image src={mediaUrl(room.room)} alt={`${room.name} — ${room.title} wallpaper in ${home.title}`} fill priority={index === 0} sizes="(max-width: 768px) 100vw, 1200px" className="object-contain object-bottom" />
        </div>
        <details className="mt-4 rounded-xl border border-edge p-4 sm:p-6">
          <summary className="cursor-pointer font-semibold">View the wallpaper · {room.title}</summary>
          <div className="relative mt-4 aspect-[3/2] max-w-3xl overflow-hidden rounded-lg bg-wash">
            <Image src={mediaUrl(room.artwork)} alt={`${room.title} — flat wallpaper artwork`} fill sizes="(max-width: 768px) 100vw, 768px" className="object-contain" />
          </div>
        </details>
        <Link href={`${path}?shop=1&design=${encodeURIComponent(room.name)}`} className="mt-5 inline-flex rounded-lg border border-charcoal px-5 py-3 text-sm font-semibold">Choose this wallpaper →</Link>
      </section>)}
    </div>
    <Link href={`${path}?shop=1`} className="mt-12 inline-flex rounded-lg bg-charcoal px-5 py-3 text-sm font-semibold text-white">Size your walls →</Link>
  </section>;
}
