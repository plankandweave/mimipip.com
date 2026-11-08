
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import { MarketMoney, MarketPricingNote } from "@/components/MarketMoney";
import { InfoPage } from "@/components/InfoPage";
import { OrderSample } from "@/components/OrderSample";
import { getMaterialOffers } from "@/lib/queries";
export const metadata: Metadata = editorialMetadata("/materials");
const descriptions: Record<string, string> = {
  "smooth-matt":
    "Smooth, sheen-free wallpaper applied with paste. Intended for long-term interiors; professional installation is recommended.",
  "linen-touch":
    "A gently textured surface with a linen feel. The design page shows its price and details.",
  "self-adhesive-vinyl":
    "Peel-and-stick material for eligible ready-size designs. Removal depends on paint condition and wall preparation; test a discreet area first.",
  "eco-cotton-canvas":
    "Canvas artwork supplied rolled for local framing or stretching. Frames and installation are not included unless explicitly listed on the product.",
};
  async function MaterialsPage() {
  const offers = await getMaterialOffers();
  return (
    <InfoPage
      eyebrow="Surfaces"
      title="Wallpaper surfaces"
      intro="The surface is part of the design. Each wallpaper has a smooth matte surface or a linen feel; its product page describes exactly what you will receive. Prices belong to the designs, rather than the surfaces."
      sections={[
        ...offers.map((m) => ({
          heading: (
            <>
              {m.name}
              {m.pricePerSqft ? (
                <> — from <MarketMoney inr={m.pricePerSqft} /> / sq ft</>
              ) : m.fromPrice ? (
                <> — artwork from <MarketMoney inr={m.fromPrice} /></>
              ) : null}
            </>
          ),
          body:
            descriptions[m.slug] ||
            "See each product for its available sizes, finish and care instructions.",
        })),
        {
          heading: "Before installation",
          body: "Walls should be dry, smooth and sound. Resolve dampness and loose paint first. Confirm suitability for high-moisture areas or specialist cleaning requirements before ordering. Screen colours and room visualisations are a guide; a physical sample helps you judge the finish in your own lighting.",
        },
        {
          heading: "Try a design sample",
          body: (
            <div className="space-y-4">
              <p>
                <MarketPricingNote
                  india="Order an A4 Soft Matte design sample for ₹200."
                  international="Design samples are posted within India only."
                />{" "}
                Choose your wallpaper design from the sample search below.
                Samples are offered on Soft Matte.
              </p>
              <OrderSample />
            </div>
          ),
        },
      ]}
      cta={{ label: "Browse wallpaper", href: "/collections/wall-art" }}
    />
  );
}

export default withBrandEditorial("/materials", MaterialsPage);
