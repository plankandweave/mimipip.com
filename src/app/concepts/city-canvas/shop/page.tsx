
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OfficeConceptBuilder } from "@/components/office/OfficeConceptBuilder";
import { hiddenConceptSlugs } from "@/lib/concept-availability";
import { getConceptOffers } from "@/lib/office-concept-server";
import { fetchPrintRules } from "@/lib/print-rules";
import { getShopConcept } from "@/lib/shop-concepts";
export const dynamic = "force-dynamic";
export const metadata: Metadata = editorialMetadata("/concepts/city-canvas/shop");
  async function Page() {
 if ((await hiddenConceptSlugs()).has("city-canvas")) notFound();
 const [catalogue, rules] = await Promise.all([getConceptOffers("city-canvas"), fetchPrintRules()]);
 return <OfficeConceptBuilder key="city-canvas" {...catalogue} rules={rules} concept={getShopConcept("city-canvas")!} />;
}

export default withBrandEditorial("/concepts/city-canvas/shop", Page);
