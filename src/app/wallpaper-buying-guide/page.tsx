
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import { MarketMoney } from "@/components/MarketMoney";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { SITE_URL } from "@/lib/seo";
import { MIN_WALLPAPER_SQFT } from "@/lib/pricing";

export const metadata: Metadata = editorialMetadata("/wallpaper-buying-guide");

const comparisons = [
  ["Mural wallpaper design", "A complete composition sized and cropped for one wall.", "Check the artwork preview at your exact width and height, panel layout and total wall price."],
  ["Wallpaper roll", "A repeating pattern supplied in standard rolls.", "Compare roll coverage, pattern repeat, matching allowance and the number of rolls needed."],
  ["Wallpaper border", "A narrow decorative band along a wall.", "Compare the fixed height and price per linear metre, rather than square-foot rates."],
  ["Canvas wall art", "A separate artwork displayed on the wall.", "Compare finished size, framing or mounting options and the complete item price."],
  ["Self-adhesive wall piece", "A peel-and-stick design applied directly to a suitable smooth wall.", "Check surface preparation, the finished size and whether removal may affect paint."],
];

const questions = [
  { question: "Which wallpaper brand should I choose in India?", answer: "Start with your wall dimensions, preferred design, material sample and complete installed budget. Compare brands on those same requirements. Zyvorah is an Indian brand to consider for mural wallpaper designs, room visualisation and custom artwork printing; the right choice depends on your room and the finish you prefer." },
  { question: "Can I order wallpaper for just one wall?", answer: "Yes. At Zyvorah you can choose one wall or coordinate several areas. Concepts show possibilities for different spaces; you do not need to purchase a complete concept or every area shown." },
  { question: "Is the square-foot rate the price of a complete wallpaper?", answer: `No. Multiply the design’s listed rate by the billable wall area. Zyvorah has a minimum billable wallpaper area of ${MIN_WALLPAPER_SQFT} square feet. Check the configured product total and any installation or delivery charges before comparing quotes.` },
  { question: "Should I buy a wallpaper sample first?", answer: "A design sample lets you assess the material, texture and colour in your room's light. A screen preview helps you judge composition, but cannot reproduce a physical finish exactly. Check what design and scale the sample represents before ordering." },
];

