/**
 * Typo-tolerant search: "paino" finds the piano rooms.
 *
 * On 12 October 2026 the founder typed "paino" into the header search and got
 * "No designs matched" — with 135 Piano Walls designs one letter-swap away.
 * Full-text search (search_products_v2) matches a word or its prefix and
 * nothing else, so a transposed letter is a dead end; "paino room" is worse,
 * because it still returns a page, matched on the one word every product
 * shares. Nothing in the catalogue was missing. The query was.
 *
 * So the query is corrected BEFORE anything reads it: each word the catalogue
 * does not know is replaced by the nearest word it does know, and the
 * corrected query goes through room detection (roomKeyForQuery) and search
 * exactly as if the shopper had typed it. The dictionary is `search_lexicon()`
 * (migration 20261012041045, read through `search_lexicon_json()` because the
 * API caps a function at 1,000 rows): every word from an active design's title, its
 * tags, a collection title or a synonym cluster, counted (these are what a
 * misspelling is corrected TO), plus every other lexeme in the search index
 * (known, so a word search can already find is never "corrected" away, but
 * never a target). The room vocabulary from rooms.ts is known too, so "shrine"
 * is not nudged into "string".
 *
 * The rules are deliberately cautious — a wrong correction is worse than none,
 * because it answers a question the shopper did not ask and tells them so:
 *   - a word of three letters or fewer, or one containing a digit (a design
 *     code), is never corrected;
 *   - a known word, or a PREFIX of a known word (search is prefix search, so
 *     "pian" already finds pianos), is never corrected;
 *   - four to seven letters allow ONE edit (a swapped pair, a wrong, missing
 *     or extra letter); eight or more allow two. Most typos are one edit, and
 *     two edits on a short word reaches a different word far too often;
 *   - of the candidates, the closest wins, then the most frequent, then the
 *     alphabetical first — the same input always corrects the same way.
 *
 * Pure: no I/O, so search-spelling.test.ts pins "paino" → "piano" exactly.
 */

/** One row of `search_lexicon()`: a word and how often the shelf names it
 *  (0 = known only through the index, never a correction target). */
export type LexiconEntry = [word: string, n: number];

export type Lexicon = {
  /** Every word the catalogue knows, targets included. */
  known: Set<string>;
  /** Correction targets by length, so a lookup only measures plausible words. */
  targetsByLength: Map<number, { word: string; n: number }[]>;
  /** Longest known word; a token longer than this plus the edit budget cannot match. */
  longest: number;
};

export function buildLexicon(rows: LexiconEntry[], extraKnown: Iterable<string> = []): Lexicon {
  const known = new Set<string>();
  const targetsByLength = new Map<number, { word: string; n: number }[]>();
  let longest = 0;
  for (const [raw, n] of rows) {
    const word = raw.toLowerCase();
    if (!word) continue;
    known.add(word);
    longest = Math.max(longest, word.length);
    if (n > 0) {
      const bucket = targetsByLength.get(word.length) ?? [];
      bucket.push({ word, n });
      targetsByLength.set(word.length, bucket);
    }
  }
  for (const phrase of extraKnown) {
    for (const w of phrase.toLowerCase().split(/[^a-z0-9]+/)) if (w) known.add(w);
  }
  return { known, targetsByLength, longest };
}

/** How many edits a token of this length may be from the word it meant. */
export function editBudget(token: string): number {
  if (token.length <= 3 || /\d/.test(token)) return 0;
  return token.length >= 8 ? 2 : 1;
}

/**
 * Optimal-string-alignment (Damerau–Levenshtein) distance: insert, delete,
 * substitute, or swap two adjacent letters, each costing one. Stops early —
 * returns `max + 1` — once a row cannot come back under `max`.
 */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2: number[] = new Array(b.length + 1);
  let prev: number[] = new Array(b.length + 1);
  let cur: number[] = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d = Math.min(d, prev2[j - 2] + 1);
      }
      cur[j] = d;
      if (d < rowMin) rowMin = d;
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev2[j] = prev[j];
    const swap = prev; prev = cur; cur = swap;
  }
  return prev[b.length];
}

function isKnown(token: string, lexicon: Lexicon): boolean {
  if (lexicon.known.has(token)) return true;
  // Prefix search: a token that begins a known word already finds it.
  if (token.length >= 4) {
    for (const w of lexicon.known) if (w.length > token.length && w.startsWith(token)) return true;
  }
  return false;
}

/** The word this token most likely meant, or undefined to leave it alone. */
export function correctWord(token: string, lexicon: Lexicon): string | undefined {
  const budget = editBudget(token);
  if (budget === 0 || isKnown(token, lexicon)) return undefined;
  let best: { word: string; n: number; d: number } | undefined;
  for (let len = token.length - budget; len <= token.length + budget; len++) {
    for (const t of lexicon.targetsByLength.get(len) ?? []) {
      const d = editDistance(token, t.word, budget);
      if (d > budget) continue;
      if (
        !best ||
        d < best.d ||
        (d === best.d && (t.n > best.n || (t.n === best.n && t.word < best.word)))
      ) {
        best = { word: t.word, n: t.n, d };
      }
    }
  }
  return best?.word;
}

export type SpellResult = {
  /** The query to search — the shopper's own when nothing was corrected. */
  query: string;
  /** True when at least one word was replaced. */
  changed: boolean;
};

/**
 * Correct the misspelt words of a query, keeping everything else — order,
 * spacing, punctuation, the words it knew — exactly as typed.
 */
export function correctSearchQuery(query: string, lexicon: Lexicon): SpellResult {
  let changed = false;
  const corrected = query.replace(/[a-z0-9]+/gi, (tok) => {
    const fixed = correctWord(tok.toLowerCase(), lexicon);
    if (!fixed) return tok;
    changed = true;
    return fixed;
  });
  return { query: changed ? corrected : query, changed };
}
