
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import { NafasAudioGuide, NafasListenButton, GuideArtwork } from "./NafasAudioGuide";
import { NafasLivingRoomFilm } from "./NafasLivingRoomFilm";
import Link from "next/link";
import Image from "@/components/SiteImage";
import { SITE_URL } from "@/lib/seo";
import {
  NAFAS_ARTIST,
  NAFAS_DESCRIPTION,
  NAFAS_DESIGNS,
  NAFAS_INKS,
  NAFAS_PATH,
  NAFAS_PENCILS,
  NAFAS_PORTRAIT,
  NAFAS_STORY,
  NAFAS_TITLE,
  nafasWebSrc,
  type NafasDesign,
} from "@/lib/nafas";
import { getNafasLiveHandles } from "@/lib/nafas-queries";

// The collection is fixed in lib/nafas; the only thing that moves is whether
// each design is live yet. Five minutes is plenty.
export const revalidate = 300;

export const metadata: Metadata = editorialMetadata("/nafas");

/** "Face Parade", each letter in one of her sprinkle colours. */
const LETTER_INKS = ["var(--pink)", "var(--sun)", "var(--sky)", "var(--leaf)", "var(--cherry)", "var(--bean)"];
function Sprinkled({ text }: { text: string }) {
  let i = 0;
  return (
    <>
      {[...text].map((ch, k) =>
        ch === " " ? (
          " "
        ) : (
          <span key={k} style={{ color: LETTER_INKS[i++ % LETTER_INKS.length] }}>
            {ch}
          </span>
        ),
      )}
    </>
  );
}

async function liveHandles(): Promise<Set<string>> {
  try {
    return new Set(await getNafasLiveHandles());
  } catch {
    return new Set();
  }
}

