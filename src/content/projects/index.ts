import type { Project, Segment } from "./types";

/** Brand-owned project records. Populate only with approved MimiPip content. */
export const PROJECTS: Project[] = [];

export const CONCEPTS = PROJECTS.filter((project) => project.kind === "concept");
export const SHOPPABLE_CONCEPTS = CONCEPTS.filter((project) => project.shop);

export function getProject(slug: string): Project | undefined {
  return PROJECTS.find((p) => p.slug === slug);
}

export function projectsForSegment(segment: Segment): Project[] {
  return PROJECTS.filter((p) => p.segments.includes(segment));
}

export type { Project, Segment };
