// Collection handle → the Studio scene_key shown on that room's product cards
// (so the bedroom page shows bedroom renders, kids page playroom renders, etc).
// Shared by the room collection pages and the homepage's daily rotation.
//
// Every handle here should have a matching scenario in src/lib/studio-scenes.ts,
// which is what makes the room tickable in the Studio room picker.
export const ROOM_SCENE_KEY: Record<string, string> = {
  "baby-nursery-wallpapers": "nursery",
  "bedroom-wallpaper": "bedroom",
  "living-room-wallpaper": "living",
  "piano-rooms": "pianoroom",
  "home-office-wallpaper": "office",
  // Left as "office" (not corpoffice): home-office renders are what the Office
  // collection's cards actually have, and toCard falls back to the flat when a
  // product has no scene for the key.
  "office-wallpaper": "office",
  "kids-wallpapers": "playroom",
  "toddler-wallpaper": "toddler",
  "teen-wallpaper": "teen",
  "play-school-wallpaper": "playschool",
  "kitchen-wallpaper": "kitchen",
  foyer: "entryway",
  "pooja-room-wallpaper": "pooja",
  "dining-room-wallpaper": "dining",
  // "reception" rather than the newer dedicated "hotellobby" scene: reception
  // renders are the ones this collection already has.
  hotels: "reception",
  "cafes-restaurants": "cafe",
  restaurants: "restaurant",
  "fine-dining": "finedining",
  "retail-showroom-spaces": "retail",
  "wellness-spa-interiors": "spa",
  "library-reading-corners": "library",
  "college-hostel-room": "hostel",
  "entertainment-media-room": "mediaroom",
  // Keep every shoppable Studio room bound to its real render key. Without
  // these, lexical guesses hid valid room ranges or selected another room.
  "residential-entrance-lobby": "resilobby",
  "residential-lift-lobby": "resiliftlobby",
  "banquet-party-hall": "banquet",
  "kids-play-space": "kidsplay",
  "gym-fitness": "gym",
  "discussion-co-working": "discussion",
  "games-room": "gamesroom",
  "grand-staircase": "grandstair",
  "clubhouse-entrance": "clubentrance",
  "residents-lounge": "clublounge",
  "clubhouse-library": "clublibrary",
  "poolside": "poolside",
  "rooftop-sky-lounge": "rooftoplounge",
  "residential-wellness": "wellnessroom",
  "residential-corridor": "resicorridor",
  "sales-gallery": "salesgallery",
  "fitting-trial-rooms": "fittingroom",
  "checkout-billing": "billing",
  "showrooms": "showroom",
  "boutique-jewellery": "boutique",
  "hospital-reception-waiting": "hospitalwaiting",
  "patient-rooms-wards": "patientroom",
  "consultation-rooms": "consultation",
  "paediatrics-childrens-wards": "paediatric",
  "hospital-corridors": "hospitalcorridor",
  "diagnostics-imaging": "diagnostics",
  "ceiling-wallpaper": "ceiling",

};

/**
 * Room collections whose GRID keeps the old all-or-nothing picture mode.
 *
 * The scene-block ordering (collection_page_v2's p_room_key) only reads well
 * when enough of the collection carries the room render. Dining Room has 3
 * across 215 designs: a leading block of three staged rooms followed by 212
 * swatches is a cliff, not a catalogue — worse than the honest all-flat grid.
 *
 * These handles keep their ROOM_SCENE_KEY entry, so the homepage rotation,
 * /rooms and the newsletter still pick the right room's render. Only the
 * collection listing opts out. Drop a handle from here once its renders are
 * dense enough to lead with.
 */
export const SCENE_BLOCK_EXEMPT = new Set<string>(["dining-room-wallpaper"]);

/**
 * The words a shopper types when they mean a ROOM, per scene key.
 *
 * Why this exists: a room collection page shows each design's render for THAT
 * room (ROOM_SCENE_KEY above, resolved per card in toCard). Site search had no
 * such notion at all, so "pooja room wallpaper" typed into the search box
 * returned the same designs with whatever picture happened to be first — a
 * bedroom render, or the bare flat — while the very same designs showed their
 * shrine render one click away on /collections/pooja-room-wallpaper. Two
 * answers to one question, and the search one was the wrong picture.
 *
 * Matched as whole words on the lower-cased query, longest phrase first, so
 * "living room" is not answered by "room" and "home office" beats "office".
 * Only rooms that HAVE a scene appear here; a query naming no room resolves to
 * undefined and search behaves exactly as it did.
 */
const ROOM_QUERY_WORDS: [scene: string, words: string[]][] = [
  ["pianoroom", ["piano room", "piano wall", "music room", "piano"]],
  ["pooja", ["pooja", "puja", "mandir", "prayer room", "prayer", "worship", "shrine", "temple room"]],
  ["nursery", ["nursery", "baby room", "baby"]],
  // "children" and "child" too: a parent types "children's wallpaper" as often
  // as "kids", and without them that search got no Kids-room boost at all.
  ["playroom", ["playroom", "play room", "kids room", "kids", "kid", "children's room", "children's", "children", "childrens", "child's room", "child"]],
  ["playschool", ["play school", "playschool", "preschool"]],
  ["toddler", ["toddler"]],
  ["teen", ["teen", "teenager", "teenage"]],
  // "office" resolves to the HOME-office scene, not corpoffice, for the reason
  // ROOM_SCENE_KEY gives: home-office renders are the ones the catalogue
  // actually has (153 against 5).
  ["office", ["home office", "study room", "study", "office"]],
  ["bedroom", ["bedroom", "master bedroom", "guest room"]],
  ["living", ["living room", "drawing room", "lounge", "sitting room"]],
  ["dining", ["dining room", "dining"]],
  ["kitchen", ["kitchen", "breakfast nook"]],
  ["entryway", ["foyer", "entrance", "entryway", "hallway", "passage"]],
  // Never bare "powder": "powder blue" is a colour, not a room.
  ["powder", ["powder room", "powder bathroom", "powder toilet", "guest bathroom", "guest toilet", "guest washroom"]],
  ["bathroom", ["bathroom", "washroom", "toilet", "restroom"]],
];

