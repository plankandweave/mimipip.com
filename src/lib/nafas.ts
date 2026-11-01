/**
 * Nafas's Face Parade — wallpapers by Nafas Elizabeth Pattrick, drawn
 * when she was seven.
 *
 * Like lib/taash, this file is the collection: every name, line of copy, file
 * and room lives here, and both the branded shopfront (/nafas) and the
 * catalogue seed (lib/catalogue-seeds) read it, so the two cannot disagree.
 *
 * The look is HERS. TAASH was set in the serif of its printed book; this one
 * is set in the colours she painted with — the hot pink of Pink Pop's hair,
 * the sprinkles behind her, the coffee beans behind Ruby & Snow — and in a
 * round, friendly display face, because the drawings are round and friendly.
 */

export const NAFAS_COLLECTION_HANDLE = "nafas-face-parade";
export const NAFAS_TAG = "NAFAS FACE PARADE";
export const NAFAS_TITLE = "Nafas's Face Parade";
export const NAFAS_ARTIST = "Nafas Elizabeth Pattrick";
export const NAFAS_PATH = "/nafas";

/** Launch rate, ₹ per sq ft, GST-inclusive, on Smooth Matt (Roheena,
 *  4 October 2026). One rate for the collection. */
export const NAFAS_RATE = 300;
export const NAFAS_MATERIAL = "smooth-matt";

/**
 * The royalty on these designs is paid to Nafas's mother, Maral Yazaarloo
 * Pattrick (Roheena, 4 October 2026): 20% of the EX-GST value of wallpaper
 * lines, the same terms and the same ledger as Mati (migration 0138's
 * royalty_statement reads products.royalty_partner).
 *
 * She may already have a royalty_partners row (she is working on a collection
 * of her own), so the seed REUSES any partner whose slug, name or legal name
 * contains `match` and creates this one only when there is none. TDS is left
 * NULL on a new row on purpose: 0139 makes the withholding rate the
 * accountant's decision, and a NULL holds a statement at approval until it is
 * made.
 */
export const NAFAS_ROYALTY = {
  slug: "maral",
  name: "Maral Yazaarloo Pattrick",
  legalName: "Maral Yazaarloo Pattrick",
  rate: 0.2,
  match: "maral",
} as const;

/** The palette, picked off the artwork itself. */
export const NAFAS_INKS = [
  { name: "Pink Pop", hex: "#F2147A" },
  { name: "Cherry", hex: "#EE2A2A" },
  { name: "Sprinkle yellow", hex: "#F7C934" },
  { name: "Sprinkle blue", hex: "#4EA6EE" },
  { name: "Sprinkle green", hex: "#6CC04A" },
  { name: "Coffee bean", hex: "#8A5A3B" },
  { name: "Latte", hex: "#E3BD7C" },
  { name: "Icing", hex: "#FBF1E3" },
] as const;

export type NafasScene = {
  /** Studio scene key — what room the picture shows (see lib/rooms). */
  sceneKey: "kidsroom" | "playroom" | "restaurant";
  file: string;
  alt: string;
  width: number;
  height: number;
};

export type NafasDesign = {
  handle: string;
  name: string;
  /** Which half of the page it belongs to: her colour faces, or her pencil
   *  animals (drawn in graphite, hung in rooms with a touch of colour). */
  palette: "colour" | "pencil" | "play" | "food";
  /** How the design hangs: one portrait across a wall, or a repeat. */
  kind: "mural" | "repeat";
  /** One line for cards. */
  line: string;
  /** The product description (HTML, as stored in products.description). */
  description: string;
  /** The design's own sprinkle of colour for the page. */
  accent: string;
  /** Its own browse tags (colours, style), on top of NAFAS_SHARED_TAGS. */
  tags: string[];
  flat: { file: string; width: number; height: number };
  scenes: NafasScene[];
};

const ROOMS_NOTE = "<p>Printed to your wall's measurements on Smooth Matt.</p>";

