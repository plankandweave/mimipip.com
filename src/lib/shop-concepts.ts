import { brand } from "@/brand/current";
import type { Project } from "@/content/projects";
import type { PersonaApartment } from "@/content/persona-apartments";
import { PROJECTS } from "@/content/projects";
import { PERSONA_APARTMENTS } from "@/content/persona-apartments";
import type { Segment } from "@/content/projects";
import { mediaUrl } from "./project-media";
export const conceptPath = (slug: string) => `/concepts/${encodeURIComponent(slug)}`;
export const conceptShopUrl = (slug: string, projects: readonly Project[] = PROJECTS) => {
  const destination = projects.find((project) => project.slug === slug)?.shop?.href;
  const target = new URL(destination || conceptPath(slug), brand.origin);
  // Catalogue destinations belong to the current storefront, including archived absolute links.
  return new URL(target.pathname + target.search + target.hash, brand.origin).href;
};
// A project becomes discoverable as a shoppable concept by entering this
// collection. Its existing segments then place it under the right audience
// door in the header; there is no separate navigation list to maintain.
export type ShopAudience = Segment | "homes" | "real-estate";
const EXTRA_AUDIENCES: Record<string,ShopAudience[]> = {"a-life-collected":["homes"],"the-lives-within":["homes"],shorelight:["real-estate"]};
export function buildShopConcepts(projects: readonly Project[], homes: readonly PersonaApartment[]) {
 const apartments = homes.map(home => ({ slug: home.slug, title: home.title, client: "Apartment", segments: ["homes"] as ShopAudience[], cover: mediaUrl(home.rooms[0].room), description: home.description }));
 return [...apartments, ...projects.filter(p => p.kind !== "commissioned").map(p => ({slug:p.slug,title:p.title,client:p.client,segments:[...p.segments,...(EXTRA_AUDIENCES[p.slug]||[])],cover:mediaUrl(p.cover),description:p.standfirst}))];
}
export const SHOP_CONCEPTS = buildShopConcepts(PROJECTS, PERSONA_APARTMENTS);
export const getShopConcept = (slug: string) => SHOP_CONCEPTS.find(p => p.slug === slug);
export const shopConceptsForSegment = (segment: ShopAudience, concepts = SHOP_CONCEPTS) => concepts.filter(p => p.segments.includes(segment));
export type ShopConcept = (typeof SHOP_CONCEPTS)[number];

export const HOME_BEDROOM_COUNTS = [2, 3, 4] as const;
export type HomeBedroomCount = (typeof HOME_BEDROOM_COUNTS)[number];
const HOME_BEDROOMS: Record<string, HomeBedroomCount> = {
  ...Object.fromEntries(PERSONA_APARTMENTS.map(home => [home.slug, 2 as const])),
  "blue-and-clay": 2,
  "angan-by-the-sea": 2,
  "raat-bagh": 2,
  "extreme-modernist": 2,
  "new-york-apartment": 2,
  "a-life-collected": 4,
  "the-lives-within": 4,
};
export const homeBedroomCount = (slug: string, homes: readonly PersonaApartment[] = PERSONA_APARTMENTS) => homes.some(home => home.slug === slug) ? 2 : HOME_BEDROOMS[slug];
export const availableHomeBedroomCounts = (concepts: readonly { slug: string }[]) =>
  HOME_BEDROOM_COUNTS.filter(count => concepts.some(concept => homeBedroomCount(concept.slug) === count));
export const homeBedroomConceptPath = (count: HomeBedroomCount) => `/concepts?space=homes&bedrooms=${count}`;
