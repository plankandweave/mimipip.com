
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PROJECTS, getProject } from "@/content/projects";
import { ProjectBook } from "@/components/book/ProjectBook";
import { getSiteFilm } from "@/lib/site-films";
import { FlipBook } from "@/components/book/FlipBook";
import { mediaUrl } from "@/lib/project-media";
import { PROJECT_CATEGORIES, getProjectCategory, projectsForCategory } from "@/content/project-categories";
import { ProjectCategoryPage } from "@/components/ProjectCategoryPage";
import "../book.css";
import "../flip.css";

type Props = { params: Promise<{ slug: string }> };

// Books are static, but a cleared Library film can join one at any time; the
// publisher refreshes this path when it does and the hour is the backstop.
export const revalidate = 3600;

// Case studies are static content in the repo, so every book is prerendered.
export function generateStaticParams() {
  return [...PROJECTS.map((p) => ({ slug: p.slug })), ...PROJECT_CATEGORIES.map((category) => ({ slug: category.slug }))];
}

 async function buildPageMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = getProjectCategory(slug);
  if (category) {
    const lead = projectsForCategory(category)[0];
    const cover = lead ? mediaUrl(lead.cover) : undefined;
    return {
      title: `${category.label} case studies`,
      description: category.description,
      alternates: { canonical: `/projects/${category.slug}` },
      openGraph: { title: `${category.label} case studies · Zyvorah`, description: category.description, url: `/projects/${category.slug}`, images: cover ? [cover] : undefined },
    };
  }
  const project = getProject(slug);
  if (!project) return { title: "Project not found" };

  // The share card carries the concept/commissioned label too — a link pasted
  // into a WhatsApp group is often the first thing a reader sees.
  const label = project.slug === "the-lives-within" ? project.client : project.kind === "concept" ? "Concept study" : "Project";
  const cover = mediaUrl(project.cover);

  return {
    title: `${project.title} · ${project.client}`,
    description: project.standfirst,
    alternates: { canonical: `/projects/${project.slug}` },
    openGraph: {
      title: `${project.title} — ${label}`,
      description: project.standfirst,
      url: `/projects/${project.slug}`,
      images: cover ? [cover] : undefined,
    },
  };
}

export default async function ProjectPage({ params }: Props) {
  const { slug } = await params;
  const category = getProjectCategory(slug);
  if (category) return <ProjectCategoryPage category={category} />;
  const project = getProject(slug);
  if (!project) notFound();

  // A project carrying flip spreads reads left-to-right; everything else
  // keeps the classic vertical book. One data field, two presentations.
  // A film filed for this study (a /concepts/ or /projects/ link — both are
  // the concept key) opens the classic book; the flip book has no slot for it.
  return project.flip ? <FlipBook project={project} /> : <ProjectBook project={project} film={await getSiteFilm("concept", project.slug)} />;
}

export const generateMetadata = withBrandMetadata(buildPageMetadata);
