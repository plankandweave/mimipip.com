
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import { getWrapProductsByTag, getApplianceFormats } from "@/lib/wrap-queries";
import { APPLIANCES } from "@/lib/appliances";
import { WrapVisualizer } from "@/components/WrapVisualizer";
import { WrapsSubnav } from "@/components/WrapsSubnav";

export const metadata: Metadata = brandMetadata({
  title: "See It on My Fridge — Zyvorah",
  alternates: { canonical: "/fridge-wraps/see-it-on-my-fridge" },
});

export default async function SeeItOnMyFridgePage() {
  const [initialDesigns, formats] = await Promise.all([
    getWrapProductsByTag(APPLIANCES.fridge.familyTag, 24),
    // The visualiser lays a design out against a chosen format's real
    // proportions, so it must be handed the fridge ladder and nothing else —
    // getWrapFormats() would put a 3:1 AC panel in the format picker of a
    // page whose whole job is a photograph of the customer's refrigerator.
    getApplianceFormats("fridge"),
  ]);
  return (
    <>
      <WrapsSubnav current="fridge" trail={[{ label: "See it on my fridge" }]} />
      <WrapVisualizer initialDesigns={initialDesigns} formats={formats} appliance="fridge" />
    </>
  );
}
