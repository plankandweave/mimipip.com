
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import Image from "@/components/SiteImage";
import Link from "next/link";
import { WalkthroughScene, type WalkthroughSceneData } from "@/components/WalkthroughScene";
import { mediaUrl } from "@/lib/project-media";

export const metadata: Metadata = brandMetadata({
  title: "Walk through Shorelight — a building curated wall by wall",
  description:
    "Scroll through an imagined Mumbai development from arrival to rooftop — every wall a Zyvorah artwork, every artwork shoppable as a panel or adaptable to your own project.",
  alternates: { canonical: "/real-estate/walkthrough" },
  openGraph: {
    title: "Walk through Shorelight · Zyvorah",
    description:
      "A residential development curated wall by wall, from the sea to the sky. Hover any wall to see the panel; bring any of it to your own building.",
    url: "/real-estate/walkthrough",
  },
});

/**
 * The walkthrough — the page that DEMONSTRATES what /real-estate sells,
 * instead of describing it. A visitor scrolls the Shorelight building from
 * arrival to rooftop: each stop is a full-viewport room held sticky, with
 * "view the panel" to see the artwork that hangs there and a shop link to
 * that exact design. The flip book at /projects/shorelight makes the same
 * argument as a document; this makes it as an experience.
 *
 * Deliberately no scroll listeners and no animation library: the cinema is
 * CSS sticky and viewport rhythm, and the only interaction is a state
 * toggle. It reads honestly — the concept mark appears at both ends,
 * because an imagined building must never pass itself off as a built one.
 */

const SCENES: WalkthroughSceneData[] = [
  {
    handle: "tide-dusk", render: "shorelight/cover.jpg", panel: "shorelight/tide-dusk.jpg",
    number: "01", family: "Tide", space: "The double-height foyer",
    line: "Arrival. Open sea at six metres — the first thing a visitor reads, and the address the building keeps.",
    priority: true,
  },
  {
    handle: "ascent-dusk", render: "shorelight/ascent-render.jpg", panel: "shorelight/ascent-dusk.jpg",
    number: "02", family: "Ascent", space: "The grand staircase",
    line: "One continuous artwork climbs with the stair — water below each sweep, leaves by the landing.",
  },
  {
    handle: "twenty-floors-dusk", render: "shorelight/liftlobby-render.jpg", panel: "shorelight/liftlobby-dusk.jpg",
    number: "03", family: "Twenty Floors", space: "The lift lobbies",
    line: "The most repeated wall in the building — one design, bought once, living on every floor at its own height of the canopy.",
  },
  {
    handle: "passage-dusk", render: "shorelight/passage-render.jpg", panel: "shorelight/passage-dusk.jpg",
    number: "13", family: "Passage", space: "The apartment corridors",
    line: "The last stretch home — read walking, in both directions, five hundred times a year. Events spaced like footsteps.",
  },
  {
    handle: "shore-threshold-dusk", render: "shorelight/clubentrance-render.jpg", panel: "shorelight/clubentrance-dusk.jpg",
    number: "04", family: "Shore Threshold", space: "The clubhouse entrance",
    line: "The chapter change: the building stops being circulation and starts being leisure.",
  },
  {
    handle: "shore-lounge-dusk", render: "shorelight/resilounge-render.jpg", panel: "shorelight/resilounge-dusk.jpg",
    number: "05", family: "Shore Lounge", space: "The residents' lounge",
    line: "The living room four hundred families share — a wall that hosts without performing.",
  },
  {
    handle: "feast-dusk", render: "shorelight/feast-render.jpg", panel: "shorelight/feast-dusk.jpg",
    number: "07", family: "Feast", space: "The banquet hall",
    line: "Empty on a Tuesday, photographed on a Saturday — a festive river of petals, dressed for any occasion.",
  },
  {
    handle: "pulse-dusk", render: "shorelight/pulse-render.jpg", panel: "shorelight/pulse-dusk.jpg",
    number: "08", family: "Pulse", space: "The gymnasium",
    line: "The view from the machine: one long current, depth to settle into, calm when the mirrors double it.",
  },
  {
    handle: "breath-dusk", render: "shorelight/breath-render.jpg", panel: "shorelight/breath-dusk.jpg",
    number: "14", family: "Breath", space: "The spa and meditation rooms",
    line: "The building's quietest wall, a few steps from its most strenuous — read lying down, in half-light, and asked to do almost nothing.",
  },
  {
    handle: "grove-dusk", render: "shorelight/grove-render.jpg", panel: "shorelight/grove-dusk.jpg",
    number: "09", family: "Grove", space: "The kids' club",
    line: "The same sea drawn young — turtles, crabs and leaping fish to find on the hundredth visit.",
  },
  {
    handle: "hush-dusk", render: "shorelight/hush-render.jpg", panel: "shorelight/hush-dusk.jpg",
    number: "06", family: "Hush", space: "The library", dark: true,
    line: "Night falls in two rooms. Here, midnight canopy with small things hidden in it — for the three-hundredth evening.",
  },
  {
    handle: "play-dusk", render: "shorelight/play-render.jpg", panel: "shorelight/play-dusk.jpg",
    number: "10", family: "Play", space: "The games room", dark: true,
    line: "The world after dark — a fox in a velvet garden, warmth that holds beside a lit table.",
  },
  {
    handle: "lagoon-dusk", render: "shorelight/lagoon-render.jpg", panel: "shorelight/lagoon-dusk.jpg",
    number: "11", family: "Lagoon", space: "The indoor pool",
    line: "Morning again. Light through clear water — bought once, seen twice, the pool carrying its reflection.",
  },
  {
    handle: "sky-dusk", render: "shorelight/sky-render.jpg", panel: "shorelight/sky-dusk.jpg",
    number: "12", family: "Sky", space: "The rooftop lounge",
    line: "The resolution: the cranes finally rise, and the painted sea meets the real one beyond the balustrade.",
  },
  {
    handle: "the-telling-dusk", render: "shorelight/the-telling-render.jpg", panel: "shorelight/the-telling-dusk.jpg",
    number: "15", family: "The Telling", space: "The sales gallery",
    line: "And the whole walk again, in one band — the wall that sells the building before a floor is poured.",
  },
];

