// Sonar — the talking wall (founder, 12 October 2026). Pure rules.
//
// "A demo QR in the Zyvorah voice." A QR on a wall; scan it and the wall
// speaks, in Timbre's voice (never the founder's), in the visitor's language:
// English always, the campus language, and Hindi. What it says is written
// once from Prism's concept for that wall — the wall in the first person,
// a minute at most — and spoken once per language through Timbre, so a wall
// scanned a thousand times costs three generations in all.
import { languagesForCampus, type TimbreLanguage } from "@/lib/timbre-rules";

export const SONAR_VERSION = "1.0";

/** The code in the QR. Short enough to type if the camera fails, unguessable
 *  enough that a code is found by scanning a wall and nothing else. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/o, 1/l/i
export const CODE_LENGTH = 10;
export const CODE_RE = /^[a-z2-9]{10}$/;

/** Ten random bytes become ten letters. The bytes come from the caller
 *  (crypto on the server) so this module stays free of node imports and can
 *  be read by the public player. */
export function newCode(bytes: Uint8Array): string {
  if (bytes.length < CODE_LENGTH) throw new Error("newCode needs ten random bytes");
  let s = "";
  for (let i = 0; i < CODE_LENGTH; i++) s += ALPHABET[bytes[i]! % ALPHABET.length];
  return s;
}

export const looksLikeCode = (s: string) => CODE_RE.test(s);
export const sonarPath = (code: string) => `/sonar/${code}`;
export const sonarUrl = (code: string, origin = "https://zyvorah.com") => `${origin}${sonarPath(code)}`;

/** What a wall is asked to say: the first person of the wall, to the person
 *  standing in front of it, in about this many words — a minute at a calm
 *  pace. */
export const PIECE_WORDS = { min: 70, max: 120 } as const;
export const MAX_PIECE_CHARS = 900;

export function pieceReady(piece: string): { ok: true } | { ok: false; reason: string } {
  const t = piece.trim();
  if (!t) return { ok: false, reason: "The wall has nothing to say yet." };
  if (t.length > MAX_PIECE_CHARS) return { ok: false, reason: `Too long for a wall to say in one breath (${t.length} characters; ${MAX_PIECE_CHARS} at most).` };
  return { ok: true };
}

export type SonarLine = { text: string; lineId: string };
export type SonarLines = Partial<Record<TimbreLanguage, SonarLine>>;

/** The languages a wall speaks: English first, then the campus language,
 *  then Hindi — the order the pills appear in. */
export function wallLanguages(campusLanguage: string | null | undefined): TimbreLanguage[] {
  return languagesForCampus(campusLanguage ?? "en");
}

/** Which language to play first for a visitor: the one they asked for when
 *  the wall speaks it, else the campus language when the phone is set to it,
 *  else English. The phone's language is a hint, never a lock. */
export function firstLanguage(available: TimbreLanguage[], asked: string | null, phone: string | null): TimbreLanguage {
  const has = (l: string | null): l is TimbreLanguage => !!l && (available as string[]).includes(l);
  if (has(asked)) return asked;
  const p = phone?.toLowerCase().split(/[-_,;]/)[0] ?? null;
  if (has(p) && p !== "en") return p;
  return available[0] ?? "en";
}

/** The languages still owed before a wall is fully spoken. */
export function missingLanguages(lines: SonarLines, wanted: TimbreLanguage[]): TimbreLanguage[] {
  return wanted.filter((l) => !lines[l]?.lineId);
}

/** The demo wall: what a college hears before any wall of theirs exists. */
export const DEMO_TITLE = "A wall that speaks";
export const DEMO_PIECE =
  "Hello. I am a wall, and I can talk. Every wall Zyvorah makes for a campus carries a small code like the one you just scanned. " +
  "Scan it, and the wall tells you what it shows and why it is here: the river that runs through this building, the people who studied here before you, " +
  "the idea behind the colour. I speak English, Hindi, and the language of the campus I stand in. " +
  "Walk on, and scan the next one.";
