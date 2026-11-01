import Image from "@/components/SiteImage";
import Link from "next/link";
import { conceptShopUrl, getShopConcept } from "@/lib/shop-concepts";
import { PaletteStrip } from "@/components/PaletteStrip";
import { mediaUrl } from "@/lib/project-media";
import type { FlipSpread, Project } from "@/content/projects/types";
import { BookTopBar } from "./BookTopBar";
import { FlipShell } from "./FlipShell";

/**
 * The flip book: a case study read LEFT TO RIGHT, one spread per gesture,
 * for projects whose data carries `flip.spreads`. A deliberate second
 * presentation beside ProjectBook, not a replacement — the classic book's
 * ChapterRail comment ("deliberately not a page-turn flipbook") stays true
 * of the classic book.
 *
 * This component is a server component on purpose: it maps pure spread data
 * to markup (so next/image and the RSC payload stay lean) and hands the
 * result to FlipShell, the one client piece, which owns the scroller.
 *
 * The kind mark uses the same strings as ProjectBook's cover, the index
 * card and the PDF — a concept study says so everywhere or nowhere.
 */
type PrivatePresentation = { label: string; pdfHref: string };

export function FlipBook({ project, presentation }: { project: Project; presentation?: PrivatePresentation }) {
  const spreads = project.flip?.spreads ?? [];
  return (
    <div className="book flip-book" data-book-theme={project.theme} data-book-project={project.slug}>
      {presentation ? <header className="private-book-bar"><span>ZYVORAH <small> / Private proposal</small></span><a href={presentation.pdfHref} download>Download PDF ↓</a></header> : <BookTopBar slug={project.slug} />}
      <FlipShell count={spreads.length}>
        {spreads.map((s, i) => (
          <Spread key={i} spread={s} project={project} index={i} total={spreads.length} priority={i < 2} presentation={presentation} />
        ))}
      </FlipShell>
    </div>
  );
}

