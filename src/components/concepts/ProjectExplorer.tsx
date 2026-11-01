"use client";
import Image from "@/components/SiteImage";
import Link from "next/link";
import { useState } from "react";
import { conceptShopUrl, availableHomeBedroomCounts, homeBedroomCount, type HomeBedroomCount, type ShopConcept } from "@/lib/shop-concepts";
import { createLookPath } from "@/lib/concept-copy";
import type { SiteFilm } from "@/lib/site-films";
import { FilmBadge, FilmHoverPreview } from "@/components/FilmBadge";
const SPACES = [
  ["all", "All spaces"],
  ["homes", "Home"],
  ["workplaces", "Office"],
  ["restaurants", "Restaurant or café"],
  ["hotels", "Hotel"],
  ["healthcare", "Healthcare"],
  ["education", "School or college"],
  ["retail", "Shop or showroom"],
  ["real-estate", "Residential development"],
  ["clubs", "Club or shared space"],
];
export function ProjectExplorer({
  concepts,
  initialSpace = "all",
  lockedSpace,
  initialBedrooms,
  films = {},
}: {
  concepts: (ShopConcept & {
    kind: string;
    spaces: string[];
    shoppable: boolean;
    exploreHref?: string;
  })[];
  initialSpace?: string;
  lockedSpace?: string;
  initialBedrooms?: HomeBedroomCount;
  /** The live Library film per concept slug (src/lib/site-films.ts). A card
   *  with one keeps its photograph and gains "Watch the film". */
  films?: Record<string, SiteFilm>;
}) {
  const [space, setSpace] = useState(initialSpace);
  const bedroomCounts = availableHomeBedroomCounts(concepts);
  const [bedrooms, setBedrooms] = useState<HomeBedroomCount | undefined>(
    initialBedrooms && bedroomCounts.includes(initialBedrooms) ? initialBedrooms : undefined,
  );
  const activeSpace = lockedSpace ?? space;
  const shown = concepts.filter(
    (c) => (activeSpace === "all" || c.spaces.includes(activeSpace)) &&
      (activeSpace !== "homes" || !bedrooms || homeBedroomCount(c.slug) === bedrooms),
  );
  return (
    <>
      {!lockedSpace && <fieldset className="mb-8">
        <legend className="mb-4 text-xl font-semibold">
          What kind of space do you have?
        </legend>
        <div className="flex flex-wrap gap-2">
          {SPACES.map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={space === id}
              onClick={() => setSpace(id)}
              className={`rounded-full border px-4 py-2 text-sm ${space === id ? "bg-charcoal text-white border-charcoal" : "border-edge bg-white"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>}
      {activeSpace === "homes" && <fieldset className="mb-8">
        <legend className="mb-4 text-xl font-semibold">Shop by bedrooms</legend>
        <div className="flex flex-wrap gap-2">
          {[undefined, ...bedroomCounts].map(count => (
            <button key={count ?? "all"} type="button" aria-pressed={bedrooms === count}
              onClick={() => setBedrooms(count)}
              className={`rounded-full border px-4 py-2 text-sm ${bedrooms === count ? "bg-charcoal text-white border-charcoal" : "border-edge bg-white"}`}>
              {count ? `${count}-bedroom` : "All homes"}
            </button>
          ))}
        </div>
      </fieldset>}
      <p role="status" className="mb-5 text-sm text-slate">
        {shown.length} {shown.length === 1 ? "idea" : "ideas"} for{" "}
        {activeSpace === "all"
          ? "every space"
          : SPACES.find((s) => s[0] === activeSpace)?.[1].toLowerCase()}
      </p>
      <div className="grid gap-7 md:grid-cols-2 lg:grid-cols-3">
        {shown.map((c) => (
          <article
            key={c.slug}
            className="flex flex-col overflow-hidden rounded-2xl border border-edge"
          >
            <div className="relative">
            <Link href={c.exploreHref ?? `/projects/${c.slug}`}>
              <div className="relative aspect-[4/3]">
                <Image
                  src={c.cover}
                  alt={c.title}
                  fill
                  sizes="(max-width:768px) 100vw, 33vw"
                  className="object-cover object-bottom"
                />
                {films[c.slug] && <FilmHoverPreview film={films[c.slug]} />}
              </div>
            </Link>
            {/* Outside the link: a button inside an anchor is invalid, and the
                badge opens the film rather than the page. */}
            {films[c.slug] && <FilmBadge film={films[c.slug]} label={`${c.title} — the film`} className="absolute bottom-3 left-3" />}
            </div>
            <div className="flex flex-1 flex-col p-5">
              <p className="text-xs text-slate">
                {c.kind === "concept"
                  ? "Design concept"
                  : "Commissioned project"}{" "}
                · {c.client}
              </p>
              <h2 className="mt-2 text-xl">{c.title}</h2>
              <p className="mt-3 text-sm text-slate">{c.description}</p>
              <Link
                href={c.exploreHref ?? `/projects/${c.slug}`}
                className="mt-4 text-sm font-semibold"
              >
                Explore this space →
              </Link>
              <div className="mt-auto pt-5 grid gap-2">
                {c.shoppable ? (
                  <a
                    href={conceptShopUrl(c.slug)}
                    className="rounded-lg bg-[#176856] px-4 py-3 text-center text-sm font-semibold text-white"
                  >
                    Buy this look →
                  </a>
                ) : (
                  <p className="rounded-lg bg-wash px-4 py-3 text-center text-sm">
                    Commissioned work · Not for sale
                  </p>
                )}
                <Link
                  href={createLookPath(c.slug)}
                  className="rounded-lg border border-edge px-3 py-3 text-center text-sm font-semibold"
                >
                  Create a look for your space →
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>
      {!shown.length && (
        <p className="rounded-xl bg-wash p-6">
          More ideas are on their way.{" "}
          <button className="underline" onClick={() => setSpace("all")}>
            Explore all spaces
          </button>
        </p>
      )}
    </>
  );
}
