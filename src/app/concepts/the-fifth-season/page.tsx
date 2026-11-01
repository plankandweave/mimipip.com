
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectBook } from "@/components/book/ProjectBook";
import { getProject } from "@/content/projects";
import { brand } from "@/brand/current";
import { hiddenConceptSlugs } from "@/lib/concept-availability";
import "../../projects/book.css";
import "./fifth-season.css";
export const dynamic = "force-dynamic";
 function inheritedGenerateMetadata(): Metadata {
 const project = getProject("the-fifth-season");
 return {title: project ? `${project.title} · ${brand.name}` : brand.name, description: project?.standfirst};
}
  async function Concept() {
 const project = getProject("the-fifth-season");
 if (!project || (await hiddenConceptSlugs()).has("the-fifth-season")) notFound();
 return <div className="fifth-season-concept"><ProjectBook project={project} backHref="/concepts?space=hospitality" backLabel={`${brand.name} · Hospitality concepts`} /></div>;
}

export default withBrandEditorial("/concepts/the-fifth-season", Concept);
export function generateMetadata() { return editorialMetadata("/concepts/the-fifth-season"); }
