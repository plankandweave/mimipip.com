
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OfficeConceptBuilder } from "@/components/office/OfficeConceptBuilder";
import { hiddenConceptSlugs } from "@/lib/concept-availability";
import { getConceptOffers } from "@/lib/office-concept-server";
import { fetchPrintRules } from "@/lib/print-rules";
import { getShopConcept } from "@/lib/shop-concepts";
export const dynamic = "force-dynamic";
export const metadata: Metadata = editorialMetadata("/concepts/the-pattern-house/shop");
  async function Page() {
 if ((await hiddenConceptSlugs()).has("the-pattern-house")) notFound();
 const [catalogue, rules] = await Promise.all([getConceptOffers("the-pattern-house"), fetchPrintRules()]);
 return <OfficeConceptBuilder key="the-pattern-house" {...catalogue} rules={rules} concept={getShopConcept("the-pattern-house")!} />;
}

export default withBrandEditorial("/concepts/the-pattern-house/shop", Page);
