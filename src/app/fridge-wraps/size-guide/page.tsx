
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage } from "@/components/InfoPage";
import { WrapsSubnav } from "@/components/WrapsSubnav";
import { getApplianceFormats } from "@/lib/wrap-queries";
import {
  TRIM_ALLOWANCE_MM,
  WRAP_MTM_RATE,
  WRAP_MTM_LEAD_DAYS,
  DOOR_MIN_CM,
  DOOR_MAX_CM,
  MAX_MTM_PANELS,
} from "@/lib/wraps";
import { formatINR } from "@/lib/pricing";

export const metadata: Metadata = brandMetadata({
  title: "Fridge wrap size guide — the six formats",
  description:
    "Every fridge wrap format: what each one fits, how many panels it contains, the panel sizes in millimetres, and why they ship oversize for you to trim against your own door edge.",
  alternates: { canonical: "/fridge-wraps/size-guide" },
});

export const revalidate = 3600;

const mm = (n: number) => `${n} mm`;

export default async function FridgeSizeGuidePage() {
  // The fridge's own ladder. getWrapFormats() now returns every appliance's
  // rows, and this page is a table of what fits a refrigerator — an AC tonnage
  // row landing in it would read as a fridge format that fits nothing.
  const formats = await getApplianceFormats("fridge");
  const standard = formats.filter((f) => !f.isMadeToMeasure);
  const madeToMeasure = formats.find((f) => f.isMadeToMeasure);

  return (
    <>
      <WrapsSubnav current="fridge" trail={[{ label: "Size guide" }]} />
      <InfoPage
      eyebrow="Fridge Wraps"
      title="Size guide"
      intro="Five standard formats and one sized to your fridge. Each format is a set of panels cut for a shape of refrigerator door, not for a particular model — which is why a handful of them cover a fleet of hundreds."
      sections={[
        {
          heading: "The five standard formats",
          body: (
            <div className="space-y-6">
              {standard.map((f) => (
                <div key={f.code} className="border-t border-edge pt-5 first:border-t-0 first:pt-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-display text-[1.05rem] font-semibold text-charcoal">
                      Format {f.code} — {f.label}
                    </h3>
                    {f.priceInr != null && (
                      <span className="font-display text-[1.05rem] font-bold text-charcoal">
                        {formatINR(f.priceInr)}
                      </span>
                    )}
                  </div>
                  {f.capacityLabel && <p className="mt-1 text-charcoal">Fits {f.capacityLabel}</p>}
                  {f.doorWidthMinMm != null && f.doorWidthMaxMm != null && f.doorHeightMinMm != null && f.doorHeightMaxMm != null && (
                    <p className="mt-1">
                      Door face {(f.doorWidthMinMm / 10).toFixed(0)}–{(f.doorWidthMaxMm / 10).toFixed(0)} cm wide,{" "}
                      {(f.doorHeightMinMm / 10).toFixed(0)}–{(f.doorHeightMaxMm / 10).toFixed(0)} cm tall
                    </p>
                  )}
                  <ul className="mt-2 space-y-0.5">
                    {f.panels.map((p, i) => (
                      <li key={i}>
                        {p.label ?? `Panel ${i + 1}`} — {mm(p.widthMm)} × {mm(p.heightMm)}
                      </li>
                    ))}
                  </ul>
                  {f.panels.length > 1 && f.overallWidthMm && f.overallHeightMm && (
                    <p className="mt-1 text-mist">
                      {f.panels.length} panels · {mm(f.overallWidthMm)} × {mm(f.overallHeightMm)} overall
                    </p>
                  )}
                </div>
              ))}
              <p className="text-mist">All prices are GST-inclusive, for the complete panel set.</p>
            </div>
          ),
        },
        {
          heading: "Why every panel is bigger than the door",
          body: (
            <p>
              Each panel ships {TRIM_ALLOWANCE_MM} mm oversize on every edge, and you trim it against
              the door itself once it is on. This is the product&apos;s central decision rather than a
              manufacturing tolerance: cutting to a measurement means your measurement has to be
              right, and trimming to an edge means the door is the ruler. It is a far more forgiving
              job, and it is what lets five formats cover door widths that vary by 65 mm across the
              whole Indian range.
            </p>
          ),
        },
        {
          heading: "How to measure, if you would rather be certain",
          body: (
            <div className="space-y-2">
              <p>
                Measure the door <strong className="text-charcoal">face</strong> — across the front,
                edge to edge, and top to bottom. Not the cabinet, not the gap it stands in. On a
                double door, measure the larger fridge door.
              </p>
              <p>
                Anything between {DOOR_MIN_CM} and {DOOR_MAX_CM} cm is a plausible door; outside that
                range it is almost always the cabinet that has been measured by mistake. Round to the
                nearest centimetre — the trim allowance absorbs the rest.
              </p>
              <p>
                <Link href="/fridge-wraps/fit-finder#measure" className="link-underline font-medium">
                  Enter your two measurements
                </Link>{" "}
                and the fit finder returns the format.
              </p>
            </div>
          ),
        },
        {
          heading: "Verified fits, and the rest",
          body: (
            <p>
              For a small number of models we have read the door dimensions off the manufacturer&apos;s
              own published specification, and the fit finder says so. Every other model is placed in
              a format by its capacity and door type — a sound assignment, but nobody has measured
              one, and we mark those differently rather than let the two look alike. If your model is
              in the second group, take the two measurements.
            </p>
          ),
        },
        ...(madeToMeasure
          ? [
              {
                heading: `Format ${madeToMeasure.code} — sized to your fridge`,
                body: (
                  <div className="space-y-2">
                    <p>
                      For a door that no standard format covers: give a width and a height for each
                      door panel, up to {MAX_MTM_PANELS} panels, and the set is sized for your
                      refrigerator alone at {formatINR(WRAP_MTM_RATE)} per square foot, dispatched
                      in {madeToMeasure.leadTimeDays ?? WRAP_MTM_LEAD_DAYS} working days. Sold on
                      this site only.
                    </p>
                    <p>
                      Panels are measured individually on purpose. On the commonest Indian double
                      door the freezer door and the fridge door are nothing like the same size, and a
                      single size applied twice would send one panel out wrong.
                    </p>
                    <p>
                      <Link href="/fridge-wraps/made-to-measure" className="link-underline font-medium">
                        Price your own measurements
                      </Link>
                    </p>
                  </div>
                ),
              },
            ]
          : []),
      ]}
      cta={{ label: "Find my fit", href: "/fridge-wraps/fit-finder" }}
      />
    </>
  );
}