const FINALE = [
  "tide-dusk", "ascent-dusk", "twenty-floors-dusk", "shore-threshold-dusk",
  "shore-lounge-dusk", "hush-dusk", "feast-dusk", "pulse-dusk",
  "grove-dusk", "play-dusk", "lagoon-dusk", "sky-dusk",
  "passage-dusk", "breath-dusk", "the-telling-dusk",
] as const;

const PANEL_BY_HANDLE: Record<string, { key: string; family: string }> = {
  "tide-dusk": { key: "shorelight/tide-dusk.jpg", family: "Tide" },
  "ascent-dusk": { key: "shorelight/ascent-dusk.jpg", family: "Ascent" },
  "twenty-floors-dusk": { key: "shorelight/liftlobby-dusk.jpg", family: "Twenty Floors" },
  "shore-threshold-dusk": { key: "shorelight/clubentrance-dusk.jpg", family: "Shore Threshold" },
  "shore-lounge-dusk": { key: "shorelight/resilounge-dusk.jpg", family: "Shore Lounge" },
  "hush-dusk": { key: "shorelight/hush-dusk.jpg", family: "Hush" },
  "feast-dusk": { key: "shorelight/feast-dusk.jpg", family: "Feast" },
  "pulse-dusk": { key: "shorelight/pulse-dusk.jpg", family: "Pulse" },
  "grove-dusk": { key: "shorelight/grove-dusk.jpg", family: "Grove" },
  "play-dusk": { key: "shorelight/play-dusk.jpg", family: "Play" },
  "lagoon-dusk": { key: "shorelight/lagoon-dusk.jpg", family: "Lagoon" },
  "sky-dusk": { key: "shorelight/sky-dusk.jpg", family: "Sky" },
  "passage-dusk": { key: "shorelight/passage-dusk.jpg", family: "Passage" },
  "breath-dusk": { key: "shorelight/breath-dusk.jpg", family: "Breath" },
  "the-telling-dusk": { key: "shorelight/the-telling-dusk.jpg", family: "The Telling" },
};

function Interlude({ eyebrow, title, body, dark }: { eyebrow: string; title: string; body: string; dark?: boolean }) {
  return (
    <section className={dark ? "bg-[#141c26] text-[#e8e4db]" : "bg-cloud"}>
      <div className="container-x mx-auto max-w-2xl py-24 text-center">
        <p className={`caps ${dark ? "text-[#c2a567]" : "text-slate"}`}>{eyebrow}</p>
        <h2 className="mt-3 text-[clamp(1.6rem,3.2vw,2.4rem)] leading-tight">{title}</h2>
        <p className={`mt-4 ${dark ? "text-[#93a0a6]" : "text-slate"}`}>{body}</p>
      </div>
    </section>
  );
}

