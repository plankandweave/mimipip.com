// Which Library film a page shows.
//
// A page never names a film file. It names ITSELF — a page key: (kind,
// handle), e.g. ('product', 'karma') or ('page', 'installation') — and asks
// what is live there. A film is assigned to a page by filing it in the
// Library with that page's zyvorah.com link; the database derives the key
// from the link, and src/lib/marketing/site-film-publish.ts puts it live once
// Roheena has cleared it. So adding a film to a page is a Library action,
// never a deploy.
//
// Reads go through the catalogue cache (the publisher bumps its version), and
// a failed read shows no film rather than breaking the page it sits on.

import { supabase } from "@/lib/supabase";
import { cachedCatalogue } from "@/lib/catalogue-cache";
import { SITE_URL } from "@/lib/seo";

/** The page kinds that render Library films. A kind that is not here keeps
 *  its films off, so the Library never calls a film live that no page shows. */
export const SITE_FILM_KINDS = ["product", "collection", "concept", "page"] as const;
export type SiteFilmKind = (typeof SITE_FILM_KINDS)[number];

export type SiteFilm = {
  id: string;
  title: string;
  src: string;
  poster: string | null;
  width: number;
  height: number;
  language: string | null;
  /** WebVTT of the narration, served from this origin (film-captions.ts). */
  captions?: string | null;
  durationS?: number;
  publishedAt?: string | null;
  /** The same film on the @zyvorahwallpapers channel, when it is public there. */
  youtubeUrl?: string | null;
  /** The same film in its other languages, same shape — for the player's
   *  language toggle. Never contains the film itself. */
  versions?: SiteFilm[];
};

/** The shape a slot takes: 'wide' (landscape), 'tall' (portrait), or 'any'. */
export type FilmShape = "wide" | "tall" | "any";

/** Library titles are filing names — "Shorelight — Roheena Natural Voice —
 *  Option 01 — Vertical" — and a shopper must never read one. This keeps the
 *  parts that name the film and drops the parts that file it (shape, language,
 *  voice, option or review number, ad/reel label). Pure; pinned by the test. */
const FILING = /\b(vertical|horizontal|portrait|widescreen|landscape|square|english|hindi|marathi|voice|option\s*\d+|review(\s*v\d+)?|v\d+|ad(\s+film)?|film\s+\d+|reel|short|story|\d+\s*s(ec)?|draft|cut)\b/i;
export function filmHeadline(title: string): string {
  const parts = title.split(/\s+[—–|]\s+/).map((p) => p.trim()).filter(Boolean);
  const kept = parts.filter((p, i) => i === 0 || !FILING.test(p));
  return kept.slice(0, 2).join(" — ") || title;
}

const toFilm = (r: Record<string, unknown>): SiteFilm => ({
  id: String(r.id),
  title: filmHeadline(String(r.title ?? "")),
  src: String(r.media_url),
  poster: typeof r.poster_url === "string" ? r.poster_url : null,
  width: Number(r.width),
  height: Number(r.height),
  language: typeof r.language === "string" ? r.language : null,
  captions: typeof r.captions_url === "string" ? r.captions_url : null,
  durationS: Number(r.duration_s ?? 0),
  publishedAt: typeof r.published_at === "string" ? r.published_at : null,
  youtubeUrl: typeof r.youtube_url === "string" ? r.youtube_url : null,
});

const usable = (r: Record<string, unknown>) => typeof r.media_url === "string" && Number(r.width) > 0 && Number(r.height) > 0;

