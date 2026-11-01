
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectBook } from "@/components/book/ProjectBook";
import { privateChronicle } from "@/content/projects/private-chronicle";
import { hiddenConceptSlugs } from "@/lib/concept-availability";
import "../../projects/book.css";
import "./concept.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = editorialMetadata("/concepts/private-chronicle");
  async function Page() {
 if ((await hiddenConceptSlugs()).has("private-chronicle")) notFound();
 return <div className="private-chronicle-concept"><ProjectBook project={privateChronicle} backHref="/concepts?space=hospitality" backLabel="Zyvorah · Hospitality concepts" /></div>;
}

export default withBrandEditorial("/concepts/private-chronicle", Page);
