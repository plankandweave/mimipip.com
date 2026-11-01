
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import { ApplianceLanding } from "@/components/ApplianceLanding";
import { getWrapLandingData } from "@/lib/wrap-landing";

/**
 * Dishwasher wraps. See ApplianceLanding for why this file holds only copy.
 *
 * The simplest appliance in the range: Indian dishwashers are effectively one
 * size, the 60 cm door, so there is one format and the fit question barely
 * exists. That is worth saying plainly rather than dressing up as a choice.
 */

export const metadata: Metadata = brandMetadata({
  title: "Dishwasher Wraps — printed panels for the 60 cm door",
  description:
    "Printed matte panels for a dishwasher door, cut to the standard 60 cm face and trimmed to your own edge. The control strip and kick plate stay bare. Removable, no residue.",
});

export const revalidate = 3600;

export default async function DishwasherWrapsPage() {
  const data = await getWrapLandingData("dishwasher");
  return (
    <ApplianceLanding
      appliance="dishwasher"
      {...data}
      headline="A dishwasher is a door, and a door can be anything."
      intro="Most dishwashers sit in a run of cabinetry and lose the argument with it — a steel or white slab among the doors you actually chose. The panel covers the door face between the control strip and the kick plate, and it can match your cabinets or ignore them entirely."
      fitNote="One size. Dishwashers sold in India are the standard 60 cm door almost without exception, so there is nothing to measure."
    />
  );
}
