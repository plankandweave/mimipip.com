
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import Image from "@/components/SiteImage";
import Link from "next/link";
import FitText from "@/components/FitText";
import { PROJECTS } from "@/content/projects";
import { PROJECT_CATEGORIES } from "@/content/project-categories";
import { mediaUrl } from "@/lib/project-media";

// These links get pasted into WhatsApp and email, so the share card is the
// first thing most recipients see. Without an image it renders as a bare grey
// box next to a URL, which reads as spam.
export const metadata: Metadata = brandMetadata({
  title: "Projects",
  description:
    "Wall narratives for workplaces, hotels, hospitals and schools — the thinking, the artwork and the finished wall, project by project.",
  alternates: { canonical: "/projects" },
  openGraph: {
    title: "Zyvorah — Projects",
    description:
      "Case studies in wall curation: the brief, the thinking, and every wall shown bare and finished.",
    url: "/projects",
    images: PROJECTS[0] ? [mediaUrl(PROJECTS[0].cover)] : undefined,
  },
});

export default function ProjectsIndex() {
  return (
    <div>
      <div className="mx-4 mt-4 rounded-[32px] bg-lavender/40 lg:mx-6">
        <div className="container-x py-14 text-center">
          <span className="caps text-slate">Projects</span>
          <div className="mt-3">
            <FitText className="text-[clamp(2.2rem,4.5vw,3.4rem)] leading-tight" maxRem={10}>
              Walls that carry a story
            </FitText>
          </div>
          <p className="mx-auto mt-4 max-w-xl text-slate">
            Each project starts with the building, not the catalogue. Here is the
            thinking, the artwork and the finished wall — in full.
          </p>
        </div>
      </div>

      <section className="container-x py-16">
        <div className="mb-14">
          <p className="caps text-slate">Browse by sector</p>
          <h2 className="mt-3 text-2xl lg:text-3xl">Send people directly to the work that matters to them</h2>
          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PROJECT_CATEGORIES.map((category) => (
              <Link key={category.slug} href={`/projects/${category.slug}`} className="group flex h-full flex-col rounded-[22px] border border-edge bg-surface p-6 transition-colors hover:bg-wash">
                <p className="font-display text-lg font-bold">{category.label}</p>
                <p className="mt-2 text-sm text-slate">{category.description}</p>
                <span className="mt-auto block pt-5 text-sm font-semibold">See case studies →</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="mb-8">
          <p className="caps text-slate">Complete library</p>
          <h2 className="mt-2 text-2xl lg:text-3xl">All case studies</h2>
        </div>
        <div className="grid gap-8 md:grid-cols-2">
          {PROJECTS.map((p) => {
            const cover = mediaUrl(p.cover);
            return (
              <Link
                key={p.slug}
                href={`/projects/${p.slug}`}
                className="group flex h-full flex-col overflow-hidden rounded-[22px] border border-edge"
              >
                <div className="relative aspect-[16/10] bg-wash">
                  {cover && (
                    <Image
                      src={cover}
                      alt={p.title}
                      fill
                      sizes="(max-width: 768px) 100vw, 700px"
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                    />
                  )}
                </div>
                {/* Column, so the CTA can sit on the bottom edge rather than
                    wherever the standfirst happens to end. Two cards side by
                    side with their links at different heights read as two
                    unrelated components. */}
                <div className="flex flex-1 flex-col p-6">
                  {/* Same label as the cover: a reader should never work out
                      from context that a study was speculative. */}
                  <span className="caps text-slate">
                    {p.slug === "the-lives-within" ? p.client : `${p.kind === "concept" ? "Concept study" : "Commissioned project"} · ${p.client}`}
                  </span>
                  <p className="mt-2 font-display text-xl font-bold">{p.title}</p>
                  <p className="mt-2 text-sm text-slate">{p.standfirst}</p>
                  <span className="mt-auto pt-5 text-sm font-semibold">Read the story →</span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
