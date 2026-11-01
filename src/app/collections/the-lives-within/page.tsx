
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import Image from "@/components/SiteImage";
import Link from "next/link";
import { BadgeIcon } from "@/components/BadgeIcon";
import { MarketMoney } from "@/components/MarketMoney";
import { getConceptOffers } from "@/lib/office-concept-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = editorialMetadata("/collections/the-lives-within");

  async function TheLivesWithinCollection() {
  const { offers, materialName } = await getConceptOffers("the-lives-within");

  return (
    <main className="container-x py-10 lg:py-16">
      <div className="mx-auto max-w-3xl text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-charcoal px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-surface">
          <BadgeIcon badgeKey="signature" className="h-4 w-4" /> Signature collection
        </span>
        <h1 className="mt-5 font-display text-[clamp(2.5rem,5vw,4.5rem)] leading-tight">The Lives Within</h1>
        <p className="mt-4 text-base leading-relaxed text-slate">
          Nine wall designs for a 10,000 sq ft family apartment in Gurgaon. Choose one wall or bring the rooms together.
        </p>
        <p className="mt-3 font-semibold text-charcoal">{materialName} · <MarketMoney inr={300} />/sq ft · incl. GST</p>
        <p className="mt-2 text-sm text-slate">Each room image is a reference. Final artwork is prepared and proofed for your measured wall before printing.</p>
        <Link href="/concepts/the-lives-within/shop" className="btn mt-6 inline-flex">Choose your walls →</Link>
      </div>

      <div className="mt-12 grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
        {offers.map((offer) => (
          <Link key={offer.handle} href={`/concepts/the-lives-within/shop?design=${encodeURIComponent(offer.handle)}`} className="group overflow-hidden rounded-[22px] border border-edge bg-surface">
            <div className="relative aspect-[16/10] overflow-hidden bg-wash">
              <Image src={offer.roomUrl} alt={`${offer.title} in the ${offer.space.toLowerCase()}`} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
            </div>
            <div className="p-5">
              <p className="caps text-slate">{offer.space}</p>
              <h2 className="mt-2 font-display text-xl font-bold">{offer.title}</h2>
              <p className="mt-2 text-sm font-semibold text-charcoal"><MarketMoney inr={offer.rate} />/sq ft</p>
              <p className="mt-3 text-sm text-slate">Room reference · artwork proofed before printing</p>
              <span className="mt-4 inline-block text-sm font-semibold">Choose this wall →</span>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}

export default withBrandEditorial("/collections/the-lives-within", TheLivesWithinCollection);
