
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import { ApplianceLanding } from "@/components/ApplianceLanding";
import { getWrapLandingData } from "@/lib/wrap-landing";

/**
 * AC wraps. A thin wrapper over the shared appliance landing — everything
 * structural lives in ApplianceLanding, and everything factual comes from
 * wrap_formats. What is written here is only the argument, which genuinely
 * differs per appliance: an air conditioner is the one appliance in the room
 * nobody has ever thought of as decorative.
 *
 * Flat top-level path, a sibling of /fridge-wraps rather than /wraps/ac. It
 * matches the search phrase, and /fridge-wraps is already a live indexed URL
 * that moving for symmetry's sake would cost more than the symmetry is worth.
 */

export const metadata: Metadata = brandMetadata({
  title: "AC Wraps — printed panels for your split air conditioner",
  description:
    "Printed matte panels cut to the front cover of a split-AC indoor unit, sized by tonnage and trimmed to your own edge. The louvres stay clear. Removable, no residue.",
});

export const revalidate = 3600;

export default async function AcWrapsPage() {
  const data = await getWrapLandingData("ac");
  return (
    <ApplianceLanding
      appliance="ac"
      {...data}
      headline="The one white box nobody decorates."
      intro="A split AC sits at eye level on the largest empty wall in the room, and it is white because that is the only colour it came in. We print matte panels cut to the front cover — sized by tonnage, trimmed to your own edge, and never over the louvres the unit breathes through."
      fitNote="Indoor units go by tonnage — 1 ton, 1.5 or 2. Yours is on the sticker on the side or in the manual, and that is the whole question."
    />
  );
}
