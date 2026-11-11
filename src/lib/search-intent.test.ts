import test from "node:test";
import assert from "node:assert/strict";

import { nameKey, namedCollection, roomPicturesFirst, type NamedCollectionRow } from "./search-intent";

// A slice of the live collections table (12 October 2026), including every
// collection the search audit found weak on that day.
const COLLECTIONS: NamedCollectionRow[] = [
  { handle: "bright-wallpaper", title: "Bright Wallpaper", kind: "color", rule_tag: "Bright" },
  { handle: "black-and-white", title: "Black and White", kind: "color", rule_tag: "Black and White" },
  { handle: "black-wallpaper", title: "Black Wallpaper", kind: "color", rule_tag: "Black" },
  { handle: "neutral-wallpaper", title: "Beige & Neutral Wallpaper", kind: "color", rule_tag: "Neutral" },
  { handle: "tropical", title: "Tropical", kind: "category", rule_tag: "Tropical" },
  { handle: "tropical-oasis-collection", title: "Tropical Oasis Collection", kind: "curated", rule_tag: "Tropical Oasis" },
  { handle: "watercolour", title: "Watercolour", kind: "category", rule_tag: "Watercolor" },
  { handle: "ceiling-wallpaper", title: "Ceiling Wallpapers", kind: "category", rule_tag: "Ceiling Wallpaper" },
  { handle: "the-blockprint-garden", title: "The Blockprint Garden", kind: "curated", rule_tag: "The Blockprint Garden" },
  { handle: "nafas-face-parade", title: "Nafas's Face Parade", kind: "curated", rule_tag: "NAFAS FACE PARADE" },
  { handle: "katha", title: "Katha (कथा)", kind: "curated", rule_tag: "Katha" },
  { handle: "games-room", title: "Games Room", kind: "room", rule_tag: "Games Room" },
  { handle: "living-room-wallpaper", title: "Living Room Wallpaper", kind: "room", rule_tag: "Living Room" },
  { handle: "piano-rooms", title: "Piano Rooms", kind: "room", rule_tag: "Piano Rooms" },
  { handle: "fine-dining", title: "Fine Dining", kind: "room", rule_tag: "Fine Dining" },
  { handle: "cafes-restaurants", title: "Cafés", kind: "room", rule_tag: "Cafés" },
  { handle: "kids-play-space", title: "Kids' Play Space", kind: "room", rule_tag: "Kids' Play Space" },
  { handle: "kids-wallpapers", title: "Kids' Wallpapers", kind: "room", rule_tag: "Kids" },
  { handle: "borders-kids", title: "Kids' Borders", kind: "other", rule_tag: "Kids" },
  { handle: "serene", title: "Serene", kind: "mood", rule_tag: "Mood: Serene" },
  { handle: "nature-wallpapers", title: "Casual", kind: "category", rule_tag: "Casual" },
  { handle: "pattern", title: "Pattern", kind: "category", rule_tag: "Pattern" },
];

const tagFor = (q: string) => namedCollection(q, COLLECTIONS)?.tag;

test("a query that names a collection is answered with that collection's tag", () => {
  assert.equal(tagFor("bright"), "Bright");
  assert.equal(tagFor("bright wallpaper"), "Bright");
  assert.equal(tagFor("Black and White"), "Black and White");
  assert.equal(tagFor("black & white wallpaper"), "Black and White");
  assert.equal(tagFor("white and black"), "Black and White");
  assert.equal(tagFor("beige & neutral"), "Neutral");
  assert.equal(tagFor("neutral"), "Neutral");
  assert.equal(tagFor("tropical"), "Tropical");
  assert.equal(tagFor("tropical oasis"), "Tropical Oasis");
  assert.equal(tagFor("watercolour"), "Watercolor");
  assert.equal(tagFor("watercolor wallpaper"), "Watercolor");
  assert.equal(tagFor("ceiling wallpaper"), "Ceiling Wallpaper");
  assert.equal(tagFor("the blockprint garden"), "The Blockprint Garden");
  assert.equal(tagFor("blockprint garden"), "The Blockprint Garden");
  assert.equal(tagFor("nafas face parade"), "NAFAS FACE PARADE");
  assert.equal(tagFor("katha"), "Katha");
  assert.equal(tagFor("games room"), "Games Room");
  assert.equal(tagFor("piano room"), "Piano Rooms");
  assert.equal(tagFor("cafe"), "Cafés");
  assert.equal(tagFor("kids play space"), "Kids' Play Space");
  assert.equal(tagFor("serene"), "Mood: Serene");
  assert.equal(tagFor("pattern wallpaper"), "Pattern");
});

test("a query that only shares words with a collection names nothing", () => {
  assert.equal(tagFor("blue floral"), undefined);
  assert.equal(tagFor("black"), "Black");
  assert.equal(tagFor("black horse"), undefined);
  assert.equal(tagFor("games"), undefined);
  assert.equal(tagFor("wallpaper"), undefined);
  assert.equal(tagFor(""), undefined);
  // Casual's handle says "nature"; a handle is never a name.
  assert.equal(tagFor("nature"), undefined);
});

test("a shared name picks the room over a border range", () => {
  assert.equal(namedCollection("kids", COLLECTIONS)?.handle, "kids-wallpapers");
});

test("a named room carries the scene it is pictured in, including rooms the room resolver cannot name", () => {
  assert.equal(namedCollection("living room", COLLECTIONS)?.roomKey, "living");
  assert.equal(namedCollection("piano rooms", COLLECTIONS)?.roomKey, "pianoroom");
  assert.equal(namedCollection("fine dining", COLLECTIONS)?.roomKey, "finedining");
  assert.equal(namedCollection("games room", COLLECTIONS)?.roomKey, "gamesroom");
  assert.equal(namedCollection("tropical", COLLECTIONS)?.roomKey, undefined);
});

test("nameKey ignores order, plurals, accents and noise", () => {
  assert.equal(nameKey("Cafés"), nameKey("cafe"));
  assert.equal(nameKey("Piano Rooms"), nameKey("piano room wallpaper"));
  assert.equal(nameKey("Gym & Fitness"), nameKey("fitness and gym"));
});

test("room pictures lead a room search, in relevance order, and nothing is dropped", () => {
  const card = (h: string, scene: string | null, flat = false) => ({ handle: h, image: `x/${h}`, imageScene: scene, imageIsFlat: flat });
  const ranked = [card("a", "meetingroom"), card("b", "living"), card("c", null, true), card("d", "living"), card("e", "bedroom")];
  assert.deepEqual(roomPicturesFirst(ranked, "living").map((c) => c.handle), ["b", "d", "a", "c", "e"]);
  assert.deepEqual(roomPicturesFirst(ranked, undefined).map((c) => c.handle), ["a", "b", "c", "d", "e"]);
});
