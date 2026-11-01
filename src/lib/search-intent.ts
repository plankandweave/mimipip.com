import { sceneKeyForCollection } from "./rooms";
import { SCENARIOS } from "./studio-scenes";

/**
 * What a search query NAMES, when it names a collection outright.
 *
 * A shopper who types "tropical", "black and white", "games room" or "The
 * Blockprint Garden" is asking for that collection, and the catalogue already
 * knows its designs exactly — by the tag the collection page filters on.
 * Full-text ranking alone guessed from words: on 12 October 2026 an audit of
 * every live collection through the live search found "bright" returned none
 * of its 9 designs in the top twelve, "The Blockprint Garden" none of its 8,
 * "games room" 1 of 29 and "black and white" 3 of 51, while the database
 * search lifted every one of them to a full top twelve once the collection's
 * tag was passed as its boost. That boost (`p_room_tag` of
 * search_products_v2) was only ever given a ROOM's tag; this hands it the
 * named collection's tag instead, with no schema change.
 *
 * Only an EXACT name counts (noise words, plurals, "&"/"and" and word order
 * aside). "blue floral" names no collection and is ranked as words, as before.
 */

export type NamedCollectionRow = { handle: string; title: string; kind: string | null; rule_tag: string | null };

export type NamedCollection = {
  handle: string;
  kind: string | null;
  tag: string;
  /** The studio scene a room collection is pictured in, when it is a room. */
  roomKey?: string;
};

// Words that describe the whole shop or the shape of a name, never which part
// of it the shopper means. "room" is deliberately NOT here: "games room" and
// "games" are different questions. Nor is "pattern": Pattern is a collection.
const NOISE = new Set([
  "wallpaper", "wallpapers", "mural", "murals", "design", "designs", "wall", "walls",
  "print", "prints", "collection", "collections",
  "the", "a", "an", "and", "of", "for", "my", "mood", "buy", "online", "india",
]);

const singular = (w: string) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);

/** The comparable form of a name: lower case, accents and punctuation gone,
 *  noise words dropped, plurals folded, word order ignored. */
export function nameKey(text: string): string {
  const words = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w && !NOISE.has(w))
    .map(singular);
  return [...new Set(words)].sort().join(" ");
}

// When two collections share a name but not a tag, the more specific one wins.
const KIND_PRIORITY = ["room", "curated", "series", "set", "category", "color", "mood"];
const rankOf = (kind: string | null) => {
  const i = KIND_PRIORITY.indexOf(kind ?? "");
  return i === -1 ? KIND_PRIORITY.length : i;
};

/**
 * The studio scene a ROOM collection is pictured in. The room surfaces'
 * own resolver first; for a room it cannot name (Games Room, Gym & Fitness,
 * Banquet & Party Hall) the studio scene that files designs into that
 * collection — search falls back to any room render, never a swatch, so a
 * design without that render is still shown.
 */
function roomKeyFor(c: NamedCollectionRow): string | undefined {
  if (c.kind !== "room") return undefined;
  return (
    sceneKeyForCollection({ handle: c.handle, kind: c.kind, rule_tag: c.rule_tag }) ??
    SCENARIOS.find((s) => s.collection === c.handle && (!c.rule_tag || (s.roomTags ?? []).includes(c.rule_tag)))?.key
  );
}

/** The collection a query names outright, or undefined. */
export function namedCollection(query: string, collections: NamedCollectionRow[]): NamedCollection | undefined {
  const key = nameKey(query);
  if (!key) return undefined;
  let best: NamedCollectionRow | undefined;
  for (const c of collections) {
    if (!c.rule_tag) continue;
    if (nameKey(c.title) !== key && nameKey(c.rule_tag) !== key) continue;
    if (!best || rankOf(c.kind) < rankOf(best.kind)) best = c;
  }
  if (!best?.rule_tag) return undefined;
  return { handle: best.handle, kind: best.kind, tag: best.rule_tag, roomKey: roomKeyFor(best) };
}

/**
 * Order a relevance-ranked result list so that, when the query names a room,
 * designs that HAVE a picture of that room come first (room rule 1: the
 * picture is the room they named). Stable: relevance order is kept within
 * each group, and nothing is removed.
 */
export function roomPicturesFirst<T extends { imageScene?: string | null; imageIsFlat?: boolean; image: string | null }>(
  cards: T[],
  roomKey: string | undefined,
): T[] {
  if (!roomKey) return cards;
  const inRoom = (c: T) => !!c.image && !c.imageIsFlat && c.imageScene === roomKey;
  return [...cards.filter(inRoom), ...cards.filter((c) => !inRoom(c))];
}
