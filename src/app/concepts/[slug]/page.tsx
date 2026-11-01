
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OfficeConceptBuilder } from "@/components/office/OfficeConceptBuilder";
import { getConceptOffers } from "@/lib/office-concept-server";
import { fetchPrintRules } from "@/lib/print-rules";
import { conceptPath, getShopConcept } from "@/lib/shop-concepts";
import { hiddenConceptSlugs } from "@/lib/concept-availability";
import { APARTMENT_SHOPPING, isApartmentSlug } from "@/lib/apartment-shopping";
import { getProductsByHandles } from "@/lib/queries";
import { ApartmentConcept } from "@/components/concepts/ApartmentConcept";
import { getProject } from "@/content/projects";
import { ProjectBook } from "@/components/book/ProjectBook";
import { SiteFilmBand } from "@/components/SiteFilmBand";
import { getSiteFilm, videoObjectJsonLd } from "@/lib/site-films";
import { JsonLd } from "@/components/JsonLd";
import { getPersonaApartment } from "@/content/persona-apartments";
import { PersonaApartment } from "@/components/concepts/PersonaApartment";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ shop?: string }> };
 async function buildPageMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const c = getShopConcept(slug);
  return c
    ? {
        title: slug === "the-lives-within" ? `${c.title} · Family apartment in Gurgaon` : `Shop ${c.title} · Shoppable concepts`,
        description: c.description,
        alternates: { canonical: conceptPath(slug) },
        openGraph: { images: [c.cover] },
      }
    : {};
}
export default async function Page({ params, searchParams }: Props) {
  const { slug } = await params;
  // The cleared Library film filed with this concept's link, if any
  // (src/lib/site-films.ts). Each of the three renderers below places it.
  const film = await getSiteFilm("concept", slug);
  const shopConcept = getShopConcept(slug);
  const filmLd = film && shopConcept
    ? videoObjectJsonLd(film, { path: conceptPath(slug), name: `${shopConcept.title} — the film`, description: shopConcept.description })
    : null;
  const ld = filmLd ? <JsonLd data={filmLd} /> : null;
  if (isApartmentSlug(slug)) {
    const products = await getProductsByHandles(APARTMENT_SHOPPING[slug]);
    return <>{ld}<ApartmentConcept slug={slug} film={film} products={products} /></>;
  }
  const project = getProject(slug);
  if (project?.shop) return <>{ld}<ProjectBook project={project} backHref="/concepts" backLabel="Zyvorah · Concepts" film={film} /></>;
  const concept = shopConcept;
  if (!concept || (await hiddenConceptSlugs()).has(slug)) notFound();
  const home = getPersonaApartment(slug);
  if (home && (await searchParams).shop !== "1") return <>{ld}<PersonaApartment home={home} /></>;
  const [catalogue, rules] = await Promise.all([
    getConceptOffers(slug),
    fetchPrintRules(),
  ]);
  return (
    <>
      {ld}
      {film && <SiteFilmBand film={film} eyebrow={`${concept.title} · The film`} heading={film.title} body={concept.description} />}
      <OfficeConceptBuilder
        key={slug}
        {...catalogue}
        rules={rules}
        concept={concept}
        exploreHref={home ? conceptPath(slug) : undefined}
      />
    </>
  );
}

export const generateMetadata = withBrandMetadata(buildPageMetadata);
