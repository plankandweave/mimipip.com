
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import { ProjectExplorer } from "@/components/concepts/ProjectExplorer";
import { hiddenConceptSlugs } from "@/lib/concept-availability";
import { conceptPath, SHOP_CONCEPTS, HOME_BEDROOM_COUNTS } from "@/lib/shop-concepts";
import { getSiteFilmsFor } from "@/lib/site-films";

export const dynamic = "force-dynamic";

export const metadata: Metadata = brandMetadata({
  title: "Shop Concepts",
  description:
    "Shop complete Zyvorah wallpaper concepts for homes, hospitality, workplaces and shared spaces.",
  alternates: { canonical: "/concepts" },
});

const CONCEPT_SPACES = new Set([
  "homes",
  "workplaces",
  "hospitality",
  "real-estate",
]);

export default async function ConceptsIndex({
  searchParams,
}: {
  searchParams: Promise<{ space?: string; bedrooms?: string }>;
}) {
  const { space, bedrooms } = await searchParams;
  const selectedSpace = space && CONCEPT_SPACES.has(space) ? space : "all";
  const [hidden, films] = await Promise.all([
    hiddenConceptSlugs(),
    getSiteFilmsFor("concept", SHOP_CONCEPTS.map((c) => c.slug)),
  ]);
  const concepts = SHOP_CONCEPTS.filter((concept) => !hidden.has(concept.slug)).map(
    (concept) => ({
      ...concept,
      kind: "concept",
      shoppable: true,
      spaces: concept.segments,
      exploreHref: conceptPath(concept.slug),
    }),
  );

  return (
    <section className="container-x py-9 sm:py-12">
      <p className="caps text-slate">Shop Concepts</p>
      <h1 className="mt-3 text-[clamp(2rem,4vw,3.4rem)]">
        {selectedSpace === "homes"
          ? "Shop concepts for your home"
          : "Shop a complete look"}
      </h1>
      <p className="mt-4 mb-8 max-w-3xl text-slate">
        {selectedSpace === "homes"
          ? "Browse complete residential stories, then make the one you choose fit your walls."
          : "Start with a complete Zyvorah story for your home, workplace or guest space. Choose a concept, then make it fit your walls."}
      </p>
      <ProjectExplorer
        key={`${selectedSpace}-${bedrooms ?? "all"}`}
        concepts={concepts}
        initialSpace={selectedSpace}
        initialBedrooms={HOME_BEDROOM_COUNTS.find(count => String(count) === bedrooms)}
        lockedSpace={selectedSpace === "all" ? undefined : selectedSpace}
        films={films}
      />
    </section>
  );
}
