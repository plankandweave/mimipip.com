
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OfficeConceptBuilder } from "@/components/office/OfficeConceptBuilder";
import { hiddenConceptSlugs } from "@/lib/concept-availability";
import { getConceptOffers } from "@/lib/office-concept-server";
import { fetchPrintRules } from "@/lib/print-rules";
import { getShopConcept } from "@/lib/shop-concepts";
export const dynamic = "force-dynamic";
export const metadata: Metadata = editorialMetadata("/concepts/quiet-atlas/shop");
  async function Page() {
 if ((await hiddenConceptSlugs()).has("quiet-atlas")) notFound();
 const [catalogue, rules] = await Promise.all([getConceptOffers("quiet-atlas"), fetchPrintRules()]);
 return <OfficeConceptBuilder key="quiet-atlas" {...catalogue} rules={rules} concept={getShopConcept("quiet-atlas")!} />;
}

export default withBrandEditorial("/concepts/quiet-atlas/shop", Page);
