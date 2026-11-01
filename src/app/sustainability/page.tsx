
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import { InfoPage } from "@/components/InfoPage";

export const metadata: Metadata = editorialMetadata("/sustainability");

  function SustainabilityPage() {
  return (
    <InfoPage
      eyebrow="Our commitment"
      title="Made responsibly"
      intro="Printing to order is the heart of how we keep waste low — we make only what you order."
      sections={[
        { heading: "No overproduction", body: "Because every mural is sized to your wall, nothing is mass-produced or sent to landfill unsold." },
        { heading: "Considered materials", body: "We're expanding our range of low-impact substrates, including an eco-cotton canvas, and use water-based inks where possible." },
        { heading: "Made locally", body: "Designed and printed in India and shipped domestically, keeping the distance from press to wall short." },
      ]}
      cta={{ label: "Explore the collection", href: "/collections/wall-art" }}
    />
  );
}

export default withBrandEditorial("/sustainability", SustainabilityPage);
