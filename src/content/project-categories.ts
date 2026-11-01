import { PROJECTS, type Project } from "./projects";

/** Shareable, audience-specific case-study collections. Membership is explicit
 * so a narrowly shared sales link can never pick up an unrelated study. */
export type ProjectCategory = {
  slug: string;
  label: string;
  eyebrow: string;
  description: string;
  projectSlugs: string[];
  headline?: string;
  proof?: { value: string; label: string }[];
  capabilities?: { title: string; body: string }[];
};

export const PROJECT_CATEGORIES: ProjectCategory[] = [];

export function getProjectCategory(slug: string, categories: readonly ProjectCategory[] = PROJECT_CATEGORIES): ProjectCategory | undefined {
  return categories.find((category) => category.slug === slug);
}

export function projectsForCategory(category: ProjectCategory, projects: readonly Project[] = PROJECTS): Project[] {
  const positions = new Map(category.projectSlugs.map((slug, index) => [slug, index]));
  return projects.filter((project) => positions.has(project.slug)).sort(
    (a, b) => positions.get(a.slug)! - positions.get(b.slug)!,
  );
}
