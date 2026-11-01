
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import Link from "next/link";
import { getApplianceFormats, getFridgeBrands, getWrapProductsByTag } from "@/lib/wrap-queries";
import { APPLIANCES, wrapCollectionPath } from "@/lib/appliances";
import { FitFinder } from "../_components/FitFinder";
import { WrapsSubnav } from "@/components/WrapsSubnav";

const FRIDGE = APPLIANCES.fridge;

export const metadata: Metadata = brandMetadata({
  title: "Which fridge wrap fits my refrigerator?",
  description:
    "Find the fridge wrap format for your refrigerator. Search by brand and model number, or measure the door face — five standard formats cover almost every fridge sold in India.",
  alternates: { canonical: "/fridge-wraps/fit-finder" },
});

export const revalidate = 3600;

export default async function FitFinderPage() {
  const [formats, brands, designs] = await Promise.all([
    // Scoped to the fridge, NOT getWrapFormats(): that returns every
    // appliance's ladder now, and this finder answers "which refrigerator do
    // you have?" — a dishwasher panel offered as a verdict here would be a
    // wrong answer to a question the customer did not ask.
    getApplianceFormats("fridge"),
    getFridgeBrands(),
    // Only to learn whether the fridge listing has anything in it: an empty
    // collection page 404s, so the verdict must not send anyone there yet.
    getWrapProductsByTag(FRIDGE.familyTag, 1),
  ]);

  return (
    <>
      <WrapsSubnav current="fridge" trail={[{ label: "Fit finder" }]} />
      <div className="container-x py-12 lg:py-16">
        <div className="mx-auto max-w-3xl">
          <header>
            <p className="caps text-[#8C6F33]">Fit finder</p>
            <h1 className="mt-3 text-[clamp(2rem,4.4vw,3rem)] leading-tight">
              Will it fit my refrigerator?
            </h1>
            <p className="mt-4 text-slate">
              The only question worth answering before you pick a pattern. Two ways to answer it: your
              model number, or two measurements off the door. Either one takes about a minute.
            </p>
          </header>

          <div className="mt-14">
            <FitFinder
              formats={formats}
              brands={brands}
              browseHref={designs.length > 0 ? wrapCollectionPath(FRIDGE.collectionHandle) : null}
            />
          </div>

          <p className="mt-16 border-t border-edge pt-8 text-sm text-slate">
            Want the whole ladder instead?{" "}
            <Link href="/fridge-wraps/size-guide" className="link-underline font-medium">
              The size guide
            </Link>{" "}
            lists every format, its panels and what it fits.
          </p>
        </div>
      </div>
    </>
  );
}
