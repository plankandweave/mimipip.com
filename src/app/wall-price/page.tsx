
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import { WallPriceEstimate } from "@/components/WallPriceEstimate";

export const metadata: Metadata = brandMetadata({
  title: "Estimate Your Wallpaper Price | Zyvorah",
  description: "Enter your wall width and height to see an indicative complete wallpaper price, including applicable delivery.",
  alternates: { canonical: "/wall-price" },
});

export default function WallPricePage() {
  return (
    <main className="container-x py-12">
      <div className="mx-auto max-w-2xl">
        <span className="caps text-slate">Before you choose</span>
        <h1 className="mt-3 font-display text-[clamp(2rem,4vw,2.8rem)] leading-tight">What will my wall cost?</h1>
        <p className="mt-4 mb-8 text-slate">See the approximate whole-wall cost first. Once you select a design, we calculate its exact size, finish, panel layout and total.</p>
        <WallPriceEstimate />
      </div>
    </main>
  );
}
