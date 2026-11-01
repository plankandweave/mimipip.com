import type { Project } from "./types";

/**
 * Concept Study 07 — hospitality, single venue.
 *
 * Beside Chengdu After Dark this is the same building type making the
 * opposite argument. Chengdu is one artwork asked to hold one room from
 * every seat; this is four artworks in a fixed order, none of which is
 * expected to carry the room alone.
 *
 * The first four chapters are the artwork sheets rather than room renders.
 * That is deliberate and it is the honest way round for this study: the
 * whole claim is that the four sheets are one story, and a photograph of a
 * room flattens four separate drawings into one picture of a restaurant.
 * The room view is the fifth chapter and the cover — it comes last because
 * it is the proof, not the argument, and it is the one frame in which all
 * four walls can be checked against each other at once.
 *
 * Palette hexes are sampled off the mood board's swatch row, not chosen and
 * not taken off the wallpapers. Sampling the artwork instead gives values
 * several steps lighter — the sheets are mostly empty paper — which would
 * have described the printed result while quietly renaming the intent.
 */
export const tidalSilence: Project = {
  slug: "tidal-silence",
  kind: "concept",
  theme: "calm",
  segments: ["hospitality"],

  client: "A Japanese restaurant",
  title: "Tidal Silence",
  standfirst:
    "Four walls that belong to the same story without repeating the same artwork. Winter sea, handmade paper and a single ink gesture — a wall journey with a beginning, an opening, a change of rhythm and a close.",
  facts: [
    { label: "Sector", value: "Hospitality — restaurant" },
    { label: "Setting", value: "A contemporary Japanese dining room" },
    { label: "Walls shown", value: "4 walls, 4 artworks" },
    { label: "Through-line", value: "Stillness, and what breaks it" },
  ],

  cover: "tidal-silence/dining-room-curated.jpg",

  brief: {
    intro:
      "A contemporary Japanese restaurant with four walls that had to belong to one another. The default answer is coordination: the same pattern, repeated, so the room reads as finished. That produces a matched set, and a matched set is not a journey — by the second wall a diner has already seen everything the room intends to say.",
    requirements: [
      "Read as unmistakably Japanese without lanterns, red suns, fans or any conventional decorative motif.",
      "Give each wall its own emotional role rather than one artwork repeated four times.",
      "Hold together as a single palette and a single hand, so four different drawings still read as one commission.",
      "Survive being encountered out of order, from different distances and in different frames of mind.",
      "Leave enough empty surface that the room stays quiet at full occupancy.",
    ],
  },

  interpretation: [
    "We did not begin with Japanese symbols. We began with a feeling: the stillness of the sea in winter, the grain of handmade paper, a branch seen through fog, ink moving across a surface, and the quiet space that exists between one mark and the next.",
    "From that came the mood board — washi-like paper, mineral stone, diluted charcoal, pale lichen and the faintest trace of smoked sakura. It fixed more than colour. It set the material language, the weight of the brush marks, the amount of empty space and the pace at which the wall story would unfold.",
    "The organising decision was to give each wall a different job rather than a different pattern. One introduces the story. One allows it to open up. One changes its rhythm. One brings it quietly to a close. The walls do not match each other; they answer each other.",
    "Three of the four are landscapes at different depths of field, so the ink wall is the only true event in the room. That is what makes it an event. A second gesture anywhere else in the building would have cost the first one everything.",
  ],

  palette: {
    intro:
      "Five colours, sampled off the mood board's own swatch row rather than chosen in advance, and what each is asked to do in a room where nothing is allowed to be loud.",
    entries: [
      {
        name: "Winter Washi",
        hex: "#BEB4A8",
        purpose:
          "The paper ground, and the largest area in every one of the four walls. Warm rather than white — a clean white would have made the whole scheme read as printed rather than made.",
      },
      {
        name: "Sea Fog",
        hex: "#515451",
        purpose:
          "The mineral grey of wet stone, and the darkest thing on the board apart from the ink. It carries almost all the drawing — but diluted heavily, so that on the wall it arrives as mist rather than as mass. Detail should be found, not announced.",
      },
      {
        name: "Smoked Sakura",
        hex: "#95827C",
        purpose:
          "A muted, smoky rose, closer to weathered plaster than to blossom. Used as weather rather than as flower: it appears in the sky of one wall and as a trace in another, and never as a field.",
      },
      {
        name: "Soot Ink",
        hex: "#262625",
        purpose:
          "Near-black, and the only true dark in the collection. It draws the winter branches at hairline weight, and once — on the third wall — it is allowed off the leash to become the whole subject.",
      },
      {
        name: "Pale Lichen",
        hex: "#88867C",
        purpose:
          "A soft sage, taken from the lichen on the board itself. On the wall it is held back almost to nothing: it sits inside the fog layers to stop the neutrals turning pink under warm restaurant light.",
      },
    ],
    note:
      "These are the swatch values, not the wall values. On the walls every one of them is held far lighter — the artwork is mostly empty paper, and Soot Ink at full strength appears exactly once, on the third wall. That gap between the palette and the printed sheet is the scheme: the same five colours run through all four walls, and what changes is how much of each is allowed out. Density, not palette, is what gives the room its sequence.",
  },

  motifs: {
    intro:
      "Four elements, recombined at different scales and from different directions. Nothing is drawn twice the same way, which is what keeps four walls from reading as a set.",
    entries: [
      {
        name: "Winter branches",
        description:
          "Bare, budded branches at hairline weight, entering from the edge and stopping. They arrive from a different corner on every wall they appear on — which is how a returning motif reads as memory rather than as repetition.",
        image: "tidal-silence/first-breath-artwork.jpg",
      },
      {
        name: "The tidal flat",
        description:
          "Water, stone and sediment merging into one another, drawn as fine shoreline markings that follow the water's own logic. It gives scale without contrast, which is the only way a landscape this large stays quiet.",
        image: "tidal-silence/distant-shore-artwork.jpg",
      },
      {
        name: "The ink gesture",
        description:
          "A single confident brush stroke, dense in places and dry, broken and unfinished in others. Its imperfections are the content. It is the one mark in the collection that was not allowed to be corrected.",
        image: "tidal-silence/sumi-passage-artwork.jpg",
      },
      {
        name: "Fog",
        description:
          "Soft layers that sit low and dissolve edges. Fog is doing structural work here: it is what lets a mountain, a shoreline and an empty sky share a wall without any of them needing an outline.",
      },
    ],
  },

  chapters: [
    {
      space: "Entry wall",
      title: "First Breath",
      rationale:
        "The first wall is intentionally quiet. Fine winter branches enter from the edges and most of the surface is left open, with a soft layer of fog near the base that almost disappears into the parchment ground. This wall does not try to impress immediately — it slows the eye down, and it sets the ceiling for how loud anything later in the room is allowed to be.",
      curated: "tidal-silence/first-breath-artwork.jpg",
      alt: "Pale washi-toned wallpaper with budded winter branches entering from the upper left and soft grey fog banks along the lower edge",
      aspect: "3/2",
    },
    {
      space: "Principal dining wall",
      title: "The Distant Shore",
      rationale:
        "The principal wall opens into an expansive tidal landscape: mountains through layers of mist, water and sediment merging, fine shoreline markings moving slowly across the surface. This is the most immersive chapter and the widest — shown here at its own 2:1 proportions rather than cropped, because the width is the argument. It holds the room without overpowering it, which is a function of value range rather than size: nothing in it is darker than mid-grey.",
      curated: "tidal-silence/distant-shore-artwork.jpg",
      alt: "Wide misted tidal landscape with layered mountains, pale water channels and a single branch entering from the upper right",
      aspect: "2/1",
    },
    {
      space: "Passage wall",
      title: "Sumi Passage",
      rationale:
        "The third wall changes the rhythm completely. A single black ink gesture cuts through the quietness of the earlier walls — dense in places, dry and broken in others, its edges left imperfect. This is not another landscape. It is the moment between landscapes: a pause, a shift and a release. It is placed where people move rather than sit, because it is the one wall in the building that does not reward ninety minutes of looking.",
      curated: "tidal-silence/sumi-passage-artwork.jpg",
      alt: "Bold diagonal black sumi ink brushstroke with spattered edges across a pale mottled washi ground",
      aspect: "3/2",
    },
    {
      space: "Closing wall",
      title: "Quiet Return",
      rationale:
        "The final wall returns to stillness without repeating where the story began. Smoked blush moves through the upper surface, winter branches enter from a different direction, and circular tidal lines gather below. It feels familiar without being the same. The story has returned to silence, but the silence now carries everything that came before it.",
      curated: "tidal-silence/quiet-return-artwork.jpg",
      alt: "Soft blush sky with winter branches from the upper left above curving pale tidal channels and sediment banks",
      aspect: "3/2",
    },
    {
      space: "The dining room",
      title: "All Four, At Once",
      rationale:
        "The four walls in one frame, which is the only view that tests the argument. First Breath holds the left return, The Distant Shore runs behind the low tables, Sumi Passage takes the tall pier on the right, and Quiet Return is visible through the doorway at the far end. Nothing repeats, nothing matches, and the room still reads as one commission — because the ground tone, the value range and the hand are shared even though no two drawings are. This is also where the restraint becomes measurable: the plaster, the stone counter, the timber and the floor are all doing nothing, and that is what leaves the walls room to speak.",
      curated: "tidal-silence/dining-room-curated.jpg",
      alt: "Japanese restaurant dining room at dusk with low tables and floor cushions, misted landscape mural behind, a bold ink brushstroke on the right-hand pier and a further mural glimpsed through the doorway",
      aspect: "3/2",
    },
  ],

  wallHierarchy: {
    intro:
      "Four artworks in one restaurant sounds like a lot of wall. It is only workable because the volumes were fixed before anything was drawn, and because three of the four are deliberately near-empty.",
    levels: [
      { level: "Full voice", purpose: "The principal dining wall — the tidal landscape, the only wall meant to hold the room.", share: 25 },
      { level: "A change of rhythm", purpose: "The passage wall — one ink gesture, seen in movement.", share: 10 },
      { level: "A murmur", purpose: "The entry and closing walls — mostly empty paper, read at the start and end of a visit.", share: 20 },
      { level: "Silent", purpose: "Bar back, kitchen face, service walls, ceilings and every joinery face. Plaster, stone and timber, nothing applied.", share: 45 },
    ],
    note:
      "Close to half of this restaurant has nothing on it, and two of the four artworks are three-quarters empty paper. Four walls can only speak as one if most of them are whispering.",
  },

  process: {
    intro: "How the collection was arrived at, in the order it actually happened.",
    steps: [
      {
        title: "A feeling before a motif",
        body: "We started from stillness rather than from imagery: the sea in winter, handmade paper, a branch through fog, and the space between one mark and the next. No decorative Japanese motif was on the table at any point, because the moment one is drawn the room stops being about the food.",
      },
      {
        title: "The mood board",
        body: "Washi, mineral stone, diluted charcoal, pale lichen and smoked sakura, assembled physically. It set the material language, the weight of the brush marks and the amount of empty space — and it named the five colours the four walls would share.",
        image: "tidal-silence/mood-board.jpg",
      },
      {
        title: "Four roles, then four drawings",
        body: "Each wall was assigned its job — introduce, open, change, close — before anything was drawn. Composition followed the role. The ink wall exists because the sequence needed a break at that point, not because a brushstroke is a good idea in a Japanese restaurant.",
      },
      {
        title: "Checked as a sequence",
        body: "The four sheets were reviewed side by side and in walking order rather than one at a time. That is where the density decisions were made: the entry wall was emptied further, and the blush on the closing wall was pulled back so it read as a return rather than a repeat.",
      },
    ],
  },

  productionNote: {
    title: "A note on what this is",
    body:
      "The restaurant is invented and these are concept visuals — the method is real, the venue is not. For an actual commission, each wall is rebuilt as print-ready artwork against:",
    points: [
      "Final wall measurements, panel widths and seam positions",
      "The order the walls are actually encountered in, which decides which artwork goes where",
      "Seated sightlines, banquette heights and table lines",
      "Sockets, service panels, switch plates and grilles",
      "The room's own lighting — a palette this close in value shifts visibly under warm light",
      "Approved physical proofs, viewed in the room at service light levels",
    ],
  },

  // Five chapters, four walls — the fifth is the room they are in, and the
  // default heading would have counted it as a wall.
  journeyHeading: "4 walls, one argument. And the room they share.",

  ask: {
    heading: "Send us your dining room.",
    body:
      "A render, a plan, or a photograph taken from the door. We'll tell you what we think the room is about — and show you the wall journey that proves it. No cost, no obligation.",
  },
};
