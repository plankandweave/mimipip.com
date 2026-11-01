"use client";

import Image from "@/components/SiteImage";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { APARTMENT_SHOPPING, type ApartmentSlug } from "@/lib/apartment-shopping";
import { ProductCard } from "@/components/ProductCard";
import type { ProductCardData } from "@/lib/types";
import { mediaUrl } from "@/lib/project-media";
import { TaashFilm } from "@/components/TaashFilm";
// Type only: site-films reads the database and must stay out of the client bundle.
import type { SiteFilm } from "@/lib/site-films";

type Room = { name: string; before: string; after: string; note: string };

function SwipeRoom({ room, product, exact }: { room: Room; product?: ProductCardData; exact: boolean }) {
  const frame = useRef<HTMLDivElement>(null);
  const [split, setSplit] = useState(52);
  const move = useCallback((x: number) => {
    const box = frame.current?.getBoundingClientRect();
    if (box) setSplit(Math.max(0, Math.min(100, ((x - box.left) / box.width) * 100)));
  }, []);
  return <article className="overflow-hidden rounded-[22px] border border-edge bg-surface">
    <div ref={frame} className="relative aspect-[680/564] touch-pan-y select-none overflow-hidden cursor-ew-resize" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); move(e.clientX); }} onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) move(e.clientX); }}>
      <Image src={mediaUrl(room.before)} alt={`${room.name}, before wallpaper`} fill className="object-cover" sizes="(max-width: 768px) 100vw, 50vw" draggable={false} />
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}><Image src={mediaUrl(room.after)} alt={`${room.name}, with wallpaper`} fill className="object-cover" sizes="(max-width: 768px) 100vw, 50vw" draggable={false} /></div>
      <div className="pointer-events-none absolute inset-y-0 w-px bg-white shadow-[0_0_0_1px_rgba(0,0,0,.16)]" style={{ left: `${split}%` }}><span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white px-2 py-1 text-xs shadow">↔</span></div>
      <span className="absolute bottom-3 left-3 rounded-full bg-white/90 px-3 py-1 text-[.65rem] font-semibold uppercase tracking-wide">Drag to compare</span>
    </div>
    <div className="p-5"><h2 className="font-display text-xl font-semibold">{room.name}</h2><p className="mt-2 text-sm text-slate">{room.note}</p>{product && <Link href={`/products/${product.handle}`} className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">{exact ? `Shop this wallpaper: ${product.title} →` : `Shop a similar design: ${product.title} →`}</Link>}</div>
  </article>;
}

const rooms = (slug: ApartmentSlug): Room[] => {
  const raat = slug === "raat-bagh";
  const modernist = slug === "extreme-modernist";
  const newYork = slug === "new-york-apartment";
  const afterExt = raat || modernist ? "png" : "jpg";
  return [
  { name: "Living & dining", before: `${slug}/before-living-dining.png`, after: `${slug}/after-living-dining.${afterExt}`, note: newYork ? "Weathered paper, black geometry and cobalt make the social wall feel downtown and editorial." : modernist ? "Cobalt, rust and chalk make the social wall feel architectural." : raat ? "A night garden gives the social room its depth." : "A coastal mural meets the Bandstand horizon." },
  { name: "Master bedroom", before: `${slug}/before-primary-bedroom.png`, after: `${slug}/after-primary-bedroom.${afterExt}`, note: newYork ? "Ink-black structure and a concentrated oxblood field give the bedroom a graphic calm." : modernist ? "A monumental graphite arc brings controlled drama to rest." : raat ? "A framed aubergine garden makes the room more intimate." : "A softer woven horizon settles the private room." },
  { name: "Second bedroom / study", before: `${slug}/before-study.png`, after: `${slug}/after-study.${afterExt}`, note: newYork ? "A cobalt cut through the paper collage gives the hybrid room a decisive identity." : modernist ? "Cobalt geometry gives the hybrid room its decisive edge." : raat ? "Dense botanicals turn the hybrid room into a retreat." : "Stepwell geometry brings quiet rhythm to work and guests." },
  { name: "Foyer & passage", before: `${slug}/before-foyer.png`, after: `${slug}/after-foyer.${afterExt}`, note: newYork ? "Abstract transit lines and a red circle turn arrival into an editorial threshold." : modernist ? "A graphic threshold sets the tone on arrival." : raat ? "A Tree of Life makes arrival feel ceremonial." : "A botanical threshold begins the home’s sea-to-courtyard story." },
];
};

