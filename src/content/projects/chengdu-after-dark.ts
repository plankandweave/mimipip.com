import type { Project } from "./types";

/**
 * Concept Study 06 — hospitality, single venue.
 *
 * The other hospitality study in this book (River House) is a whole building:
 * nine rooms, one subject, a progression a guest walks through over three
 * days. This is the opposite problem and worth showing beside it — one
 * restaurant, one artwork, and a guest who will be in the room for ninety
 * minutes and never come back to a second wall.
 *
 * That changes what the wall has to do. There is no sequence to reward, so
 * the composition carries its own second reading: at booth distance it is
 * steamers and porcelain, and from the door it is smoke moving across a
 * black lacquered ground.
 *
 * The colour story is documented as it actually happened, including the
 * broken plate — an accident, not a device invented afterwards. Saying so is
 * the point of the chapter; a palette that claims to have been derived is
 * less convincing than one that admits it was noticed.
 *
 * Source imagery is four finished views and one studio frame, with no bare
 * "before" plates, so every chapter renders as a single full-bleed image.
 * Two frames are 2:1 and carry an explicit aspect override — the artwork
 * sheet in particular is a wall band whose whole argument is its width.
 */
export const chengduAfterDark: Project = {
  slug: "chengdu-after-dark",
  kind: "concept",
  theme: "warm",
  segments: ["hospitality"],

  client: "A Sichuan restaurant",
  title: "Chengdu After Dark",
  standfirst:
    "Heat, smoke and a plate that broke while we were working. One mural for one room — steamers, porcelain fragments and chilli oil on a black lacquered ground, built to be read twice: once from the door, once from the booth.",
  facts: [
    { label: "Sector", value: "Hospitality — restaurant" },
    { label: "Setting", value: "A Sichuan dining room" },
    { label: "Walls shown", value: "3 spaces, one artwork" },
    { label: "Through-line", value: "Heat, smoke and a broken plate" },
  ],

  cover: "chengdu-after-dark/main-dining-curated.jpg",

  brief: {
    intro:
      "A Sichuan restaurant with a dark, heavy shell — concrete, aged timber, an open fire kitchen at the end of the room — and one long wall that ran the entire length of it. The operator's instinct was the usual one: red lanterns, a dragon, a calligraphy panel. Which is to say, the decoration every Chinese restaurant in the city already has, and which tells a diner nothing about this kitchen.",
    requirements: [
      "Read as unmistakably Sichuan without a single piece of conventional Chinese-restaurant imagery.",
      "Survive being the only artwork in the building — no sequence, no second wall to explain the first.",
      "Work at two distances: a booth at arm's length, and the far end of a forty-metre room.",
      "Hold up in near-darkness, because the room is lit at fifteen lux and the wall is washed, not lit flat.",
      "Extend to a private dining room and a booth run without becoming wallpaper repeated three times.",
    ],
  },

  interpretation: [
    "The visual language did not arrive fully formed. It developed while we were discussing the restaurant, studying its atmosphere and considering how a wall could express something as intangible as heat, aroma and the energy of food being prepared after dark.",
    "Then, during the development of the case study, a blue-and-white Chinese plate we were holding accidentally broke. The irregular pieces immediately caught our attention: the familiar cobalt pattern was suddenly interrupted by raw, uneven edges. A complete plate would have remained an object on a dining table. Broken, it became a fragment of a larger story. We decided not to visually repair it — the pieces became a recurring element within the mural, appearing, disappearing and moving through the composition like memories of meals already served. That accident gave the artwork its character.",
    "The circular bamboo steamers bring in the rhythm of a busy kitchen and the human act of preparing and sharing food. Their woven surfaces add warmth and tactility against the darker background.",
    "The flowing ivory lines represent steam and aroma. They do not rise in perfect columns — they curl, overlap, escape and drift across the wall, connecting the different elements of the composition. They allow something invisible, the smell and warmth of freshly prepared food, to become visible.",
    "And then there is the red. A Sichuan-inspired composition would feel incomplete without the colour of chilli, heat and málà. It is not used as a conventional Chinese red or as surface decoration: it appears in sharp, controlled gestures, almost like chilli oil cutting through a dark sauce. Against the charcoal, tobacco and cobalt, it becomes the pulse of the mural.",
  ],

  palette: {
    intro:
      "Six colours, every one of them taken off something that is actually in the story — darkness, smoke, bamboo, porcelain, steam and heat — and what each is asked to do to the person sitting in front of it.",
    entries: [
      {
        name: "Chengdu Ink",
        hex: "#191817",
        purpose:
          "A dense, warm black drawn from ink, wok-seasoned surfaces and a food street after sunset. It grounds the mural and is the reason the brighter elements have any intensity at all.",
      },
      {
        name: "Night-Market Smoke",
        hex: "#4A423B",
        purpose:
          "A softened charcoal that sits between black and brown — smoke, weathered walls, and the haze that appears where kitchens, people and evening light meet.",
      },
      {
        name: "Mála Lacquer",
        hex: "#8E2118",
        purpose:
          "Deep chilli red: Sichuan heat, chilli oil, the numbing-spicy character of málà. Used sparingly and never as a field. It is the pulse, and a pulse you can see everywhere is a rash.",
      },
      {
        name: "Bamboo Tobacco",
        hex: "#8A6A47",
        purpose:
          "A warm, aged brown from steamers, tea-stained paper, timber counters and the patina of objects handled a thousand times in a working kitchen.",
      },
      {
        name: "Rising Steam",
        hex: "#DFCDB4",
        purpose:
          "A warm, slightly smoky ivory rather than a clean white. It gives form to aroma, movement and heat, and softens the darkness without lighting it.",
      },
      {
        name: "Broken Porcelain Cobalt",
        hex: "#1E3566",
        purpose:
          "The ceramic blue of the plate that broke. It carries clarity and cultural memory without asking a dragon to do the work.",
      },
    ],
    note:
      "The palette is not decorative and it does not rotate between rooms. What changes between the main room, the booths and the private dining room is how much of the ground is left empty — the same six colours, held at different densities.",
  },

  motifs: {
    intro:
      "Four elements, recombined. No motif is drawn twice the same size, which is what keeps a forty-metre wall from reading as a repeat.",
    entries: [
      {
        name: "The broken plate",
        description:
          "Cobalt-on-white fragments with raw edges, scattered rather than arranged — the same few sherds turning up across the room like meals already served. The one element we refused to repair.",
        image: "chengdu-after-dark/artwork-flat.jpg",
      },
      {
        name: "The steamers",
        description:
          "Circular bamboo baskets, stacked and singly, seen from above and edge-on. They carry the rhythm of a working kitchen and are the only warm, tactile surface in the composition.",
      },
      {
        name: "Steam and aroma",
        description:
          "Ivory lines that curl, overlap and drift rather than rise. They are the connective tissue of the mural: they make the invisible part of eating — smell, warmth — the thing that actually moves your eye across the wall.",
      },
      {
        name: "Chilli-oil gestures",
        description:
          "Sharp red marks, thrown rather than drawn, cutting through the dark ground. A few per panel, never balanced, never centred.",
      },
    ],
  },

  chapters: [
    {
      space: "The artwork",
      title: "One Sheet, Before the Room",
      rationale:
        "The mural drawn flat, at its own proportions, before a single wall is measured. Read here it is obvious what the composition is doing: the left third is almost empty smoke, the density builds to the right, and the porcelain and red are distributed so that no seated position gets a dead patch of wall in front of it. Every layout decision after this one is a consequence of this sheet.",
      curated: "chengdu-after-dark/artwork-flat.jpg",
      alt: "Flat view of the mural artwork — bamboo steamers, blue-and-white porcelain fragments, ivory steam lines and red chilli-oil marks on an aged black lacquered ground",
      aspect: "2/1",
    },
    {
      space: "Main dining room",
      title: "Read From the Door",
      rationale:
        "The long wall, run past the tables to the open kitchen at the far end. At this distance the drawing dissolves: what a diner walking in sees is smoke moving across black, with the fire of the kitchen at the end of it. Nothing about the wall competes with the flame — it is the darkest, quietest version of the artwork, and it is doing the job of making the room feel long and lived-in rather than decorated.",
      curated: "chengdu-after-dark/main-dining-curated.jpg",
      alt: "Long, dimly lit restaurant dining room with the mural running the full length of the left wall towards an open fire kitchen",
      aspect: "2/1",
    },
    {
      space: "Booth run",
      title: "Read From Arm's Length",
      rationale:
        "The same artwork at the distance people actually eat at. Here the mural has to reward ninety minutes of glancing at it, so this section of the composition is the dense one: whole steamers, the largest porcelain fragments, the cracked ground legible as a surface with age. The wall is washed from above rather than lit flat, which keeps the ivory steam reading as light and the ground reading as depth.",
      curated: "chengdu-after-dark/booths-curated.jpg",
      alt: "Leather booth seating against a panelled mural wall of steamers, blue-and-white porcelain shards and ivory steam lines",
      aspect: "3/2",
    },
    {
      space: "Private dining room",
      title: "Almost Nothing",
      rationale:
        "One round table, one host, and a conversation that is the actual purpose of the room. So the composition is emptied: a single steamer, two fragments, one steam line, one red mark, and a great deal of black. It is the same artwork and the same six colours at a fraction of the density — which is the proof that the scheme is a language rather than a pattern. A private room given the main wall at full strength would have been the loudest mistake in the building.",
      curated: "chengdu-after-dark/private-dining-curated.jpg",
      alt: "Private dining room with a round table and a sparse mural — one bamboo steamer, a few porcelain fragments and a single ivory steam line on black",
      aspect: "3/2",
    },
  ],

  wallHierarchy: {
    intro:
      "A restaurant is a small building with a large temptation: every surface is visible from every seat, so every surface gets treated. The volumes below were fixed before the artwork was composed, and the mural was drawn to fit them rather than the other way round.",
    levels: [
      { level: "Full voice", purpose: "The long dining wall and the booth run — one continuous artwork, the only artwork in the building.", share: 30 },
      { level: "A murmur", purpose: "The private dining room — the same language emptied out to a handful of marks.", share: 10 },
      { level: "Silent", purpose: "Kitchen face, bar back, entry, service walls, ceilings. Concrete, timber, steel and nothing applied.", share: 60 },
    ],
    note:
      "Three fifths of this restaurant has nothing on it. In a room lit at fifteen lux that is not restraint for its own sake — it is the only way the one wall that is lit reads as the reason you are looking.",
  },

  process: {
    intro: "How the artwork was actually arrived at, including the part that was an accident.",
    steps: [
      {
        title: "The room before the imagery",
        body: "We started from the atmosphere rather than from motifs: a dark shell, an open flame, a kitchen that is audible from every seat, and a cuisine whose defining quality — málà — is a sensation rather than a look. The question was how a wall expresses heat and aroma, not which Chinese objects to draw.",
      },
      {
        title: "The plate that broke",
        body: "A blue-and-white plate broke in the studio during development. We kept the pieces on the table, and the raw edges against the cobalt pattern turned out to be more interesting than the plate had been. The decision that shaped the whole artwork was to leave it broken.",
        image: "chengdu-after-dark/studio-table.jpg",
      },
      {
        title: "Density, not composition",
        body: "The mural was built as a gradient of density rather than as a picture: emptiest where people walk, densest where they sit, near-silent in the private room. Every seated sightline was checked against the sheet before any element was finalised.",
      },
      {
        title: "Proofed in the dark",
        body: "A restaurant this dark will flatten a mural proofed under studio light. For a commissioned installation, colour should be checked on physical proofs in the room's own lighting — level, angle and temperature — because a black ground that is one step too light stops being lacquer and starts being grey.",
      },
    ],
  },

  productionNote: {
    title: "A note on what this is",
    body:
      "The restaurant is invented and these are concept visuals — the method is real, the venue is not. For an actual commission, the mural is rebuilt as print-ready artwork against:",
    points: [
      "Final wall measurements, panel widths and seam positions",
      "Banquette heights, table lines and every seated sightline",
      "Sockets, service panels, switch plates and extract grilles",
      "The room's own lighting — level, angle and colour temperature",
      "A substrate specified for a kitchen environment: grease, heat and cleaning",
      "Approved physical proofs, viewed in the room at service light levels",
    ],
  },

  ask: {
    heading: "Send us your dining room.",
    body:
      "A render, a plan, or a photograph taken from the host stand. We'll tell you what we think the room is about — and show you one wall that proves it. No cost, no obligation.",
  },
};
