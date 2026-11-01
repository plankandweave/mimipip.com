
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectBook } from "@/components/book/ProjectBook";
import { quietAtlas } from "@/content/projects/quiet-atlas";
import { hiddenConceptSlugs } from "@/lib/concept-availability";
import "../../projects/book.css";
import "./concept.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = editorialMetadata("/concepts/quiet-atlas");
  async function Page() {
 if ((await hiddenConceptSlugs()).has("quiet-atlas")) notFound();
 return <div className="quiet-atlas-concept"><ProjectBook project={quietAtlas} backHref="/concepts?space=hospitality" backLabel="Zyvorah · Hospitality concepts" /></div>;
}

export default withBrandEditorial("/concepts/quiet-atlas", Page);
