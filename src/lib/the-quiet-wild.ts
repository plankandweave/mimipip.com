/**
 * THE QUIET WILD — eleven bird murals, celebrating the stillness of nature.
 *
 * Realistically rendered birds inhabit palm-lined lagoons, lotus ponds,
 * mangrove creeks, coastal shores and flowering woodlands. Soft botanical
 * colours, atmospheric depth and a classic painted finish. Every artwork is
 * PORTRAIT in proportion: the renders keep the full composition on a tall
 * feature wall, and wider-wall adaptations need separate crop/extension
 * approval — which is why `products.orientation` is 'vertical' on every one
 * (rule 7 of the homepage rules: a landscape frame refuses a declared vertical).
 *
 * Source of truth: the founder's Drive folder "The Quiet Wild" —
 * `01 - Wallpaper Artworks/` (the eleven artworks) and `02 - Room Renders/`
 * (one AI room-concept visualisation per artwork, in the room the collection
 * guide places it). The Drive file ids below are those files, recorded so a
 * re-export can be traced to its source; scripts/seed-the-quiet-wild.ts reads
 * the downloaded originals from a local folder (`--from`), never from Drive.
 *
 * ONE DESIGN ALREADY EXISTS. 01 Flamingo Palm Lake is "the unchanged existing
 * artwork supplied by the founder" (collection guide) — it is `la-00026`,
 * active since the catalogue import, with its own verified flat and four
 * Studio renders. Homepage rule 1 (no design twice) means it JOINS the
 * collection rather than being seeded again: it gains the collection tag and
 * its entrance-hall render, and keeps everything else. Ten new products
 * complete the eleven.
 *
 * ROOM RENDERS are concept visualisations, not photographs of installed
 * projects — every description says so, and so does the collection copy.
 */

export const QUIET_WILD_TAG = "The Quiet Wild";
export const QUIET_WILD_COLLECTION_HANDLE = "the-quiet-wild";

/** R2 key prefix under `product-images/` — served by /media/product-images/…
 *  with @480/@1200 renditions beside every master (media-url.ts). */
export const QUIET_WILD_MEDIA_PREFIX = "the-quiet-wild";

/** Same substrate and rate as the collection's existing design (la-00026:
 *  smooth-matt at ₹200/sq ft, the only material it sells on). One substrate
 *  per collection, matching what the founder's own artwork already offers. */
export const QUIET_WILD_MATERIAL = "smooth-matt";
export const QUIET_WILD_RATE = 200;

/** The rooms the collection guide names as its placement direction —
 *  entrance halls and dining rooms first, then drawing rooms, tea rooms,
 *  reading rooms, libraries and bright hospitality lounges. Every design is
 *  filed under all five (founder's decision, 5 October 2026), on top of its
 *  own render's room. A room page shows the render of that room where one
 *  exists and the flat otherwise, after the rendered designs
 *  (collection_page_v2's scene-block ordering); the render fill can close
 *  those gaps later by enabling the room in room_render_fill. No bedroom: the
 *  guide is explicit that none is included. */
export const QUIET_WILD_ROOM_TAGS = [
  "Foyer",
  "Dining Room",
  "Living Room",
  "Library & Reading Corners",
  "Hotel Lobby & Reception",
] as const;

/** Style facets shared by every design in the collection. */
/** "Vintage": the classic painted finish the guide describes. */
export const QUIET_WILD_STYLE_TAGS = ["Birds", "Landscape", "Botanical", "Vintage", "Mood: Serene"] as const;