export function ApartmentConcept({ slug, products, film = null }: { slug: ApartmentSlug; products: ProductCardData[]; film?: SiteFilm | null }) {
  const raat = slug === "raat-bagh";
  const modernist = slug === "extreme-modernist";
  const newYork = slug === "new-york-apartment";
  const exact = slug === "angan-by-the-sea";
  const title = newYork ? "The New York Apartment" : modernist ? "Extreme Modernist" : raat ? "Raat Bagh" : "Aangan by the Sea";
  const description = newYork ? "Downtown sophistication for a compact Bandra home: graphic, editorial and metropolitan, without the clichés." : modernist ? "A clean, architectural Mumbai home of graphite, mineral grey, cobalt and rust: bold art, disciplined proportion and no decorative noise." : raat ? "A richly layered, traditionally Indian home: collected furniture, nocturnal gardens and ornamental borders." : "A contemporary Indian home overlooking the sea, shaped by courtyards, monsoon horizons and handloom rhythm.";
  const roomList = rooms(slug);
  const heroRoom = roomList[0]!;
  const filmEl = film ? <TaashFilm src={film.src} poster={film.poster} title={film.title} film={film} style={{ aspectRatio: `${film.width} / ${film.height}` }} className={`mx-auto w-full rounded-[22px] shadow-[0_20px_50px_rgba(0,0,0,0.2)] ${film.height > film.width ? "max-w-[340px]" : ""}`} /> : null;
  // Phone first (AGENTS.md). This page is where the YouTube and Instagram ads
  // land, and on a phone it used to open on words alone — headline, two
  // paragraphs, a button — with the film a screen down and the wallpapers four
  // full-width comparisons further. 9 Oct 2026: of 107 Google Ads visitors,
  // 97 left without touching anything. So on a phone the home itself leads
  // (the finished living room, uncropped at its own 680:564), the four
  // wallpapers and their prices follow straight after the title, and the room
  // comparisons come next. The film the visitor has usually just watched as
  // the ad moves below them; on a laptop it keeps its place beside the title.
  return <section className="container-x py-8 sm:py-14"><Link href="/concepts" className="inline-flex min-h-10 items-center text-sm underline underline-offset-4">All concepts</Link>
    <div className="relative mt-4 aspect-[680/564] overflow-hidden rounded-[22px] md:hidden"><Image src={mediaUrl(heroRoom.after)} alt={`${title}: ${heroRoom.name.toLowerCase()} with wallpaper`} fill priority className="object-cover" sizes="100vw" /></div>
    <div className={film ? "mt-6 grid gap-8 md:mt-8 md:grid-cols-[minmax(0,1fr)_minmax(0,340px)] md:items-center" : "mt-6 md:mt-8"}><div><p className="caps text-slate">2-bedroom apartment · Mumbai</p><h1 className="mt-3 text-[clamp(2.25rem,6vw,4.8rem)]">{title}</h1><p className="mt-3 max-w-2xl text-base text-slate sm:mt-4 sm:text-lg">{description}</p><Link href="#shop-wallpapers" className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-[#176856] px-5 py-3 text-sm font-semibold text-white sm:mt-6">{exact ? "Shop the four wallpapers →" : "Shop wallpapers for this look →"}</Link></div>{filmEl && <div className="hidden md:block">{filmEl}</div>}</div>
    <section id="shop-wallpapers" className="scroll-mt-28 mt-10 border-t border-edge pt-8 sm:mt-12 sm:pt-10" aria-labelledby="shop-wallpapers-heading">
      <h2 id="shop-wallpapers-heading" className="text-2xl">{exact ? "The four wallpapers in this home" : "Shop wallpapers for this look"}</h2>
      <p className="mt-3 max-w-2xl text-sm text-slate">{exact ? "In room order. Choose one to see the price for your wall, enter your wall size and buy it sized to your wall." : "Available designs inspired by this home’s colours and mood; the exact wallpapers pictured are not currently in the shop. Choose a design to see prices, select your wall size and shop."}</p>
      {products.length > 0 && <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 sm:mt-8 sm:gap-y-10 lg:grid-cols-4">{products.map((product) => <ProductCard key={product.handle} product={product} />)}</div>}
    </section>
    <section className="mt-12 border-t border-edge pt-8 sm:pt-10" aria-labelledby="rooms-heading">
      <h2 id="rooms-heading" className="text-2xl">Room by room</h2>
      <p className="mt-3 max-w-2xl text-sm text-slate">Concept study · Drag each divider to compare the room before and after.</p>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">{roomList.map((room, index) => <SwipeRoom key={room.name} room={room} exact={exact} product={products.find((p) => p.handle === APARTMENT_SHOPPING[slug][index])} />)}</div>
    </section>
    {filmEl && <div className="mt-12 md:hidden">{filmEl}</div>}
    <Link href="/collections/wall-art" className="mt-8 inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">Explore more wallpapers →</Link>
  </section>;
}
