
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OfficeConceptBuilder } from "@/components/office/OfficeConceptBuilder";
import { hiddenConceptSlugs } from "@/lib/concept-availability";
import { getConceptOffers } from "@/lib/office-concept-server";
import { fetchPrintRules } from "@/lib/print-rules";
import { getShopConcept } from "@/lib/shop-concepts";
export const dynamic = "force-dynamic";
export const metadata: Metadata = editorialMetadata("/concepts/private-chronicle/shop");
  async function Page() {
 if ((await hiddenConceptSlugs()).has("private-chronicle")) notFound();
 const [catalogue, rules] = await Promise.all([getConceptOffers("private-chronicle"), fetchPrintRules()]);
 return <OfficeConceptBuilder key="private-chronicle" {...catalogue} rules={rules} concept={getShopConcept("private-chronicle")!} />;
}

export default withBrandEditorial("/concepts/private-chronicle/shop", Page);
