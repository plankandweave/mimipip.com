
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "@/components/SiteImage";
import { getApplianceFormats, getWrapProductsByTag } from "@/lib/wrap-queries";
import { getPopulatedWrapRows } from "@/lib/wrap-landing";
import {
  WRAP_MTM_RATE,
  WRAP_MTM_LEAD_DAYS,
  TRIM_ALLOWANCE_MM,
  formatSizeLabel,
  fromWrapPrice,
} from "@/lib/wraps";
import { APPLIANCES, wrapCollectionPath } from "@/lib/appliances";
import { formatINR } from "@/lib/pricing";
import { SITE_URL } from "@/lib/seo";
import { WrapCard } from "@/components/WrapCard";
import { Reveal } from "@/components/Reveal";
import { WrapStudio } from "@/components/WrapStudio";
import { JsonLd } from "@/components/JsonLd";
import { WrapsSubnav } from "@/components/WrapsSubnav";
import { getFridgeHeroScenes } from "./_lib/scenes";
import { FRIDGE_COLLECTION_LINKS, FRIDGE_FAQ } from "./_lib/copy";

/**
 * This page is the FRIDGE's landing page, not the family's — the family hub is
 * /wraps. Everything below is scoped to `fridge` deliberately: the formats, the
 * designs and the collection tiles all read off one appliance's facts, and the
 * other appliances get their own pages off a shared template.
 */
const FRIDGE = APPLIANCES.fridge;

export const metadata: Metadata = brandMetadata({
  title: "Fridge Wrap Designs Fitted to Your Refrigerator Door",
  description:
    "Matte vinyl designs for a refrigerator door, trimmed to its edges. Five standard formats cover almost every fridge sold in India, from ₹700. Find your fit in a minute.",
  alternates: { canonical: "/fridge-wraps" },
});

// Designs publish between deploys, and so does the first hero photograph —
// neither should wait for a build to appear on the fridge's front page.
export const revalidate = 3600;

