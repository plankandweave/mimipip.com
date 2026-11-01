
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectBook } from "@/components/book/ProjectBook";
import { getProject } from "@/content/projects";
import { brand } from "@/brand/current";
import { hiddenConceptSlugs } from "@/lib/concept-availability";
import "../../projects/book.css";
import "./sidequest.css";
export const dynamic = "force-dynamic";
 function inheritedGenerateMetadata(): Metadata {
 const project = getProject("sidequest");
 return {title: project ? `${project.title} · ${brand.name}` : brand.name, description: project?.standfirst};
}
  async function Concept() {
 const project = getProject("sidequest");
 if (!project || (await hiddenConceptSlugs()).has("sidequest")) notFound();
 return <div className="sidequest-concept"><ProjectBook project={project} backHref="/concepts?space=hospitality" backLabel={`${brand.name} · Hospitality concepts`} /></div>;
}

export default withBrandEditorial("/concepts/sidequest", Concept);
export function generateMetadata() { return editorialMetadata("/concepts/sidequest"); }
