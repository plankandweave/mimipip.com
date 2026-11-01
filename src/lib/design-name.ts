/**
 * What a partner pastes into the portal search, turned into the ways it could
 * NAME one design exactly.
 *
 * HomeLane's designers browse zyvorah.com and come back to the portal to
 * order, so the search box has to take whatever they copied: the name off the
 * product page ("Sage Cranes Chinoiserie Wallpaper"), the page's address
 * (https://zyvorah.com/products/sage-cranes-chinoiserie), or the design code.
 * Full-text search alone could not promise this — it ORs every word, so a
 * pasted name matched half the shop and the design itself could sit on page
 * three (30 September 2026). An exact name now leads, whatever else matches.
 *
 * Pure, so it can be pinned by a test; the lookup lives in queries.ts.
 */
export type NameCandidates = {
  /** Handles the text could be: from a pasted URL, or the text slugified. */
  handles: string[];
  /** The text as a title, for a case-insensitive exact title match. */
  title: string | null;
  /** The text as a design code. */
  code: string | null;
};

/** Curly quotes, long dashes and runs of whitespace are what a copy from a
 *  web page brings along; a person typing never meant them. */
export function normaliseName(text: string): string {
  return text
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugifyName(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const HANDLE_IN_URL = /\/products\/([a-z0-9][a-z0-9-]*)/i;
// Words the website adds around a design's name that a handle may or may not
// carry. Tried both ways, never required.
const SUFFIXES = ["wallpaper", "wall-mural", "mural"];

export function nameCandidates(raw: string): NameCandidates {
  const text = normaliseName(raw);
  if (!text) return { handles: [], title: null, code: null };

  const url = text.match(HANDLE_IN_URL);
  if (url) return { handles: [url[1].toLowerCase()], title: null, code: null };

  const slug = slugifyName(text);
  const handles = new Set<string>();
  if (slug) {
    handles.add(slug);
    for (const s of SUFFIXES) {
      if (slug.endsWith(`-${s}`)) handles.add(slug.slice(0, -(s.length + 1)));
      else handles.add(`${slug}-${s}`);
    }
  }
  return {
    handles: [...handles],
    title: text,
    // A code is one token; a sentence is never a code.
    code: /\s/.test(text) ? null : text,
  };
}

/** Escape a string for a PostgREST `ilike` so it matches literally. */
export function ilikeLiteral(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}