const readSiteFilms = cachedCatalogue("site-films", async (kind: SiteFilmKind, handle: string): Promise<SiteFilm[]> => {
  const { data, error } = await supabase.rpc("site_films", { p_kind: kind, p_handles: [handle] });
  if (error) throw new Error(`site_films(${kind}, ${handle}): ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).filter(usable).map(toFilm);
});

/** Live films for many pages of one kind at once, keyed by handle — for a
 *  grid of cards (the /concepts index). One read, never throws. */
const readSiteFilmsMany = cachedCatalogue("site-films-many", async (kind: SiteFilmKind, handles: string[]): Promise<Record<string, SiteFilm[]>> => {
  const { data, error } = await supabase.rpc("site_films", { p_kind: kind, p_handles: handles });
  if (error) throw new Error(`site_films(${kind}, ${handles.length} pages): ${error.message}`);
  const out: Record<string, SiteFilm[]> = {};
  for (const r of ((data ?? []) as Record<string, unknown>[]).filter(usable)) (out[String(r.handle)] ??= []).push(toFilm(r));
  return out;
});

export async function getSiteFilmsFor(kind: SiteFilmKind, handles: string[], shape: FilmShape = "any"): Promise<Record<string, SiteFilm>> {
  if (!handles.length) return {};
  try {
    const all = await readSiteFilmsMany(kind, [...new Set(handles.map((h) => h.toLowerCase()))].sort());
    const out: Record<string, SiteFilm> = {};
    for (const [handle, films] of Object.entries(all)) {
      const f = withVersions(films, pickSiteFilm(films, shape));
      if (f) out[handle] = f;
    }
    return out;
  } catch (err) {
    console.error("[site-films]", err);
    return {};
  }
}

/** The chosen film, carrying its other-language cuts of the same shape so the
 *  player can offer them. Pure; pinned by the test. */
export function withVersions(films: SiteFilm[], chosen: SiteFilm | null): SiteFilm | null {
  if (!chosen) return null;
  const seen = new Set([chosen.language]);
  const versions = films.filter((f) => {
    if (f.id === chosen.id || shapeOf(f) !== shapeOf(chosen) || !f.language || f.language === "none" || seen.has(f.language)) return false;
    seen.add(f.language);
    return true;
  });
  return versions.length ? { ...chosen, versions } : chosen;
}

export const shapeOf = (f: Pick<SiteFilm, "width" | "height">): Exclude<FilmShape, "any"> => (f.width > f.height ? "wide" : "tall");

/** Pure: the film a slot of this shape shows — English first, then the
 *  earliest filed (site_films orders by filing date). */
export function pickSiteFilm(films: SiteFilm[], shape: FilmShape = "any"): SiteFilm | null {
  const fits = films.filter((f) => shape === "any" || shapeOf(f) === shape);
  return fits.find((f) => f.language === "english") ?? fits[0] ?? null;
}

/** The live Library film for a page, or null. Never throws. */
export async function getSiteFilm(kind: SiteFilmKind, handle: string, shape: FilmShape = "any"): Promise<SiteFilm | null> {
  try {
    const films = await readSiteFilms(kind, handle.toLowerCase());
    return withVersions(films, pickSiteFilm(films, shape));
  } catch (err) {
    console.error("[site-films]", err);
    return null;
  }
}

/** Tailwind-free frame sizing: the film's own proportions, so no slot crops
 *  or letterboxes it. */
export const filmAspect = (f: Pick<SiteFilm, "width" | "height">) => ({ aspectRatio: `${f.width} / ${f.height}` });

const isoDuration = (seconds: number) => {
  const s = Math.max(1, Math.round(seconds));
  return `PT${Math.floor(s / 60)}M${s % 60}S`;
};

/**
 * schema.org VideoObject for a film on a page, so Google can show the film
 * against it in search. Google requires a thumbnail and an upload date, so a
 * film without a poster yet emits nothing rather than an invalid object. A
 * public copy on the YouTube channel is named as the embed. Pure.
 */
export function videoObjectJsonLd(film: SiteFilm, page: { path: string; name: string; description: string }) {
  if (!film.poster || !film.publishedAt) return null;
  const url = `${SITE_URL}${page.path}`;
  const yt = film.youtubeUrl?.match(/(?:v=|shorts\/|youtu\.be\/)([\w-]{11})/)?.[1];
  return {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    "@id": `${url}#film-${film.id}`,
    name: page.name,
    description: page.description,
    thumbnailUrl: [film.poster],
    uploadDate: film.publishedAt,
    ...(film.durationS ? { duration: isoDuration(film.durationS) } : {}),
    contentUrl: film.src,
    ...(yt ? { embedUrl: `https://www.youtube.com/embed/${yt}` } : {}),
    ...(film.language === "hindi" ? { inLanguage: "hi" } : film.language === "marathi" ? { inLanguage: "mr" } : film.language === "english" ? { inLanguage: "en" } : {}),
    publisher: { "@id": `${SITE_URL}/#organization` },
  };
}