export default async function FridgeWrapsPage() {
  const [formats, heroScenes, populatedRows, designs] = await Promise.all([
    // The fridge ladder alone. getWrapFormats() returns every appliance's rows
    // now, and this page prints its formats twice — the hero index and the
    // panel-size table at the foot — so an unscoped call would list AC tonnages
    // and a dishwasher door on a page headed "Fridge Wraps".
    getApplianceFormats("fridge"),
    getFridgeHeroScenes(3, FRIDGE.key),
    // Which aesthetic rows hold a design SOLD ON A FRIDGE — the same call every
    // other appliance landing page makes. Not getSubCollections(): that reads
    // parent_handle, and 0096 moved every wrap listing under the `wraps` hub, so
    // asking for the children of `fridge-wraps` silently returns nothing and
    // strands all five rows on "In the studio" with four live designs each.
    getPopulatedWrapRows("fridge"),
    // Overfetched: the row below shows eight, but the collection tiles pick
    // their covers out of the same result rather than run ten more queries.
    getWrapProductsByTag(FRIDGE.familyTag, 24),
  ]);

  const standard = formats.filter((f) => !f.isMadeToMeasure);
  const heroFormat = standard.find((f) => f.code === "A");
  const madeToMeasure = formats.find((f) => f.isMadeToMeasure);
  // Scoped by the query above, so this is the cheapest FRIDGE format rather
  // than the cheapest thing in the range — the "from" figure sits next to
  // Format A's price and the two have to belong to the same ladder.
  const fromPrice = fromWrapPrice(formats);
  const hero = heroScenes[0] ?? null;

  // An empty listing 404s (see the collection page's own guard), so a tile only
  // becomes a link once it has fridge designs in it. Before that the row names
  // are set in type — a real fact about the range, and never a dead link.
  const populatedRowKeys = new Set(populatedRows.map((r) => r.key));
  const familyListingLive = designs.length > 0;

  // One cover per collection, taken from designs already fetched for the row
  // below rather than ten more queries. A collection with no cover in hand
  // still renders — as type, at the same size, which is the whole point of
  // the treatment.
  //
  // Matched on the row's TAG, never its label: "Dolce Gabbana Inspired" and
  // "Mini Fridge Exclusives" are display names, and looking for them among a
  // design's tags can only ever miss — which used to fail `covers.every()`
  // below and strip the photography off all five tiles, populated or not.
  const coverFor = (key: string): { image: string; alt: string } | null => {
    const hit = designs.find((d) => d.tags?.includes(key) && d.image);
    return hit?.image ? { image: hit.image, alt: hit.imageAlt } : null;
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FRIDGE_FAQ.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Zyvorah", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Fridge Wraps", item: `${SITE_URL}/fridge-wraps` },
    ],
  };

  return (
    <div>
      <JsonLd data={[faqJsonLd, breadcrumbJsonLd]} />
      <WrapsSubnav current="fridge" />

      {/* ---------- hero ----------
          Photography carries this page when there is photography. There is
          none at launch, and the fallback is deliberately NOT a drawn fridge
          or a pattern swatch: the range is presented in type, at full
          confidence, and the picture takes its place the day it exists. */}
      <section className="relative mx-4 mt-4 overflow-hidden rounded-[32px] lg:mx-6">
        <div className={`relative flex flex-col justify-end ${hero ? "min-h-[max(560px,82vh)] pt-16" : "h-auto bg-[#F1E9DC] py-16 lg:py-24"}`}>
          {hero && (
            <>
              <Image
                src={hero.url}
                alt={hero.title}
                fill
                priority
                // The scenes are 1920px JPEGs; a bare `fill` asks for 3840 on a wide
                // screen, which buys nothing and costs the page its first paint.
                sizes={"(min-width: 1920px) 1920px, 100vw"}
                // The floor survives the crop (AGENTS.md, homepage rule 8): a
                // kitchen reads from the floor up, so a short frame loses the
                // ceiling, never the fridge's base.
                className="object-cover object-bottom"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-charcoal/70 via-charcoal/15 to-charcoal/10" />
            </>
          )}
          <div className={`container-x relative ${hero ? "pb-14" : ""}`}>
            <p className={`caps ${hero ? "text-surface/80" : "text-[#8C6F33]"}`}>Fridge Wraps</p>
            <h1
              className={`mt-5 max-w-3xl text-[clamp(2.4rem,6.2vw,4.6rem)] leading-[1.02] ${
                hero ? "text-surface" : "text-charcoal"
              }`}
            >
              The largest thing in your kitchen, and nobody chose how it looks.
            </h1>
            <p className={`mt-5 max-w-xl text-[1.05rem] ${hero ? "text-surface/85" : "text-slate"}`}>
              Matte design panels for a refrigerator door, cut oversize and trimmed against your own
              door edge. Five standard formats cover almost every fridge sold in India — so the only
              question worth asking is which one you have.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/fridge-wraps/fit-finder"
                className={`btn ${hero ? "border-surface bg-surface text-charcoal hover:bg-surface/90" : ""}`}
              >
                Find my fit
              </Link>
              <Link
                href={familyListingLive ? wrapCollectionPath(FRIDGE.collectionHandle) : "/fridge-wraps/size-guide"}
                className={`btn ${
                  hero
                    ? "border-surface/40 bg-transparent text-surface hover:bg-surface hover:text-charcoal"
                    : "btn-ghost"
                }`}
              >
                {familyListingLive ? "See the collections" : "See the six formats"}
              </Link>
            </div>

            {heroFormat?.priceInr != null && (
              <p className={`mt-6 text-sm ${hero ? "text-surface/80" : "text-slate"}`}>
                <span className={hero ? "text-surface" : "text-charcoal"}>
                  {heroFormat.label}, {formatINR(heroFormat.priceInr)}.
                </span>{" "}
                {fromPrice != null && <>Six formats from {formatINR(fromPrice)}. </>}
                GST included, delivered across India.
              </p>
            )}

            {/* The range as an index. Type doing the work a photograph would
                otherwise do — and it stays useful once the photograph lands. */}
            {!hero && (
              <ul className="mt-12 grid gap-x-8 gap-y-4 border-t border-[#DCCFB8] pt-8 sm:grid-cols-2 lg:grid-cols-3">
                {formats.map((f) => (
                  <li key={f.code} className="flex items-baseline gap-3">
                    <span className="font-display text-[1.6rem] font-bold leading-none text-[#8C6F33]">{f.code}</span>
                    <span className="text-sm text-charcoal">
                      {f.label}
                      {f.capacityLabel && <span className="text-slate"> · {f.capacityLabel}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* ---------- the studio ----------
          Directly under the hero, because clicking a pattern and watching the
          fridge change IS the pitch. Everything below it — fit, process,
          collections — is what someone reads AFTER they have seen the thing
          they want. */}
      <WrapStudio designs={designs} formats={formats} appliance="fridge" />

      {/* ---------- the fit block ----------
          Then fit, because the blocker on this product is "will it fit", not
          "do I like it"; every market that sold these pattern-first has the
          same one-star review profile. */}
      <Reveal>
        <section id="fit" className="container-x py-16">
          <div className="rounded-[32px] bg-[#F6F1E7] p-8 lg:p-14">
            <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
              <div>
                <p className="caps text-[#8C6F33]">Step one, and the only hard one</p>
                <h2 className="mt-3 text-[clamp(1.8rem,3.6vw,2.8rem)] leading-tight">
                  Which refrigerator do you have?
                </h2>
                <p className="mt-4 max-w-lg text-slate">
                  Type the brand and the model number off the sticker inside your door. You get the
                  format, the panel sizes and the price — and, where we have read the door dimensions
                  off the manufacturer&apos;s own specification sheet, we say so plainly.
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-4">
                  <Link href="/fridge-wraps/fit-finder" className="btn">
                    Find my fit
                  </Link>
                  <Link href="/fridge-wraps/fit-finder#measure" className="link-underline text-sm font-medium">
                    Can&apos;t find the sticker? Measure the door instead
                  </Link>
                </div>
              </div>

              <dl className="space-y-5 border-t border-[#E3D9C6] pt-8 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
                <div>
                  <dt className="font-display text-[0.95rem] font-semibold">Verified, or honestly not</dt>
                  <dd className="mt-1 text-sm text-slate">
                    A handful of models are matched from the manufacturer&apos;s published door
                    dimensions. The rest are assigned by capacity and door type, and we ask you to
                    confirm with two measurements rather than pretend they are the same thing.
                  </dd>
                </div>
                <div>
                  <dt className="font-display text-[0.95rem] font-semibold">Two numbers is the fallback</dt>
                  <dd className="mt-1 text-sm text-slate">
                    Width and height of the door face, edge to edge, in centimetres. That is enough
                    to place almost any fridge.
                  </dd>
                </div>
                <div>
                  <dt className="font-display text-[0.95rem] font-semibold">Nothing fits? That&apos;s an answer too</dt>
                  <dd className="mt-1 text-sm text-slate">
                    Sized to your fridge — {formatINR(WRAP_MTM_RATE)} per
                    square foot, {WRAP_MTM_LEAD_DAYS} working days, this site only.
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </section>
      </Reveal>

      {/* ---------- why it fits ---------- */}
      <Reveal>
        <section id="how" className="container-x pb-16">
          <div className="max-w-2xl">
            <p className="caps text-mist">How it works</p>
            <h2 className="mt-2 text-3xl lg:text-4xl">The door is the ruler.</h2>
            <p className="mt-4 text-slate">
              Every panel ships {TRIM_ALLOWANCE_MM} mm oversize on each edge, and you trim it against
              the door itself. Cutting to a measurement means your measurement has to be right;
              trimming to an edge means it doesn&apos;t. That one decision is what lets five formats
              cover a fleet of hundreds of models.
            </p>
          </div>
          <ol className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              {
                n: "One",
                h: "Lay it on",
                b: "Peel the backing from the top edge and lay the panel down flat. Nothing is committed until you smooth it.",
              },
              {
                n: "Two",
                h: "Smooth from the centre",
                b: "Work outwards, so air leaves at the edge instead of stranding in the middle as a bubble.",
              },
              {
                n: "Three",
                h: "Trim to the edge",
                b: "Run a blade along the door's own edge. You are cutting to a line that already exists.",
              },
            ].map((s) => (
              <li key={s.n} className="rounded-[22px] bg-wash p-6">
                <span className="caps text-[#8C6F33]">{s.n}</span>
                <p className="mt-2 font-display text-[1.1rem] font-bold">{s.h}</p>
                <p className="mt-2 text-sm text-slate">{s.b}</p>
              </li>
            ))}
          </ol>
          <Link href="/fridge-wraps/size-guide" className="link-underline mt-8 inline-block text-sm font-medium">
            The six formats, panel by panel &rarr;
          </Link>
        </section>
      </Reveal>

      {/* ---------- mood band ----------
          The rest of the art-directed scenes, when there are any. Nothing
          stands in for them: an empty band is simply absent, because a
          placeholder here would be a drawn kitchen, and a drawn kitchen is
          what this line is explicitly not. */}
      {heroScenes.length > 1 && (
        <Reveal>
          <section className="container-x pb-16">
            <div className="grid gap-4 sm:grid-cols-2">
              {heroScenes.slice(1, 3).map((s) => (
                <div key={s.slug} className="zoomer relative aspect-[4/3]">
                  <Image
                    src={s.url}
                    alt={s.title}
                    fill
                    sizes="(max-width:768px) 100vw, 50vw"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          </section>
        </Reveal>
      )}

      {/* ---------- collections ---------- */}
      <Reveal>
        <section id="collections" className="container-x py-16">
          <div className="max-w-2xl">
            <p className="caps text-mist">The range</p>
            <h2 className="mt-2 text-3xl lg:text-4xl">One aesthetic at a time, four designs each.</h2>
            <p className="mt-3 text-slate">
              The range grows a row at a time — four designs that belong together, released
              together. Rows still in the studio are named here but not yet open.
            </p>
          </div>

          {(() => {
            const links = FRIDGE_COLLECTION_LINKS;
            // All photographs or none. A grid where four tiles carry an image
            // and two don't reads as a page that failed to load — whereas a
            // whole row set in type reads as a decision.
            const covers = links.map((c) => coverFor(c.key));
            const illustrated = covers.every(Boolean);
            return (
            <div className="mt-10">
              <ul className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
                {links.map(({ handle, title, key }, i) => {
                  const cover = illustrated ? covers[i] : null;
                  const live = populatedRowKeys.has(key);
                  const inner = (
                    <>
                      {cover ? (
                        <Image
                          src={cover.image}
                          alt={cover.alt}
                          fill
                          sizes="(max-width:768px) 50vw, 33vw"
                          className="object-cover transition-transform duration-700 group-hover:scale-105"
                        />
                      ) : null}
                      <div
                        className={`absolute inset-0 ${
                          cover ? "bg-gradient-to-t from-charcoal/55 to-transparent" : "bg-[#F1E9DC]"
                        }`}
                      />
                      <div className="absolute inset-x-0 bottom-0 p-5">
                        <p className={`font-display text-xl font-bold ${cover ? "text-surface" : "text-charcoal"}`}>
                          {title}
                        </p>
                        {!live && (
                          <p className={`mt-1 text-xs ${cover ? "text-surface/80" : "text-slate"}`}>In the studio</p>
                        )}
                      </div>
                    </>
                  );
                  return (
                    <li key={handle}>
                      {live ? (
                        // The fridge's own listing narrowed to the look, not the
                        // row collection: a row spans the whole range, so
                        // /collections/fridge-florals would open Florals panels
                        // cut for an AC on a page headed Fridge Wraps. Same
                        // target the other appliance pages use.
                        <Link
                          href={wrapCollectionPath(FRIDGE.collectionHandle, key)}
                          className="group relative block aspect-[4/5] overflow-hidden rounded-[22px]"
                        >
                          {inner}
                        </Link>
                      ) : (
                        // Not a link, and not styled like one: an empty
                        // collection page 404s, and a name set in type is a
                        // truer thing to show than a broken door.
                        <div className="relative block aspect-[4/5] overflow-hidden rounded-[22px]">{inner}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
            );
          })()}
        </section>
      </Reveal>

      {/* ---------- designs ---------- */}
      {designs.length > 0 && (
        <Reveal>
          <section className="container-x pb-16">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="caps text-mist">In the range now</p>
                <h2 className="mt-2 text-3xl lg:text-4xl">Designs</h2>
                {fromPrice != null && (
                  <p className="mt-2 text-sm text-slate">
                    Every design is made in all five standard formats, from {formatINR(fromPrice)}.
                  </p>
                )}
              </div>
              <Link href={wrapCollectionPath(FRIDGE.collectionHandle)} className="btn btn-ghost text-sm">
                View all
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-4">
              {designs.slice(0, 8).map((p) => (
                <WrapCard key={p.handle} product={p} formats={formats} appliance="fridge" />
              ))}
            </div>
          </section>
        </Reveal>
      )}

      {/* ---------- try it / sample it ---------- */}
      <Reveal>
        <section className="container-x pb-16">
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/fridge-wraps/see-it-on-my-fridge"
              className="flex flex-col justify-between rounded-[22px] bg-[#F6F1E7] p-8 transition-transform hover:-translate-y-0.5"
            >
              <div>
                <p className="caps text-[#8C6F33]">Before you buy</p>
                <p className="mt-3 font-display text-[1.35rem] font-bold">See it on my fridge</p>
                <p className="mt-2 text-sm text-slate">
                  Photograph your own refrigerator and put a design on it, at the format you actually
                  own.
                </p>
              </div>
              <span className="mt-8 text-sm font-semibold">Open the visualiser &rarr;</span>
            </Link>
            {/* Was "Order a design sample" (₹200, /samples) on the old wraps
                site. A wrap sample is a chip of the same unchosen film, so it
                waits with the range — and this app's /samples is the
                wallpaper sample flow, which has no wrap designs in it. */}
            <Link
              href="/contact?about=Appliance%20wraps"
              className="flex flex-col justify-between rounded-[22px] bg-wash p-8 transition-transform hover:-translate-y-0.5"
            >
              <div>
                <p className="caps text-mist">Coming soon</p>
                <p className="mt-3 font-display text-[1.35rem] font-bold">Tell me when it opens</p>
                <p className="mt-2 text-sm text-slate">
                  The designs and the fit are finished; we&apos;re signing off the film before the
                  first run. Leave your details and we&apos;ll write the day it opens.
                </p>
              </div>
              <span className="mt-8 text-sm font-semibold">Get in touch &rarr;</span>
            </Link>
          </div>
        </section>
      </Reveal>

      {/* ---------- custom fridge fit ---------- */}
      {madeToMeasure && (
        <Reveal>
          <section className="container-x pb-16">
            <div className="rounded-[32px] border border-edge p-8 lg:p-14">
              <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
                <div className="max-w-xl">
                  <p className="caps text-[#8C6F33]">Format Z</p>
                  <h2 className="mt-3 text-[clamp(1.8rem,3.4vw,2.6rem)] leading-tight">
                    Or give us your own three numbers.
                  </h2>
                  <p className="mt-4 text-slate">
                    A panel width, a panel height and how many doors. Sized for your refrigerator
                    alone at {formatINR(WRAP_MTM_RATE)} per square foot, dispatched in{" "}
                    {madeToMeasure.leadTimeDays ?? WRAP_MTM_LEAD_DAYS} working days. Sold on this
                    site only — it is not a size a marketplace can promise in two days.
                  </p>
                </div>
                <Link href="/fridge-wraps/made-to-measure" className="btn shrink-0">
                  Price my measurements
                </Link>
              </div>
            </div>
          </section>
        </Reveal>
      )}

      {/* ---------- faq ---------- */}
      <Reveal>
        <section id="faq" className="container-x border-t border-edge py-16">
          <div className="mx-auto max-w-3xl">
            <p className="caps text-mist">Before you ask</p>
            <h2 className="mt-2 text-3xl lg:text-4xl">Frequently asked</h2>
            <dl className="mt-10 space-y-8">
              {FRIDGE_FAQ.map((f) => (
                <div key={f.q}>
                  <dt className="font-display text-lg font-semibold">{f.q}</dt>
                  <dd className="mt-2 text-sm leading-relaxed text-slate">{f.a}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-12 flex flex-wrap gap-3">
              <Link href="/fridge-wraps/fit-finder" className="btn">
                Find my fit
              </Link>
              <Link href="/fridge-wraps/size-guide" className="btn btn-ghost">
                Size guide
              </Link>
            </div>
          </div>
        </section>
      </Reveal>

      {/* Panel sizes, stated once in full, for anyone who scrolled this far
          wanting the numbers rather than the pictures. */}
      <section className="container-x pb-20">
        <div className="mx-auto max-w-3xl overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <caption className="sr-only">Fridge wrap formats, what each fits, and the set price</caption>
            <thead>
              <tr className="border-b border-edge text-mist">
                <th scope="col" className="py-3 pr-4 font-medium">Format</th>
                <th scope="col" className="py-3 pr-4 font-medium">Fits</th>
                <th scope="col" className="py-3 pr-4 font-medium">Panels</th>
                <th scope="col" className="py-3 font-medium">Price</th>
              </tr>
            </thead>
            <tbody>
              {formats.map((f) => (
                <tr key={f.code} className="border-b border-edge/60">
                  <th scope="row" className="py-4 pr-4 font-display font-semibold">
                    {f.code} · {f.label}
                  </th>
                  <td className="py-4 pr-4 text-slate">{f.capacityLabel ?? "—"}</td>
                  <td className="py-4 pr-4 text-slate">{formatSizeLabel(f)}</td>
                  <td className="py-4 text-charcoal">
                    {f.priceInr != null
                      ? formatINR(f.priceInr)
                      : `${formatINR(WRAP_MTM_RATE)} / sq ft`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 text-xs text-mist">
            All prices GST-inclusive. Panel sizes include the {TRIM_ALLOWANCE_MM} mm trim allowance on
            every edge.
          </p>
        </div>
      </section>
    </div>
  );
}
