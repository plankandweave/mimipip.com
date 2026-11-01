
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import { OfficeConceptBuilder } from "@/components/office/OfficeConceptBuilder";
import { getConceptOffers } from "@/lib/office-concept-server";
import { fetchPrintRules } from "@/lib/print-rules";
import { getShopConcept } from "@/lib/shop-concepts";
import { hiddenConceptSlugs } from "@/lib/concept-availability";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = editorialMetadata("/concepts/sidequest/shop");

  async function SidequestShop() {
  if ((await hiddenConceptSlugs()).has("sidequest")) notFound();
  const [catalogue, rules] = await Promise.all([getConceptOffers("sidequest"), fetchPrintRules()]);
  return <OfficeConceptBuilder key="sidequest" {...catalogue} rules={rules} concept={getShopConcept("sidequest")!} />;
}

export default withBrandEditorial("/concepts/sidequest/shop", SidequestShop);