function DesignCard({ design, live, tilt }: { design: NafasDesign; live: boolean; tilt: string }) {
  const scene = design.scenes[0];
  const pencil = design.palette === "pencil";
  const inner = (
    <>
      <div className={`${pencil ? "sketch" : "polaroid"} ${tilt}`}>
        <div className={`relative ${pencil ? "aspect-[3/2]" : "aspect-square"} overflow-hidden rounded-[14px]`}>
          <Image
            src={nafasWebSrc(design.handle, scene)}
            alt={scene.alt}
            fill
            unoptimized
            sizes="(max-width: 768px) 100vw, 33vw"
            className="object-cover object-bottom"
          />
        </div>
        <div className="flex items-center gap-3 px-1 pt-4">
          <div
            className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-full ${pencil ? "ring-1" : "ring-4"}`}
            style={{ ["--tw-ring-color" as string]: pencil ? "rgba(46,46,46,0.35)" : design.accent }}
          >
            <Image src={nafasWebSrc(design.handle, "flat")} alt="" fill unoptimized sizes="56px" className="object-cover" />
          </div>
          <div className="min-w-0">
            <h3 className="display text-2xl font-semibold leading-tight">{design.name}</h3>
            <p className="text-[0.8rem] font-medium uppercase tracking-[0.14em]" style={{ color: pencil ? "var(--lead)" : design.accent }}>
              {pencil ? "One big pencil drawing" : design.kind === "mural" ? "One big drawing" : "A repeating pattern"}
            </p>
          </div>
        </div>
      </div>
      <p className="mt-5 px-2 text-[0.98rem] leading-relaxed text-[color:var(--ink-soft)]">{design.line}</p>
      <p className="mt-3 px-2 text-sm font-semibold">
        {live ? (
          <Link href={`/products/${design.handle}`} className="underline decoration-2 underline-offset-4" style={{ textDecorationColor: pencil ? "var(--graphite)" : design.accent }}>
            See it on your wall →
          </Link>
        ) : (
          <span className="text-[color:var(--ink-soft)]">Arriving in the shop shortly</span>
        )}
      </p>
    </>
  );
  return <GuideArtwork id={design.handle} className="face-card block">{inner}</GuideArtwork>;
}

/** Artwork starts its narration; the separate shop link preserves buying access. */
function ToDesign({ design, live, className, children }: { design: NafasDesign; live: boolean; className?: string; children: React.ReactNode }) {
  return <GuideArtwork id={design.handle} className={className}>
    {children}
    {live && <Link className="nafas-picture-shop" href={`/products/${design.handle}`} aria-label={`${design.name} — see it on your wall`}>See it on your wall →</Link>}
  </GuideArtwork>;
}

const TILTS = ["tilt-l", "tilt-r", "tilt-l"];

function Swatches({ inks }: { inks: readonly { name: string; hex: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-7 gap-y-5">
      {inks.map((ink) => (
        <li key={ink.name} className="flex items-center gap-3">
          <span className="dot" style={{ background: ink.hex }} aria-hidden />
          <span className="text-sm font-medium">{ink.name}</span>
        </li>
      ))}
    </ul>
  );
}

  async function NafasPage() {
  const live = await liveHandles();
  const colour = NAFAS_DESIGNS.filter((d) => d.palette === "colour");
  const daisySnap = colour.find((d) => d.handle === "nafas-daisy-snap")!;
  const food = NAFAS_DESIGNS.filter((d) => d.palette === "food");
  const play = NAFAS_DESIGNS.filter((d) => d.palette === "play");
  const pencil = NAFAS_DESIGNS.filter((d) => d.palette === "pencil");
  const pinkPop = colour[0];
  const panda = pencil.find((d) => d.handle === "nafas-panda-and-tweet") ?? pencil[0];
  const fish = pencil.find((d) => d.handle === "nafas-bubbles-the-fish") ?? pencil[1];
  const puppy = pencil.find((d) => d.handle === "nafas-patch-the-puppy") ?? pencil[2];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: NAFAS_TITLE,
    description: NAFAS_DESCRIPTION,
    url: `${SITE_URL}${NAFAS_PATH}`,
    creator: { "@type": "Person", name: NAFAS_ARTIST },
  };

  return (
    <NafasAudioGuide><main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Hero — colour in front, a pencil drawing tucked behind it: the page's
          whole journey in one glance. */}
      <section className="sprinkles">
        <div className="container-x grid items-center gap-12 py-14 md:grid-cols-[1.05fr_1fr] md:py-20">
          <div>
            <span className="chip" style={{ background: "var(--pink-soft)", color: "var(--pink)" }}>
              A collection by Nafas, age seven
            </span>
            <h1 className="display mt-5 text-[clamp(2.8rem,7vw,5.4rem)] font-semibold leading-[0.95]">
              <span style={{ color: "var(--ink)" }}>Nafas&rsquo;s</span>
              <br />
              <Sprinkled text="Face Parade" />
            </h1>
            <p className="mt-6 max-w-[34rem] text-[1.08rem] leading-[1.6] text-[color:var(--ink-soft)]">
              {NAFAS_DESIGNS.length} wallpapers by {NAFAS_ARTIST}, age seven. Bright faces, pencil animals, flowers, cars, footballs and a smiling pizza — her imagination, all across the wall.
            </p>
            <div className="nafas-guide-start"><NafasListenButton id="intro">Let Nafas show you around</NafasListenButton><p>Tap to listen. Her story follows as you scroll.</p></div>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a href="#faces" className="nf-btn nf-btn-pink">
                Shop the designs <span aria-hidden>↓</span>
              </a>
              <a href="#pencil" className="nf-btn nf-btn-line">
                Meet the animals
              </a>
              <a href="#little-foodies" className="nf-btn nf-btn-line">A little slice of happy</a>
              <a href="#flowers-and-play" className="nf-btn nf-btn-line">Flowers &amp; play</a>
            </div>
            <p className="mt-6 text-sm text-[color:var(--ink-soft)]">
              Explore the designs · availability and ordering are shown on each product page
            </p>
          </div>
          <div className="relative mx-auto w-full max-w-[560px] pb-10 pr-6 md:pb-14">
            <ToDesign design={panda} live={live.has(panda.handle)} className="sketch tilt-l absolute bottom-0 right-0 w-[58%]">
              <div className="relative aspect-[3/2] overflow-hidden rounded-[10px]">
                <Image src={nafasWebSrc(panda.handle, "flat")} alt="" fill unoptimized sizes="30vw" className="object-cover" />
              </div>
            </ToDesign>
            <ToDesign design={pinkPop} live={live.has(pinkPop.handle)} className="polaroid tilt-r relative w-[88%]">
              <div className="relative aspect-square overflow-hidden rounded-[14px]">
                <Image
                  src={nafasWebSrc(pinkPop.handle, pinkPop.scenes[0])}
                  alt={pinkPop.scenes[0].alt}
                  fill
                  priority
                  unoptimized
                  sizes="(max-width: 768px) 90vw, 40vw"
                  className="object-cover object-bottom"
                />
              </div>
              <p className="display px-1 pt-3 text-lg font-medium text-[color:var(--ink-soft)]">Pink Pop, in a playroom</p>
            </ToDesign>
          </div>
        </div>
      </section>

      <div className="beans" aria-hidden />

      {/* In colour */}
      <section id="faces" className="container-x scroll-mt-28 py-16 md:py-20">
        <h2 className="display text-[clamp(2rem,4vw,3rem)] font-semibold leading-tight">The faces, in colour</h2>
        <p className="mt-3 max-w-[36rem] text-[1.02rem] leading-[1.6] text-[color:var(--ink-soft)]">
          Three portraits to hang as one big picture across a wall, and the original repeat that pairs Pink Pop with Ruby & Snow.
        </p>
        <div className="mt-12 grid gap-12 sm:grid-cols-2 lg:grid-cols-3 lg:gap-10">
          {colour.map((d, i) => (
            <DesignCard key={d.handle} design={d} live={live.has(d.handle)} tilt={TILTS[i % TILTS.length]} />
          ))}
        </div>
      </section>

      <section id="living-room" className="scroll-mt-28 bg-[#f7f0e6] py-16 md:py-24" aria-labelledby="living-room-heading">
        <div className="container-x">
          <div className="max-w-[46rem]">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--ink-soft)]">From Nafas&rsquo;s sketchbook</p>
            <h2 id="living-room-heading" className="display mt-3 text-[clamp(2.2rem,5vw,4rem)] font-semibold leading-tight">Nafas&rsquo;s colourful tree</h2>
            <p className="mt-4 text-[1.05rem] leading-[1.7] text-[color:var(--ink-soft)]">
              A burst of colour and a little tree with a life of its own. Nafas imagined it brightening a living room with a black sofa and white table.
            </p>
          </div>
          <figure className="mx-auto mt-9 max-w-[850px] overflow-hidden rounded-[18px] bg-white shadow-[0_18px_55px_rgba(55,35,20,0.12)]">
            <Image
              src="/nafas/living-room/wall-art-room.webp"
              alt="Nafas's original square tree painting shown as wall art above a black sofa and white table"
              width={1254}
              height={1254}
              unoptimized
              sizes="(max-width: 850px) 100vw, 850px"
              className="h-auto w-full"
            />
          </figure>
          <figure className="mt-9 overflow-hidden rounded-[18px] bg-white shadow-[0_18px_55px_rgba(55,35,20,0.12)]">
            <Image
              src="/nafas/living-room/wallpaper-room.webp"
              alt="Nafas's tree painting extended across a living-room wallpaper wall behind a black sofa and white table"
              width={1672}
              height={941}
              unoptimized
              sizes="100vw"
              className="h-auto w-full"
            />
          </figure>
          <div className="mt-8 grid items-center gap-8 md:grid-cols-[1.5fr_1fr]">
            <div>
              <NafasLivingRoomFilm />
              <p className="mt-3 text-sm text-[color:var(--ink-soft)]">Hear Nafas tell the story behind her painting.</p>
            </div>
            <figure className="mx-auto w-full max-w-[350px] rounded-[18px] bg-white p-4 shadow-[0_12px_35px_rgba(55,35,20,0.10)]">
              <Image
                src="/nafas/living-room/original-painting.jpg"
                alt="Nafas's original painting of a dark branching tree among colourful brushstrokes"
                width={1261}
                height={1280}
                unoptimized
                sizes="(max-width: 768px) 85vw, 350px"
                className="h-auto w-full rounded-[8px]"
              />
              <figcaption className="pt-3 text-sm text-[color:var(--ink-soft)]">The painting that started it all.</figcaption>
            </figure>
          </div>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/contact?question=Nafas%27s%20colourful%20tree%20as%20wallpaper%20or%20wall%20art" className="nf-btn nf-btn-pink">Ask us about this design <span aria-hidden>→</span></Link>
            <Link href="#faces" className="nf-btn nf-btn-line">Explore Nafas&rsquo;s wallpapers</Link>
          </div>
        </div>
      </section>


      <section id="daisy-snap" className="container-x scroll-mt-28 pb-16 md:pb-20">
        <p className="text-sm font-semibold uppercase tracking-widest">New from Nafas</p>
        <h2 className="display mt-3 text-[clamp(2rem,4vw,3rem)] font-semibold">Meet Daisy Snap</h2>
        <p className="mt-3 max-w-[36rem] text-[1.02rem] leading-relaxed">A sunny smile, a camera, and a wall full of daisies. A new face for a bedroom or a corner for making things.</p>
        <div className="mt-8 grid gap-8 md:grid-cols-2">
          {daisySnap.scenes.map((scene) => (
            <ToDesign key={scene.file} design={daisySnap} live={live.has(daisySnap.handle)} className="polaroid">
              <figure className="pb-10">
                <div className="relative aspect-[3/2] overflow-hidden rounded-[14px]">
                  <Image src={nafasWebSrc(daisySnap.handle, scene)} alt={scene.alt} fill unoptimized sizes="(max-width: 768px) 100vw, 50vw" className="object-cover object-bottom" />
                </div>
                <figcaption className="display px-1 pt-3 text-lg">{scene.sceneKey === "playroom" ? "A sunny corner for making things" : "Daisies to wake up to"}</figcaption>
              </figure>
            </ToDesign>
          ))}
        </div>
        <details className="mt-8">
          <summary className="cursor-pointer py-3 font-semibold">See the flat wallpaper — Daisy Snap</summary>
          <Image src={nafasWebSrc(daisySnap.handle, "flat")} alt="Daisy Snap — flat artwork" width={1024} height={1536} unoptimized className="mt-4 h-auto w-full max-w-md rounded-xl" />
        </details>
      </section>

      {/* The turn: her sprinkles lose their colour as you scroll, and the
          icing ground cools to paper. */}
      <section data-nafas-track="pencil" className="fade-band" aria-labelledby="turn-heading">
        <div className="container-x relative py-24 text-center md:py-32">
          <h2 id="turn-heading" className="display text-[clamp(1.8rem,4vw,3rem)] font-semibold leading-tight">
            <Sprinkled text="Then" /> <span style={{ color: "var(--graphite)" }}>she picked up a pencil.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-[30rem] text-[1.02rem] leading-[1.6] text-[color:var(--lead)]">
            The same hand, the same smile, in soft grey lead on paper.
          </p>
          <div className="mt-5"><NafasListenButton id="pencil">Why I like black and white</NafasListenButton></div>
          <svg className="mx-auto mt-6 block" width="160" height="14" viewBox="0 0 160 14" aria-hidden>
            <path d="M3 9c22-6 40 4 62-1s36-6 54-2 26 3 38-1" fill="none" stroke="var(--graphite)" strokeWidth="2.2" strokeLinecap="round" opacity=".7" />
          </svg>
        </div>
      </section>

      {/* In pencil */}
      <section id="pencil" className="grain scroll-mt-28">
        <div className="container-x py-16 md:py-20">
          <h2 className="display text-[clamp(2rem,4vw,3rem)] font-semibold leading-tight" style={{ color: "var(--graphite)" }}>
            The animals, in pencil
          </h2>
          <p className="mt-3 max-w-[38rem] text-[1.02rem] leading-[1.6] text-[color:var(--lead)]">
            Each one hangs as a single big drawing across the wall, black and white, with the paper grain left in. Let
            the room bring the colour — a pink throw, a yellow pouffe.
          </p>
          <div className="mt-12 grid gap-12 sm:grid-cols-2 lg:grid-cols-3 lg:gap-10">
            {pencil.map((d, i) => (
              <DesignCard key={d.handle} design={d} live={live.has(d.handle)} tilt={TILTS[(i + 1) % TILTS.length]} />
            ))}
          </div>
        </div>
      </section>

      <section id="flowers-and-play" className="scroll-mt-28" style={{ background: "var(--icing)" }}>
        <div className="container-x py-16 md:py-20">
          <span className="chip" style={{ background: "var(--pink-soft)", color: "var(--pink)" }}>New from Nafas</span>
          <h2 className="display mt-4 text-[clamp(2rem,4vw,3rem)] font-semibold">Flowers &amp; play</h2>
          <p className="mt-3 max-w-[38rem] text-[1.02rem] leading-relaxed text-[color:var(--ink-soft)]">Little daisies, a big crayon bloom, and cars with footballs. Her original colours and playful marks, with room for everyday adventures.</p>
          <div className="mt-12 space-y-16">
            {play.map((d) => (
              <article key={d.handle}>
                <h3 className="display text-3xl font-semibold" style={{ color: d.accent }}>{d.name}</h3>
                <p className="mt-2 text-[color:var(--ink-soft)]">{d.line}</p>
                <div className="mt-6 grid gap-6 md:grid-cols-2">
                  {d.scenes.map((scene) => (
                    <ToDesign key={scene.file} design={d} live={live.has(d.handle)} className="polaroid">
                      <figure>
                        <Image src={nafasWebSrc(d.handle, scene)} alt={scene.alt} width={scene.width} height={scene.height} unoptimized sizes="(max-width: 768px) 100vw, 50vw" className="h-auto w-full rounded-[10px]" />
                        <figcaption className="display pt-3 text-lg">{scene.sceneKey === "kidsroom" ? "A bedroom to dream in" : "A place to play and create"}</figcaption>
                      </figure>
                    </ToDesign>
                  ))}
                </div>
                <details className="mt-5 rounded-xl border border-black/10 bg-white/60 p-4">
                  <summary className="cursor-pointer font-semibold">See the flat wallpaper — {d.name}</summary>
                  <Image src={nafasWebSrc(d.handle, "flat")} alt={`${d.name} — flat artwork`} width={d.flat.width} height={d.flat.height} unoptimized className="mx-auto mt-4 h-auto max-h-[720px] w-auto max-w-full" />
                </details>
                {live.has(d.handle) && <Link href={`/products/${d.handle}`} className="nf-btn nf-btn-pink mt-5">See {d.name} on your wall →</Link>}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="little-foodies" className="container-x scroll-mt-28 py-16 md:py-20">
        <span className="chip" style={{ background: "var(--pink-soft)", color: "var(--pink)" }}>New from Nafas</span>
        <h2 className="display mt-4 text-[clamp(2rem,4vw,3rem)] font-semibold">A little slice of happy</h2>
        <p className="mt-3 max-w-[38rem] text-[1.02rem] leading-relaxed text-[color:var(--ink-soft)]">Nafas imagined a wall for the children’s eating area in a mall. Her answer? A pizza with a smile, a little tongue, and a hand waving hello.</p>
        {food.map((d) => (
          <article key={d.handle} className="mt-10">
            <h3 className="display text-3xl font-semibold" style={{ color: d.accent }}>{d.name}</h3>
            <p className="mt-2 text-[color:var(--ink-soft)]">{d.line}</p>
            <div className="mt-6 space-y-8">
              {d.scenes.map((scene) => (
                <ToDesign key={scene.file} design={d} live={live.has(d.handle)} className="polaroid">
                  <figure>
                    <Image src={nafasWebSrc(d.handle, scene)} alt={scene.alt} width={scene.width} height={scene.height} unoptimized sizes="100vw" className="h-auto w-full rounded-[10px]" />
                    <figcaption className="display pt-3 text-lg">{scene.file.includes("family-nook") ? "A table to share — the family dining nook" : "A happy place to eat — a mall children’s dining area"}</figcaption>
                  </figure>
                </ToDesign>
              ))}
            </div>
            <div className="mt-5"><NafasListenButton id={d.handle} /></div>
            <details className="mt-5 rounded-xl border border-black/10 bg-white/60 p-4">
              <summary className="cursor-pointer font-semibold">See the flat wallpaper — {d.name}</summary>
              <Image src={nafasWebSrc(d.handle, "flat")} alt={`${d.name} — flat artwork`} width={d.flat.width} height={d.flat.height} unoptimized className="mx-auto mt-4 h-auto max-h-[720px] w-auto max-w-full" />
            </details>
            {live.has(d.handle) && <Link href={`/products/${d.handle}`} className="nf-btn nf-btn-pink mt-5">See {d.name} on your wall →</Link>}
          </article>
        ))}
      </section>

      {/* Meet the artist — she stays in colour on the paper page. */}
      <section id="nafas" className="scroll-mt-28" style={{ background: "var(--paper-deep)" }}>
        <div className="container-x grid items-center gap-12 py-16 md:grid-cols-[0.8fr_1.2fr] md:py-24">
          <div className="sketch tilt-l mx-auto w-full max-w-[380px]">
            <div className="relative overflow-hidden rounded-[10px]" style={{ aspectRatio: `${NAFAS_PORTRAIT.width} / ${NAFAS_PORTRAIT.height}` }}>
              <Image
                src={NAFAS_PORTRAIT.src}
                alt="Nafas Elizabeth Pattrick holding a small pink flower"
                fill
                unoptimized
                sizes="(max-width: 768px) 90vw, 380px"
                className="object-cover"
              />
            </div>
            <p className="display px-1 pt-3 text-lg font-medium text-[color:var(--lead)]">Nafas, the artist</p>
          </div>
          <div>
            <span className="chip" style={{ background: "#fff", color: "var(--graphite)" }}>
              Meet the artist
            </span>
            <h2 className="display mt-4 text-[clamp(2rem,4vw,3.2rem)] font-semibold leading-tight" style={{ color: "var(--graphite)" }}>
              {NAFAS_ARTIST}
            </h2>
            <div className="mt-6 max-w-[38rem] space-y-4 text-[1.04rem] leading-[1.65] text-[color:var(--lead)]">
              {NAFAS_STORY.map((p) => (
                <p key={p.slice(0, 24)}>{p}</p>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Rooms — pencil on the wall, colour in the room. */}
      <section className="grain">
        <div className="container-x py-16 md:py-20">
          <h2 className="display text-[clamp(2rem,4vw,3rem)] font-semibold leading-tight" style={{ color: "var(--graphite)" }}>
            Pencil on the wall, colour in the room
          </h2>
          <div className="mt-10 grid items-start gap-8 md:grid-cols-2">
            {[
              { d: panda, s: panda.scenes[1] ?? panda.scenes[0], label: `${panda.name}, in a playroom` },
              { d: puppy, s: puppy.scenes[1] ?? puppy.scenes[0], label: `${puppy.name}, in a reading corner` },
              { d: fish, s: fish.scenes[0], label: `${fish.name}, in a bedroom` },
              { d: colour[2], s: colour[2].scenes[0], label: `${colour[2].name}, in a bedroom` },
            ].map(({ d, s, label }, i) => (
              <ToDesign key={label} design={d} live={live.has(d.handle)} className={`face-card ${d.palette === "pencil" ? "sketch" : "polaroid"} ${i % 2 ? "tilt-r" : "tilt-l"}`}>
                <figure>
                  <div className="relative overflow-hidden rounded-[10px]" style={{ aspectRatio: `${s.width} / ${s.height}` }}>
                    <Image
                      src={nafasWebSrc(d.handle, s)}
                      alt={s.alt}
                      fill
                      unoptimized
                      sizes="(max-width: 768px) 100vw, 50vw"
                      className="object-cover object-bottom"
                    />
                  </div>
                  <figcaption className="display px-1 pt-3 text-lg font-medium text-[color:var(--lead)]">{label}</figcaption>
                </figure>
              </ToDesign>
            ))}
          </div>
        </div>
      </section>

      {/* Calm rooms — the same walls with the colour taken out of the room too. */}
      <section className="grain">
        <div className="container-x pb-16 md:pb-20">
          <h2 className="display text-[clamp(1.8rem,3.4vw,2.6rem)] font-semibold leading-tight" style={{ color: "var(--graphite)" }}>
            Or keep the whole room calm
          </h2>
          <p className="mt-3 max-w-[36rem] text-[1.02rem] leading-[1.6] text-[color:var(--lead)]">
            Linen, oak and soft greys: the pencil drawing with nothing competing for it.
          </p>
          <div className="mt-10 grid items-start gap-8 sm:grid-cols-2">
            {pencil
              .flatMap((d) => d.scenes.filter((sc) => sc.file.includes("-calm")).map((sc) => ({ d, sc })))
              .map(({ d, sc }, i) => (
                <ToDesign key={`${d.handle}-${sc.file}`} design={d} live={live.has(d.handle)} className={`face-card sketch ${i % 2 ? "tilt-r" : "tilt-l"}`}>
                  <figure>
                    <div className="relative overflow-hidden rounded-[10px]" style={{ aspectRatio: `${sc.width} / ${sc.height}` }}>
                      <Image src={nafasWebSrc(d.handle, sc)} alt={sc.alt} fill unoptimized sizes="(max-width: 640px) 100vw, 50vw" className="object-cover object-bottom" />
                    </div>
                    <figcaption className="display px-1 pt-3 text-lg font-medium text-[color:var(--lead)]">
                      {d.name}, {sc.file.includes("playroom") ? "in a calm playroom" : sc.file.includes("reading") ? "in a calm reading corner" : "in a calm bedroom"}
                    </figcaption>
                  </figure>
                </ToDesign>
              ))}
          </div>
        </div>
      </section>

      {/* Her colours, then her pencils */}
      <section className="sprinkles-grey">
        <div className="container-x py-16 md:py-20">
          <h2 className="display text-[clamp(1.8rem,3.4vw,2.6rem)] font-semibold leading-tight" style={{ color: "var(--graphite)" }}>
            Her colours, and her pencils
          </h2>
          <div className="mt-8 space-y-6">
            <Swatches inks={NAFAS_INKS} />
            <Swatches inks={NAFAS_PENCILS} />
          </div>
          <div className="mt-14 flex flex-wrap gap-3">
            <Link href="#faces" className="nf-btn nf-btn-ink">
              Explore all {NAFAS_DESIGNS.length} designs <span aria-hidden>→</span>
            </Link>
            <Link href="/collections/wallpaper-worlds" className="nf-btn nf-btn-line">
              More kids&rsquo; wallpapers
            </Link>
          </div>
        </div>
      </section>
    </main></NafasAudioGuide>
  );
}

export default withBrandEditorial("/nafas", NafasPage);