export const NAFAS_DESIGNS: NafasDesign[] = [
  {
    handle: "nafas-pink-pop",
    name: "Pink Pop",
    palette: "colour",
    kind: "mural",
    line: "A cloud of hot-pink hair on a scatter of rainbow sprinkles.",
    description:
      "<p>A cloud of hot-pink hair, gummy-bear earrings and a candy-striped shirt, set on a scatter of rainbow sprinkles. " +
      "Drawn by Nafas Elizabeth Pattrick at seven, for Nafas's Face Parade, and hung as one big, happy portrait across the wall.</p>" +
      ROOMS_NOTE,
    accent: "#F2147A",
    tags: ["Pink", "Yellow", "Blue", "Abstract", "Modern"],
    flat: { file: "flat.png", width: 1254, height: 1254 },
    scenes: [
      {
        sceneKey: "playroom",
        file: "room-playroom.jpg",
        alt: "Pink Pop wallpaper by Nafas in a kids' playroom",
        width: 1254,
        height: 1254,
      },
    ],
  },
  {
    handle: "nafas-ruby-and-snow",
    name: "Ruby & Snow",
    palette: "colour",
    kind: "mural",
    line: "Half cherry-red, half snow-white hair, on a field of coffee beans.",
    description:
      "<p>Hair half cherry-red and half snow-white, starburst lashes and a wide, happy grin, set on a field of coffee beans. " +
      "Drawn by Nafas Elizabeth Pattrick at seven, for Nafas's Face Parade, and hung as one big portrait across the wall.</p>" +
      ROOMS_NOTE,
    accent: "#EE2A2A",
    tags: ["Red", "Brown", "Yellow", "Abstract", "Modern"],
    flat: { file: "flat.png", width: 1254, height: 1254 },
    scenes: [
      {
        sceneKey: "kidsroom",
        file: "room-kidsroom.jpg",
        alt: "Ruby & Snow wallpaper by Nafas in a child's bedroom",
        width: 1254,
        height: 1254,
      },
    ],
  },
  {
    handle: "nafas-daisy-snap", name: "Daisy Snap", palette: "colour", kind: "mural",
    line: "A sunny smile, a blue camera, and a wall full of daisies.",
    description: "<p>A dark bob, a sunny smile and white daisies against a warm yellow ground. A blue-and-lime instant camera and a fan of colourful pictures complete this playful portrait.</p><p>Based on Nafas Elizabeth Pattrick's original artwork, Daisy Snap joins Nafas's Face Parade as one big picture across the wall — for a child's bedroom or a corner for making things.</p>" + ROOMS_NOTE,
    accent: "#996600", tags: ["Yellow", "Blue", "Brown", "Floral", "Modern"],
    flat: { file: "flat.png", width: 1024, height: 1536 },
    scenes: [
      { sceneKey: "playroom", file: "room-playroom.jpg", alt: "Daisy Snap wallpaper by Nafas in a sunny children's creative nook with wooden furniture", width: 1536, height: 1024 },
      { sceneKey: "kidsroom", file: "room-kidsroom.jpg", alt: "Daisy Snap wallpaper by Nafas in a child's bedroom with an oak bed and powder-blue bedding", width: 1536, height: 1024 },
    ],
  },
  {
    handle: "nafas-face-parade-pattern",
    name: "Face Parade",
    palette: "colour",
    kind: "repeat",
    line: "Pink Pop and Ruby & Snow, side by side, all the way across the wall.",
    description:
      "<p>Pink Pop and Ruby & Snow side by side in a chequerboard of sprinkles and coffee beans — a parade of faces that " +
      "keeps going all the way across the wall. Drawn by Nafas Elizabeth Pattrick at seven, the repeat that gives the collection its name.</p>" +
      ROOMS_NOTE,
    accent: "#F7C934",
    tags: ["Pink", "Red", "Yellow", "Brown", "Abstract", "Modern"],
    flat: { file: "flat.png", width: 1254, height: 1254 },
    scenes: [
      {
        sceneKey: "kidsroom",
        file: "room-kidsroom.jpg",
        alt: "Face Parade wallpaper by Nafas in a child's bedroom",
        width: 1374,
        height: 1145,
      },
      {
        sceneKey: "playroom",
        file: "room-playroom.jpg",
        alt: "Face Parade wallpaper by Nafas in a kids' art corner",
        width: 1254,
        height: 1254,
      },
    ],
  },
  // ── In pencil (added 4 October 2026) ──────────────────────────────────
  // Three animals drawn in graphite on textured paper. The walls are black and
  // white; the colour lives in the rooms around them.
  {
    handle: "nafas-patch-the-puppy",
    name: "Patch the Puppy",
    palette: "pencil",
    kind: "mural",
    line: "A floppy-eared puppy with a patch over each eye, peeking down at you.",
    description:
      "<p>A floppy-eared puppy with a patch over each eye and a freckled little nose, peeking down from the wall. " +
      "Drawn in pencil by Nafas Elizabeth Pattrick, for Nafas's Face Parade, and hung as one big drawing across the wall — " +
      "the soft graphite and paper grain are part of the print.</p>" +
      ROOMS_NOTE,
    accent: "#2E2E2E",
    tags: ["Black and White", "Grey", "Animal"],
    flat: { file: "flat.png", width: 1536, height: 1024 },
    scenes: [
      { sceneKey: "kidsroom", file: "room-kidsroom.jpg", alt: "Patch the Puppy wallpaper by Nafas in a child's bedroom", width: 1536, height: 1024 },
      { sceneKey: "kidsroom", file: "room-reading.jpg", alt: "Patch the Puppy wallpaper by Nafas in a child's reading corner", width: 1536, height: 1024 },
      // Calm, all-neutral rooms (added 4 October 2026): the same wall with the
      // colour taken out of the room too, for a black-and-white home.
      { sceneKey: "kidsroom", file: "room-reading-calm.jpg", alt: "Patch the Puppy wallpaper by Nafas in a calm, neutral reading corner", width: 1536, height: 1024 },
      { sceneKey: "kidsroom", file: "room-kidsroom-calm.jpg", alt: "Patch the Puppy wallpaper by Nafas in a calm, neutral child's bedroom", width: 1536, height: 1024 },
    ],
  },
  {
    handle: "nafas-bubbles-the-fish",
    name: "Bubbles the Fish",
    palette: "pencil",
    kind: "mural",
    line: "A stripy little fish blowing three bubbles as it swims by.",
    description:
      "<p>A stripy little fish with a curly smile, blowing three round bubbles as it swims across the wall. " +
      "Drawn in pencil by Nafas Elizabeth Pattrick, for Nafas's Face Parade, and hung as one big drawing across the wall — " +
      "the soft graphite and paper grain are part of the print.</p>" +
      ROOMS_NOTE,
    accent: "#2E2E2E",
    tags: ["Black and White", "Grey", "Animal"],
    flat: { file: "flat.png", width: 1536, height: 1024 },
    scenes: [
      { sceneKey: "kidsroom", file: "room-kidsroom.jpg", alt: "Bubbles the Fish wallpaper by Nafas in a child's bedroom", width: 1536, height: 1024 },
      { sceneKey: "playroom", file: "room-playroom.jpg", alt: "Bubbles the Fish wallpaper by Nafas in a kids' playroom", width: 1536, height: 1024 },
    ],
  },
  {
    handle: "nafas-panda-and-tweet",
    name: "Panda & Tweet",
    palette: "pencil",
    kind: "mural",
    line: "A smiling panda with a little bird singing on its head.",
    description:
      "<p>A big, smiling panda with a little bird perched on its head, singing a song of musical notes. " +
      "Drawn in pencil by Nafas Elizabeth Pattrick, for Nafas's Face Parade, and hung as one big drawing across the wall — " +
      "the soft graphite and paper grain are part of the print.</p>" +
      ROOMS_NOTE,
    accent: "#2E2E2E",
    tags: ["Black and White", "Grey", "Animal", "Birds"],
    flat: { file: "flat.png", width: 1536, height: 1024 },
    scenes: [
      { sceneKey: "kidsroom", file: "room-kidsroom.jpg", alt: "Panda & Tweet wallpaper by Nafas in a child's bedroom", width: 1536, height: 1024 },
      { sceneKey: "playroom", file: "room-playroom.jpg", alt: "Panda & Tweet wallpaper by Nafas in a kids' playroom", width: 1536, height: 1024 },
      { sceneKey: "playroom", file: "room-playroom-calm.jpg", alt: "Panda & Tweet wallpaper by Nafas in a calm, neutral playroom", width: 1536, height: 1024 },
      { sceneKey: "kidsroom", file: "room-kidsroom-calm.jpg", alt: "Panda & Tweet wallpaper by Nafas in a calm, neutral child's bedroom", width: 1536, height: 1024 },
    ],
  },
  {
    handle: "nafas-daisy-days", name: "Daisy Days", palette: "play", kind: "repeat",
    line: "Yellow and lilac flowers scattered across a happy pink ground.",
    description: "<p>Yellow and lilac flowers scattered across a happy pink ground. Based on Nafas Elizabeth Pattrick's original artwork, with her colours and drawing character preserved in a cleaned flat design.</p>" + ROOMS_NOTE,
    accent: "#D94B97", tags: ["Pink", "Yellow", "Floral"],
    flat: { file: "flat.png", width: 1536, height: 1024 },
    scenes: [
      { sceneKey: "kidsroom", file: "room-kidsroom.jpg", alt: "Daisy Days wallpaper by Nafas in a child's bedroom", width: 1536, height: 1024 },
      { sceneKey: "playroom", file: "room-playroom.jpg", alt: "Daisy Days wallpaper by Nafas in a children's playroom", width: 1536, height: 1024 },
    ],
  },
  {
    handle: "nafas-spiral-bloom", name: "Spiral Bloom", palette: "play", kind: "mural",
    line: "A red crayon flower with a colourful spiral at its heart.",
    description: "<p>A red crayon flower with a colourful spiral at its heart. Based on Nafas Elizabeth Pattrick's original artwork, with her colours and drawing character preserved in a cleaned flat design.</p>" + ROOMS_NOTE,
    accent: "#D84242", tags: ["Red", "Green", "Floral"],
    flat: { file: "flat.png", width: 1024, height: 1536 },
    scenes: [
      { sceneKey: "kidsroom", file: "room-kidsroom.jpg", alt: "Spiral Bloom wallpaper by Nafas in a child's bedroom", width: 1536, height: 1024 },
      { sceneKey: "playroom", file: "room-playroom.jpg", alt: "Spiral Bloom wallpaper by Nafas in a children's creative playroom", width: 1536, height: 1024 },
    ],
  },
  {
    handle: "nafas-wheels-and-goals", name: "Wheels & Goals", palette: "play", kind: "repeat",
    line: "Blue cars and footballs, with plenty of sky blue between them.",
    description: "<p>Blue cars and footballs, with plenty of sky blue between them. Based on Nafas Elizabeth Pattrick's original artwork, with her colours and drawing character preserved in a cleaned flat design.</p>" + ROOMS_NOTE,
    accent: "#2466AB", tags: ["Blue", "Modern"],
    flat: { file: "flat.png", width: 1536, height: 1024 },
    scenes: [
      { sceneKey: "kidsroom", file: "room-kidsroom.jpg", alt: "Wheels & Goals wallpaper by Nafas in a child's bedroom", width: 1536, height: 1024 },
      { sceneKey: "playroom", file: "room-playroom.jpg", alt: "Wheels & Goals wallpaper by Nafas in a children's playroom", width: 1536, height: 1024 },
    ],
  },
  {
    handle: "nafas-pizza-pal", name: "Pizza Pal", palette: "food", kind: "mural",
    line: "A smiling slice, waving hello at the children's table.",
    description: "<p>Nafas imagined this smiling pizza for a children's eating area in a shopping mall. Her little waving arm, cheeky tongue and coloured-pencil marks stay at the heart of the design, enlarged on a warm ivory paper-textured ground.</p><p>One big character across the wall, with space around its hands and feet.</p>" + ROOMS_NOTE,
    accent: "#B84E48", tags: ["Cream", "Yellow", "Red", "Modern", "Restaurants"],
    flat: { file: "flat.png", width: 1536, height: 1024 },
    scenes: [
      { sceneKey: "restaurant", file: "room-mall-dining.jpg", alt: "Pizza Pal by Nafas on the wall of a mall children's eating area, with small red and yellow chairs", width: 1536, height: 1024 },
      { sceneKey: "restaurant", file: "room-mall-family-nook.jpg", alt: "Pizza Pal in a mall family dining nook with a low communal table and pastel chairs", width: 1536, height: 1024 },
    ],
  },
];

