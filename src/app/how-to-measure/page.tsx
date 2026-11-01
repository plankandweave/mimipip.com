
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import Link from "next/link";
import { MeasureWithPhoneCard } from "@/components/MeasureWithPhoneCard";

export const metadata: Metadata = brandMetadata({
  title: "How to Measure",
  description:
    "How to measure your wall for a Zyvorah mural wallpaper design — in feet or millimetres, with tips for sockets, skirting and doors.",
  alternates: { canonical: "/how-to-measure" },
});

const STEPS = [
  {
    n: "01",
    t: "Measure the full width",
    d: "Measure wall-to-wall at the widest point, in feet or millimetres. If the wall isn't perfectly square, measure at the top, middle and bottom and use the largest number.",
  },
  {
    n: "02",
    t: "Measure the full height",
    d: "Floor (or top of skirting) to ceiling. Measure on the left, centre and right, and again take the largest — we'd rather trim a little than come up short.",
  },
  {
    n: "03",
    t: "Round up, don't round down",
    d: "Always round up to the nearest inch / 10 mm. We add a small trim margin automatically so the mural covers edge-to-edge with a little to spare for fitting.",
  },
  {
    n: "04",
    t: "Enter your size",
    d: "Pop the width and height into the product page — type feet or millimetres and the other fills in for you. The visualiser shows exactly which part of the design lands on your wall.",
  },
];

export default function HowToMeasurePage() {
  return (
    <div className="container-x py-12">
      <div className="mx-auto max-w-2xl">
        <span className="caps text-slate">Size guide</span>
        <h1 className="mt-3 text-[clamp(2rem,4vw,2.8rem)] leading-tight">How to measure your wall</h1>
        <p className="mt-4 text-slate">
          Every Zyvorah mural is cut to your exact wall, so a good measurement is everything.
          It takes two minutes and all you need is a tape measure.
        </p>

        <MeasureWithPhoneCard />

        <ol className="mt-10 space-y-6">
          {STEPS.map((s) => (
            <li key={s.n} className="flex gap-5 rounded-[18px] bg-wash p-5">
              <span className="font-display text-2xl font-extrabold text-mist">{s.n}</span>
              <div>
                <h2 className="font-display text-lg font-semibold">{s.t}</h2>
                <p className="mt-1 text-sm text-slate">{s.d}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-10 rounded-[18px] bg-sage/40 p-6">
          <h3 className="font-display text-base font-bold">A few tips</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate">
            <li>• Measure the whole wall even if furniture is in the way — we cover the full surface.</li>
            <li>• Sockets, switches and radiators: measure the wall as if they weren&apos;t there. The mural is trimmed around them during fitting.</li>
            <li>• Sloped ceilings or chimney breasts? Measure the largest rectangle that covers the area and tell us in the order notes.</li>
            <li>• Not sure? Order a sample first, or ask our concierge — we&apos;re happy to check your numbers.</li>
          </ul>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/collections/wall-art" className="btn h-12 px-6 text-[0.8rem]">
            Browse wallpaper
          </Link>
          <Link href="/how-to-measure#" className="btn btn-ghost h-12 px-6 text-[0.8rem]">
            Order a sample
          </Link>
        </div>
      </div>
    </div>
  );
}
