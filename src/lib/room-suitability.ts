/**
 * Which designs make sense in which ROOM of an Indian home.
 *
 * Why this exists: a room is not a colour swatch. On 26 September 2026 the
 * catalogue was found selling a portrait of a queen as the wall behind a
 * mandir ("Maharani's Splendor", with an Instagram post queued), a war
 * elephant and a charging stallion over cribs, and bison in baby nurseries.
 * Every classifier that files designs into rooms — the Studio scene picker,
 * the retag repair pass — judged "does this look nice in a bedroom", never
 * "would an Indian family put this THERE". The name-only pooja guard in
 * studio-scenes.ts caught Mughal and playing-card names and nothing else.
 *
 * Two halves, both needed:
 *  1. ROOM_RULES below is the written judgement. It is injected into every
 *     prompt that files a design into a room, so new designs are judged at
 *     intake.
 *  2. `room_exclusions` (migration 20260926140000) is the decided record:
 *     "this design is never sold in this room". Triggers on product_tags and
 *     product_images drop any write that would put it back, whichever path it
 *     comes from, and room_fill_next never pays to render it. A classifier can
 *     be wrong again tomorrow; the exclusion cannot be undone by one.
 *
 * ROOM_KEYS must match the `room_scenes` table row for row.
 */

export type RoomKey =
  | "nursery" | "toddler" | "kids" | "playschool" | "teen"
  | "pooja" | "bedroom" | "dining" | "kitchen"
  | "living" | "foyer" | "office" | "pianoroom";

/** The rule an Indian household would apply to each room, in one line each.
 *  Written for a model: short, concrete, and naming the failures seen live. */
export const ROOM_RULES: Record<RoomKey, string> = {
  nursery:
    "Baby nursery (0-2): only soft, calm, gentle art — pastel florals, clouds, moon and stars, rainbows, " +
    "friendly baby-style animals (bunnies, birds, a soft cartoon elephant or giraffe), gentle landscapes. " +
    "NEVER: large wild or predatory beasts drawn realistically or powerfully (bison, bull, buffalo, tiger, lion, " +
    "wolf, bear, eagle, snake, crocodile), war/royal/ceremonial elephants or charging horses, hunting, weapons, " +
    "deities or sacred imagery, adult human portraits or sensual figures, skulls, dark/near-black or moody grounds, " +
    "dramatic high-contrast or heavy ornate adult luxury (damask, baroque, Mughal court), crows, bats, vultures, owls.",
  toddler:
    "Toddler room (2-4): same bar as a nursery, may be a little brighter and more playful. Same NEVER list.",
  kids:
    "Child's bedroom / playroom (4-10): cheerful, playful, adventurous — cartoon animals incl. cartoon lions or " +
    "dinosaurs, space, vehicles, maps, jungles, alphabets. NEVER: realistic fierce predators or beasts shown " +
    "powerful or aggressive, war, battle, weapons, blood, horror, skulls, deities or sacred imagery as decoration, " +
    "adult human portraits or sensual figures, alcohol, playing cards or casinos, dark moody adult art, heavy " +
    "adult luxury (damask, baroque, royal court scenes).",
  playschool:
    "Play school classroom: as for a child's room, plus educational themes are welcome. Same NEVER list.",
  teen:
    "Teenager's room: broader — realistic animals, cities, travel, abstract, sport, music are fine. NEVER: " +
    "sensual or nude figures, deities or sacred imagery as decoration, alcohol, casinos or playing cards, horror, " +
    "skulls, and nothing babyish (nursery pastels, baby animals) that a teenager would be embarrassed by.",
  pooja:
    "Pooja room (a Hindu home shrine; the art is the wall behind the mandir): ONLY deities, sacred symbols (Om, " +
    "swastik, kalash, diya, bells, conch, trishul), lotus, marigold and other auspicious florals, mandala/yantra, " +
    "temple architecture, sacred animals in their devotional role (Nandi, Kamdhenu/cow-and-calf, peacock, swan), " +
    "serene gold or neutral textures, Buddha/Jain imagery. NEVER: human portraits of any kind (queens, kings, " +
    "women, men), secular royalty or court scenes, wildlife or animals as decor, landscapes, cityscapes, modern " +
    "abstract art, Mughal/Islamic monument imagery, playing cards, sensual figures, cartoons, anything dark or gloomy.",
  bedroom:
    "Master bedroom (restful, per common vastu sense): calm and harmonious. NEVER: war, battle, hunting, weapons, " +
    "violence, aggressive or charging animals (bull, bison, tiger, war elephant, rearing horse), deities or " +
    "sacred imagery (most Indian families keep gods out of the bedroom), sorrow or loneliness, skulls or death, " +
    "and nothing babyish (nursery cartoons, alphabets).",
  dining:
    "Dining room: appetising, warm, social. NEVER: predators, hunting or kill scenes, death or skulls, insects, " +
    "reptiles, deities or sacred imagery, sensual figures, bathroom-like or clinical art, babyish nursery art.",
  kitchen:
    "Kitchen: fresh, clean, food-friendly. Same NEVER list as the dining room.",
  living:
    "Living room: broad. NEVER: babyish nursery art (baby animals, alphabets, pastel cartoons), nude or sensual " +
    "figures, skulls, horror, gore.",
  pianoroom:
    "Piano room: artwork should complement a grand or upright piano and leave the instrument visually legible. " +
    "NEVER: babyish art, horror, gore, or designs that visually overwhelm the instrument.",
  foyer:
    "Entrance foyer: broad, a welcome. Deities such as Ganesha at the entrance are auspicious and welcome. " +
    "NEVER: babyish nursery art, nude or sensual figures, skulls, horror, violence, sorrowful imagery.",
  office:
    "Home office / study: focused and composed. NEVER: babyish nursery art, sensual figures, skulls, horror, gore.",
};

