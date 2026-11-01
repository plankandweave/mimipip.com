import Link from "next/link";
import { ProjectStrip } from "@/components/ProjectStrip";
import { PROJECT_CATEGORIES, projectsForCategory, type ProjectCategory } from "@/content/project-categories";

export function ProjectCategoryPage({ category }: { category: ProjectCategory }) {
  const projects = projectsForCategory(category);
  return (
    <div>
      <div className="mx-4 mt-4 rounded-[32px] bg-lavender/40 lg:mx-6">
        <div className="container-x py-14">
          <Link href="/projects" className="caps text-slate">← All case studies</Link>
          <p className="caps mt-8 text-slate">{category.eyebrow}</p>
          <h1 className="mt-3 max-w-4xl text-[clamp(2.2rem,4.5vw,3.4rem)] leading-tight">{category.headline ?? category.label}</h1>
          <p className="mt-5 max-w-2xl text-slate">{category.description}</p>
          {category.proof && (
            <dl className="mt-10 grid gap-px overflow-hidden rounded-[20px] border border-edge bg-edge sm:grid-cols-2 lg:grid-cols-4">
              {category.proof.map((item) => (
                <div key={item.label} className="bg-surface/95 p-5">
                  <dt className="caps text-slate">{item.label}</dt>
                  <dd className="mt-2 font-display text-lg font-bold">{item.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
      {category.capabilities && (
        <section className="container-x py-16">
          <p className="caps text-slate">What we bring to an education campus</p>
          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {category.capabilities.map((item, index) => (
              <article key={item.title} className="rounded-[22px] border border-edge bg-surface p-5">
                <span className="caps text-slate">{String(index + 1).padStart(2, "0")}</span>
                <h2 className="mt-6 font-display text-xl font-bold">{item.title}</h2>
                <p className="mt-3 text-sm leading-6 text-slate">{item.body}</p>
              </article>
            ))}
          </div>
        </section>
      )}
      <ProjectStrip
        projects={projects}
        heading={`${category.label} concept studies`}
        blurb={category.slug === "education" ? "The principal spaces come first. The quieter, less visible rooms follow — because a school is judged in public but sustained in everyday life." : "Only work relevant to this sector, collected in one link you can share directly."}
      />
      {category.slug === "education" && (
        <section className="container-x pb-16">
          <div className="rounded-[28px] bg-ink px-6 py-10 text-white lg:flex lg:items-end lg:justify-between lg:gap-10 lg:px-10">
            <div>
              <p className="caps text-white/60">Begin with one useful wall</p>
              <h2 className="mt-3 max-w-2xl text-3xl leading-tight">Send us the floor plan and the wall students see first.</h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-white/70">We will identify where a coherent visual system can strengthen arrival, learning, belonging and the daily route through your campus.</p>
            </div>
            <Link href="/contact?about=Education%20campus" className="btn mt-7 shrink-0 bg-white text-ink lg:mt-0">Start a campus conversation →</Link>
          </div>
        </section>
      )}
      <nav className="container-x pb-20" aria-label="Other case-study sectors">
        <p className="caps text-slate">Explore another sector</p>
        <div className="mt-4 flex flex-wrap gap-3">
          {PROJECT_CATEGORIES.filter((item) => item.slug !== category.slug).map((item) => (
            <Link key={item.slug} href={`/projects/${item.slug}`} className="btn btn-ghost text-sm">{item.label} →</Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
