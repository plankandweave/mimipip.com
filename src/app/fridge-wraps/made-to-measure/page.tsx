
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import Link from "next/link";
import { getWrapFormat, getWrapProductsByTag } from "@/lib/wrap-queries";
import {
  MADE_TO_MEASURE_CODE,
  WRAP_MTM_RATE,
  WRAP_MTM_LEAD_DAYS,
  MAX_MTM_PANELS,
  DOOR_MIN_CM,
  DOOR_MAX_CM,
} from "@/lib/wraps";
import { APPLIANCES, wrapCollectionPath } from "@/lib/appliances";
import { formatINR } from "@/lib/pricing";
import { MadeToMeasure } from "../_components/MadeToMeasure";
import { WrapsSubnav } from "@/components/WrapsSubnav";

const FRIDGE = APPLIANCES.fridge;

export const metadata: Metadata = brandMetadata({
  title: "Fridge wrap sized to your appliance — your own measurements",
  description:
    "For a refrigerator no standard format covers. Give a width and a height for each door panel and we print the set for your fridge alone, at ₹200 per square foot.",
  alternates: { canonical: "/fridge-wraps/made-to-measure" },
});

export const revalidate = 3600;

/** A measurement handed over from the fit finder's fallback, in cm. Kept as a
 *  string: it is only ever a form prefill, and the server re-normalises and
 *  re-prices it regardless of what arrives in the URL. */
function prefill(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < DOOR_MIN_CM || n > DOOR_MAX_CM) return undefined;
  return String(n);
}

export default async function MadeToMeasurePage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string | string[]; h?: string | string[] }>;
}) {
  const [{ w, h }, format, designs] = await Promise.all([
    searchParams,
    // One row by code, not a ladder: Format Z belongs to the fridge and codes
    // are globally unique across the range (0094), so there is nothing to scope.
    getWrapFormat(MADE_TO_MEASURE_CODE),
    getWrapProductsByTag(FRIDGE.familyTag, 1),
  ]);

  const leadDays = format?.leadTimeDays ?? WRAP_MTM_LEAD_DAYS;

  return (
    <>
      <WrapsSubnav current="fridge" trail={[{ label: "Sized to your fridge" }]} />
      <div className="container-x py-12 lg:py-16">
        <div className="mx-auto max-w-3xl">
          <header>
            <p className="caps text-[#8C6F33]">Format {MADE_TO_MEASURE_CODE}</p>
            <h1 className="mt-3 text-[clamp(2rem,4.4vw,3rem)] leading-tight">Sized to your fridge</h1>
            <p className="mt-4 text-slate">
              For the refrigerator none of the five standard formats covers. Give us a width and a
              height for each door panel — up to {MAX_MTM_PANELS} — and the set is prepared
              for your fridge alone at {formatINR(WRAP_MTM_RATE)} per square foot, dispatched in{" "}
              {leadDays} working days. Sold on this site only.
            </p>
          </header>

          <section className="mt-10 rounded-[22px] bg-wash p-6">
            <h2 className="font-display text-[0.95rem] font-semibold">Measuring, briefly</h2>
            <ul className="mt-3 space-y-1.5 text-sm text-slate">
              <li>Measure each door&apos;s face — across the front, edge to edge, and top to bottom.</li>
              <li>
                Measure every door separately. On most Indian double doors the freezer door and the
                fridge door are nothing like the same size, and one figure used twice sends one panel
                out wrong.
              </li>
              <li>
                Leave the handles out of it. The panels cover the faces; you trim around fixtures as
                you go.
              </li>
            </ul>
          </section>

          <div className="mt-10">
            <MadeToMeasure
              initialWidthCm={prefill(w)}
              initialHeightCm={prefill(h)}
              browseHref={designs.length > 0 ? wrapCollectionPath(FRIDGE.collectionHandle) : null}
            />
          </div>

          <p className="mt-14 border-t border-edge pt-8 text-sm text-slate">
            Not sure you need this?{" "}
            <Link href="/fridge-wraps/fit-finder" className="link-underline font-medium">
              Check the standard formats first
            </Link>{" "}
            — they are cheaper, they dispatch faster, and almost every fridge sold in India fits one.
          </p>
        </div>
      </div>
    </>
  );
}
