
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import Link from "next/link";
import { EnquiryForm } from "@/components/EnquiryForm";
import { ProjectStrip } from "@/components/ProjectStrip";
import { PROJECTS } from "@/content/projects";
import { SEGMENTS } from "@/content/segments";

export const metadata: Metadata = editorialMetadata("/commercial");

// Segments with a landing page of their own link to it; the rest stay as
// plain cards until they have a case study worth sending someone to.
const SPACE_HREF: Record<string, string> = Object.fromEntries(
  SEGMENTS.map((s) => [s.slug, `/commercial/${s.slug}`]),
);

const SPACES = [
  { t: "Workspaces & campuses", d: "Offices, campuses and business districts — one visual story across every floor.", t_key: "workplaces" },
  { t: "Hospitals & clinics", d: "Where a wall is looked at for hours by someone who did not choose to be there.", t_key: "healthcare" },
  { t: "Hospitality", d: "Hotel lobbies, restaurants, cafés and bars — statement walls that set the mood.", t_key: "hospitality" },
  { t: "Retail & showrooms", d: "Multi-city rollouts where every store feels local at the door and unmistakably one brand past it.", t_key: "retail" },
  { t: "Schools & campuses", d: "Where the walls meet a student on the first day they leave home, and every day after.", t_key: "education" },
];

const STEPS = [
  ["01", "Brief & wall sizes", "Tell us the spaces, rough dimensions and the look you're after. Share a moodboard if you have one."],
  ["02", "Design & proof", "We match a design from the catalogue or adapt one, and send a proof to approve before anything is made."],
  ["03", "Production", "Once approved, commercial runs are produced and dispatched in 7–10 working days, colour-matched across every drop."],
  ["04", "Delivery & fitting", "Clearly-labelled drops arrive with a fitting guide. On-site installation is available in Bengaluru, Mumbai & Pune."],
];

  function CommercialPage() {
  return (
    <div>
      <div className="mx-4 mt-4 rounded-[32px] bg-lavender/40 lg:mx-6">
        <div className="container-x py-14 text-center">
          <span className="caps text-slate">For business</span>
          <h1 className="mt-3 text-[clamp(2.2rem,4.5vw,3.4rem)] leading-tight">Commercial &amp; project murals</h1>
          <p className="mx-auto mt-4 max-w-xl text-slate">
            From a single feature wall to a whole floor — mural wallpaper designs made to
            spec, with consistent colour across large runs and a proof approved before we begin.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <a href="#enquire" className="btn inline-flex h-12 px-6 text-[0.82rem]">Start a project</a>
            {/* The other half of the demand: an office manager with a reception
                wall and two meeting rooms does not want a quotation, and used
                to have nowhere to go from here. */}
            <Link href="/office" className="btn btn-ghost inline-flex h-12 px-6 text-[0.82rem]">
              Just a few office walls? Shop by workspace
            </Link>
          </div>
        </div>
      </div>

      <ProjectStrip
        projects={PROJECTS}
        heading="Selected projects"
        blurb="Full case studies — the brief, the thinking, and every wall shown bare and finished."
      />

      <section className="container-x py-16">
        <h2 className="text-2xl lg:text-3xl">Where it works</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SPACES.map((s) => {
            const href = SPACE_HREF[s.t_key];
            const body = (
              <>
                <p className="font-display text-lg font-bold">{s.t}</p>
                <p className="mt-2 text-sm text-slate">{s.d}</p>
                {href && <span className="mt-3 inline-block text-sm font-semibold">See the work →</span>}
              </>
            );
            return href ? (
              <Link key={s.t} href={href} className="rounded-[22px] bg-wash p-6 transition-colors hover:bg-lavender/40">
                {body}
              </Link>
            ) : (
              <div key={s.t} className="rounded-[22px] bg-wash p-6">{body}</div>
            );
          })}
        </div>
      </section>

      <section className="container-x pb-16">
        <h2 className="text-2xl lg:text-3xl">How a project runs</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([n, t, d]) => (
            <div key={n} className="rounded-[22px] border border-edge p-6">
              <p className="font-display text-2xl font-extrabold text-charcoal">{n}</p>
              <p className="mt-2 font-semibold">{t}</p>
              <p className="mt-1 text-sm text-slate">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container-x pb-16">
        <div className="pastel-section grid items-center gap-10 bg-sage/40 md:grid-cols-2">
          <div>
            <span className="caps text-slate">Built for scale</span>
            <h2 className="mt-3 text-2xl lg:text-3xl">Finishes that hold up</h2>
            <p className="mt-4 max-w-md text-slate">
              Each design has its own surface: smooth matte or with a linen feel.
              Every wall is made to order and colour-matched across drops, so it reads as one piece.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/materials" className="btn btn-ghost text-sm">See materials</Link>
              <Link href="/trade" className="btn btn-ghost text-sm">Designers &amp; architects →</Link>
            </div>
          </div>
          <ul className="grid gap-3 text-sm text-slate">
            {[
              "Consistent colour across large runs",
              "Proof approved before production",
              "7–10 working days after approval",
              "Project quotation — priced per the brief",
              "On-site installation in Bengaluru, Mumbai & Pune",
            ].map((l) => (
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
          <p className="mt-3 text-slate">
            Tell us about the spaces and we&apos;ll come back with an approach and a quotation. Prefer
            email? Write to <a href="mailto:hello@zyvorah.com" className="link-underline">hello@zyvorah.com</a> with
            &ldquo;Project&rdquo; in the subject.
          </p>
          <div className="mt-6">
            <EnquiryForm
              topic="Commercial project"
              orgLabel="Company / organisation"
              detailsPlaceholder="Spaces (e.g. lobby + café), rough wall sizes, timeline, and the look you're after…"
              submitLabel="Request a quote"
            />
          </div>
        </div>
      </section>
    </div>
  );
}

export default withBrandEditorial("/commercial", CommercialPage);
