
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectBook } from "@/components/book/ProjectBook";
import { earthHeldLightly } from "@/content/projects/earth-held-lightly";
import { hiddenConceptSlugs } from "@/lib/concept-availability";
import "../../projects/book.css";
import "./concept.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = editorialMetadata("/concepts/earth-held-lightly");
  async function Page() {
 if ((await hiddenConceptSlugs()).has("earth-held-lightly")) notFound();
 return <div className="earth-held-lightly-concept"><ProjectBook project={earthHeldLightly} backHref="/concepts?space=hospitality" backLabel="Zyvorah · Hospitality concepts" /></div>;
}

export default withBrandEditorial("/concepts/earth-held-lightly", Page);
