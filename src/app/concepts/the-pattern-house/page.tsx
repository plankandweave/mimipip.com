
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ProjectBook } from "@/components/book/ProjectBook";
import { thePatternHouse } from "@/content/projects/the-pattern-house";
import { hiddenConceptSlugs } from "@/lib/concept-availability";
import "../../projects/book.css";
import "./concept.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = editorialMetadata("/concepts/the-pattern-house");
  async function Page({ searchParams }: { searchParams: Promise<{ design?: string | string[] }> }) {
 if ((await hiddenConceptSlugs()).has("the-pattern-house")) notFound();
 const { design } = await searchParams;
 if (typeof design === "string" && design) redirect(`/concepts/the-pattern-house/shop?design=${encodeURIComponent(design)}`);
 return <div className="the-pattern-house-concept"><ProjectBook project={thePatternHouse} backHref="/concepts?space=hospitality" backLabel="Zyvorah · Hospitality concepts" /></div>;
}

export default withBrandEditorial("/concepts/the-pattern-house", Page);