/**
 * Tags every design carries. Rooms are deliberately ONLY "Kids": every scene
 * above is a child's room, and a design must have a picture of every room it
 * is sold for (room rule 3) — tagging Bedroom or Living Room here would file it
 * under rooms it has no render of, and those grids would show a swatch.
 */
export const NAFAS_SHARED_TAGS = [NAFAS_TAG, "Kids", "Mood: Playful"];

/** Where the bundled originals live in public/, and where the seed copies
 *  them to in the media bucket (served at MEDIA_BASE/<key>). */
export const NAFAS_SEED_DIR = "/seed-media/nafas-face-parade";
export const NAFAS_MEDIA_PREFIX = "product-images/collections/nafas-face-parade";

/** The page's own lighter renditions in public/nafas. */
export function nafasWebSrc(handle: string, which: "flat" | NafasScene): string {
  const name = which === "flat" ? "flat" : which.file.replace(/\.[a-z]+$/, "");
  return `${NAFAS_PATH}/${handle}-${name}.webp`;
}

/** Her pencil palette, for the black-and-white half of the page. */
export const NAFAS_PENCILS = [
  { name: "Graphite", hex: "#2E2E2E" },
  { name: "Soft lead", hex: "#6B6B6B" },
  { name: "Smudge", hex: "#A9A9A6" },
  { name: "Paper", hex: "#F4F3EF" },
] as const;