export default function WalkthroughPage() {
  // Grouped rather than indexed by hand: the night interlude must always land
  // between the two night rooms, whatever else joins the walk.
  const nightStart = SCENES.findIndex((s) => s.dark);
  const nightEnd = SCENES.map((s) => Boolean(s.dark)).lastIndexOf(true) + 1;
  const before = SCENES.slice(0, nightStart);
  const night = SCENES.slice(nightStart, nightEnd);
  const after = SCENES.slice(nightEnd);

  return (
    <div className="bg-cloud">
      {/* Arrival */}
      <section className="relative">
        <div className="relative h-[92vh] overflow-hidden">
          <Image src={mediaUrl("shorelight/cover.jpg")} alt="Arriving at Shorelight" fill sizes="100vw" className="object-cover" priority />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/20" />
          <div className="absolute inset-x-0 bottom-0 pb-14">
            <div className="container-x text-white">
              <p className="caps text-white/85">Concept study · An imagined Mumbai development</p>
              <h1 className="mt-3 max-w-3xl text-[clamp(2.4rem,5.5vw,4.2rem)] leading-[1.05]">
                Walk through a building curated wall by wall.
              </h1>
              <p className="mt-4 max-w-2xl text-white/90">
                Shorelight is what an entire development looks like with one hand on its walls — twelve
                families of artwork telling one story from the sea to the sky. Scroll to walk it. Every
                wall you pass is a real panel you can shop, or bring to your own building.
              </p>
              <p className="mt-8 caps text-white/70">Scroll ↓</p>
            </div>
          </div>
        </div>
      </section>

      {before.map((s) => (
        <WalkthroughScene key={s.handle} scene={s} />
      ))}

      <Interlude
        dark
        eyebrow="After dark"
        title="Two rooms belong to the night."
        body="The library and the games room carry the same world at moonrise — and the building lets them. Restraint is not the absence of character; it is knowing which rooms may keep secrets."
      />

      {night.map((s) => (
        <WalkthroughScene key={s.handle} scene={s} />
      ))}

      <Interlude
        eyebrow="The ascent completes"
        title="Water, and then sky."
        body="The pool returns the story to water for pleasure; the rooftop lets it go."
      />

      {after.map((s) => (
        <WalkthroughScene key={s.handle} scene={s} />
      ))}

      {/* The whole property, one story */}
      <section className="container-x py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="caps text-slate">One connected story</p>
          <h2 className="mt-3 text-[clamp(1.8rem,3.6vw,2.6rem)] leading-tight">
            Ninety walls. One building. One author.
          </h2>
          <p className="mt-4 text-slate">
            This is the argument of the whole page: not ninety good designs, but one world told at
            every elevation — fifteen families, every shared amenity given its own wall, and two
            lights for the spaces a development builds twice. That is what makes a property feel
            curated rather than decorated.
          </p>
        </div>
        <div className="mt-10 flex gap-3 overflow-x-auto pb-4" style={{ scrollbarWidth: "thin" }}>
          {FINALE.map((h) => {
            const p = PANEL_BY_HANDLE[h];
            return (
              <Link key={h} href={`/products/${h}`} className="group relative h-44 w-32 flex-none overflow-hidden rounded-xl">
                <Image src={mediaUrl(p.key)} alt={p.family} fill sizes="128px" className="object-cover transition group-hover:scale-105" />
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 text-[0.65rem] font-semibold text-white">
                  {p.family}
                </span>
              </Link>
            );
          })}
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link href="/commercial" className="btn inline-flex h-12 px-6 text-[0.82rem]">
            Create this for your project
          </Link>
          <Link href="/projects/shorelight" className="btn btn-ghost inline-flex h-12 px-6 text-[0.82rem]">
            Read the case study
          </Link>
          <Link href="/collections/shorelight" className="btn btn-ghost inline-flex h-12 px-6 text-[0.82rem]">
            Browse the collection
          </Link>
        </div>
        <p className="mt-8 text-center text-xs text-mist">
          Shorelight is a concept study — an imagined development, built with commissioned-grade rigour.
          Your building would get its own story.
        </p>
      </section>
    </div>
  );
}
