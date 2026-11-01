// The Library-reel sequence rule (Roheena, 29 Sep 2026), enforced by the
// system rather than by whoever arranges the calendar:
//
//   1. A Library film is used by at most ONE live reel slot, ever. A slot
//      whose reel already went out counts, even if it was removed later.
//   2. Two VOICED reels of the same language never sit back to back. The
//      sequence is every live Instagram reel slot in (day_key, seq) order;
//      a 'none'-language film and a reel that is not a Library film are
//      neutral — they neither count nor break a pair, so each voiced film is
//      compared with the previous voiced film. Marathi is its own language.
//
// Pure: the caller supplies the slots and each film's language. It is used
// by the plan import and slot restore (refuse), by publishApproved (hold the
// offending post only) and by the desk read (show the warning + the swap).

import type { FilmLanguage } from "./film-language";

export type ReelSeqSlot = {
  id?: string;
  day_key: string;
  seq: number;
  channel: string;
  kind: string;
  status: string; // slot status: idea | planned | removed
  library_id: string | null;
  /** The film's declared language; null when undeclared (treated as neutral). */
  language: FilmLanguage | null;
  /** Its post already went out — it counts even if the slot was later removed. */
  published?: boolean;
  /** Title for the message; optional. */
  title?: string | null;
};

export type ReelViolation = {
  rule: "repeat-film" | "same-language";
  /** The slot that breaks the rule (the later one) — the one to hold / fix. */
  slot: string;
  /** The earlier slot it clashes with. */
  with: string;
  library_id: string;
  language: FilmLanguage | null;
  reason: string;
  /** The nearest later slot whose film, swapped with this one's, clears the
   *  clash without creating another. null when no swap can (a repeated film
   *  needs a different film, not a different day). */
  swap_with: string | null;
};

const key = (s: Pick<ReelSeqSlot, "day_key" | "seq">) => `${s.day_key}#${s.seq}`;
const voiced = (l: FilmLanguage | null): l is Exclude<FilmLanguage, "none"> => !!l && l !== "none";

/** The slots the rule looks at, in calendar order. */
export function reelSequence(slots: ReelSeqSlot[]): ReelSeqSlot[] {
  return slots
    .filter((s) => s.channel === "instagram" && s.kind === "reel" && (s.status !== "removed" || s.published))
    .sort((a, b) => (a.day_key === b.day_key ? a.seq - b.seq : a.day_key < b.day_key ? -1 : 1));
}

function raw(seq: ReelSeqSlot[]): Omit<ReelViolation, "swap_with">[] {
  const out: Omit<ReelViolation, "swap_with">[] = [];
  const firstUse = new Map<string, ReelSeqSlot>();
  let prevVoiced: ReelSeqSlot | null = null;
  for (const s of seq) {
    if (!s.library_id) continue;
    const name = s.title ? `“${s.title}”` : `film ${s.library_id}`;
    const first = firstUse.get(s.library_id);
    if (first) {
      out.push({
        rule: "repeat-film",
        slot: key(s),
        with: key(first),
        library_id: s.library_id,
        language: s.language,
        reason: `${key(s)} repeats ${name}, already used by the reel on ${key(first)} — a Library film goes out once`,
      });
    } else firstUse.set(s.library_id, s);
    if (!voiced(s.language)) continue;
    if (prevVoiced && prevVoiced.language === s.language) {
      out.push({
        rule: "same-language",
        slot: key(s),
        with: key(prevVoiced),
        library_id: s.library_id,
        language: s.language,
        reason: `${key(s)} is a ${s.language} reel straight after the ${s.language} reel on ${key(prevVoiced)} — two voiced reels of one language never run back to back`,
      });
    }
    prevVoiced = s;
  }
  return out;
}

const sig = (v: Omit<ReelViolation, "swap_with">) => `${v.rule}|${v.slot}|${v.with}`;

/** Every violation in the calendar, each with a suggested swap where one works. */
export function reelSequenceViolations(slots: ReelSeqSlot[]): ReelViolation[] {
  const seq = reelSequence(slots);
  const found = raw(seq);
  const before = new Set(found.map(sig));
  return found.map((v) => {
    if (v.rule === "repeat-film") return { ...v, swap_with: null };
    const i = seq.findIndex((s) => key(s) === v.slot);
    let swap: string | null = null;
    for (let j = i + 1; j < seq.length && !swap; j++) {
      const a = seq[i];
      const b = seq[j];
      // Only an unpublished Library reel can trade films.
      if (!b.library_id || b.published || a.published || b.language === a.language) continue;
      const trial = seq.slice();
      trial[i] = { ...a, library_id: b.library_id, language: b.language, title: b.title };
      trial[j] = { ...b, library_id: a.library_id, language: a.language, title: a.title };
      const after = raw(trial);
      // Resolves: this clash is gone and nothing new appeared.
      if (after.every((x) => before.has(sig(x)) && sig(x) !== sig(v))) swap = key(b);
    }
    return { ...v, swap_with: swap };
  });
}

/** Human line for a violation, with its fix. */
export function describeViolation(v: ReelViolation): string {
  const fix =
    v.rule === "repeat-film"
      ? "choose a different Library film for this slot"
      : v.swap_with
        ? `swap its film with the reel on ${v.swap_with}`
        : "no single swap clears it — choose a film in another language (or a no-voice film)";
  return `${v.reason}; ${fix}`;
}

/** Refuse when any violation touches one of `touched` (slot keys this action
 *  writes). A clash already in the calendar that this action does not touch is
 *  the hourly check's to report — it must not block unrelated work. */
export function assertReelSequence(slots: ReelSeqSlot[], touched: Set<string>): void {
  const mine = reelSequenceViolations(slots).filter((v) => touched.has(v.slot) || touched.has(v.with));
  if (mine.length) throw new Error(mine.map(describeViolation).join(" · "));
}
