
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EnquiryForm } from "@/components/EnquiryForm";
import { ProjectStrip } from "@/components/ProjectStrip";
import { SEGMENTS, getSegment } from "@/content/segments";
import { projectsForSegment } from "@/content/projects";
import { mediaUrl } from "@/lib/project-media";

type Props = { params: Promise<{ segment: string }> };

export function generateStaticParams() {
  return SEGMENTS.map((s) => ({ segment: s.slug }));
}

 async function buildPageMetadata({ params }: Props): Promise<Metadata> {
  const { segment } = await params;
  const s = getSegment(segment);
  if (!s) return { title: "Not found" };
  return {
    title: s.label,
    description: s.standfirst,
    alternates: { canonical: `/commercial/${s.slug}` },
    openGraph: {
      title: s.title,
      description: s.standfirst,
      url: `/commercial/${s.slug}`,
      // The sector's own lead case study, so a pasted link previews the work
      // rather than a blank card.
      images: (() => {
        const lead = projectsForSegment(s.slug)[0];
        return lead ? [mediaUrl(lead.cover)] : undefined;
      })(),
    },
  };
}

export default async function SegmentPage({ params }: Props) {
  const { segment } = await params;
  const s = getSegment(segment);
  if (!s) notFound();

  const projects = projectsForSegment(s.slug);

  return (
    <div>
      <div className="mx-4 mt-4 rounded-[32px] bg-lavender/40 lg:mx-6">
        <div className="container-x py-14">
          <Link href="/commercial" className="caps text-slate">
            ← Commercial projects
          </Link>
          <h1 className="mt-4 max-w-3xl text-[clamp(2rem,4.5vw,3.2rem)] leading-tight">{s.title}</h1>
          <p className="mt-5 max-w-xl text-slate">{s.standfirst}</p>
          <a href="#enquire" className="btn mt-8 inline-flex h-12 px-6 text-[0.82rem]">
            Start a project
          </a>
        </div>
      </div>

      {/* Proof before argument: the books are the reason this page converts. */}
      <ProjectStrip
        projects={projects}
        heading="Case studies"
        blurb="Full projects — the brief, the thinking, and every wall shown bare and finished."
      />

      <section className="container-x pb-16">
        <h2 className="text-2xl lg:text-3xl">What we hear</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {s.problems.map((p) => (
            <div key={p.t} className="rounded-[22px] bg-wash p-6">
              <p className="font-display text-lg font-bold">{p.t}</p>
              <p className="mt-2 text-sm text-slate">{p.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container-x pb-16">
        <div className="pastel-section grid items-center gap-10 bg-sage/40 md:grid-cols-2">
          <div>
            <span className="caps text-slate">How we work</span>
            <h2 className="mt-3 text-2xl lg:text-3xl">What a commission looks like</h2>
            <p className="mt-4 max-w-md text-slate">
              Not a catalogue selection. We read the building first, then design a visual
              language that runs through it.
            </p>
            <Link href="/commercial" className="btn btn-ghost mt-6 text-sm">
              How a project runs →
            </Link>
          </div>
          <ul className="grid gap-3 text-sm text-slate">
            {s.promise.map((l) => (
              <li key={l} className="flex items-start gap-2.5 rounded-[14px] bg-surface/70 px-4 py-3">
                <span aria-hidden>✦</span> {l}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="enquire" className="container-x pb-20">
        <div className="mx-auto max-w-lg">
          <h2 className="text-2xl lg:text-3xl">Start a project</h2>
          <p className="mt-3 text-slate">{s.ask}</p>
          <div className="mt-6">
            <EnquiryForm
              topic={`Commercial project — ${s.label}`}
              orgLabel="Company / organisation"
              detailsPlaceholder="The spaces, rough wall sizes, timeline, and what each area is for…"
              submitLabel="Request a quote"
            />
          </div>
        </div>
      </section>
    </div>
  );
}

export const generateMetadata = withBrandMetadata(buildPageMetadata);
