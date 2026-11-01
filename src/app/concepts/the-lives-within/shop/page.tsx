
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OfficeConceptBuilder } from "@/components/office/OfficeConceptBuilder";
import { hiddenConceptSlugs } from "@/lib/concept-availability";
import { getConceptOffers } from "@/lib/office-concept-server";
import { fetchPrintRules } from "@/lib/print-rules";
import { getShopConcept } from "@/lib/shop-concepts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = editorialMetadata("/concepts/the-lives-within/shop");

  async function Page() {
  if ((await hiddenConceptSlugs()).has("the-lives-within")) notFound();
  const [catalogue, rules] = await Promise.all([
    getConceptOffers("the-lives-within"),
    fetchPrintRules(),
  ]);
  return <OfficeConceptBuilder key="the-lives-within" {...catalogue} rules={rules} concept={getShopConcept("the-lives-within")!} />;
}

export default withBrandEditorial("/concepts/the-lives-within/shop", Page);
