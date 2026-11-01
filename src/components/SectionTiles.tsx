import { hiddenConceptSlugs } from "@/lib/concept-availability";
import Image from "@/components/SiteImage";
import Link from "next/link";
import type { Project } from "@/content/projects/types";
import { mediaUrl } from "@/lib/project-media";

/**
 * The tiles a section hub shows under "Shop by space" — spaces and case
 * studies, in ONE grid and ONE visual treatment.
 *
 * WHY THEY SHARE A GRID. A buyer landing on /office is choosing what to look
 * at, not choosing a content type. The projects were already on these pages,
 * but in their own row further down in their own chrome (ProjectStrip, 16:10
 * cards under a separate heading), which reads as a footnote — so the one
 * thing that proves we have actually done this at scale sat below the fold in
 * a different visual language from the thing above it. Same grid, same card,
 * same crop.
 *
 * WHAT STILL SEPARATES THEM. A case-study tile carries its kind as a caps
 * label and ends in "Read the case study", where a space tile ends in a
 * count. That line is not decoration: `ProjectKind` exists because a reader
 * who later works out that a "case study" was imagined has been misled, and
 * the label travels with the card for the same reason it sits on the book's
 * cover. Sharing a style must not mean losing that.
 */

/**
 * `meta` is the footer line, composed by the caller rather than derived here.
 * The three sections genuinely count different things — /office counts a
 * curated tag ("21 designs"), while /hospitality and /real-estate count
 * renders against tagged ("21 shot for this space · 53 designs in total")
 * because their grids are a hard renders-only filter. Passing the sentence
 * keeps that difference where it is decided instead of teaching this
 * component three merchandising rules.
 */
export type SpaceTileData = {
  slug: string;
  label: string;
  tease: string;
  image: string | null;
  portrait: boolean;
  meta?: string | null;
};

/** Shared chrome. Both tiles are this card; only the footer line differs. */
const CARD =
  "group overflow-hidden rounded-[22px] border border-edge bg-surface transition-colors hover:border-charcoal";
const FRAME = "relative aspect-[4/3] overflow-hidden bg-wash";
const IMG = "transition-transform duration-700 group-hover:scale-105";

export function SpaceTile({ tile, href }: { tile: SpaceTileData; href: string }) {
  return (
    <Link href={href} className={CARD}>
      <div className={FRAME}>
        {tile.image && (
          <Image
            src={tile.image}
            alt={tile.label}
            fill
            sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, 33vw"
            className={`${IMG} ${tile.portrait ? "object-contain p-3" : "object-cover"}`}
          />
        )}
      </div>
      <div className="p-5">
        <p className="font-display text-lg font-bold">{tile.label}</p>
        <p className="mt-1.5 text-sm text-slate">{tile.tease}</p>
        {tile.meta && <p className="mt-3 text-xs text-mist">{tile.meta}</p>}
      </div>
    </Link>
  );
}

export async function ProjectTile({ project }: { project: Project }) {
  if ((await hiddenConceptSlugs()).has(project.slug)) return null;
  const cover = mediaUrl(project.cover);
  return (
    <Link href={`/projects/${project.slug}`} className={CARD}>
      <div className={FRAME}>
        {cover && (
          <Image
            src={cover}
            alt={project.title}
            fill
            sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, 33vw"
            className={`${IMG} object-cover`}
          />
        )}
      </div>
      <div className="p-5">
        {/* Never dropped for tidiness — see the note at the top of this file. */}
        <span className="caps text-slate">
          {project.slug === "the-lives-within" ? project.client : project.kind === "concept" ? "Concept study" : "Commissioned project"}
        </span>
        <p className="mt-2 font-display text-lg font-bold">{project.title}</p>
        <p className="mt-1.5 line-clamp-2 text-sm text-slate">{project.standfirst}</p>
        <p className="mt-3 text-xs text-mist">Read the case study →</p>
      </div>
    </Link>
  );
}

/** A concept is the same authored study, entered from the buying side. */
export async function ConceptTile({ project }: { project: Project }) {
  if ((await hiddenConceptSlugs()).has(project.slug)) return null;
  const cover = mediaUrl(project.cover);
  return (
    <Link href={`/concepts/${project.slug}`} className={CARD}>
      <div className={FRAME}>
        {cover && (
          <Image
            src={cover}
            alt={`${project.title} office concept`}
            fill
            sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, 25vw"
            className={`${IMG} object-cover`}
          />
        )}
      </div>
      <div className="p-5">
        <span className="caps text-slate">Four coordinated walls</span>
        <p className="mt-2 font-display text-lg font-bold">{project.title}</p>
        <p className="mt-1.5 line-clamp-2 text-sm text-slate">{project.standfirst}</p>
        <p className="mt-3 text-xs text-mist">Shop this concept →</p>
      </div>
    </Link>
  );
}
