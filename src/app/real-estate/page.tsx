
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { MarketMoney, MarketPricingNote } from "@/components/MarketMoney";
import Link from "next/link";
import { OfficeCostEstimator } from "@/components/OfficeCostEstimator";
import { OfficeSpecActions, OfficeSpecTable } from "@/components/OfficeSpecTable";
import { JsonLd } from "@/components/JsonLd";
import { tileMeta } from "@/lib/space-sections";
import { SpaceTile } from "@/components/SectionTiles";
import { REAL_ESTATE_SPACES } from "@/content/real-estate";
import { getRealEstateFinishes, getRealEstateTiles, realEstateEstimatorRates } from "@/lib/real-estate";
import { officeSpec } from "@/lib/office-spec";
import { INSTALL_CITY_NAMES } from "@/lib/install-cities";
import { SITE_URL } from "@/lib/seo";

// Catalogue-backed — same hourly backstop as /office and /hospitality.
export const revalidate = 3600;

export const metadata: Metadata = editorialMetadata("/real-estate");

/**
 * /real-estate — the developer's rung. Same shoppable-versus-/commercial split
 * as /office and /hospitality (see those pages for the full reasoning), and
 * structurally a copy of /hospitality: a union of sibling collections rather
 * than a filter over one base tag, each grid a hard renders-only filter.
 *
 * What is NOT copied is the tone. Both neighbours sell impact — an office
 * reception is a first impression, a hotel lobby is a photograph. These walls
 * are seen by the same people every day for years and were chosen for them by
 * somebody else, so the section argues for restraint throughout. See the
 * header of src/content/real-estate.ts.
 */
  async function RealEstatePage() {
  const [tiles, finishes] = await Promise.all([getRealEstateTiles(), getRealEstateFinishes()]);
  const spec = officeSpec({ finishes });
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
    ["Repeat elevations, one file", "Forty identical lift lobbies is one artwork, panelled once and reordered per floor."],
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
          name: "Real Estate Wallpaper — Common Areas & Clubhouse",
          url: `${SITE_URL}/real-estate`,
          description:
            "Mural wallpaper for the common areas of residential developments, priced by the square foot and cut to the elevation.",
          hasPart: REAL_ESTATE_SPACES.map((s) => ({
            "@type": "CollectionPage",
            name: s.label,
            url: `${SITE_URL}/real-estate/${s.slug}`,
          })),
        }}
      />

      <div className="mx-4 mt-4 rounded-[32px] bg-sky/40 lg:mx-6">
        <div className="container-x py-14 text-center">
          <span className="caps text-slate">For developers & residents&apos; associations</span>
          <h1 className="mt-3 text-[clamp(2.2rem,4.5vw,3.4rem)] leading-tight">
            Wallpaper for the walls a building hands over.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-slate">
            Entrance lobbies, lift lobbies and the clubhouse — sized to your wall for your actual
            elevation
            {from ? <> from <strong><MarketMoney inr={from} /> per square foot</strong></> : null}, dispatched in
            7–10 working days, fitted without closing a floor.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <a href="#spaces" className="btn inline-flex h-12 px-6 text-[0.82rem]">
              Shop by space
            </a>
            <Link href="/real-estate/walkthrough" className="btn btn-ghost inline-flex h-12 px-6 text-[0.82rem]">
              Walk through Shorelight
            </Link>
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
          <h2 className="mt-3 text-2xl lg:text-3xl">Start with the room you are handing over.</h2>
          <p className="mt-4 text-slate">
            A lobby wall and a lift lobby are not the same problem — one is read across a
            double-height space by someone deciding whether to buy, the other from three feet
            away by someone who has seen it four thousand times. Each edit below is composed
            for that space, and shows only designs actually shot in it.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((t) => (
            <SpaceTile key={t.slug} tile={{ ...t, meta: tileMeta(t) }} href={`/real-estate/${t.slug}`} />
          ))}
        </div>
      </section>

      {/* The argument the other two sections do not have to make: this is the
          cheapest square footage in a project to make look finished, and it is
          bought once and installed many times. */}
      <section className="container-x pb-16">
        <div className="pastel-section grid items-center gap-10 bg-sage/40 md:grid-cols-2">
          <div>
            <span className="caps text-slate">Why the common areas</span>
            <h2 className="mt-3 text-2xl lg:text-3xl">
              The last five per cent of a project, and the first thing anyone sees.
            </h2>
            <p className="mt-4 max-w-md text-slate">
              Flats are sold on the flats. What is remembered on a site visit is the lobby, the
              lift you rode up in and the clubhouse you were walked through — the surfaces that
              are usually finished in paint because the budget ran out. Priced by the square
              foot, a lobby feature wall costs less than the planters in front of it.
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
              "One artwork, panelled once, reordered per identical floor",
              "Cut around call panels, signage and fire notices",
              "Your file kept, so a damaged drop is one panel years later",
              "Phased by tower, so it can follow the handover schedule",
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
        <OfficeCostEstimator rates={realEstateEstimatorRates(finishes)} wallLabel="wall" />
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

      {/* No `residential development` segment exists in the projects book yet.
          A restaurant and a temple lobby are not a handover wall, so nothing
          stands in — the grid above is spaces only until a common-areas case
          study is written up. */}

      <section className="container-x pb-20">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-[22px] border border-edge p-7">
            <p className="font-display text-lg font-bold">One clubhouse, a handful of walls?</p>
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
            <p className="font-display text-lg font-bold">A tower, or a whole township?</p>
            <p className="mt-2 text-sm text-slate">
              Past roughly five walls it stops being a purchase and starts being a project: one
              visual language across the development, a named idea per zone, artwork built to
              measured elevations and phased to the handover programme.
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

export default withBrandEditorial("/real-estate", RealEstatePage);
