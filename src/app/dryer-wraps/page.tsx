
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import { ApplianceLanding } from "@/components/ApplianceLanding";
import { getWrapLandingData } from "@/lib/wrap-landing";

/**
 * Dryer wraps. See ApplianceLanding for why this file holds only copy.
 *
 * A dryer shares the front-loader's cabinet and its porthole, so it shares the
 * geometry and differs only in what it is for. It gets its own appliance key and
 * its own page anyway, rather than being folded into the washing-machine page:
 * a customer looking for a dryer wrap searches for a dryer wrap, and a page that
 * mentioned dryers in a paragraph about washing machines would not be found by
 * them or read as being for them.
 */

export const metadata: Metadata = brandMetadata({
  title: "Dryer Wraps — printed panels for your tumble dryer",
  description:
    "Printed matte panels for a tumble dryer's front, cut around the door and trimmed to your own edge. Wrap it to match the washer it is stacked with. Removable, no residue.",
});

export const revalidate = 3600;

export default async function DryerWrapsPage() {
  const data = await getWrapLandingData("dryer");
  return (
    <ApplianceLanding
      appliance="dryer"
      {...data}
      headline="The other white box in the laundry."
      intro="A dryer is usually stacked on or beside a washing machine, which means two blank fronts in a row where one would already have been enough. The panel covers the front face, cut around the door, with the control fascia left clear — and the same design fits the washer below it."
      fitNote="Dryers share the front-loader's 600 mm cabinet, so there is one panel. If it is stacked with a washing machine, the pair can be wrapped to match."
    />
  );
}
