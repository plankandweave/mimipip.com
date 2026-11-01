import type { ProductCardData } from "./types";

// A grid row is read as one picture, not four. Left to raw ranking, a row can
// land a Katha folk mural beside a Bauhaus pastel and a retro-orb geometric —
// each fine alone, incoherent together. These helpers arrange a list so each
// row of the grid holds designs that belong to the same aesthetic family: a
// line of geometry, then a line of Katha, rather than the two interleaved.

/** The tag vocabulary, split by axis — as returned by getFacetVocab(). */
export type FacetVocab = {
  colour: { tag: string }[];
  style: { tag: string }[];
  subject: { tag: string }[];
  room: { tag: string }[];
  mood: { tag: string }[];
};

// What a shared tag says about whether two designs look right side by side.
// Style and subject carry the look itself. Mood is the felt register — regal
// and playful clash even inside one style. Colour is a weak signal, and a
// shared room ("Bedroom") says nothing at all about how two designs look.
const WEIGHT_STYLE = 3;
const WEIGHT_SUBJECT = 3;
const WEIGHT_MOOD = 2;
const WEIGHT_COLOUR = 1;
// A shared room says nothing about how two designs look — nearly everything in
// the catalogue is tagged Bedroom and Living Room. Left at any weight above
// zero, three shared rooms quietly add up to a style match and a folk mural
// gets filed beside a Bauhaus pastel.
const WEIGHT_ROOM = 0;
/** An unlisted tag is a real signal (a curated family like "Katha") but a quiet one. */
const WEIGHT_UNLISTED = 1;

type WeightedTags = Map<string, number>;

function weightsFor(vocab: FacetVocab): WeightedTags {
  const w: WeightedTags = new Map();
  for (const o of vocab.room) w.set(o.tag, WEIGHT_ROOM);
  for (const o of vocab.colour) w.set(o.tag, WEIGHT_COLOUR);
  for (const o of vocab.mood) w.set(o.tag, WEIGHT_MOOD);
  for (const o of vocab.subject) w.set(o.tag, WEIGHT_SUBJECT);
  // Style last: a tag that is both a listed style and something else is a style.
  for (const o of vocab.style) w.set(o.tag, WEIGHT_STYLE);
  return w;
}

const sharedTags = (a: ProductCardData, b: ProductCardData): string[] => {
  const theirs = new Set(b.tags ?? []);
  return (a.tags ?? []).filter((t) => theirs.has(t));
};

/** How much two designs look like they belong together. */
function affinity(a: ProductCardData, b: ProductCardData, w: WeightedTags): number {
  return sharedTags(a, b).reduce((sum, tag) => sum + (w.get(tag) ?? WEIGHT_UNLISTED), 0);
}

/**
 * Same aesthetic family — they share an actual look-bearing tag (a named style
 * or subject). Deliberately NOT a score threshold: a pile of weak coincidences
 * must never add up to "these belong together".
 */
function sameFamily(a: ProductCardData, b: ProductCardData, w: WeightedTags): boolean {
  return sharedTags(a, b).some((tag) => (w.get(tag) ?? WEIGHT_UNLISTED) >= WEIGHT_STYLE);
}

/**
 * Reorders `cards` so the grid reads a family at a time — a line of geometry,
 * then a line of Katha, instead of the two interleaved.
 *
 * Designs are gathered into aesthetic families, and the biggest family goes
 * first so it fills whole rows. A family smaller than a row can't have a pure
 * row of its own, so the leftovers land at the END, where the change of
 * register reads as the next thing rather than as a jumbled opening row.
 *
 * Never drops or duplicates a card.
 */
export function arrangeByAffinity(
  cards: ProductCardData[],
  vocab: FacetVocab,
  perRow = 4,
): ProductCardData[] {
  if (cards.length <= 2 || perRow < 2) return cards;
  const w = weightsFor(vocab);
  const remaining = cards.map((card, index) => ({ card, index }));
  const clusters: { card: ProductCardData; index: number }[][] = [];

  while (remaining.length) {
    const seed = remaining.shift()!;
    const cluster = [seed];
    for (let i = remaining.length - 1; i >= 0; i--) {
      if (sameFamily(seed.card, remaining[i].card, w)) cluster.push(remaining.splice(i, 1)[0]);
    }
    // Within a family, closest to the seed first, so a row tightens rather than
    // just sharing a label — same mood and palette sit together.
    cluster.sort(
      (a, b) =>
        affinity(seed.card, b.card, w) - affinity(seed.card, a.card, w) || a.index - b.index,
    );
    clusters.push(cluster);
  }

  // Biggest family first; ties keep whichever led in the original ranking, so
  // recency and editorial priority still decide what a visitor meets first.
  clusters.sort((a, b) => b.length - a.length || a[0].index - b[0].index);
  return clusters.flat().map((e) => e.card);
}
