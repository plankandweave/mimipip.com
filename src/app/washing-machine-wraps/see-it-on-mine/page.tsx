
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import { getWrapProductsByTag, getApplianceFormats } from "@/lib/wrap-queries";
import { APPLIANCES } from "@/lib/appliances";
import { WrapVisualizer } from "@/components/WrapVisualizer";
import { WrapsSubnav } from "@/components/WrapsSubnav";

/**
 * "See it on my own washing machine" — the photo visualiser for this appliance.
 *
 * Every appliance gets its own route rather than one page with a switcher: the
 * page holds a photograph of the customer's own washing machine in localStorage,
 * and a switcher would invite them to swap appliance under a photograph that is
 * of the previous one.
 *
 * The fridge's equivalent lives at /fridge-wraps/see-it-on-my-fridge, which
 * shipped before the range grew and is a live URL worth keeping.
 */

const APPLIANCE = "washer-top" as const;

export const metadata: Metadata = brandMetadata({
  title: "See It on My Washing Machine",
  alternates: { canonical: "/washing-machine-wraps/see-it-on-mine" },
});

export default async function SeeItOnMinePage() {
  const [initialDesigns, formats] = await Promise.all([
    // This appliance's authored flats, not the designs' canonical ones — the
    // visualiser places the artwork as it will print on THIS appliance.
    getWrapProductsByTag(APPLIANCES[APPLIANCE].familyTag, 24, APPLIANCE),
    // The visualiser lays a design out against a chosen format's real
    // proportions, so it must be handed this appliance's ladder and nothing
    // else — getWrapFormats() would put a fridge door in the format picker.
    getApplianceFormats(APPLIANCE),
  ]);
  return (
    <>
      <WrapsSubnav
        current={APPLIANCES[APPLIANCE].pickerGroup}
        trail={[{ label: APPLIANCES[APPLIANCE].visualizerLabel }]}
      />
      <WrapVisualizer initialDesigns={initialDesigns} formats={formats} appliance={APPLIANCE} />
    </>
  );
}
