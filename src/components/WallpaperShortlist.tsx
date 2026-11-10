"use client";

import Link from "next/link";
import type { ProductCardData } from "@/lib/types";
import { CollectionProductCard } from "@/components/CollectionProductCard";
import { ContactForm } from "@/components/ContactForm";
import { useMarket } from "@/components/MarketProvider";
import { installationTotal, INSTALL_CITIES_LABEL } from "@/lib/pricing";
import { SAMPLE_UNIT_INR } from "@/components/OrderSample";
import { formatMarketMoney } from "@/lib/markets";
import { storeWhatsappHref } from "@/lib/whatsapp";
import { trackWhatsappClick } from "@/components/WhatsAppButton";

export function WallpaperShortlist({ products }: { products: ProductCardData[] }) {
  const { market } = useMarket();
  const rates = products.map(p => p.fromPricePerSqft ?? 0).filter(r => r > 0);
  const startingRate = rates.length ? Math.min(...rates) : null;
  const india = market.countryCode === "IN";
  const whatsapp = storeWhatsappHref("Hi MimiPip, I'd like help choosing and ordering wallpaper from https://mimipip.com/shop-wallpaper. My city and approximate wall size are: ");
  return <div className="container-x py-6 md:py-12">
    <header className="max-w-3xl">
      <p className="caps text-slate">Wallpaper for your home</p>
      <h1 className="mt-3 text-[clamp(1.8rem,4vw,3.25rem)] leading-tight">Wallpaper, made for your wall.</h1>
      <p className="mt-3 text-slate">A small edit. Clear prices. Design samples to help you decide.</p>
      {india && startingRate != null && <p className="mt-3 text-sm font-semibold">From {formatMarketMoney(startingRate, "INR")}/sq ft · Design samples {formatMarketMoney(SAMPLE_UNIT_INR, "INR")} · Free delivery across India</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <a href="#designs" className="btn min-h-11 px-4 text-sm">Choose a design</a>
        <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn btn-ghost min-h-11 px-4 text-sm" onClick={() => trackWhatsappClick("wallpaper-shortlist")}>Ask for sizing help</a>
      </div>
    </header>

    <section id="designs" aria-label="Wallpaper shortlist" className="mt-8 scroll-mt-28">
      {products.length ? <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 md:gap-x-6">
        {products.map(product => <CollectionProductCard key={product.handle} product={product} buyingActions />)}
      </div> : <p>Explore the current range in <Link href="/collections/wall-art" className="underline">all wallpapers</Link>, or ask us for a shortlist below.</p>}
      <p className="mt-5 text-xs text-slate">Room images show design visualisations. A design sample helps you judge the colour and finish in your own light.</p>
    </section>

    <section aria-labelledby="ordering-help" className="mt-12 grid gap-6 border-t border-edge pt-8 md:grid-cols-3">
      <div><h2 id="ordering-help" className="font-display text-xl">Know the whole plan</h2><p className="mt-2 text-sm text-slate">Enter your wall size on a design page to see its exact price. Review the crop and surface before adding it to your cart.</p></div>
      <div><h3 className="font-semibold">Installation</h3><p className="mt-2 text-sm text-slate">{india ? `For a 10 × 8 ft wall, professional fitting adds ${formatMarketMoney(installationTotal(80), "INR")} in ${INSTALL_CITIES_LABEL}. Elsewhere, ask us about arranging your installer.` : "Ask us about installation arrangements for your location before ordering."}</p></div>
      <div><h3 className="font-semibold">See what you’re choosing</h3><p className="mt-2 text-sm text-slate"><Link href="/materials" className="underline">Explore surfaces</Link> and see the feel of each design.</p></div>
    </section>

    <section aria-labelledby="wall-advice" className="mt-10 max-w-xl rounded-2xl border border-edge p-5 md:p-7">
      <h2 id="wall-advice" className="font-display text-2xl">Not sure where to start?</h2>
      <p className="mt-2 text-sm text-slate">Tell us your city, the design you like and your approximate wall size, if you know it. We can help you work out the next step.</p>
      <ContactForm initialMessage="Please help me choose and order wallpaper from your shortlist. " />
    </section>
    <nav aria-label="More wallpaper options" className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm underline">
      <Link href="/collections/wall-art">Browse all wallpapers</Link>
      <Link href="/print-your-own">Print your own image</Link>
      <Link href="/design-with">Find designs for my room</Link>
    </nav>
  </div>;
}
