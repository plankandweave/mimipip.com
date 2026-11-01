/**
 * WINTER WORLDS — six original winter-fantasy murals for children's rooms.
 *
 * Why this collection exists (founder, 5 October 2026): requests for licensed
 * characters keep arriving — that week, a parent asking for an Elsa / Frozen
 * wallpaper — and were declined with nothing to show in their place. We do not
 * print licensed characters. These are the answer the concierge now SHOWS
 * instead (see "Character and franchise requests" in the concierge prompts):
 * the wonder a child is asking for, in a world that is entirely our own.
 *
 * The rights boundary shaped the artwork, and must shape anything added here:
 *  - no people, no princess figures, no lookalike costumes or hair;
 *  - no snowmen, ice palaces or castles, no scene from any film;
 *  - no Disney, Frozen or character names in titles, tags, descriptions or
 *    alt text, and nothing "-inspired". Ideas (snow, aurora, winter gardens)
 *    are free to use; a studio's particular expression of them is not.
 * The artwork was generated as original concepts (ChatGPT image generation,
 * founder's brief of 5 October 2026) and reviewed against these rules before
 * it was bundled. That review reduces risk; it is not legal clearance for
 * every market.
 *
 * The room pictures are four styled child's bedrooms (scene "kidsroom") and a
 * playroom (scene "playroom" — what the Kids collection grid shows), both Kids
 * rooms, so each design is sold for the Kids room only (room rule 3).
 *
 * Files ship in public/seed-media/winter-worlds and publish themselves on the
 * first cron tick after deploy (lib/catalogue-seeds). 1536 x 1024 originals:
 * print masters are built on the first order (lib/print-master).
 */
export const WINTER_WORLDS_COLLECTION_HANDLE = "winter-worlds";
export const WINTER_WORLDS_TAG = "Winter Worlds";
export const WINTER_WORLDS_TITLE = "Winter Worlds";
export const WINTER_WORLDS_SEED_DIR = "/seed-media/winter-worlds";
export const WINTER_WORLDS_MEDIA_PREFIX = "product-images/collections/winter-worlds";

/** The standard made-to-measure rate, ₹ per sq ft, GST-inclusive. */
export const WINTER_WORLDS_RATE = 200;
export const WINTER_WORLDS_MATERIAL = "smooth-matt";

export const WINTER_WORLDS_DESCRIPTION =
  "Six original winter worlds for a child's room — northern lights over frosted flowers, a snowy birch wood, " +
  "observatories floating on clouds, swans on a dawn lake, an orchard glazed in frost and a moonlit garden. " +
  "Painted with a soft gouache-and-watercolour feel, and sized to your wall for your wall.";

const DESIGN_PRODUCTION_NOTE =
  "<p>Painted with a soft gouache-and-watercolour feel, and sized to your wall for your wall.</p>";

/** Every room picture is the same child's bedroom, styled four ways. */
const ROOMS = [
  { file: "room-pearl-sleigh.jpg", look: "a pale blue sleigh bed" },
  { file: "room-rose-heirloom.jpg", look: "a rose-pink heirloom bed" },
  { file: "room-ivory-carved.jpg", look: "a carved ivory bed" },
  { file: "room-silk-canopy.jpg", look: "a silk-canopied bed" },
] as const;

export type WinterWorldsDesign = {
  handle: string;
  name: string;
  description: string;
  tags: string[];
  /** Which room picture fronts the design's cards. Never the canopy bed: its
   *  posts stand in front of the artwork. */
  lead: (typeof ROOMS)[number]["file"];
};