function Spread({
  spread, project, index, total, priority, presentation,
}: {
  spread: FlipSpread; project: Project; index: number; total: number; priority: boolean; presentation?: PrivatePresentation;
}) {
  const dark = "dark" in spread && spread.dark ? "" : undefined;
  const group = {
    "data-spread": "",
    role: "group",
    "aria-label": `Page ${index + 1} of ${total}`,
    ...(dark !== undefined ? { "data-dark": "" } : {}),
  };

  switch (spread.type) {
    case "cover":
      return (
        <section {...group} className="flip-spread flip-cover">
          <div className="flip-cover-img">
            <Image src={mediaUrl(spread.image)} alt={spread.alt} fill sizes="100vw" className="object-cover" style={presentation ? { objectFit: "contain", objectPosition: "bottom" } : undefined} priority />
          </div>
          <div className="flip-cover-scrim" />
          <div className="flip-cover-text">
            <p className="flip-kind">
              {presentation?.label ?? (project.slug === "the-lives-within" ? project.client : `${project.kind === "concept" ? "Concept Study" : "Commissioned Project"} · ${project.client}`)}
            </p>
            <h1 className="flip-cover-title">{project.title}</h1>
            <p className="flip-cover-standfirst">{project.standfirst}</p>
          </div>
        </section>
      );

    case "passage":
      return (
        <section {...group} className="flip-spread flip-passage">
          <div className="flip-passage-inner">
            {spread.eyebrow && <p className="flip-eyebrow">{spread.eyebrow}</p>}
            <h2 className="flip-passage-title">{spread.title}</h2>
            <div className="flip-passage-body">
              {spread.body.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          </div>
        </section>
      );

    case "plate":
      return (
        <section {...group} className="flip-spread flip-plate">
          <div className="flip-plate-img" style={{ "--flip-ar": spread.aspect ?? "2 / 3" } as React.CSSProperties}>
            <Image
              src={mediaUrl(spread.image)}
              alt={spread.alt}
              fill
              sizes="(max-width: 900px) 84vw, 60vh"
              className="object-cover"
              style={presentation ? { objectFit: "contain" } : undefined}
              priority={priority}
            />
          </div>
          <Band caption={spread.caption} />
          {getShopConcept(project.slug)&&spread.caption?.space&&<a href={`${conceptShopUrl(project.slug)}?design=${encodeURIComponent(spread.caption.space)}`} className="book-no-print mx-auto my-2 block w-fit rounded-full border px-4 py-2 text-xs font-semibold">Buy this design →</a>}
        </section>
      );

    case "pair": {
      // Landscape pairs stack; portrait pairs sit side by side. The aspect is
      // declared on the spread so the geometry never waits on image bytes.
      const landscape = spread.aspect === "3/2";
      return (
        <section {...group} className="flip-spread flip-pair">
          <div
            className="flip-pair-imgs"
            {...(landscape ? { "data-stack": "" } : {})}
            style={{ "--flip-pair-ar": spread.aspect ?? "2 / 3" } as React.CSSProperties}
          >
            {spread.images.map((img) => (
              <div key={img.key}>
                <Image src={mediaUrl(img.key)} alt={img.alt} fill sizes="(max-width: 900px) 44vw, 40vh" className="object-cover" style={presentation ? { objectFit: "contain" } : undefined} />
              </div>
            ))}
          </div>
          <Band caption={spread.caption} />
        </section>
      );
    }

    case "panorama":
      return (
        <section {...group} className="flip-spread flip-pano">
          <div className="flip-pano-img">
            <Image src={mediaUrl(spread.image)} alt={spread.alt} fill sizes="100vw" className="object-cover" />
          </div>
          {spread.caption && (
            <div className="flip-pano-caption">
              <p className="flip-band-space">
                {[spread.caption.number, spread.caption.title, spread.caption.space].filter(Boolean).join(" · ")}
              </p>
            </div>
          )}
        </section>
      );

    case "palette":
      return (
        <section {...group} className="flip-spread flip-quiet">
          <div className="flip-quiet-inner">
            <p className="flip-eyebrow">The palette</p>
            {project.palette.intro && <p className="flip-quiet-intro">{project.palette.intro}</p>}
            <PaletteStrip
              className="book-palette mt-7"
              tone="editorial"
              swatches={project.palette.entries.map((c) => ({
                name: c.name,
                hex: c.hex,
                pct: c.share ?? null,
                role: null,
                caption: c.purpose,
              }))}
            />
          </div>
        </section>
      );

    case "index":
      return (
        <section {...group} className="flip-spread flip-quiet">
          <div className="flip-quiet-inner">
            <p className="flip-eyebrow">{spread.heading ?? "The coverage"}</p>
            {spread.intro && <p className="flip-quiet-intro">{spread.intro}</p>}
            <div className="flip-index-groups">
              {spread.groups.map((g) => (
                <div key={g.name} className="flip-index-group">
                  <h3>{g.name}</h3>
                  <ul>
                    {g.spaces.map((sp) => (
                      <li key={sp}>{sp}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>
      );

    case "gallery":
      return (
        <section {...group} className="flip-spread flip-quiet">
          <div className="flip-quiet-inner">
            <p className="flip-eyebrow">{spread.heading ?? "Every wall"}</p>
            {spread.intro && <p className="flip-quiet-intro">{spread.intro}</p>}
            <div className="flip-gallery">
              {spread.images.map((img) => (
                <div key={img.key} className="flip-gallery-cell" title={img.alt}>
                  <Image src={mediaUrl(img.key)} alt={img.alt} fill sizes="120px" className="object-cover" />
                </div>
              ))}
            </div>
          </div>
        </section>
      );

    case "ask":
      return (
        <section {...group} className="flip-spread flip-quiet">
          <div className="flip-quiet-inner" style={{ textAlign: "center" }}>
            {getShopConcept(project.slug)?<><p className="flip-eyebrow">Make it your own</p>
            <h2 className="flip-quiet-title">Bring this look to your space.</h2>
            <p className="flip-quiet-intro">Buy the complete wallpaper and mural collection, or choose individual designs, made to fit your walls. Furniture and styling are not included.</p>
            <Link href={conceptShopUrl(project.slug)} className="flip-ask-cta">Buy this look →</Link></>:<><h2 className="flip-quiet-title">Commissioned for {project.client} · Not for sale</h2><p className="flip-quiet-intro">These designs were created for {project.client}. Commission an original look for your own space below.</p></>}
            <Link href={`/projects/${project.slug}/create`} className="mt-4 block text-sm underline">Create a look for your space →</Link>
          </div>
        </section>
      );
  }
}

function Band({ caption }: { caption: { number?: string; title: string; space?: string; note?: string } }) {
  return (
    <div className="flip-band">
      {caption.number && <span className="flip-band-number">{caption.number}</span>}
      <span className="flip-band-title">{caption.title}</span>
      {caption.space && <span className="flip-band-space">{caption.space}</span>}
      {caption.note && <span className="flip-band-note">{caption.note}</span>}
    </div>
  );
}
