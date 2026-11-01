// Long-form YouTube for Library films: the rules, with no database and no
// network, so the runner, the Library card and the tests read the same ones.
//
// A Library film filed under YouTube goes to @zyvorahwallpapers in its own
// shape and length. Widescreen stays an ordinary video; YouTube classifies
// square films up to three minutes as Shorts. The pipeline around it is
//
//   queued (Roheena's approval, written on the film)
//     → gate (this file: licences, shape, copy through the brand-safety gate)
//     → claim (one writer wins, on the row's updated_at)
//     → reconcile (is this film already on the channel? then record, never re-upload)
//     → upload → thumbnail + captions → verify with YouTube → record on the film.
//
// Every state lives in `youtube.longform` on the Library row, so the card and
// the cron read one record, and nothing here takes anyone's word for it.

import { checkCaption, autoCorrect, type SafetyIssue } from "./safety";
import { normaliseClearance } from "./library-record";
import { filmOf } from "./video-divisions";

export const SITE = "https://zyvorah.com";
export const YT_TITLE_MAX = 100;
export const YT_DESCRIPTION_MAX = 5000;
/** YouTube counts every tag's characters (plus separators) against 500. */
export const YT_TAGS_MAX_CHARS = 500;
/** How long an upload may hold its claim before a later run may reconcile and retry it. */
export const CLAIM_STALE_MS = 20 * 60 * 1000;
/** Upload attempts the cron makes on its own before the film waits for a person. */
export const MAX_ATTEMPTS = 3;

export type LongformState = "queued" | "blocked" | "uploading" | "published" | "failed";

export type LongformCopy = {
  title: string;
  description: string;
  tags: string[];
  /** BCP-47 of the words on the page (title/description). */
  defaultLanguage: string;
  /** BCP-47 of what the viewer hears; absent for a film with no voice. */
  defaultAudioLanguage?: string;
};

export type Longform = {
  state: LongformState;
  approved_by?: string;
  approved_at?: string;
  requested_by?: string;
  claim?: string;
  claimed_at?: string;
  attempts?: number;
  video_id?: string;
  url?: string;
  title?: string;
  privacy?: string;
  channel_id?: string;
  published_at?: string;
  /** Recovered from the channel rather than uploaded by this run. */
  reconciled?: boolean;
  thumbnail?: string;
  captions?: string;
  error?: string;
  failed_at?: string;
};

export type FilmRow = {
  id: string;
  title: string;
  wallpaper?: string | null;
  product_url?: string | null;
  format?: string | null;
  language?: string | null;
  width?: number | null;
  height?: number | null;
  duration_s?: number | string | null;
  media_key?: string | null;
  cover_key?: string | null;
  captions_key?: string | null;
  clearance?: unknown;
  youtube?: unknown;
};

/** The pipeline's record on a film, or null when it has never been asked to go. */
export function longformOf(row: Pick<FilmRow, "youtube">): Longform | null {
  const yt = row.youtube && typeof row.youtube === "object" ? (row.youtube as Record<string, unknown>) : {};
  const lf = yt.longform;
  return lf && typeof lf === "object" && typeof (lf as Longform).state === "string" ? (lf as Longform) : null;
}

/** Copy someone wrote for this film (youtube.copy), if any. */
function writtenCopy(row: FilmRow): Partial<LongformCopy> | null {
  const yt = row.youtube && typeof row.youtube === "object" ? (row.youtube as Record<string, unknown>) : {};
  const c = yt.copy;
  return c && typeof c === "object" ? (c as Partial<LongformCopy>) : null;
}

/** Hidden tag that marks an upload as THIS Library film — how an interrupted
 *  run finds its own video on the channel instead of uploading a second. */
export const filmTag = (id: string) => `zyvorah-film-${id.slice(0, 8)}`;

const LANG_CODE: Record<string, string> = { english: "en", hindi: "hi", marathi: "mr" };

/** Collaborations the credit line must name. Matched on what the film sells. */
const COLLABORATORS: { match: RegExp; credit: string; tags: string[] }[] = [
  {
    match: /\bmati\b|\/mati\b|\btaash\b/i,
    credit: "TAASH is a collaboration between Mati (@stylemati) and Zyvorah.",
    tags: ["Mati", "stylemati", "TAASH"],
  },
];

export function collaboratorFor(row: FilmRow) {
  const hay = `${row.title} ${row.wallpaper ?? ""} ${row.product_url ?? ""}`;
  return COLLABORATORS.find((c) => c.match.test(hay)) ?? null;
}

/** The Library title names the cut ("— Widescreen", "— Hindi Film"); a viewer
 *  needs the film's name, not how it was filed. */
export function publicTitle(libraryTitle: string): string {
  const parts = libraryTitle.split(/\s+[—–-]\s+/).filter((p) =>
    !/^(widescreen|horizontal|vertical|landscape|portrait|16:9|hindi film|english film|english ad|hindi ad|review v\d+)$/i.test(p.trim()));
  return parts.join(" — ").trim() || libraryTitle.trim();
}

const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);

