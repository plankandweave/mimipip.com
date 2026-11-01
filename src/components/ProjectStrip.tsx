import { hiddenConceptSlugs } from "@/lib/concept-availability";
import Image from "@/components/SiteImage";
import Link from "next/link";
import type { Project } from "@/content/projects/types";
import { mediaUrl } from "@/lib/project-media";

/**
 * A row of case-study books, in shop chrome rather than book chrome.
 *
 * Used on /commercial and on every segment page — the books are a shared
 * library, so one hospitality study can front several segments without being
 * rebuilt. The concept/commissioned label travels with the card for the same
 * reason it sits on the cover: a reader should never work out from context
 * that a study was speculative.
 */
export async function ProjectStrip({
  projects,
  heading = "Selected projects",
  blurb,
}: {
  projects: Project[];
  heading?: string;
  blurb?: string;
}) {
  const hidden = await hiddenConceptSlugs();
  projects = projects.filter(project => !hidden.has(project.slug));
  if (projects.length === 0) return null;

  return (
    <section className="container-x pb-16">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-2xl lg:text-3xl">{heading}</h2>
        <Link href="/projects" className="text-sm font-semibold link-underline">
          All projects →
        </Link>
      </div>
      {blurb && <p className="mt-3 max-w-xl text-slate">{blurb}</p>}

      <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => {
          const cover = mediaUrl(p.cover);
          return (
            <Link
              key={p.slug}
              href={`/projects/${p.slug}`}
              className="group flex h-full flex-col overflow-hidden rounded-[22px] border border-edge bg-surface"
            >
              <div className="relative aspect-[16/10] bg-wash">
                {cover && (
                  <Image
                    src={cover}
                    alt={p.title}
                    fill
                    sizes="(max-width: 768px) 100vw, 460px"
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                  />
                )}
              </div>
              <div className="flex flex-1 flex-col p-5">
                <span className="caps text-slate">
                  {p.slug === "the-lives-within" ? p.client : p.kind === "concept" ? "Concept study" : "Commissioned project"}
                </span>
                <p className="mt-2 font-display text-lg font-bold">{p.title}</p>
                <p className="mt-1.5 line-clamp-2 text-sm text-slate">{p.standfirst}</p>
                <span className="mt-auto pt-4 text-sm font-semibold">Read the story →</span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
