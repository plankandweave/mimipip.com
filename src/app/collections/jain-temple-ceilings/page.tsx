
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import { JainCollection, type JainCollectionSearch } from "@/components/jain/Collection";
export const metadata: Metadata = editorialMetadata("/collections/jain-temple-ceilings");
  async function Page({ searchParams }: { searchParams: Promise<JainCollectionSearch> }) {
  return <JainCollection surface="ceiling" search={await searchParams} />;
}

export default withBrandEditorial("/collections/jain-temple-ceilings", Page);
