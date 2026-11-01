
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";

import { CATALOGUE_FLOOR_RATE, marketLanding, marketPriceLabel } from "@/lib/market-seo";
import { inMarket } from "@/components/MarketLanding";
import type { ReactNode } from "react";
import { MarketMoney, MarketPricingNote } from "@/components/MarketMoney";
import type { Metadata } from "next";
import Link from "next/link";
import { OfficeCostEstimator } from "@/components/OfficeCostEstimator";
import { OfficeSpecActions, OfficeSpecTable } from "@/components/OfficeSpecTable";
import { JsonLd } from "@/components/JsonLd";
import { ConceptTile, ProjectTile, SpaceTile } from "@/components/SectionTiles";
import { projectsForSegment } from "@/content/projects";
import { OFFICE_TEN_WAYS_SLUGS } from "@/content/projects/office-ten-ways";
import { OFFICE_COLLECTION, WORKSPACES } from "@/content/workspaces";
import { estimatorRates, getOfficeFinishes, getWorkspaceTiles } from "@/lib/office";
import { designCount } from "@/lib/space-sections";
import { officeSpec } from "@/lib/office-spec";
import { INSTALL_CITY_NAMES } from "@/lib/install-cities";
import { SITE_URL } from "@/lib/seo";

// Catalogue-backed, so it must not serve a snapshot from a fortnight ago; the
// same hourly backstop the collection listings use.
export const revalidate = 3600;

/**
 * The snippet quoted ₹200 to every searcher, including one in Denver whose
 * page charges dollars. `?market=US` is that country's version of this page
 * (src/lib/market-seo.ts); the clean URL stays India's and x-default.
 */
 async function inheritedGenerateMetadata({
  searchParams,
}: {
  searchParams?: Promise<{ market?: string }>;
}): Promise<Metadata> {
  const { countryCode, alternates } = marketLanding("/office", (await searchParams)?.market);
  const rate = marketPriceLabel(CATALOGUE_FLOOR_RATE, countryCode);
  const title = "Office Wallpaper — Shop by Workspace";
  const description = `Mural wallpaper for offices: reception, meeting rooms, boardrooms, workstations, phone booths and cafeterias. Priced by the square foot from ${rate}, dispatched in 7–10 working days.`;
  return {
    title,
    description,
    alternates,
    openGraph: { title: `${title} · Zyvorah`, description, url: `${SITE_URL}${alternates.canonical}`, siteName: "Zyvorah", type: "website" },
  };
}

