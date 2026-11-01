
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = brandMetadata({
  title: "How Custom Sizing Works",
  description:
    "Every Zyvorah mural is prepared for the exact width and height of your wall. See how custom sizing works — from measuring, to choosing and framing the design, to an approved composition and your complete price before you order.",
  alternates: { canonical: "/custom-sizing" },
});

const STEPS: { n: string; title: string; body: string }[] = [
  {
    n: "01",
    title: "Measure your wall",
    body: "Measure the full width and height of the wall you want to cover, edge to edge. Feet and inches are fine — our guide walks you through it, including walls with doors, windows or sloped ceilings.",
  },
  {
    n: "02",
    title: "Choose a design",
    body: "Pick any design from the collection, or bring your own artwork. Every design can be prepared at your wall's exact size — nothing is limited to a standard roll.",
  },
  {
    n: "03",
    title: "See it at your wall's exact size",
    body: "Enter your width and height and the design is shown at your wall's true proportions. Drag to reposition and zoom to set the scale, so the focal point lands where it should — above a console, beside a bed, or away from a television.",
  },
  {
    n: "04",
    title: "Review and approve the composition",
    body: "What you frame is exactly what you get. Before adding to cart you approve the crop, scale and position — so a face doesn't disappear behind a cupboard and the most beautiful part of a design isn't cut away.",
  },
  {
    n: "05",
    title: "Choose your material",
    body: "Select the finish that suits the room and how the wall will be used. Order a sample first if you'd like to feel the material and check the colour in your own light.",
  },
  {
    n: "06",
    title: "See your complete price",
    body: "Your price is shown in full before you order. In India it includes GST and free standard delivery. We print to your exact wall size; the chargeable width starts at 4 ft and wallpaper billing starts at 20 sq ft.",
  },
  {
    n: "07",
    title: "Produced in numbered panels for your wall",
    body: "Your mural is made to order and arrives as clearly-labelled panels sized for your wall, with a fitting guide in the box. Professional installation is available in selected cities.",
  },
];

const RECORDS = [
  "The wallpaper design",
  "Exact wall width and height",
  "Selected material",
  "Approved crop and scale",
  "Panel arrangement",
  "Price and applicable GST",
  "Delivery and installation selections",
];

export default function CustomSizingPage() {
  return (
    <div className="container-x py-12">
      <div className="mx-auto max-w-2xl">
        <span className="caps text-slate">Sized to your wall</span>
        <h1 className="mt-3 text-[clamp(2rem,4.2vw,3.1rem)] leading-[1.08]">
          Made for your wall—not taken from a standard roll.
        </h1>
        <p className="mt-5 text-[1.05rem] leading-relaxed text-slate">
          Every room is different, and every wall has its own proportions. That is why a Zyvorah
          mural is prepared for the exact width and height of your wall — composed and cut for your
          particular space, never trimmed down from a fixed size.
        </p>
      </div>

      {/* steps */}
      <div className="mx-auto mt-12 max-w-2xl space-y-4">
        {STEPS.map((s) => (
          <div key={s.n} className="flex gap-5 rounded-[20px] bg-wash p-6">
            <p className="font-display text-2xl font-extrabold text-mist">{s.n}</p>
            <div>
              <p className="font-display text-lg font-bold text-charcoal">{s.title}</p>
              <p className="mt-1.5 text-[1.02rem] leading-relaxed text-slate">{s.body}</p>
            </div>
          </div>
        ))}
      </div>

      {/* what the configuration records */}
      <div className="mx-auto mt-12 max-w-2xl rounded-[24px] border border-edge p-7">
        <h2 className="font-display text-xl font-bold text-charcoal">An approved composition, on record</h2>
        <p className="mt-2 text-[1.02rem] leading-relaxed text-slate">
          Dimensions are only the beginning — position and scale matter just as much. Before
          production begins, your configuration records:
        </p>
        <ul className="mt-4 grid gap-2 text-[1.02rem] leading-relaxed text-slate sm:grid-cols-2">
          {RECORDS.map((r) => (
            <li key={r} className="flex items-start gap-2.5">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-mist" />
              {r}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[1.02rem] leading-relaxed text-slate">
          This creates clarity before production begins and helps ensure that what arrives reflects
          the wall you approved.
        </p>
      </div>

      {/* CTAs */}
      <div className="mx-auto mt-12 max-w-2xl">
        <div className="pastel-section bg-sage/30 text-center">
          <h2 className="text-2xl font-semibold lg:text-3xl">Ready to size your wall?</h2>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href="/design-with" className="btn">Find My Wallpaper</Link>
            <Link href="/collections/wall-art" className="btn btn-ghost">Explore all wallpapers</Link>
          </div>
          <Link href="/how-to-measure" className="mt-4 inline-block text-sm font-semibold text-slate underline underline-offset-4 hover:text-charcoal">
            How to measure your wall
          </Link>
        </div>
      </div>
    </div>
  );
}