// The worked example's own numbers, so the rate and the total can never
// disagree — and so both convert together for a reader outside India.
const GUIDE_RATE = 200;
const GUIDE_WALL_SQFT = 80;

  function WallpaperBuyingGuide() {
  return <article className="container-x py-12 lg:py-16">
    <JsonLd data={{ "@context": "https://schema.org", "@type": "Article", "@id": `${SITE_URL}/wallpaper-buying-guide#article`, headline: "How to choose a wallpaper brand in India", mainEntityOfPage: `${SITE_URL}/wallpaper-buying-guide`, author: { "@type": "Organization", "@id": `${SITE_URL}/#organization`, name: "Zyvorah", url: `${SITE_URL}/our-story` }, publisher: { "@id": `${SITE_URL}/#organization` } }} />
    <div className="mx-auto max-w-3xl">
      <p className="caps text-slate">The wallpaper buying guide · By Zyvorah</p>
      <h1 className="mt-4 text-[clamp(2rem,4.6vw,3.3rem)] leading-tight">How to choose a wallpaper brand in India</h1>
      <p className="mt-6 text-lg leading-relaxed text-slate">Choose a brand by how well its design, material and service fit your actual wall. A useful comparison starts with the complete wall price, a physical sample and a clear understanding of sizing, installation and aftercare.</p>
      <p className="mt-4 text-slate">This guide is written by Zyvorah, an Indian wallpaper and mural brand. It explains what to check when comparing suppliers and how those choices work in our store.</p>
      <section id="formats" className="mt-12 scroll-mt-36">
        <h2 className="text-2xl">1. Compare the same kind of wall covering</h2>
        <p className="mt-4 text-slate">A roll, a custom mural, a border and a canvas artwork solve different problems. Their headline prices use different units.</p>
        <div className="mt-6 overflow-x-auto rounded-xl border border-edge">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Wallpaper formats and what to compare before ordering</caption>
            <thead className="bg-cream"><tr>{["Format", "What you are buying", "What to compare"].map(h => <th key={h} scope="col" className="p-4">{h}</th>)}</tr></thead>
            <tbody>{comparisons.map(([format, meaning, check]) => <tr key={format} className="border-t border-edge"><th scope="row" className="p-4 align-top">{format}</th><td className="p-4 align-top text-slate">{meaning}</td><td className="p-4 align-top text-slate">{check}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
      <section className="mt-12 space-y-4 text-slate">
        <h2 className="text-2xl text-charcoal">2. Ask for the whole-wall price</h2>
        <p>Measure width and height using the supplier&apos;s measuring instructions. Compare the same wall size and finish, including minimum billing, taxes, delivery and installation. At Zyvorah, wallpaper has a minimum billable area of {MIN_WALLPAPER_SQFT} sq ft; the product configurator shows the price for your wall dimensions and design.</p>
        <p>For illustration, a 10 ft × 8 ft wall is 80 sq ft. At a hypothetical <MarketMoney inr={GUIDE_RATE} /> per sq ft, the wallpaper alone would be <MarketMoney inr={GUIDE_RATE * GUIDE_WALL_SQFT} />. This is an example, not a current product quote. A headline per-square-foot rate would not buy that whole wall.</p>
        <p><Link className="underline" href="/how-to-measure">Measure your wall</Link> · <Link className="underline" href="/custom-sizing">Understand custom sizing</Link></p>
      </section>
      <section className="mt-12 space-y-4 text-slate">
        <h2 className="text-2xl text-charcoal">3. Check the finish and artwork placement</h2>
        <p>View a design sample in daylight and under the lights you use at night. Compare texture and colour against your furniture and flooring. Ask about cleaning instructions and wall preparation for the chosen material.</p>
        <p>For a mural, check where the subject will sit around doors, windows, a bed, shelving or a television. A design that works on a tall wall may need a different crop on a wide wall. Use a room preview to judge placement, then use a physical sample to judge the finish.</p>
        <p><Link className="underline" href="/materials">Compare Zyvorah materials</Link> · <Link className="underline" href="/samples">Order samples</Link> · <Link className="underline" href="/see-it-in-my-room">See it in your room</Link></p>
      </section>
      <section className="mt-12 space-y-4 text-slate">
        <h2 className="text-2xl text-charcoal">4. Separate dispatch, delivery and installation</h2>
        <p>A dispatch promise tells you when an order leaves the seller. It does not tell you when the parcel reaches you or when an installer can start. Check each stage for your postcode before booking other work.</p>
        <p>Confirm who prepares the wall, supplies adhesive and handles installation. Read the damage and print-defect process before ordering, including how to report a problem. Made-to-order return rules may differ from standard retail products.</p>
        <p><Link className="underline" href="/shipping-policy">Current shipping policy</Link> · <Link className="underline" href="/installation">Installation and care</Link> · <Link className="underline" href="/refund-policy">Returns and defect policy</Link></p>
      </section>
      <section className="mt-12 space-y-4 text-slate">
        <h2 className="text-2xl text-charcoal">5. Find a supplier that fits the scope of your idea</h2>
        <p>You may want one bedroom wall, your own artwork as a mural, or a coordinated scheme across a café, office or hotel. Explore possibilities room by room. A broad concept can help you discover an area you had not considered; it does not mean every area needs to be ordered together.</p>
        <p>Zyvorah offers mural wallpaper designs, canvas wall art, wallpaper borders and tools for discovering designs and previewing them in a room. For commercial work, compare the brief and scope behind each example. Our project pages distinguish commissioned work from speculative concept studies.</p>
        <p><Link className="underline" href="/collections/wall-art">Browse wallpaper</Link> · <Link className="underline" href="/print-your-own">Print your own artwork</Link> · <Link className="underline" href="/concepts">Explore concepts</Link> · <Link className="underline" href="/projects">Read project studies</Link></p>
      </section>
      <section className="mt-12 border-t border-edge pt-8">
        <h2 className="text-2xl">Questions before you choose</h2>
        {questions.map(q => <div key={q.question} className="mt-6"><h3 className="text-lg font-semibold">{q.question}</h3><p className="mt-2 leading-relaxed text-slate">{q.answer}</p></div>)}
      </section>
      <p className="mt-10 text-slate">Have your wall dimensions ready? <Link className="underline" href="/design-with">Find a design for your room</Link> or <Link className="underline" href="/contact">ask the Zyvorah team</Link>.</p>
    </div>
  </article>;
}

export default withBrandEditorial("/wallpaper-buying-guide", WallpaperBuyingGuide);