/** Every word search uses to recognise a room — so spelling correction
 *  (search-spelling.ts) treats "shrine" or "mandir" as known, never nudging a
 *  room word the catalogue does not name in a title into a nearby stranger. */
export function roomQueryVocabulary(): string[] {
  return ROOM_QUERY_WORDS.flatMap(([, words]) => words);
}

/**
 * The room render a SEARCH should show, or undefined when the query names no
 * room. Deliberately in the same file as ROOM_SCENE_KEY: both answer "which
 * picture does this reader want", and they must not drift apart.
 */
export function roomKeyForQuery(query: string): string | undefined {
  const low = ` ${query.toLowerCase().replace(/[^a-z0-9']+/g, " ").trim()} `;
  let best: { scene: string; len: number } | undefined;
  for (const [scene, words] of ROOM_QUERY_WORDS) {
    for (const w of words) {
      if (!low.includes(` ${w} `)) continue;
      if (!best || w.length > best.len) best = { scene, len: w.length };
    }
  }
  return best?.scene;
}

/**
 * THE answer to "which room render does this room collection show". Every
 * surface that fronts a room — the homepage tiles and hero, /rooms, the room
 * collection page, the lookbook, the newsletter — asks this, never
 * ROOM_SCENE_KEY directly.
 *
 * Why: ROOM_SCENE_KEY is hand-kept, and room collections are created in the
 * database. On 30 September 2026 a "Powder Bathroom" collection existed with
 * no entry there, so every surface treated it as roomless and showed whatever
 * picture its designs happened to lead with — the homepage's "Shop by room ·
 * Powder Bathroom" tile was a toddler's playroom. An unlisted room now
 * resolves from its own handle / rule tag through the same vocabulary search
 * uses; one the vocabulary cannot name either returns undefined, and
 * `showsRoom` then refuses every picture for it (fail closed).
 */
export function sceneKeyForRoom(handle: string, ruleTag?: string | null): string | undefined {
  return (
    ROOM_SCENE_KEY[handle] ??
    roomKeyForQuery(handle.replace(/-/g, " ")) ??
    (ruleTag ? roomKeyForQuery(ruleTag) : undefined)
  );
}

/** `sceneKeyForRoom` for any collection: inference only for a collection that
 *  IS a room (kind "room"); a style or colour collection whose handle happens
 *  to contain a room word keeps only its explicit ROOM_SCENE_KEY entry. */
export function sceneKeyForCollection(c: { handle: string; kind?: string | null; rule_tag?: string | null }): string | undefined {
  return c.kind === "room" ? sceneKeyForRoom(c.handle, c.rule_tag) : ROOM_SCENE_KEY[c.handle];
}

/**
 * Does this card's picture actually show THIS room? Keyed on the image's
 * stored scene_key (`imageScene`, from toCard), never the URL — a URL prefix
 * check reads a bedroom-duo render as a bedroom. No room key means no picture
 * can qualify: a room tile with no render of its room is left out, never
 * fronted by another room's.
 */
export function showsRoom(
  card: { image: string | null; imageIsFlat?: boolean; imageScene?: string | null },
  roomKey: string | undefined,
): boolean {
  return !!roomKey && !!card.image && !card.imageIsFlat && card.imageScene === roomKey;
}

/**
 * How a card's alt text names the room a render shows ("in a bedroom"), per
 * scene key. Written out rather than derived from the Studio's scenario labels
 * because those are picker labels ("Master bedroom", "Cafés", "Library /
 * reading corner") and read wrongly after "in a". A scene not listed here (a
 * detail shot, a mood board) simply gets no room phrase.
 */
const ROOM_ALT_PHRASE: Record<string, string> = {
  pianoroom: "a piano room",
  living: "a living room",
  bedroom: "a bedroom",
  bedroomduo: "a bedroom",
  kidsroom: "a child's bedroom",
  playroom: "a kids' playroom",
  nursery: "a nursery",
  toddler: "a toddler's room",
  teen: "a teen's room",
  playschool: "a play school",
  pooja: "a pooja room",
  "pooja-diwali": "a pooja room",
  office: "a home office",
  corpoffice: "an office",
  dining: "a dining room",
  kitchen: "a kitchen",
  entryway: "an entrance foyer",
  foyerconsole: "an entrance foyer",
  reception: "a reception lobby",
  hotellobby: "a hotel lobby",
  boardroom: "a boardroom",
  meetingroom: "a meeting room",
  cafe: "a café",
  restaurant: "a restaurant",
  finedining: "a fine-dining restaurant",
  retail: "a retail store",
  spa: "a spa",
  library: "a reading corner",
  hostel: "a hostel room",
  mediaroom: "a media room",
  gamesroom: "a games room",
  gym: "a gym",
  bathroom: "a bathroom",
  powder: "a powder room",
};

/** "a bedroom" for a render's scene key, or undefined when it is not a room. */
export function roomAltPhrase(sceneKey: string | null | undefined): string | undefined {
  return sceneKey ? ROOM_ALT_PHRASE[sceneKey] : undefined;
}
