
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectBook } from "@/components/book/ProjectBook";
import { cityCanvas } from "@/content/projects/city-canvas";
import { hiddenConceptSlugs } from "@/lib/concept-availability";
import "../../projects/book.css";
import "./concept.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = editorialMetadata("/concepts/city-canvas");
  async function Page() {
 if ((await hiddenConceptSlugs()).has("city-canvas")) notFound();
 return <div className="city-canvas-concept"><ProjectBook project={cityCanvas} backHref="/concepts?space=hospitality" backLabel="Zyvorah · Hospitality concepts" /></div>;
}

export default withBrandEditorial("/concepts/city-canvas", Page);
