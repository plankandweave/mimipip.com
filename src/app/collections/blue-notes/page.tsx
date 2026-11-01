
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "@/components/SiteImage";
import { MarketMoney, MarketPricingNote } from "@/components/MarketMoney";
import { inMarket } from "@/components/MarketLanding";
import { JsonLd } from "@/components/JsonLd";
import { getProductsByTag } from "@/lib/queries";
import { marketLanding, marketPriceLabel, deliveryPitch, HOME_MARKET } from "@/lib/market-seo";
import { BLUE_NOTES_DESIGNS, BLUE_NOTES_RATE } from "@/lib/blue-notes";
import { DesignGallery } from "./DesignGallery";
import "./blue-notes.css";

export const revalidate = 3600;
type Props = { searchParams: Promise<{ market?: string }> };
const route = "/collections/blue-notes";
const introduction = "Eleven abstract wallpapers in deep blue, warm ivory and soft blush. Expressive curves, wandering lines and a beautiful linen feel, made for spaces with a point of view.";

 async function inheritedGenerateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { market } = await searchParams;
  const { countryCode, alternates } = marketLanding(route, market);
  const description = `${introduction} ${marketPriceLabel(BLUE_NOTES_RATE, countryCode)}/sq ft, sized to your wall. ${countryCode === HOME_MARKET ? "GST included." : deliveryPitch(countryCode)}`;
  return { title: "Blue Notes — Abstract Wallpaper Collection", description, alternates,
    openGraph: { title: "Blue Notes · Zyvorah", description, url: alternates.canonical as string, images: [{ url: BLUE_NOTES_DESIGNS[0].rooms[1].url, width: 1536, height: 1024, alt: "Indigo Orbit in a private lift lobby" }] },
    twitter: { card: "summary_large_image", title: "Blue Notes · Zyvorah", description, images: [BLUE_NOTES_DESIGNS[0].rooms[1].url] } };
}

  async function BlueNotesPage({ searchParams }: Props) {
  const { market } = await searchParams;
  const { landingCountryCode } = marketLanding(route, market);
  const products = await getProductsByTag("Blue Notes", 24);
  const active = new Map(products.map(p => [p.handle, p]));
  const designs = BLUE_NOTES_DESIGNS.filter(d => active.has(d.handle));
  return inMarket(landingCountryCode, <div className="blue-notes">
    <JsonLd data={{ "@context": "https://schema.org", "@type": "CollectionPage", name: "Blue Notes", description: introduction, url: `https://zyvorah.com${route}`, mainEntity: { "@type": "ItemList", numberOfItems: designs.length, itemListElement: designs.map((d, i) => ({ "@type": "ListItem", position: i + 1, name: d.name, url: `https://zyvorah.com/products/${d.handle}` })) } }} />
    <section className="bn-opening">
      <div className="bn-edition"><Link href="/collections">Collections</Link><span>11 wallpapers</span></div>
      <h1>blue notes</h1>
      <figure className="bn-cover">
        <Image src={BLUE_NOTES_DESIGNS[0].rooms[1].url} alt="Indigo Orbit in a private lift lobby" width={1536} height={1024} priority sizes="100vw" />
        <figcaption><span>01 — Indigo Orbit</span><a href="#the-designs">Explore collection <span aria-hidden>↓</span></a></figcaption>
      </figure>
    </section>

    <section className="bn-introduction" aria-label="About Blue Notes">
      <p>Studies in ink, movement and balance. Eleven abstract wallpapers with a beautiful linen feel.</p>
      <div><p><MarketMoney inr={BLUE_NOTES_RATE} /> / sq ft</p><span>Original mural designs</span></div>
    </section>

    <section id="the-designs" className="bn-designs" aria-label="The eleven designs">
      {/* Every card opens on a room render (DesignGallery starts at rooms[0]);
          the flat is only a tap on "Artwork". Stamped for
          scripts/verify-index-pages.mjs, which reads every collection page. */}
      <div className="bn-gallery" data-flat-cards="">
        {designs.map(design => <DesignGallery key={design.handle} design={design} rate={active.get(design.handle)!.fromPricePerSqft ?? BLUE_NOTES_RATE} />)}
      </div>
      {designs.length === 0 && <p>The collection is being prepared. Please check back shortly.</p>}
    </section>
    <footer className="bn-end"><span>Blue Notes · Zyvorah</span><MarketPricingNote india="GST included · Free delivery across India" /><a href="#the-designs">Back to designs ↑</a></footer>
  </div>);
}

export default withBrandEditorial("/collections/blue-notes", BlueNotesPage);
export function generateMetadata() { return editorialMetadata("/collections/blue-notes"); }