export type QuietWildDesign = {
  /** "01".."11" — the guide's numbering, kept for the Drive filenames. */
  number: string;
  /** Product handle. For 01 this is the EXISTING product's handle. */
  handle: string;
  title: string;
  /** True for la-00026: join the collection, never re-seed. */
  existing?: boolean;
  /** Drive file id of the artwork. Omitted for the existing design, whose
   *  verified flat already lives in the catalogue. */
  flatDriveId?: string;
  /** Original artwork file extension on Drive (01 is a JPEG, the rest PNG). */
  flatExt?: "png" | "jpg";
  /** Drive file id of the matching room render. */
  roomDriveId: string;
  /** The room the guide places it in, as the guide names it. */
  setting: string;
  /** Studio scene key of that room (src/lib/studio-scenes.ts) — what makes
   *  the render show on that room's collection page and tiles. */
  sceneKey: string;
  /** Phrase for the render's alt text: "… wallpaper in <roomPhrase>". */
  roomPhrase: string;
  /** Room collection tag(s) for the render's own setting, on top of
   *  QUIET_WILD_ROOM_TAGS. */
  settingTags: string[];
  /** Colour facet tags (collections of kind 'color'), read off the artwork
   *  itself after the files were downloaded and looked at. */
  colours: string[];
  /** Extra style tags beyond QUIET_WILD_STYLE_TAGS. */
  extraStyles?: string[];
  /** The guide's placement note — why this room. */
  why: string;
  /** Product description, two short paragraphs of HTML. */
  description: string;
};

const concept =
  "<p>Part of The Quiet Wild, eleven bird murals in a classic painted finish. " +
  "An original mural design for your wall.</p>";

