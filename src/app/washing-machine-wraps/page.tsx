
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import { ApplianceLanding } from "@/components/ApplianceLanding";
import { getWrapLandingData } from "@/lib/wrap-landing";
import { getApplianceFormats, getWrapProductsByTag } from "@/lib/wrap-queries";
import { APPLIANCES } from "@/lib/appliances";
import type { WrapCardData } from "@/lib/wrap-queries";
import type { WrapFormat } from "@/lib/wraps";

/**
 * Washing machine wraps — the one landing page that fronts TWO appliances.
 *
 * Front-load and top-load washers are separate rows in wrap_appliances because
 * almost everything about them differs: a front-loader is one flat panel with the
 * door cut out, a top-loader is a three-side wrap covering the front and both
 * flanks, and their artwork is authored at different proportions. But a customer
 * owns "a washing machine" and does not think of those as two products, so they
 * share a page and the page opens on whichever kind is actually in the catalogue.
 *
 * Top-load leads when both exist. It is the more common machine in Indian homes
 * and the more distinctive product — a wrap that turns two corners is the thing
 * worth showing first.
 */

export const metadata: Metadata = brandMetadata({
  title: "Washing Machine Wraps — printed panels, front and top load",
  description:
    "Printed matte panels for washing machines. Top-loaders are wrapped on three sides — front and both flanks, each printed with your design; front-loaders get a single panel cut around the door. Trimmed to your own edge, removable.",
});

export const revalidate = 3600;

export default async function WashingMachineWrapsPage() {
  // Both load types, then lead with whichever has designs. A page that opened on
  // front-load when only top-load artwork exists would show an empty studio
  // beside a populated catalogue.
  const [top, front] = await Promise.all([
    getWrapLandingData("washer-top"),
    getWrapLandingData("washer-front"),
  ]);
  const lead = top.designs.length || !front.designs.length ? top : front;
  const other = lead === top ? front : top;
  const appliance = lead === top ? ("washer-top" as const) : ("washer-front" as const);

  // The fit table and the studio both belong to the leading load type, but the
  // "from" price on the hero should span the page's whole offer — a customer
  // reading "from ₹2,000" and then finding a ₹1,000 front-loader panel was told
  // the wrong number.
  const formats: WrapFormat[] = [...lead.formats, ...other.formats];
  const designs: WrapCardData[] = lead.designs;
  const rows = lead.rows.length ? lead.rows : other.rows;

  // Both load types reach the studio. The lead one opens it, but a front-loader
  // owner can switch to their own machine and the ₹1,000 panel the hero
  // promises — which was previously reachable only in a static table below.
  // Lead first — the studio opens on options[0], and that must be the same load
  // type the rest of the page leads with.
  const studioVariants =
    appliance === "washer-top"
      ? [
          { appliance: "washer-top" as const, formats: top.formats, designs: top.designs },
          { appliance: "washer-front" as const, formats: front.formats, designs: front.designs },
        ]
      : [
          { appliance: "washer-front" as const, formats: front.formats, designs: front.designs },
          { appliance: "washer-top" as const, formats: top.formats, designs: top.designs },
        ];

  return (
    <ApplianceLanding
      appliance={appliance}
      formats={formats}
      designs={designs}
      rows={rows}
      studioVariants={studioVariants}
      heroScenes={lead.heroScenes.length ? lead.heroScenes : other.heroScenes}
      headline="Wrapped on three sides, not just the front."
      intro={`A top-loader is visible from every direction it is walked past, so we wrap three sides of it — the front and both flanks, each printed with the design you choose. The lid stays as it is, because that is the surface you put things down on. Front-loaders take a single panel, cut around the door.`}
      fitNote={
        appliance === "washer-top"
          ? "Top-loaders go by load size — 6 to 8 kg, or 8 to 12. It is printed on the front of the machine."
          : "Front-loaders are a 600 mm cabinet almost without exception, so there is one panel for them."
      }
    />
  );
}
