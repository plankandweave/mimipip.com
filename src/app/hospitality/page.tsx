
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { MarketMoney, MarketPricingNote } from "@/components/MarketMoney";
import Link from "next/link";
import { OfficeCostEstimator } from "@/components/OfficeCostEstimator";
import { OfficeSpecActions, OfficeSpecTable } from "@/components/OfficeSpecTable";
import { JsonLd } from "@/components/JsonLd";
import { tileMeta } from "@/lib/space-sections";
import { ProjectTile, SpaceTile } from "@/components/SectionTiles";
import { projectsForSegment } from "@/content/projects";
import { HOSPITALITY_SPACES } from "@/content/hospitality";
import { getHospitalityFinishes, getHospitalityTiles, hospitalityEstimatorRates } from "@/lib/hospitality";
import { officeSpec } from "@/lib/office-spec";
import { INSTALL_CITY_NAMES } from "@/lib/install-cities";
import { SITE_URL } from "@/lib/seo";

// Catalogue-backed, so it must not serve a snapshot from a fortnight ago —
// same hourly backstop /office and the collection listings use.
export const revalidate = 3600;

export const metadata: Metadata = editorialMetadata("/hospitality");

/**
 * /hospitality — the shoppable rung between the residential shop and
 * /commercial, for hotels, F&B and spa/wellness properties. Modelled on
 * /office (see that page's comment for the full reasoning); the difference is
 * structural, not editorial — see src/content/hospitality.ts's header for why
 * this hub is a union of three sibling collections rather than a filter over
 * one base tag, and why each space's grid is a hard renders-only filter
 * rather than a curated-tag-or-fallback edit.
 */
  async function HospitalityPage() {
  const [tiles, finishes] = await Promise.all([getHospitalityTiles(), getHospitalityFinishes()]);
  const spec = officeSpec({ finishes });
  // The section's own case studies, shown as tiles in the space grid rather
  // than as a separate row below it — see src/components/SectionTiles.tsx.
  const projects = projectsForSegment("hospitality");
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
    [
      "Dispatched in 7–10 working days",
      <MarketPricingNote
        key="dispatch"
        india="After the proof is approved. Free shipping across India."
        international="After the proof is approved. International delivery is included in the price."
      />,
    ],
    ["Fitted without closing the floor", "Paste-the-wall, no wet trimming on site — usually done out of hours."],
    ["Installed on site", `${INSTALL_CITY_NAMES.join(", ")}. Elsewhere, labelled drops and a fitting guide.`],
  ];

  return (
    <div>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Hospitality Wallpaper — Shop by Space",
          url: `${SITE_URL}/hospitality`,
          description:
            "Mural wallpaper for hotels, cafés, restaurants and spas, priced by the square foot and cut to the wall.",
          hasPart: HOSPITALITY_SPACES.map((s) => ({
            "@type": "CollectionPage",
            name: s.label,
            url: `${SITE_URL}/hospitality/${s.slug}`,
          })),
        }}
      />

      <div className="mx-4 mt-4 rounded-[32px] bg-sky/40 lg:mx-6">
        <div className="container-x py-14 text-center">
          <span className="caps text-slate">For hotels, cafés & spas</span>
          <h1 className="mt-3 text-[clamp(2.2rem,4.5vw,3.4rem)] leading-tight">
            Wallpaper for hospitality, priced before you have to ask.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-slate">
            Lobby walls, dining rooms and treatment rooms — sized to your wall for your actual
            elevation
            {from ? <> from <strong><MarketMoney inr={from} /> per square foot</strong></> : null}, dispatched in
            7–10 working days, fitted without shutting the floor.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <a href="#spaces" className="btn inline-flex h-12 px-6 text-[0.82rem]">
              Shop by space
            </a>
            <Link href="/samples" className="btn btn-ghost inline-flex h-12 px-6 text-[0.82rem]">
              Order samples
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
          <h2 className="mt-3 text-2xl lg:text-3xl">Start with the room your guest is standing in.</h2>
          <p className="mt-4 text-slate">
            A lobby wall and a treatment room are not the same problem — one is read across a
            double-height space, the other from a foot away in low light. Each edit below is
            composed for that space, and shows only designs actually shot in it — everything
            else is one click away.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((t) => (
            <SpaceTile key={t.slug} tile={{ ...t, meta: tileMeta(t) }} href={`/hospitality/${t.slug}`} />
          ))}
          {projects.map((p) => (
            <ProjectTile key={p.slug} project={p} />
          ))}
        </div>
      </section>

      <section className="container-x pb-16">
        <OfficeCostEstimator rates={hospitalityEstimatorRates(finishes)} wallLabel="wall" />
      </section>

      {/* Branded walls: the same studio capability /office offers, restated for
          a hospitality brand — a hotel or restaurant identity, a mural of the
          property, a colourway matched to the brand palette. */}
      <section className="container-x pb-16">
        <div className="pastel-section grid items-center gap-10 bg-sage/40 md:grid-cols-2">
          <div>
            <span className="caps text-slate">Branded walls</span>
            <h2 className="mt-3 text-2xl lg:text-3xl">Your property, your palette, your wall.</h2>
            <p className="mt-4 max-w-md text-slate">
              A brand pattern, a signature illustration, a photograph from the property —
              upload it and we prepare it to your exact wall size, or we adapt a catalogue
              design into your palette.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/print-your-own" className="btn text-sm">
                Use your own artwork
              </Link>
              <Link href="/bespoke" className="btn btn-ghost text-sm">
                Commission a design →
              </Link>
            </div>
          </div>
          <ul className="grid gap-3 text-sm text-slate">
            {[
              "Upload artwork and size it to the wall in the browser",
              "Recolouring an existing design to a brand palette",
              "Artwork placed around doors, sconces and screens",
              "A proof approved before anything is made",
              "Repeatable across properties, colour-matched",
            ].map((l) => (
              <li key={l} className="flex items-start gap-2.5 rounded-[14px] bg-surface/70 px-4 py-3">
                <span aria-hidden>✦</span> {l}
              </li>
            ))}
          </ul>
        </div>
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
          <OfficeSpecActions sheetHref="/hospitality/spec-sheet" />
        </div>
      </section>


      <section className="container-x pb-20">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-[22px] border border-edge p-7">
            <p className="font-display text-lg font-bold">A few walls?</p>
            <p className="mt-2 text-sm text-slate">
              Order samples, measure the wall, and buy it the way you would buy
              anything else. Priced on the page, no quotation to wait for.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/samples" className="btn text-sm">
                Order samples
              </Link>
            </div>
          </div>
          <div className="rounded-[22px] border border-edge bg-wash p-7">
            <p className="font-display text-lg font-bold">A whole property, or a group?</p>
            <p className="mt-2 text-sm text-slate">
              Past roughly five walls it stops being a purchase and starts being a project:
              one visual language across the property, a named idea per zone, artwork built
              to measured elevations.
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

export default withBrandEditorial("/hospitality", HospitalityPage);
