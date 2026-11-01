
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OfficeConceptBuilder } from "@/components/office/OfficeConceptBuilder";
import { hiddenConceptSlugs } from "@/lib/concept-availability";
import { getConceptOffers } from "@/lib/office-concept-server";
import { fetchPrintRules } from "@/lib/print-rules";
import { getShopConcept } from "@/lib/shop-concepts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = editorialMetadata("/concepts/the-fifth-season/shop");

  async function FifthSeasonShop() {
  if ((await hiddenConceptSlugs()).has("the-fifth-season")) notFound();
  const [catalogue, rules] = await Promise.all([getConceptOffers("the-fifth-season"), fetchPrintRules()]);
  return <OfficeConceptBuilder key="the-fifth-season" {...catalogue} rules={rules} concept={getShopConcept("the-fifth-season")!} />;
}

export default withBrandEditorial("/concepts/the-fifth-season/shop", FifthSeasonShop);