export const NAFAS_PORTRAIT = { src: `${NAFAS_PATH}/nafas-portrait.webp`, width: 694, height: 920 };

/** About the artist, from the family's own words. */
export const NAFAS_STORY = [
  "Born into a world of adventure, Nafas began her journey even before her first breath. While still in her mother's womb, she travelled through forty countries across Africa, Europe and Asia, on her parents' motorcycle journey.",
  "Today, at seven, she has the confidence and curiosity of a well-travelled soul. She loves being in front of the camera and making videos, and she meets every creature she finds with kindness, unafraid and eager to learn from the living world around her.",
  "Pink Pop and Ruby & Snow are two of the faces she drew in colour; Face Parade sets them side by side. Then she picked up a pencil and drew her animals — a puppy, a fish, and a panda with a bird singing on its head.",
];

export const NAFAS_DESCRIPTION =
  "Eleven wallpapers by seven-year-old Nafas Elizabeth Pattrick: colour portraits — Pink Pop, Ruby & Snow and Daisy Snap — with the Face Parade repeat — and three animals in pencil — Patch the Puppy, Bubbles the Fish and Panda & Tweet — plus Daisy Days, Spiral Bloom, Wheels & Goals and Pizza Pal. Printed to measure on Smooth Matt for children's spaces.";
