import Link from "next/link";
import { TaashFilm } from "@/components/TaashFilm";
import { filmAspect, shapeOf, type SiteFilm } from "@/lib/site-films";

/**
 * A page's Library film beside a few lines about it. The frame takes the
 * film's own proportions — a vertical Reel stands narrow beside the words, a
 * widescreen film takes the larger column — so no film is cropped or boxed.
 * Renders only when the page has a live film (src/lib/site-films.ts).
 */
export function SiteFilmBand({
  film,
  eyebrow,
  heading,
  body,
  cta,
}: {
  film: SiteFilm;
  eyebrow: string;
  heading: string;
  body?: string;
  cta?: { href: string; label: string };
}) {
  const tall = shapeOf(film) === "tall";
  return (
    <section className="container-x py-10 lg:py-14" aria-label={`${eyebrow}: ${film.title}`}>
      <div
        className={`mx-auto grid items-center gap-8 rounded-[28px] bg-[#eee6da] p-5 lg:p-8 ${
          tall ? "max-w-5xl md:grid-cols-[minmax(0,0.75fr)_minmax(0,1fr)] md:gap-12" : "lg:grid-cols-[minmax(0,1.65fr)_minmax(0,0.75fr)]"
        }`}
      >
        <TaashFilm
          src={film.src}
          poster={film.poster}
          title={film.title}
          film={film}
          style={filmAspect(film)}
          className={`min-w-0 w-full rounded-[18px] ${tall ? "mx-auto max-w-[310px]" : ""}`}
        />
        <div className="min-w-0 max-w-md">
          <p className="text-xs uppercase tracking-[0.18em] text-[#8b5744]">{eyebrow}</p>
          <h2 className="mt-3 font-display text-2xl leading-tight text-[#30251d] md:text-3xl">{heading}</h2>
          {body && <p className="mt-4 font-serif text-base leading-relaxed text-[#56483d]">{body}</p>}
          <p className="mt-3 text-xs leading-relaxed text-[#77675a]">The film starts silently. Choose “Hear the story” for the narrated version.</p>
          {cta && (
            <Link href={cta.href} className="mt-6 inline-flex w-fit items-center rounded-full bg-[#29221d] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#493a31]">
              {cta.label} →
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