/** The rooms a deity painting is never sold into — every room whose NEVER
 *  list above names deities. Mirrors `deity_free_room()` (migration
 *  20261004075528), whose triggers refuse a deity design entry to these rooms
 *  by any path, so a classifier cannot put a Ganesha back in the Kids room. */
export const DEITY_FREE_ROOMS: readonly RoomKey[] = [
  "nursery", "toddler", "kids", "playschool", "teen", "bedroom", "dining", "kitchen",
];

/** Series that are deity paintings by definition, by handle prefix. */
const DEITY_SERIES_PREFIXES = ["dwadasha-"];

/**
 * Should this design be held off a page that shows the room `sceneKey` names?
 * The database decides this through room_exclusions; this is the storefront's
 * own copy for the series we KNOW are deities, so a children's page never
 * shows one even before (or without) that record. It changes nothing once the
 * exclusion is applied — the design is no longer in the room's listing.
 */
export function heldOutOfRoom(handle: string, sceneKey: string | undefined): boolean {
  if (!sceneKey) return false;
  const room = roomKeyForScene(sceneKey);
  return room !== undefined
    && DEITY_FREE_ROOMS.includes(room)
    && DEITY_SERIES_PREFIXES.some((prefix) => handle.startsWith(prefix));
}

/** The room tags each room key owns. Mirrors `room_scenes.tags`. */
export const ROOM_TAGS_BY_KEY: Record<RoomKey, string[]> = {
  nursery: ["Nursery"],
  toddler: ["Toddler"],
  kids: ["Kids"],
  playschool: ["Play School"],
  teen: ["Teen"],
  pooja: ["Pooja Room", "Spiritual"],
  bedroom: ["Bedroom"],
  dining: ["Dining Room"],
  kitchen: ["Kitchen"],
  living: ["Living Room"],
  pianoroom: ["Piano Rooms"],
  foyer: ["Foyer"],
  office: ["Home Office"],
};

/** The Studio scene keys each room key owns. Mirrors `room_scenes.scene_keys`. */
export const ROOM_SCENES_BY_KEY: Record<RoomKey, string[]> = {
  nursery: ["nursery"],
  toddler: ["toddler"],
  kids: ["kidsroom", "playroom", "kidsplay"],
  playschool: ["playschool"],
  teen: ["teen"],
  pooja: ["pooja"],
  bedroom: ["bedroom", "bedroomduo"],
  dining: ["dining"],
  kitchen: ["kitchen"],
  living: ["living"],
  pianoroom: ["pianoroom"],
  foyer: ["entryway", "foyerconsole"],
  office: ["office"],
};

/** The room key a scene belongs to, or undefined for scenes outside the home
 *  (offices, hotels, cafés — judged by their own briefs, not by this file). */
export function roomKeyForScene(sceneKey: string): RoomKey | undefined {
  for (const [room, scenes] of Object.entries(ROOM_SCENES_BY_KEY) as [RoomKey, string[]][]) {
    if (scenes.includes(sceneKey)) return room;
  }
  return undefined;
}

/** The room key a room tag belongs to, or undefined. */
export function roomKeyForTag(tag: string): RoomKey | undefined {
  for (const [room, tags] of Object.entries(ROOM_TAGS_BY_KEY) as [RoomKey, string[]][]) {
    if (tags.includes(tag)) return room;
  }
  return undefined;
}

/**
 * The rulebook as one prompt block, for any classifier that files designs into
 * rooms or picks the rooms to render. Rooms not listed here are unaffected.
 */
export function roomRulesPrompt(): string {
  return (
    "ROOM SUITABILITY — the buyer is an Indian family. Only choose a room if a thoughtful Indian household " +
    "would genuinely put THIS artwork in THAT room. When in doubt for a nursery, child's room or pooja room, " +
    "leave that room out. Rules:\n" +
    (Object.entries(ROOM_RULES) as [RoomKey, string][]).map(([k, r]) => `- ${k}: ${r}`).join("\n")
  );
}
