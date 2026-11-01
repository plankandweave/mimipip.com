
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/seo";
import { countAmazonListings, AMAZON_STOREFRONT_URL } from "@/lib/marketplace-availability";
import { AUTOGRAPH_LABEL } from "@/lib/pricing";

const title = "Where to buy Zyvorah — Amazon, Pepperfry & HomeLane";
const description =
  "Zyvorah wallpapers are sized to your wall on zyvorah.com, and a selection of fixed-size designs is available on Amazon India. Pepperfry and HomeLane are coming soon.";

export const metadata: Metadata = editorialMetadata("/where-to-buy");

// The live-listing count is read from the database, so this page cannot drift
// into claiming a channel carries more (or fewer) designs than it does.
export const revalidate = 3600;

type Channel = {
  name: string;
  status: "live" | "coming-soon";
  /** What a customer gets there, said plainly. */
  blurb: string;
  href?: string;
  cta?: string;
};

  async function WhereToBuyPage() {
  const amazonCount = await countAmazonListings();

  const channels: Channel[] = [
    {
      name: "Amazon India",
      status: "live",
      blurb:
        amazonCount > 0
          ? `Available now. ${amazonCount} of our designs are listed on Amazon in fixed sizes — prepared for your order, like everything we make, with Amazon checkout and delivery. If you already shop there, it is an easy way to buy a Zyvorah.`
          : "Available now. A selection of our designs is listed on Amazon in fixed sizes — prepared for your order, like everything we make, with Amazon checkout and delivery.",
      href: AMAZON_STOREFRONT_URL,
      cta: "Shop Zyvorah on Amazon",
    },
    {
      name: "Pepperfry",
      status: "coming-soon",
      blurb:
        "Coming soon. Our catalogue is being prepared for Pepperfry's marketplace. Nothing is listed there yet — if you see Zyvorah designs on Pepperfry today, they are not ours.",
    },
    {
      name: "HomeLane",
      status: "coming-soon",
      blurb:
        "Coming soon. We are working with HomeLane so their design consultants can specify Zyvorah wallpaper directly into a room plan.",
    },
  ];

  return (
    <main className="mx-auto max-w-4xl px-5 py-14 sm:py-20">
      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-slate">
        Where to buy
      </p>
      <h1 className="mt-3 text-[clamp(2rem,4vw,3rem)] leading-tight">
        Buy Zyvorah where it suits you
      </h1>
      <p className="mt-5 max-w-2xl text-base leading-relaxed text-charcoal">
        Every Zyvorah design is sized to your wall here on zyvorah.com — you give us the
        wall, we print to the centimetre. A selection of designs is also sold in fixed
        sizes on Amazon, and more channels are on the way.
      </p>

      <div className="mt-10 space-y-5">
        {channels.map((c) => (
          <section
            key={c.name}
            className="rounded-[20px] border border-charcoal/10 bg-surface p-6"
          >
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl">{c.name}</h2>
              <span
                className={
                  c.status === "live"
                    ? "rounded-full bg-sage px-3 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-charcoal"
                    : "rounded-full bg-lavender/60 px-3 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-charcoal"
                }
              >
                {c.status === "live" ? "Available now" : "Coming soon"}
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-charcoal">{c.blurb}</p>
            {c.href && c.cta && (
              <a
                href={c.href}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 rounded-full border border-charcoal/25 px-4 py-2 text-sm font-semibold text-charcoal transition-colors hover:bg-charcoal hover:text-surface"
              >
                {c.cta}
                <span aria-hidden="true">→</span>
              </a>
            )}
          </section>
        ))}
      </div>

      {/* The honest trade-off. A customer choosing a channel should know what
          they give up, rather than discovering it after the parcel arrives. */}
      <section className="mt-12 rounded-[20px] bg-charcoal/[0.04] p-6">
        <h2 className="text-xl">What changes by where you buy</h2>
        <ul className="mt-4 space-y-3 text-sm leading-relaxed text-charcoal">
          <li>
            <strong>On zyvorah.com</strong> — any wall size, priced per square foot, with
            our visualiser, A4 design samples, and professional installation where we
            offer it. This is the full range.
          </li>
          <li>
            <strong>On a marketplace</strong> — a fixed set of designs in fixed sizes,
            with that marketplace&apos;s own delivery and returns. Wall-sized mural wallpaper is not
            available there.
          </li>
          <li>
            <strong>{AUTOGRAPH_LABEL} designs</strong> — our premium series with a linen feel. Each design shows its own price, including tax. These are sold <strong>only on zyvorah.com</strong> and will never
            appear on Amazon, Pepperfry or HomeLane.
          </li>
        </ul>
        <Link
          href="/collections"
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-charcoal px-5 py-2.5 text-sm font-semibold text-surface transition-opacity hover:opacity-90"
        >
          Browse the full collection
          <span aria-hidden="true">→</span>
        </Link>
      </section>
    </main>
  );
}

export default withBrandEditorial("/where-to-buy", WhereToBuyPage);