/**
 * /office — the shoppable rung between the residential shop and /commercial.
 *
 * The problem this page exists for: an office buyer landing on zyvorah.com sees
 * nurseries and pooja rooms and concludes we are a residential brand, and the
 * one page that says otherwise (/commercial) opens with a 4,80,000 sq ft campus
 * and closes with "request a quote". Neither serves an office manager with a
 * reception wall and two meeting rooms, which is most of the demand.
 *
 * So this page's whole job, in order:
 *   1. price and lead time above the fold — the two things nobody publishes;
 *   2. shop by the space they are standing in, not by pattern;
 *   3. the specification a facilities manager or architect came for;
 *   4. two live exits — samples for the small job, /commercial for the floor.
 * It deliberately does NOT gate anything behind a form.
 */
  async function OfficePage({
  searchParams,
}: {
  searchParams?: Promise<{ market?: string }>;
}) {
  const { landingCountryCode } = marketLanding("/office", (await searchParams)?.market);
  const [tiles, finishes] = await Promise.all([getWorkspaceTiles(), getOfficeFinishes()]);
  const spec = officeSpec({ finishes });
  // Keep the new four-wall concepts on their own buying shelf; the broader
  // workplace studies remain the proof-of-method shelf below it.
  const workplaceProjects = projectsForSegment("workplaces");
  const newConceptSlugs = new Set<string>(OFFICE_TEN_WAYS_SLUGS);
  const concepts = workplaceProjects.filter((project) => newConceptSlugs.has(project.slug));
  const projects = workplaceProjects.filter((project) => !newConceptSlugs.has(project.slug));
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

  const page = (
    <div>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Office Wallpaper — Shop by Workspace",
          url: `${SITE_URL}/office`,
          description:
            "Mural wallpaper for offices, priced by the square foot and cut to the wall.",
          hasPart: WORKSPACES.map((w) => ({
            "@type": "CollectionPage",
            name: w.label,
            url: `${SITE_URL}/office/${w.slug}`,
          })),
        }}
      />

      <section className="container-x py-6" aria-label="Office quote wallpaper">
        <h2 className="text-2xl">Your words, on your wall.</h2>
        <p className="mt-2 max-w-2xl text-slate">Add a quote, a welcome or your company values to any mural wallpaper. Choose a font and colour, then drag the text into place on your measured wall. Your approved layout is printed automatically.</p>
        <a href="#spaces" className="mt-3 inline-block text-sm font-semibold underline underline-offset-4">Choose a wallpaper and add your quote →</a>
      </section>

      <div className="mx-4 mt-4 rounded-[32px] bg-sky/40 lg:mx-6">
        {/* Deliberately shallow. At the old py-14 with a 3.4rem headline the
            hero filled the viewport on a laptop, so the page's first screen was
            an argument with no goods on it and nothing to suggest scrolling —
            a workplace buyer could reasonably conclude there was nothing here.
            The tiles now break the fold instead. */}
        <div className="container-x py-9 text-center">
          <span className="caps text-slate">For the workplace</span>
          <h1 className="mt-2 text-[clamp(1.9rem,3.6vw,2.7rem)] leading-tight">
            Wallpaper for offices, priced before you have to ask.
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-slate">
            Reception walls, meeting rooms, boardrooms, corridors, phone booths and
            canteens — sized to your wall for your actual elevation
            {from ? <> from <strong><MarketMoney inr={from} /> per square foot</strong></> : null}, dispatched in
            7–10 working days, fitted without shutting the floor.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <a href="#spaces" className="btn inline-flex h-12 px-6 text-[0.82rem]">
              Shop by workspace
            </a>
            <a href="#concepts" className="btn btn-ghost inline-flex h-12 px-6 text-[0.82rem]">
              Shop by concepts
            </a>
            <a href="#projects" className="btn btn-ghost inline-flex h-12 px-6 text-[0.82rem]">
              Shop by ideas and projects
            </a>
            <Link href="/samples" className="btn btn-ghost inline-flex h-12 px-6 text-[0.82rem]">
              Order samples
            </Link>
          </div>
        </div>
      </div>

      <section id="spaces" className="container-x pb-14 pt-8">
        <div className="max-w-2xl">
          <span className="caps text-slate">Shop by workspace</span>
          <h2 className="mt-3 text-2xl lg:text-3xl">Start with the room you are standing in.</h2>
          <p className="mt-4 text-slate">
            A reception wall and a phone booth panel are not the same problem — one is read
            across a lobby, the other from forty centimetres away. Each of these is an edit
            composed for that space, with what to watch out for written down.
          </p>
        </div>

        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((t) => (
            <SpaceTile key={t.slug} tile={{ ...t, meta: `${designCount(t.total)} · sized to your wall` }} href={`/office/${t.slug}`} />
          ))}
        </div>

        <div className="mt-8">
          <Link href={`/collections/${OFFICE_COLLECTION}`} className="btn btn-ghost text-sm">
            Or browse every office design →
          </Link>
        </div>
      </section>

      <section id="concepts" className="container-x scroll-mt-24 pb-16">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-2xl">
            <span className="caps text-slate">Shop by concepts</span>
            <h2 className="mt-3 text-2xl lg:text-3xl">One office, four coordinated moments.</h2>
            <p className="mt-4 text-slate">
              Each concept carries one visual language through Arrival, Work, Meet and Pause.
              Buy a single wall, select several rooms, or take the complete four-wall look.
            </p>
          </div>
          <Link href="/concepts" className="btn btn-ghost text-sm">
            Browse every concept →
          </Link>
        </div>
        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {concepts.map((concept) => (
            <ConceptTile key={concept.slug} project={concept} />
          ))}
        </div>
      </section>

      <section id="projects" className="container-x scroll-mt-24 pb-16">
        <div className="max-w-2xl">
          <span className="caps text-slate">Shop by ideas and projects</span>
          <h2 className="mt-3 text-2xl lg:text-3xl">See how a whole workplace comes together.</h2>
          <p className="mt-4 text-slate">
            Before-and-after studies show what each wall is doing, why it belongs in that
            room and how a visual language can travel across a floor or campus.
          </p>
        </div>
        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectTile key={project.slug} project={project} />
          ))}
        </div>
        <Link href="/projects" className="btn btn-ghost mt-8 text-sm">
          Browse office ideas &amp; projects →
        </Link>
      </section>

      {/* The four objections an office buyer arrives with. These used to sit
          between the hero and the tiles, which pushed the goods off the first
          screen; the hero already states the price, the lead time and the
          out-of-hours fit, so the detail reads better once someone has seen
          what there is to buy. */}
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

      {/* Camera-friendly meeting rooms gets a band of its own on the hub: it is
          the reason a hybrid workplace buyer picks a supplier, and nobody else
          in the category is talking about it. */}
      <section className="container-x pb-16">
        <div className="pastel-section grid items-center gap-10 bg-lavender/40 md:grid-cols-2">
          <div>
            <span className="caps text-slate">Meeting rooms</span>
            <h2 className="mt-3 text-2xl lg:text-3xl">
              The wall behind you is on camera for hours a week.
            </h2>
            <p className="mt-4 max-w-md text-slate">
              Since meetings went hybrid, the far wall of every meeting room became a
              backdrop — compressed by a codec, behind someone&apos;s head, in front of
              people who did not choose to look at it. Fine detail shimmers, hard contrast
              drags the exposure off the speaker&apos;s face, and strong verticals make
              background blur flicker around a shoulder.
            </p>
            <p className="mt-3 max-w-md text-slate">
              So we made a separate edit for it: calm enough to sit behind a person, still
              worth looking at by the people in the room.
            </p>
            <Link href="/office/meeting-rooms" className="btn mt-6 text-sm">
              See camera-friendly designs
            </Link>
          </div>
          <ul className="grid gap-3 text-sm text-slate">
            {[
              "Larger, calmer forms that survive video compression",
              "No hard light-dark jumps directly behind a speaker",
              "Nothing that fights portrait blur or a virtual background",
              "Still designed to be looked at for an hour from the table",
              "Cut to the room's real end wall, screen and joinery included",
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

      {/* Branded walls: the studio already exists, the office buyer just does
          not know it applies to them. */}
      <section className="container-x pb-16">
        <div className="pastel-section grid items-center gap-10 bg-sage/40 md:grid-cols-2">
          <div>
            <span className="caps text-slate">Branded walls</span>
            <h2 className="mt-3 text-2xl lg:text-3xl">Your artwork, your colours, your wall.</h2>
            <p className="mt-4 max-w-md text-slate">
              A brand pattern, a campus illustration, a photograph from the founding
              office — upload it and we prepare it to your exact wall size, or we adapt a
              catalogue design into your palette.
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
              "Artwork placed around doors, sockets and screens",
              "A proof approved before anything is made",
              "Repeatable across floors and offices, colour-matched",
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
          <OfficeSpecActions />
        </div>
      </section>

      {/* Proof borrowed from /commercial rather than rebuilt — the books are
          the credibility, and they belong to that page. */}

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
              <Link href={`/collections/${OFFICE_COLLECTION}`} className="btn btn-ghost text-sm">
                Browse designs
              </Link>
            </div>
          </div>
          <div className="rounded-[22px] border border-edge bg-wash p-7">
            <p className="font-display text-lg font-bold">A whole floor, or a campus?</p>
            <p className="mt-2 text-sm text-slate">
              Past roughly five walls it stops being a purchase and starts being a project:
              one visual language across the building, a named idea per zone, artwork built
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
  return inMarket(landingCountryCode, page);
}

export default withBrandEditorial("/office", OfficePage);
export function generateMetadata() { return editorialMetadata("/office"); }
