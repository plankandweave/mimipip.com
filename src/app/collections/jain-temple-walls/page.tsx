
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import { JainCollection, type JainCollectionSearch } from "@/components/jain/Collection";
export const metadata: Metadata = editorialMetadata("/collections/jain-temple-walls");
  async function Page({ searchParams }: { searchParams: Promise<JainCollectionSearch> }) {
  return <JainCollection surface="wall" search={await searchParams} />;
}

export default withBrandEditorial("/collections/jain-temple-walls", Page);