function fitTags(tags: string[]): string[] {
  const out: string[] = [];
  let used = 0;
  for (const raw of tags) {
    const t = raw.replace(/[<>,"]/g, "").trim();
    if (!t || out.some((o) => o.toLowerCase() === t.toLowerCase())) continue;
    const cost = t.length + (t.includes(" ") ? 2 : 0) + (out.length ? 1 : 0);
    if (used + cost > YT_TAGS_MAX_CHARS) break;
    out.push(t);
    used += cost;
  }
  return out;
}

/** Title, description, tags and language for a film: the copy written for it
 *  when there is some, else a plain one built from the Library record. The
 *  product link and the collaborator credit are added if the copy lacks them —
 *  those are facts, not style. */
export function buildLongformCopy(row: FilmRow): LongformCopy {
  const written = writtenCopy(row) ?? {};
  const collab = collaboratorFor(row);
  const link = row.product_url && row.product_url.startsWith(SITE) ? row.product_url : SITE;
  const name = publicTitle(row.title);

  let title = (written.title ?? `${name} | Zyvorah Wallpapers`).replace(/#shorts/gi, "").replace(/\s{2,}/g, " ").trim();
  title = clip(autoCorrect(title), YT_TITLE_MAX);

  let description = written.description?.trim()
    ?? [
      `${name}${row.wallpaper ? ` — ${row.wallpaper}` : ""}.`,
      "Explore original mural wallpaper designs by Zyvorah.",
      `See it here: ${link}`,
    ].join("\n\n");
  if (!description.includes(link)) description = `${description}\n\n${link}`;
  if (collab && !description.includes(collab.credit)) description = `${description}\n\n${collab.credit}`;
  description = clip(autoCorrect(description), YT_DESCRIPTION_MAX);

  const tags = fitTags([
    ...(written.tags ?? []),
    ...(collab?.tags ?? []),
    "Zyvorah", "wallpaper", "wallpaper India", "murals", "interior design", "home decor",
    filmTag(row.id),
  ]);

  const audio = row.language ? LANG_CODE[row.language] : undefined;
  return {
    title,
    description,
    tags,
    defaultLanguage: written.defaultLanguage ?? audio ?? "en",
    ...(audio ? { defaultAudioLanguage: audio } : {}),
  };
}

/** Everything that stands between this film and a public upload, in words.
 *  Empty means it may go. */
export function gateFilm(row: FilmRow, copy: LongformCopy, approvedBy: string | undefined): string[] {
  const why: string[] = [];
  const t = `“${row.title}”`;
  if (!approvedBy) why.push(`${t} has no recorded approval to publish`);
  if (row.format !== "youtube") why.push(`${t} is filed under ${row.format ?? "nothing"}, not YouTube`);
  if (!row.media_key) why.push(`${t} has no stored video file`);
  const film = filmOf(row);
  if (!film) why.push(`${t} has not been measured yet — open the Library once so its shape and length are read`);
  else if (film.width === film.height && film.durationS > 180.5) why.push(`${t} is square and longer than three minutes; this route only accepts square Shorts up to three minutes`);
  else if (film.width < film.height) why.push(`${t} is ${film.width}×${film.height}; vertical films use the Shorts publisher`);
  const clearance = normaliseClearance(row.clearance);
  const unlicensed = (["voice", "music"] as const).filter((k) => clearance[k].state === "pending");
  if (unlicensed.length) why.push(`${t} is not cleared: ${unlicensed.join(" and ")} licence pending in the Library`);
  if (!row.language) why.push(`${t} has no language set — YouTube needs to know what the viewer hears`);
  if (!row.product_url || !row.product_url.startsWith(`${SITE}/`)) why.push(`${t} has no zyvorah.com link to send viewers to`);
  why.push(...copyProblems(copy));
  return why;
}

/** The brand-safety gate plus YouTube's own limits. Blocks only. */
export function copyProblems(copy: LongformCopy): string[] {
  const out: string[] = [];
  if (!copy.title.trim()) out.push("the title is empty");
  if (copy.title.length > YT_TITLE_MAX) out.push(`the title is ${copy.title.length} characters; YouTube takes ${YT_TITLE_MAX}`);
  if (/#shorts/i.test(copy.title) || /#shorts/i.test(copy.description)) out.push("long-form copy must not say #Shorts");
  if (/[<>]/.test(copy.title) || /[<>]/.test(copy.description)) out.push("YouTube refuses < and > in a title or description");
  const blocks = (issues: SafetyIssue[]) => issues.filter((i) => i.severity === "block").map((i) => i.detail);
  // Descriptions run past Instagram's 2,200; YouTube's own limit is checked above.
  const text = `${copy.title}\n\n${copy.description}`;
  out.push(...blocks(checkCaption(text, { channel: "youtube" }).issues).filter((d) => !/2,200/.test(d)));
  if (text.length > YT_DESCRIPTION_MAX + YT_TITLE_MAX + 2) out.push(`the description runs past YouTube's ${YT_DESCRIPTION_MAX} characters`);
  if (copy.tags.join(",").length > YT_TAGS_MAX_CHARS) out.push("the tags run past YouTube's 500 characters");
  return out;
}

/** What a run should do with a film, given its record and the time. */
export function nextStep(lf: Longform | null, now: number): "skip" | "go" | "wait" {
  if (!lf) return "skip"; // never asked to go
  if (lf.state === "published") return "skip";
  if (lf.state === "queued" || lf.state === "blocked") return "go";
  if (lf.state === "failed") return (lf.attempts ?? 0) < MAX_ATTEMPTS ? "go" : "skip";
  // uploading: someone holds it; only a stale claim may be reconciled and retried.
  const at = lf.claimed_at ? Date.parse(lf.claimed_at) : 0;
  return now - at > CLAIM_STALE_MS ? "go" : "wait";
}

/** Does a video on the channel belong to this film? The hidden film tag is the
 *  proof; the exact title is the fallback for an upload whose tags were lost. */
export function isThisFilm(video: { tags?: string[]; title?: string }, rowId: string, copyTitle: string): boolean {
  if ((video.tags ?? []).includes(filmTag(rowId))) return true;
  return !!video.title && video.title.trim() === copyTitle.trim();
}

export const watchUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;
