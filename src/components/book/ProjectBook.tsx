import { conceptShopUrl, getShopConcept } from "@/lib/shop-concepts";
import Image from "@/components/SiteImage";
import Link from "next/link";
import type { Project } from "@/content/projects/types";
import { mediaUrl } from "@/lib/project-media";
import type { SiteFilm } from "@/lib/site-films";
import { SiteFilmBand } from "@/components/SiteFilmBand";
import FitText from "@/components/FitText";
import { PaletteStrip } from "@/components/PaletteStrip";
import { WallReveal } from "./WallReveal";
import { ChapterRail } from "./ChapterRail";
import { BookTopBar } from "./BookTopBar";

/**
 * The one renderer every case study passes through.
 *
 * The page order is fixed and deliberate: the reader meets the brief and the
 * thinking BEFORE the imagery does its work, so the walls land as an argument
 * rather than as decoration. Anything that varies between projects lives in
 * the data file or the theme — never here.
 */
export function ProjectBook({ project, backHref = "/projects", backLabel = "Zyvorah · Projects", film = null }: { project: Project; backHref?: string; backLabel?: string; film?: SiteFilm | null }) {
  const isConcept = project.kind === "concept";
  const coverSrc = mediaUrl(project.cover);

  return (
    <div className="book" data-book-theme={project.theme}>
      <ChapterRail chapters={project.chapters.map((c) => c.space)} />

      {/* Outside <header>, because a sticky element only travels as far as
          its own parent's box — inside the header it would come unstuck the
          moment the cover ended, which is the moment it starts being useful. */}
      <BookTopBar slug={project.slug} backHref={backHref} backLabel={backLabel} shopHref={project.shop?.href} />

      {/* ---- Cover ---- */}
      <header className="relative">
        <div className="relative aspect-[16/10] w-full md:aspect-[21/9]">
          {coverSrc ? (
            <Image src={coverSrc} alt={project.title} fill sizes="100vw" className="object-cover" priority />
          ) : (
            <div className="h-full w-full" style={{ background: "var(--book-accent-soft)" }} />
          )}
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(to top, rgba(0,0,0,0.55), rgba(0,0,0,0.05) 55%)" }}
          />
        </div>
        <div className={project.slug === "the-lives-within" ? "book-plate relative mt-0 md:-mt-24" : "book-plate -mt-24 relative"}>
          <div
            className="max-w-3xl rounded-[24px] p-8 md:p-12"
            style={{ background: "var(--book-ground)" }}
          >
            {/* The concept/commissioned label is the first thing on the page,
                not a footnote. A reader who discovers later that a "case
                study" was imagined has been misled, and that costs more than
                the study could ever earn. */}
            <div className="flex flex-wrap items-center gap-3">
              <p className="book-eyebrow" style={{ color: "var(--book-accent)" }}>
                {project.slug === "the-lives-within" ? project.client : <>{isConcept ? "Concept Study" : "Commissioned Project"}{" · "}{project.client}</>}
              </p>
              {project.clientLogo && (
                // eslint-disable-next-line @next/next/no-img-element -- SVG logo; Next/Image's custom loader doesn't optimize vectors.
                <img
                  src={mediaUrl(project.clientLogo)}
                  alt={`${project.client} logo`}
                  className="h-5 w-auto opacity-80"
                />
              )}
            </div>
            <div className="mt-4">
              <FitText
                className="text-[clamp(2.1rem,5vw,3.6rem)] leading-[1.05] font-bold"
                minRem={1.75}
                maxRem={4.5}
              >
                {project.title}
              </FitText>
            </div>
            <p className="book-prose mt-5">{project.standfirst}</p>

            <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              {project.facts.map((f) => (
                <div key={f.label}>
                  <dt className="book-eyebrow">{f.label}</dt>
                  <dd className="mt-1 text-sm font-semibold">{f.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </header>

      {/* ---- The film ----
           A cleared Library film filed for this concept comes straight after
           the cover: the reader has met the headline and now hears it
           (src/lib/site-films.ts). Nothing renders otherwise. */}
      {film && (
        <SiteFilmBand
          film={film}
          eyebrow={`${project.title} · The film`}
          heading={film.title}
          body={project.standfirst}
          cta={project.shop ? { href: conceptShopUrl(project.slug), label: project.shop.label } : undefined}
        />
      )}

      {/* ---- Front matter ----
           The brief and the interpretation used to be two full plates, which
           meant a reader met four screens of unbroken text before the first
           wall. They are one plate now, read side by side: the ask on the
           left, the answer on the right, so the pairing is spatial instead of
           something the reader has to hold in their head across a scroll. */}
      <section className="book-plate book-plate--tight book-rule">
        <div className="grid gap-x-16 gap-y-12 lg:grid-cols-[0.85fr_1fr]">
          <div>
            <p className="book-eyebrow">The brief</p>
            <p className="book-prose mt-4 text-[0.98rem]">{project.brief.intro}</p>
            <ul className="mt-6 grid gap-3.5">
              {project.brief.requirements.map((r, i) => (
                <li key={r} className="flex gap-3.5">
                  <span
                    className="shrink-0 pt-[3px] font-mono text-[0.68rem] tabular-nums"
                    style={{ color: "var(--book-accent)" }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[0.93rem] leading-[1.55]">{r}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:border-l lg:pl-16" style={{ borderColor: "var(--book-rule)" }}>
            <p className="book-eyebrow">Our interpretation</p>
            <div className="mt-4 space-y-4">
              {project.interpretation.map((para, i) => (
                <p
                  key={para.slice(0, 30)}
                  className={
                    i === 0
                      ? "text-[clamp(1.2rem,2.1vw,1.6rem)] leading-[1.35] font-medium"
                      : "book-prose text-[0.96rem] leading-[1.65]"
                  }
                >
                  {para}
                </p>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---- Palette ----
           Shown as a ribbon rather than a list of chips-with-captions. A
           designer reads a palette by seeing the colours ADJACENT — whether
           the golds fight the greens is invisible when every swatch is
           marooned in its own row of body copy. Names and notes sit in a
           column under each colour, so the alignment does the labelling and
           the section costs a third of the height it used to. */}
      <section className="book-plate book-plate--tight book-rule">
        <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
          <p className="book-eyebrow">The palette</p>
          {project.palette.intro && (
            <p className="max-w-md text-[0.93rem] leading-[1.6]" style={{ color: "var(--book-muted)" }}>
              {project.palette.intro}
            </p>
          )}
        </div>

        {/* Full-bleed, flush, no gaps: a palette is judged by how the
            colours behave against each other, and a gutter between swatches
            is a lie about how they will actually meet on a wall.

            One shared strip with the proposal studio, so a reader meets the
            same treatment in the book and in the deck she presents. Each
            colour is as wide as its share; where a study has named no shares
            the bands come out equal. The hex is passed in to PAINT the band
            and is not printed — a published case study is the last place the
            recipe belongs. */}
        <PaletteStrip
          className="book-palette mt-7"
          tone="editorial"
          swatches={project.palette.entries.map((c) => ({
            name: c.name,
            hex: c.hex,
            pct: c.share ?? null,
            // Her sentence about what the colour DOES is the case study's
            // argument and stays on the page. The studio's terse internal
            // `role` token is a different thing and has no equivalent here.
            role: null,
            caption: c.purpose,
          }))}
        />

        {/* The restraint note is the sentence that makes a design director sit
            up — it reads as a decision, not a taste. Given its own weight. */}
        {project.palette.note && (
          <p
            className="mt-9 max-w-2xl border-l-2 pl-5 text-[1.02rem] leading-[1.6]"
            style={{ borderColor: "var(--book-accent)" }}
          >
            {project.palette.note}
          </p>
        )}
      </section>

      {/* ---- Motifs ---- */}
      <section className="book-plate book-plate--tight book-rule">
        <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
          <p className="book-eyebrow">The motif system</p>
          {project.motifs.intro && (
            <p className="max-w-md text-[0.93rem] leading-[1.6]" style={{ color: "var(--book-muted)" }}>
              {project.motifs.intro}
            </p>
          )}
        </div>
        <div className="mt-7 grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {project.motifs.entries.map((m) => {
            const src = mediaUrl(m.image ?? "");
            const body = (
              <>
                {src && (
                  <div className="relative mb-3 aspect-square overflow-hidden rounded-[14px]">
                    <Image
                      src={src}
                      alt={m.name}
                      fill
                      sizes="(max-width:900px) 50vw, 400px"
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                    />
                  </div>
                )}
                <p className="border-t pt-3 text-[0.95rem] font-semibold" style={{ borderColor: "var(--book-rule)" }}>
                  {m.name}
                </p>
                <p className="mt-1 text-[0.85rem] leading-[1.55]" style={{ color: "var(--book-muted)" }}>
                  {m.description}
                </p>
                {m.href && (
                  <span
                    className="book-no-print mt-2 inline-block text-sm font-semibold"
                    style={{ color: "var(--book-accent)" }}
                  >
                    See this design →
                  </span>
                )}
              </>
            );
            return m.href ? (
              <Link key={m.name} href={m.href} className="group block">
                {body}
              </Link>
            ) : (
              <div key={m.name}>{body}</div>
            );
          })}
        </div>
      </section>

      {/* ---- Buildings: one master story, one chapter each ---- */}
      {project.buildings && (
        <section className="book-plate book-rule">
          <p className="book-eyebrow">
            {project.buildingLabel ?? "The building chapters"}
          </p>
          {project.buildings.intro && <p className="book-prose mt-5">{project.buildings.intro}</p>}
          <div className="mt-10 grid gap-10 md:grid-cols-2">
            {project.buildings.entries.map((b, i) => (
              <div key={b.name} className="border-t pt-6" style={{ borderColor: "var(--book-rule)" }}>
                <p className="font-mono text-xs tabular-nums" style={{ color: "var(--book-accent)" }}>
                  {String(i + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-2 text-[clamp(1.3rem,2.4vw,1.8rem)] font-bold">{b.name}</h3>
                <p className="book-eyebrow mt-1">{b.subtitle}</p>
                <p className="mt-4 text-[0.98rem] leading-relaxed">{b.body}</p>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {b.draws.map((d) => (
                    <li
                      key={d}
                      className="rounded-full px-3 py-1 text-xs"
                      style={{ background: "var(--book-accent-soft)", color: "var(--book-ink)" }}
                    >
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---- Journeys: the same walls, read by three different people ---- */}
      {project.journeys && (
        <section className="book-plate book-rule">
          <p className="book-eyebrow">Three journeys</p>
          {project.journeys.intro && <p className="book-prose mt-5">{project.journeys.intro}</p>}
          <div className="mt-9 grid gap-8 lg:grid-cols-3">
            {project.journeys.entries.map((j) => (
              <div key={j.who}>
                <p className="font-semibold">{j.who}</p>
                <ol className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm" style={{ color: "var(--book-muted)" }}>
                  {j.route.map((stop, i) => (
                    <li key={stop} className="flex items-center gap-1.5">
                      <span>{stop}</span>
                      {i < j.route.length - 1 && (
                        <span aria-hidden style={{ color: "var(--book-accent)" }}>→</span>
                      )}
                    </li>
                  ))}
                </ol>
                <p className="mt-4 text-sm leading-relaxed" style={{ color: "var(--book-muted)" }}>{j.body}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---- The journey: one chapter per screen ---- */}
      <section className="book-rule">
        <div className="book-plate pb-0">
          <p className="book-eyebrow">The visual journey</p>
          <h2 className="mt-4 max-w-2xl text-[clamp(1.6rem,3vw,2.4rem)]">
            {project.journeyHeading ?? `${project.chapters.length} walls, one argument.`}
          </h2>
        </div>

        {project.chapters.map((ch, i) => (
          <article key={`${ch.space}-${ch.title}`} id={`chapter-${i + 1}`} className="book-chapter book-plate scroll-mt-4">
            <div className="mb-6 flex flex-wrap items-baseline gap-x-5 gap-y-2">
              <span className="font-mono text-xs tabular-nums" style={{ color: "var(--book-accent)" }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <p className="book-eyebrow">{ch.space}</p>
              <h3 className="text-[clamp(1.4rem,2.6vw,2rem)] font-bold">{ch.title}</h3>
            </div>

            <WallReveal plain={ch.plain} curated={ch.curated} alt={ch.alt} priority={i === 0} aspect={ch.aspect} />

            <p className="book-prose book-prose--full mt-6">{ch.rationale}</p>
            {getShopConcept(project.slug)&&<a href={`${conceptShopUrl(project.slug)}?design=${encodeURIComponent(ch.space)}`} className="book-no-print mt-4 inline-flex rounded-full border px-5 py-3 text-sm font-semibold">Buy this design →</a>}

            {ch.series && ch.series.length > 0 && (
              <div className={`mt-8 grid gap-5 ${ch.series.length > 1 ? "sm:grid-cols-3" : ""}`}>
                {ch.series.map((st) => (
                  <figure key={st.key}>
                    <div
                      className="relative overflow-hidden rounded-[12px] bg-black/5"
                      style={{ aspectRatio: st.aspect ?? "2/3" }}
                    >
                      <Image
                        src={mediaUrl(st.key)}
                        alt={st.alt}
                        fill
                        sizes="(max-width:640px) 100vw, 320px"
                        className="object-contain"
                      />
                    </div>
                    {st.caption && (
                      <figcaption className="mt-2 font-mono text-xs" style={{ color: "var(--book-muted)" }}>
                        {st.caption}
                      </figcaption>
                    )}
                  </figure>
                ))}
              </div>
            )}
          </article>
        ))}
      </section>

      {/* ---- Wall hierarchy ----
           The section that proves curation rather than supply: a campus where
           every wall is illustrated reads as a wallpaper showroom, so naming
           the half that must stay quiet is the argument, not a caveat. */}
      {project.wallHierarchy && (
        <section className="book-plate book-rule">
          <p className="book-eyebrow">Not every wall speaks at the same volume</p>
          {project.wallHierarchy.intro && <p className="book-prose mt-5">{project.wallHierarchy.intro}</p>}
          <div className="mt-9 max-w-3xl">
            {project.wallHierarchy.levels.map((l) => (
              <div
                key={l.level}
                className="grid grid-cols-[1fr_auto] items-baseline gap-x-6 gap-y-2 border-t py-5 sm:grid-cols-[10rem_1fr_3rem]"
                style={{ borderColor: "var(--book-rule)" }}
              >
                <p className="font-semibold">{l.level}</p>
                <p className="text-sm" style={{ color: "var(--book-muted)" }}>{l.purpose}</p>
                <p className="text-right font-mono text-sm tabular-nums">{l.share}%</p>
                <div
                  className="col-span-full h-1 overflow-hidden rounded-full"
                  style={{ background: "var(--book-accent-soft)" }}
                  aria-hidden
                >
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${l.share}%`, background: "var(--book-accent)" }}
                  />
                </div>
              </div>
            ))}
          </div>
          {project.wallHierarchy.note && (
            <p className="mt-8 max-w-xl border-l-2 pl-5 text-[1.05rem] leading-relaxed"
               style={{ borderColor: "var(--book-accent)" }}>
              {project.wallHierarchy.note}
            </p>
          )}
        </section>
      )}

      {/* ---- Process: where an owner starts believing in delivery ---- */}
      <section className="book-plate book-rule">
        <p className="book-eyebrow">How this was made</p>
        {project.process.intro && <p className="book-prose mt-5">{project.process.intro}</p>}
        <div className="mt-10 grid gap-10 md:grid-cols-2">
          {project.process.steps.map((s, i) => {
            const src = mediaUrl(s.image ?? "");
            return (
              <div key={s.title}>
                {src && (
                  <div className="relative mb-5 aspect-[16/9] overflow-hidden rounded-[16px]">
                    <Image src={src} alt={s.title} fill sizes="(max-width:900px) 100vw, 700px" className="object-cover" />
                  </div>
                )}
                <p className="font-mono text-xs tabular-nums" style={{ color: "var(--book-accent)" }}>
                  {String(i + 1).padStart(2, "0")}
                </p>
                <p className="mt-2 font-semibold">{s.title}</p>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--book-muted)" }}>{s.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      {project.shop && (
        <section className="book-plate book-rule">
          <div className="rounded-[22px] p-8 md:p-10" style={{ background: "var(--book-accent-soft)" }}>
            <p className="book-eyebrow">Make this wall yours</p>
            <h2 className="mt-3 max-w-2xl text-[clamp(1.6rem,3vw,2.35rem)]">{project.shop.heading}</h2>
            <p className="book-prose mt-4 max-w-2xl">{project.shop.body}</p>
            <Link
              href={conceptShopUrl(project.slug)}
              className="book-no-print mt-7 inline-flex h-12 items-center rounded-full px-7 text-sm font-semibold"
              style={{ background: "var(--book-ink)", color: "var(--book-ground)" }}
            >
              {project.shop.label} →
            </Link>
          </div>
        </section>
      )}

      {/* ---- Volunteered constraints ---- */}
      <section className="book-plate book-rule">
        <div className="max-w-2xl rounded-[20px] p-8" style={{ background: "var(--book-accent-soft)" }}>
          <p className="book-eyebrow">{project.productionNote.title}</p>
          <p className="mt-4 text-[0.98rem] leading-relaxed">{project.productionNote.body}</p>
          <ul className="mt-5 grid gap-2 text-sm" style={{ color: "var(--book-muted)" }}>
            {project.productionNote.points.map((p) => (
              <li key={p} className="flex gap-3">
                <span aria-hidden style={{ color: "var(--book-accent)" }}>—</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---- The ask ---- */}
      <section className="book-plate book-rule text-center">
        {getShopConcept(project.slug)?<><h2 className="mx-auto max-w-2xl text-[clamp(1.8rem,4vw,2.9rem)] leading-tight">
          Bring this look to your space.
        </h2>
        <p className="book-prose mx-auto mt-5 text-center">
          Buy the complete wallpaper and mural collection, or choose individual designs, made to fit your walls. Furniture and styling are not included.
        </p>
        <Link
          href={conceptShopUrl(project.slug)}
          className="book-no-print mt-9 inline-flex h-13 items-center rounded-full px-8 text-sm font-semibold"
          style={{ background: "var(--book-ink)", color: "var(--book-ground)" }}
        >
          {project.slug === "the-lives-within" ? "Choose your walls →" : "Buy this look →"}
        </Link></>:<><h2 className="text-3xl">Commissioned for {project.client} · Not for sale</h2><p className="book-prose mx-auto mt-5 text-center">These designs were created for {project.client}. Commission an original look for your own space below.</p></>}
        <Link href={`/projects/${project.slug}/create`} className="book-no-print ml-3 mt-4 inline-flex rounded-full border px-6 py-4 text-sm font-semibold">Create a look for your space →</Link>
      </section>
    </div>
  );
}
