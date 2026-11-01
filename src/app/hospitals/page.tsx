
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { MarketMoney, MarketPricingNote } from "@/components/MarketMoney";
import Link from "next/link";
import { OfficeCostEstimator } from "@/components/OfficeCostEstimator";
import { OfficeSpecActions, OfficeSpecTable } from "@/components/OfficeSpecTable";
import { JsonLd } from "@/components/JsonLd";
import { ProjectTile, SpaceTile } from "@/components/SectionTiles";
import { projectsForSegment } from "@/content/projects";
import { HEALTHCARE_SPACES } from "@/content/healthcare";
import { estimatorRates, getSectionFinishes, getSectionTiles, tileMeta } from "@/lib/space-sections";
import { officeSpec } from "@/lib/office-spec";
import { INSTALL_CITY_NAMES } from "@/lib/install-cities";
import { SITE_URL } from "@/lib/seo";

// Catalogue-backed — same hourly backstop as /office and /hospitality.
export const revalidate = 3600;

export const metadata: Metadata = editorialMetadata("/hospitals");

  async function HospitalsPage() {
  const [tiles, finishes] = await Promise.all([getSectionTiles(HEALTHCARE_SPACES), getSectionFinishes()]);
  const spec = officeSpec({ finishes });
  // The section's own case studies, shown as tiles in the space grid.
  const projects = projectsForSegment("healthcare");
  const from = finishes[0]?.rate;

  const REASSURANCE: [string, ReactNode][] = [
    [
      "Priced by the square foot",
      from ? (
        <>
          From <MarketMoney inr={from} />/sq ft
          <MarketPricingNote
            india=", GST inclusive — no roll to buy whole."
            international=", international delivery included — no roll to buy whole."
          />
        </>
      ) : (
        "No roll to buy whole — you pay for the wall."
      ),
    ],
    ["Repeat elevations, one file", "A coordinated design can continue across departments, with panel layouts prepared for each wall."],
    [
      "Dispatched in 7–10 working days",
      <MarketPricingNote
        key="dispatch"
        india="After the proof is approved. Free shipping across India."
        international="After the proof is approved. International delivery is included in the price."
      />,
    ],
    ["Installed on site", `${INSTALL_CITY_NAMES.join(", ")}. Elsewhere, labelled drops and a fitting guide.`],
  ];

  return (
    <div>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Hospital Wallpaper — Shop by Space",
          url: `${SITE_URL}/hospitals`,
          description:
            "Mural wallpaper designs for healthcare interiors, subject to site-specific material and cleaning requirements.",
          hasPart: HEALTHCARE_SPACES.map((s) => ({
            "@type": "CollectionPage",
            name: s.label,
            url: `${SITE_URL}/hospitals/${s.slug}`,
          })),
        }}
      />

      <div className="mx-4 mt-4 rounded-[32px] bg-sky/40 lg:mx-6">
        <div className="container-x py-14 text-center">
          <span className="caps text-slate">For hospitals, clinics & diagnostics</span>
          <h1 className="mt-3 text-[clamp(2.2rem,4.5vw,3.4rem)] leading-tight">
            Wallpaper for hospitals, specified honestly.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-slate">
            Reception, waiting areas, consultation rooms and staff spaces — sized to your wall for your actual
            elevation
            {from ? <> from <strong><MarketMoney inr={from} /> per square foot</strong></> : null}, dispatched in
            7–10 working days after approval. Installation is planned around your facility’s access and cleaning requirements.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <a href="#spaces" className="btn inline-flex h-12 px-6 text-[0.82rem]">
              Shop by space
            </a>
            <Link href="/samples" className="btn btn-ghost inline-flex h-12 px-6 text-[0.82rem]">
              Order samples
            </Link>
            <Link href="/concepts" className="btn btn-ghost inline-flex h-12 px-6 text-[0.82rem]">
              Explore healthcare concepts
            </Link>
          </div>
        </div>
      </div>

      <section className="container-x py-12">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {REASSURANCE.map(([t, d]) => (
            <div key={t} className="rounded-[22px] bg-wash p-6">
              <p className="font-display text-base font-bold">{t}</p>
              <p className="mt-2 text-sm text-slate">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="spaces" className="container-x pb-16">
        <div className="max-w-2xl">
          <span className="caps text-slate">Shop by space</span>
          <h2 className="mt-3 text-2xl lg:text-3xl">Start with the room the patient is in.</h2>
          <p className="mt-4 text-slate">
            A waiting room, a consultation room and a staff lounge have different needs.
            Explore the designs by space, then confirm material suitability with your
            facilities team. Room visualisations show design possibilities, not clinical certification.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((t) => (
            <SpaceTile key={t.slug} tile={{ ...t, meta: tileMeta(t) }} href={`/hospitals/${t.slug}`} />
          ))}
          {projects.map((p) => (
            <ProjectTile key={p.slug} project={p} />
          ))}
        </div>
      </section>

      {/* The argument the other two sections do not have to make: this is the
          cheapest square footage in a project to make look finished, and it is
          bought once and installed many times. */}
      <section className="container-x pb-16">
        <div className="pastel-section grid items-center gap-10 bg-sage/40 md:grid-cols-2">
          <div>
            <span className="caps text-slate">Designed around care</span>
            <h2 className="mt-3 text-2xl lg:text-3xl">
              Different spaces support different moments.
            </h2>
            <p className="mt-4 max-w-md text-slate">
              Give patients and families a considered setting, while keeping signage legible
              and equipment accessible. Before specifying a clinical area, review the substrate,
              seams and adhesive against your infection-control, cleaning and fire requirements.
              Standard decorative wallpaper is not a claim of clinical suitability.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/commercial#enquire" className="btn text-sm">
                Talk about a project
              </Link>
              <Link href="/trade" className="btn btn-ghost text-sm">
                Architects &amp; specifiers →
              </Link>
            </div>
          </div>
          <ul className="grid gap-3 text-sm text-slate">
            {[
              "Coordinate reception, consultation and staff areas without repeating every wall",
              "Plan around equipment, call panels, signage and fire notices",
              "Keep approved artwork and panel references for replacement enquiries",
              "Phase installation by department and agreed access windows",
              "A proof approved before anything is made",
            ].map((l) => (
              <li key={l} className="flex items-start gap-2.5 rounded-[14px] bg-surface/70 px-4 py-3">
                <span aria-hidden>✦</span> {l}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="container-x pb-16">
        <OfficeCostEstimator rates={estimatorRates(finishes)} wallLabel="wall" />
      </section>

      <section className="container-x pb-16">
        <div className="max-w-2xl">
          <span className="caps text-slate">Specification</span>
          <h2 className="mt-3 text-2xl lg:text-3xl">Everything the fit-out will ask for.</h2>
          <p className="mt-4 text-slate">
            Written down so nobody has to email for it — and downloadable, because a spec
            sheet gets forwarded rather than bookmarked.
          </p>
        </div>
        <div className="mt-10">
          <OfficeSpecTable groups={spec} />
          <OfficeSpecActions sheetHref="/commercial" />
        </div>
      </section>

      {/* No `residential development` segment exists in the projects book yet,
          and inventing one to filter on would show an empty strip. The general
          selection is the honest answer until a common-areas case study is
          written up. */}

      <section className="container-x pb-20">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-[22px] border border-edge p-7">
            <p className="font-display text-lg font-bold">A clinic or a few waiting-room walls?</p>
            <p className="mt-2 text-sm text-slate">
              Order samples, measure the elevations, and buy it the way you would buy anything
              else. Priced on the page, no quotation to wait for.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/samples" className="btn text-sm">
                Order samples
              </Link>
            </div>
          </div>
          <div className="rounded-[22px] border border-edge bg-wash p-7">
            <p className="font-display text-lg font-bold">A hospital or a network of clinics?</p>
            <p className="mt-2 text-sm text-slate">
              Past roughly five walls it stops being a purchase and starts being a project: one
              visual language across the facility, a named idea per zone, artwork built to
              measured elevations and phased around clinical operations.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/commercial" className="btn text-sm">
                Start a project
              </Link>
              <Link href="/trade" className="btn btn-ghost text-sm">
                Designers &amp; architects →
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default withBrandEditorial("/hospitals", HospitalsPage);
