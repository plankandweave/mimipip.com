import { getProject } from "@/content/projects";
import { getShopConcept } from "./shop-concepts";

/** The form and its intake must accept exactly the same catalogue references. */
export function getConceptReference(slug: string, projectLookup = getProject, shopLookup = getShopConcept) {
  return projectLookup(slug) ?? shopLookup(slug);
}
