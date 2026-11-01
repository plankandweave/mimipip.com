
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OfficeConceptBuilder } from "@/components/office/OfficeConceptBuilder";
import { hiddenConceptSlugs } from "@/lib/concept-availability";
import { getConceptOffers } from "@/lib/office-concept-server";
import { fetchPrintRules } from "@/lib/print-rules";
import { getShopConcept } from "@/lib/shop-concepts";
export const dynamic = "force-dynamic";
export const metadata: Metadata = editorialMetadata("/concepts/earth-held-lightly/shop");
  async function Page() {
 if ((await hiddenConceptSlugs()).has("earth-held-lightly")) notFound();
 const [catalogue, rules] = await Promise.all([getConceptOffers("earth-held-lightly"), fetchPrintRules()]);
 return <OfficeConceptBuilder key="earth-held-lightly" {...catalogue} rules={rules} concept={getShopConcept("earth-held-lightly")!} />;
}

export default withBrandEditorial("/concepts/earth-held-lightly/shop", Page);