export const WINTER_WORLDS_DESIGNS: WinterWorldsDesign[] = [
  {
    handle: "aurora-garden",
    name: "The Aurora Garden",
    description:
      "<p>Ribbons of lilac, mint and peach light drift over a lake ringed with snowy mountains, while tall frosted flowers " +
      "— white, blush and periwinkle — rise around it under a crescent moon. Magical enough for a small child, " +
      "refined enough to grow with them.</p>" + DESIGN_PRODUCTION_NOTE,
    tags: ["Mood: Serene", "Pastel", "Purple", "Blue", "Landscape", "Floral", "Watercolor"],
    lead: "room-pearl-sleigh.jpg",
  },
  {
    handle: "snowlight-meadow",
    name: "Snowlight Meadow",
    description:
      "<p>A silver-birch wood at dusk: small white hares in the snow, chickadees on the branches, and warm amber lights " +
      "glowing among the frosted grasses, with a river winding to the mountains beyond. A cosy storybook world with " +
      "little discoveries at a child's eye level.</p>" + DESIGN_PRODUCTION_NOTE,
    tags: ["Mood: Serene", "White", "Neutral", "Landscape", "Animal", "Birds", "Watercolor"],
    lead: "room-rose-heirloom.jpg",
  },
  {
    handle: "cloud-observatory",
    name: "The Cloud Observatory",
    description:
      "<p>Domed observatories float on islands of lavender cloud, joined by delicate bridges, with brass telescopes " +
      "turned towards a midnight sky of golden constellations and a great pale moon. A room built for exploring the stars.</p>" +
      DESIGN_PRODUCTION_NOTE,
    tags: ["Mood: Playful", "Blue", "Purple", "Art", "Watercolor"],
    lead: "room-ivory-carved.jpg",
  },
  {
    handle: "swan-lake-at-dawn",
    name: "Swan Lake at Dawn",
    description:
      "<p>White swans glide across a still turquoise lake as the first blush of morning touches the snowy hills. Frosted " +
      "willow branches frame the view from above, and snow-dusted irises and hellebores bloom along the shore.</p>" +
      DESIGN_PRODUCTION_NOTE,
    tags: ["Mood: Romantic", "Pastel", "Pink", "Turquoise", "Landscape", "Birds", "Floral", "Watercolor"],
    lead: "room-rose-heirloom.jpg",
  },
  {
    handle: "the-crystal-orchard",
    name: "The Crystal Orchard",
    description:
      "<p>An orchard glazed in hoarfrost: apple and pear branches arch overhead, heavy with frosted fruit and pale " +
      "blossom, tiny birds perch among them, and a lilac path winds away through the snow under falling snowflakes.</p>" +
      DESIGN_PRODUCTION_NOTE,
    tags: ["Mood: Serene", "White", "Pastel", "Botanical", "Floral", "Birds", "Watercolor"],
    lead: "room-ivory-carved.jpg",
  },
  {
    handle: "moonlit-winter-garden",
    name: "The Moonlit Winter Garden",
    description:
      "<p>White camellias, pale blue hydrangeas and silver ferns frame a snowy valley at night, where two small white " +
      "deer stand in a distant clearing beneath a crescent moon and a sky of gentle golden stars.</p>" +
      DESIGN_PRODUCTION_NOTE,
    tags: ["Mood: Romantic", "Blue", "Purple", "Floral", "Botanical", "Chinoiserie", "Animal"],
    lead: "room-rose-heirloom.jpg",
  },
];

const PLAYROOM = "room-playroom.jpg";

/** Every design carries the collection tag and the one room its pictures
 *  show. No other room tag: a room needs a picture of it (room rule 3). */
export const WINTER_WORLDS_SHARED_TAGS = [WINTER_WORLDS_TAG, "Kids"];

/** The room pictures for one design, lead first. */
export function winterWorldsRooms(d: WinterWorldsDesign) {
  const lead = ROOMS.find((r) => r.file === d.lead)!;
  const bedrooms = [lead, ...ROOMS.filter((r) => r.file !== d.lead)].map((r) => ({
    file: r.file,
    sceneKey: "kidsroom",
    alt: `${d.name} wallpaper in a child's bedroom with ${r.look}`,
  }));
  // The playroom (founder, 5 October 2026) is what the Kids collection grid
  // shows (ROOM_SCENE_KEY["kids-wallpapers"] is "playroom"). It comes after the
  // bedrooms so the lead never changes, and reaches designs that are already
  // live through ensureImages.
  return [
    ...bedrooms,
    { file: PLAYROOM, sceneKey: "playroom", alt: `${d.name} wallpaper in a children's playroom with a little table, chairs and toys` },
  ];
}

/** Pixel size of every bundled image (originals are 3:2). */
export const WINTER_WORLDS_SIZE = { width: 1536, height: 1024 } as const;