export const QUIET_WILD_DESIGNS: QuietWildDesign[] = [
  {
    number: "01",
    handle: "la-00026",
    title: "Flamingo Palm Lake",
    existing: true,
    roomDriveId: "1U2G-h42TUnVgW20dgmhqYyvXtPHCk_X8",
    setting: "Entrance Hall",
    sceneKey: "entryway",
    roomPhrase: "an entrance hall",
    settingTags: ["Foyer"],
    colours: ["Green", "Pink", "Neutral"],
    extraStyles: ["Tropical"],
    why: "Arrival wall with little furniture in front, giving the original palm landscape and two flamingos a clear view.",
    description: "", // the existing product keeps its own description
  },
  {
    number: "02",
    handle: "quiet-wild-flamingo-lagoon",
    title: "Flamingo Lagoon",
    flatDriveId: "1wUWwFS9NKPi7GaaPh-t8rU76x6fqAmDs",
    flatExt: "png",
    roomDriveId: "1d2RTKRV91m9AbtQnxM5lZb1WlxWQ5Hot",
    setting: "Dining Room",
    sceneKey: "dining",
    roomPhrase: "a dining room",
    settingTags: ["Dining Room"],
    colours: ["Pink", "Green", "Neutral"],
    extraStyles: ["Tropical"],
    why: "A sociable room where the warm timber and blush birds work together; keep the table away from the mural wall.",
    description:
      "<p>Blush flamingos wade a still lagoon under palms, the water holding the soft colour of the sky. " +
      "A sociable mural for a dining room, where warm timber and the birds' rose plumage work together; keep the table off the mural wall so the lagoon stays open.</p>" +
      concept,
  },
  {
    number: "03",
    handle: "quiet-wild-egret-backwater",
    title: "Egret Backwater",
    flatDriveId: "1UN7fN6MtrTZdB4RP-LRNN8xHhcKWtWIv",
    flatExt: "png",
    roomDriveId: "1pncII1uL9ujQlXw-s35WWTckO2A36TXN",
    setting: "Drawing Room",
    sceneKey: "living",
    roomPhrase: "a drawing room",
    settingTags: ["Living Room"],
    colours: ["Green", "White", "Neutral"],
    extraStyles: ["Tropical"],
    why: "An airy sitting room with low furniture lets the ivory birds and open water remain visible.",
    description:
      "<p>Ivory egrets rest on a palm-fringed backwater, open water and soft blue hills giving the scene its calm. " +
      "Drawn for an airy drawing room: low furniture lets the birds and the water stay in view.</p>" +
      concept,
  },
  {
    number: "04",
    handle: "quiet-wild-crane-lotus-marsh",
    title: "Crane Lotus Marsh",
    flatDriveId: "10BHl2mW0jK0ulGuZvb7vyl9HmdTdJxvU",
    flatExt: "png",
    roomDriveId: "1zmIzMgsgqpv9-cL-K2ISuB5u5dNphjaI",
    setting: "Tea Room",
    sceneKey: "living",
    roomPhrase: "a tea room",
    settingTags: ["Living Room"],
    colours: ["Green", "Neutral"],
    extraStyles: ["Tropical"],
    why: "An intimate tea room suits the still water and delicate lotus imagery.",
    description:
      "<p>A pair of grey cranes stand among lotus in a still, palm-lined marsh, the pale flowers floating on quiet water. " +
      "Delicate enough for an intimate tea room or sitting room, where the stillness of the water sets the pace.</p>" +
      concept,
  },
  {
    number: "05",
    handle: "quiet-wild-roseate-island",
    title: "Roseate Island",
    flatDriveId: "1RhQDLdNanOfUzPQ7hlKgQJGkgRIGpZrk",
    flatExt: "png",
    roomDriveId: "1T4hiSO-NpuPYH4s7ume4I3W_8l72nqdC",
    setting: "Boutique Hotel Lounge",
    // "reception", not "hotellobby": the Hotel Lobby & Reception collection
    // (`hotels`) shows reception renders (ROOM_SCENE_KEY), so this is the key
    // that puts this boutique-lounge render on that page.
    sceneKey: "reception",
    roomPhrase: "a boutique hotel lounge",
    settingTags: ["Hotel Lobby & Reception"],
    colours: ["Pink", "Green", "Neutral"],
    extraStyles: ["Tropical"],
    why: "A boutique hospitality lounge gives the blush spoonbills and tropical setting room to become the focal point.",
    description:
      "<p>Roseate spoonbills on a small tropical island, one with its blush wings open, set against palms and still water. " +
      "A focal point for a boutique hotel lounge, where the tropical setting has the room it needs.</p>" +
      concept,
  },
  {
    number: "06",
    handle: "quiet-wild-heron-mangrove",
    title: "Heron Mangrove",
    flatDriveId: "1QHt7ZGU9pSVJLLJLomCsN-0GiGQwnq-t",
    flatExt: "png",
    roomDriveId: "1waPR3ktcJRyRxWFASO3-Ak70Hus1H0IQ",
    setting: "Library",
    sceneKey: "library",
    roomPhrase: "a library",
    settingTags: ["Library & Reading Corners"],
    colours: ["Green", "Brown", "Neutral"],
    why: "Dark timber shelves on the adjacent wall complement the mangrove roots without covering the heron.",
    description:
      "<p>A grey heron stands among mangrove roots on a shaded creek, the tangle of roots and leaves giving the scene its depth. " +
      "At home in a library, where dark timber shelves on the adjacent wall answer the mangrove without covering the bird.</p>" +
      concept,
  },
  {
    number: "07",
    handle: "quiet-wild-teal-lotus-pond",
    title: "Teal Lotus Pond",
    flatDriveId: "1_FYxv6x-P-Dj5EvlduKcB5R3ftFmjAq8",
    flatExt: "png",
    roomDriveId: "1qpjyS1WxoQgirl55ar2ESJQY2nGevMgD",
    setting: "Breakfast Room",
    sceneKey: "dining",
    roomPhrase: "a breakfast room",
    settingTags: ["Dining Room"],
    colours: ["Green", "Pink", "Neutral"],
    why: "Daylight and a garden connection suit the lotus pond and swimming teal.",
    description:
      "<p>Teal swim a lotus pond beneath broad, sage-green leaves, the pale pink of the lotus flowers drifting over still water. " +
      "Made for a breakfast room with daylight and a garden beyond it, where the pond reads as part of the view.</p>" +
      concept,
  },
  {
    number: "08",
    handle: "quiet-wild-pelican-estuary",
    title: "Pelican Estuary",
    flatDriveId: "1CJoLXWZGepwEs-bZ4cyk4h5HUceSsIZb",
    flatExt: "png",
    roomDriveId: "1WV9MwbGWEUFjvogKFpE1lBq9RaR1LgVj",
    setting: "Coastal Lounge",
    sceneKey: "living",
    roomPhrase: "a coastal lounge",
    settingTags: ["Living Room"],
    colours: ["Neutral", "Blue", "White"],
    why: "Pale timber, linen and blue-grey accents complement the open coastal scene.",
    description:
      "<p>Two white pelicans rest on pale dunes above an open estuary, sea and shallow water under a wide, soft sky. " +
      "The open coastal scene suits a lounge in pale timber and linen, with blue-grey accents picking up the water.</p>" +
      concept,
  },
  {
    number: "09",
    handle: "quiet-wild-ibis-meadow",
    title: "Ibis Meadow",
    flatDriveId: "1IH2sk-hHwCuTsOfwePb9WPM5-rfrgMQs",
    flatExt: "png",
    roomDriveId: "15jtvCIz79iM-M1Twy3zX07SnhMgcPFDh",
    setting: "Dining Nook",
    sceneKey: "dining",
    roomPhrase: "a dining nook",
    settingTags: ["Dining Room"],
    colours: ["Brown", "Yellow", "Neutral"],
    why: "A compact dining space gains depth from the meadow; avoid furniture across the ibis silhouettes.",
    description:
      "<p>Glossy ibis wade a golden marsh meadow, their bronze plumage set among tall grasses and white wildflowers. " +
      "A compact dining nook gains depth from the meadow; keep furniture clear of the birds so their outlines read.</p>" +
      concept,
  },
  {
    number: "10",
    handle: "quiet-wild-kingfisher-stream",
    title: "Kingfisher Stream",
    flatDriveId: "1KXgZaf3ojJ4Zc-cw3j6kjJ-ZhPa0OOMX",
    flatExt: "png",
    roomDriveId: "1TYcgJoaOPhptaSteLPyJ1IYpwfkjyPTy",
    setting: "Reading Room",
    sceneKey: "library",
    roomPhrase: "a reading room",
    settingTags: ["Library & Reading Corners"],
    colours: ["Green", "Neutral"],
    why: "A quiet reading room supports the stream scene and small jewel-like kingfisher.",
    description:
      "<p>A small, jewel-bright kingfisher on a branch above a woodland stream and its falls, the moss and foliage kept soft around it. " +
      "A quiet reading room is its natural setting: the scene is calm, and the bird rewards a second look.</p>" +
      concept,
  },
  {
    number: "11",
    handle: "quiet-wild-parakeet-woodland",
    title: "Parakeet Woodland",
    flatDriveId: "1nMAMvWqJoIEja2T0YUhUEnMve_d95G6Z",
    flatExt: "png",
    roomDriveId: "1TEWHME_RKs4e-OhhWuBTn3BIPj0B6ogw",
    setting: "Stair Landing",
    // "entryway": an arrival-facing stair landing is the entrance hall, and
    // this key is what the Foyer page shows ("hallway" has no room page).
    sceneKey: "entryway",
    roomPhrase: "a stair landing",
    settingTags: ["Foyer"],
    colours: ["Green", "White", "Neutral"],
    why: "An arrival-facing landing wall gives the full vertical woodland composition and long parakeet tails space.",
    description:
      "<p>Rose-ringed parakeets in a flowering woodland, their long tails drawn down through white blossom and branches of a tall composition. " +
      "A stair landing that faces the arrival gives the full vertical scene, and the tails, the height they need.</p>" +
      concept,
  },
];

/** Collection-page copy (collections.description) and the pull-quote block —
 *  two channels, rendered differently; see seed-dwadasha.ts for why both. */
export const QUIET_WILD_STORY = {
  description:
    "Eleven wallpaper murals celebrating the stillness of nature. Realistically rendered birds " +
    "inhabit palm-lined lagoons, lotus ponds, mangrove creeks, coastal shores and flowering woodlands. " +
    "Soft botanical colours, atmospheric depth and a classic painted finish give every landscape its own " +
    "character, bringing calm and quiet discovery to your walls. Each one is made for a generous feature " +
    "wall: an entrance hall, a dining room, a drawing room or a library.",
  quote: "Calm, and quiet discovery, for your walls.",
  credit: "Zyvorah",
};

/** The design that fronts the collection's tile on /collections and in the
 *  menu: the founder's own artwork, the one the collection grew from. */
export const QUIET_WILD_HERO_HANDLE = "la-00026";
