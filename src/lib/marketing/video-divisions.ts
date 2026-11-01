// The Library's video divisions — where a finished film goes — and the rule
// that sorts each film into one. Shared by the Library tab and the library
// API. The shape and length a film is sorted by come from the server's read
// of the MP4 itself (`mp4-probe.ts`), never from the uploader.
//
// A film is not graded against the division someone picked; it is FILED where
// it fits (Roheena, 28 Sep 2026: "It's not about showing anything failing. It
// should just go into the category it belongs to"). The chosen division is
// kept when the film fits it — a vertical film can be a Reel, a Short, a Story
// or an ad, and only a person knows which — and otherwise the film is routed to
// the first division that takes its shape and length. A 16:9 film filed as a
// Reel lands in YouTube.

export type Division = "reel" | "short" | "story" | "ad" | "amazon" | "youtube" | "meeting";

type Aspect = { label: string; ratio: number };
const V916: Aspect = { label: "9:16", ratio: 9 / 16 };
const V45: Aspect = { label: "4:5", ratio: 4 / 5 };
const H169: Aspect = { label: "16:9", ratio: 16 / 9 };
const ASPECT_TOLERANCE = 0.02;

export type Film = { width: number; height: number; durationS: number };

export type DivisionSpec = {
  key: Division;
  label: string;
  /** One line under the division heading: what it is for. */
  purpose: string;
  /** Whether a film of this shape and length belongs here. */
  accepts: (f: Film) => boolean;
};

const shapeIs = (f: Film, ...aspects: Aspect[]) =>
  aspects.some((a) => Math.abs(f.width / f.height - a.ratio) / a.ratio <= ASPECT_TOLERANCE);

export const DIVISIONS: DivisionSpec[] = [
  { key: "reel", label: "Reels", purpose: "Instagram Reels — vertical, up to 3 minutes.", accepts: (f) => shapeIs(f, V916) && f.durationS <= 180.5 },
  { key: "short", label: "YouTube Shorts", purpose: "YouTube Shorts — vertical, up to 3 minutes.", accepts: (f) => shapeIs(f, V916) && f.durationS <= 180.5 },
  { key: "story", label: "Stories", purpose: "Instagram Stories — vertical, up to 60 seconds.", accepts: (f) => shapeIs(f, V916) && f.durationS <= 60.5 },
  { key: "ad", label: "Ad films", purpose: "Paid ads on Meta and Google — vertical or 4:5.", accepts: (f) => shapeIs(f, V916, V45) },
  { key: "amazon", label: "Amazon", purpose: "Amazon listing and Sponsored Brands video — vertical or 16:9.", accepts: (f) => shapeIs(f, V916, H169) },
  { key: "youtube", label: "YouTube", purpose: "YouTube videos — widescreen films and approved square Shorts.", accepts: (f) => f.width > f.height || (f.width === f.height && f.durationS <= 180.5) || f.durationS > 180.5 },
  { key: "meeting", label: "Business Meeting Videos", purpose: "Presentations for business meetings with architects, designers, promoters and project teams—introducing Zyvorah and exploring our approach to education and hospitality projects.", accepts: () => true },
];

export const DIVISION_KEYS = DIVISIONS.map((d) => d.key);
export const isDivision = (v: unknown): v is Division => typeof v === "string" && (DIVISION_KEYS as string[]).includes(v);
export const divisionOf = (v: unknown): DivisionSpec => DIVISIONS.find((d) => d.key === v) ?? DIVISIONS[0];

/** Where a film goes when the chosen division does not take it, by shape. */
const FALLBACK: Record<"wide" | "tall", Division[]> = {
  wide: ["youtube", "amazon"],
  tall: ["reel", "youtube", "ad"],
};

/** The division a film is filed under: the chosen one if the film fits it,
 *  else the first that takes its shape and length. A shape no division takes
 *  (a square, say) stays where it was put. */
export function routeFilm(chosen: Division, film: Film): Division {
  if (divisionOf(chosen).accepts(film)) return chosen;
  const order = FALLBACK[film.width > film.height ? "wide" : "tall"];
  return order.find((key) => divisionOf(key).accepts(film)) ?? chosen;
}

/** The divisions a film could be moved to by hand. */
export function divisionsFor(film: Film | null): DivisionSpec[] {
  const fits = film ? DIVISIONS.filter((d) => d.accepts(film)) : [];
  return fits.length ? fits : DIVISIONS;
}

/** A stored row's measurement, or null when it has not been measured. */
export function filmOf(row: { width?: number | null; height?: number | null; duration_s?: number | string | null }): Film | null {
  const durationS = row.duration_s == null ? NaN : Number(row.duration_s);
  if (!row.width || !row.height || !(durationS > 0)) return null;
  return { width: row.width, height: row.height, durationS };
}

export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** "16:9 · 1:46 · 1920×1080" — what the file is, for the card. */
export function describeFilm(f: Film): string {
  const known = [V916, V45, H169, { label: "1:1", ratio: 1 }];
  const hit = known.find((a) => shapeIs(f, a));
  return `${hit ? hit.label : f.width > f.height ? "widescreen" : "vertical"} · ${clock(f.durationS)} · ${f.width}×${f.height}`;
}
