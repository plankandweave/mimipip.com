
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import { marketLanding, marketPriceLabel } from "@/lib/market-seo";
import { inMarket } from "@/components/MarketLanding";
import { MarketMoney } from "@/components/MarketMoney";
import Link from "next/link";
import { EnquiryForm } from "@/components/EnquiryForm";
import { BespokeAddOn } from "@/components/BespokeAddOn";
import { BESPOKE_PRICE } from "@/lib/pricing";

/**
 * The fee is quoted in the currency of whichever country's page this is —
 * `?market=US` is the American version, the clean URL is India's.
 */
 async function buildPageMetadata({
  searchParams,
}: {
  searchParams?: Promise<{ market?: string }>;
}): Promise<Metadata> {
  const { countryCode, alternates } = marketLanding("/bespoke", (await searchParams)?.market);
  return {
    title: "Bespoke Murals",
    description: `Original murals designed to your brief — ${marketPriceLabel(BESPOKE_PRICE, countryCode)} per design, whatever the wall size. A design service by Zyvorah; the wallpaper itself is ordered separately.`,
    alternates,
  };
}

const STEPS = [
  ["01", "Brief & references", "Share your space, the mood you want, any references or a palette. We'll ask a few questions to get it right."],
  ["02", "Concept & quote", "Our designers propose a direction and a clear quotation before any detailed work begins."],
  ["03", "Design & proofs", "We create the artwork and share proofs. You review and refine until it's exactly right."],
  ["04", "Make & deliver", "We make your approved design to your wall's exact size and dispatch it with a fitting guide."],
];

export default async function BespokePage({
  searchParams,
}: {
  searchParams?: Promise<{ market?: string }>;
}) {
  const { landingCountryCode } = marketLanding("/bespoke", (await searchParams)?.market);
  const page = (
    <div>
      <div className="mx-4 mt-4 rounded-[32px] bg-blush/40 lg:mx-6">
        <div className="container-x py-14 text-center">
          <span className="caps text-slate">Design service</span>
          <h1 className="mt-3 text-[clamp(2.2rem,4.5vw,3.4rem)] leading-tight">Bespoke murals, made to your brief</h1>
          <p className="mx-auto mt-4 max-w-xl text-slate">
            When the catalogue isn&apos;t quite it, our designers create an original mural for you —
            your story and palette, scaled to your exact wall.
          </p>
          <p className="mx-auto mt-5 max-w-xl">
            <span className="font-display text-2xl font-bold text-charcoal">
              <MarketMoney inr={BESPOKE_PRICE} />
            </span>{" "}
            <span className="text-slate">per design, whatever the wall size</span>
            <span className="mt-1 block text-xs text-mist">
              A design service — the wallpaper itself is ordered separately, per sq ft.
            </span>
          </p>
          <a href="#book" className="btn mt-7 inline-flex h-12 px-6 text-[0.82rem]">Book a bespoke design</a>
        </div>
      </div>

      <section className="container-x py-16">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { t: "Designed for you", d: "Not a stock design — an original artwork developed to your brief, room and story." },
            { t: "Your palette, your scale", d: "Colours tuned to your interiors and the design composed for your wall's proportions." },
            { t: "Proofed before we make it", d: "You see and approve proofs before anything is made. No surprises." },
          ].map((c) => (
            <div key={c.t} className="rounded-[22px] bg-wash p-6">
              <p className="font-display text-lg font-bold">{c.t}</p>
              <p className="mt-2 text-sm text-slate">{c.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container-x pb-16">
        <h2 className="text-2xl lg:text-3xl">How it works</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([n, t, d]) => (
            <div key={n} className="rounded-[22px] border border-edge p-6">
              <p className="font-display text-2xl font-extrabold text-charcoal">{n}</p>
              <p className="mt-2 font-semibold">{t}</p>
              <p className="mt-1 text-sm text-slate">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container-x pb-16">
        <div className="pastel-section grid items-center gap-8 bg-lavender/40 md:grid-cols-[1.3fr_1fr]">
          <div>
            <span className="caps text-slate">Already have artwork?</span>
            <h2 className="mt-3 text-2xl lg:text-3xl">Your own image vs. bespoke</h2>
            <p className="mt-4 max-w-lg text-slate">
              If you already have the artwork, <Link href="/print-your-own" className="link-underline">Your Own Image</Link>{" "}
              makes your file to your wall size. Bespoke is for when you want us to{" "}
              <em>design</em> the mural for you from a brief. Not sure where to start? The{" "}
              <Link href="/design-with" className="link-underline">Zyvorah Curator</Link> can help you find a direction.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/print-your-own" className="btn btn-ghost text-sm">Your own image</Link>
            <Link href="/design-with" className="btn btn-ghost text-sm">Ask the Curator</Link>
          </div>
        </div>
      </section>

      {/* book it — a service bought by the number of designs, not by wall area */}
      <section id="book" className="container-x pb-16">
        <div className="mx-auto max-w-lg">
          <h2 className="text-2xl lg:text-3xl">Book a bespoke design</h2>
          <p className="mt-3 text-slate">
            <MarketMoney inr={BESPOKE_PRICE} /> per design, whatever the size of the wall. Choose how many
            designs you need, tell us the brief, and our studio starts from there.
          </p>

          <div className="mt-5 rounded-[18px] bg-sage/30 p-5 text-sm text-slate">
            <p className="font-semibold text-charcoal">What this covers — and what it doesn&apos;t</p>
            <ul className="mt-2 grid gap-1.5">
              <li>✓ Original design work to your brief, proofed with you before anything is made.</li>
              <li>✓ One price per design, whatever the wall measures.</li>
              <li>
                ✗ <span className="text-charcoal">Not</span> the wallpaper itself — you order that
                separately, per sq ft, once the design is approved.
              </li>
              <li>
                ✗ Unusually complicated artwork may cost more — we tell you the charge before starting,
                never after.
              </li>
            </ul>
          </div>

          <div className="mt-5">
            <BespokeAddOn variant="standalone" forHandle="" forTitle="your brief" />
          </div>
        </div>
      </section>

      <section id="enquire" className="container-x pb-20">
        <div className="mx-auto max-w-lg">
          <h2 className="text-2xl lg:text-3xl">Rather talk it through first?</h2>
          <p className="mt-3 text-slate">
            If your project is large or you&apos;re not sure what you need, tell us what you have in
            mind and we&apos;ll propose a direction and a quote before you pay anything. Prefer email?
            Write to <a href="mailto:hello@zyvorah.com" className="link-underline">hello@zyvorah.com</a> with
            &ldquo;Bespoke&rdquo; in the subject.
          </p>
          <div className="mt-6">
            <EnquiryForm
              topic="Bespoke design"
              orgLabel="Company / brand (optional)"
              detailsPlaceholder="The space, the story or theme, your palette, wall size, and any references…"
              submitLabel="Send bespoke enquiry"
            />
          </div>
        </div>
      </section>
    </div>
  );
  return inMarket(landingCountryCode, page);
}

export const generateMetadata = withBrandMetadata(buildPageMetadata);
