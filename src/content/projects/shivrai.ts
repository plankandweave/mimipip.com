import type { Project } from "./types";

/** Concept study for an imagined Maharashtra leadership office. */
export const shivrai: Project = {
  slug: "shivrai",
  kind: "concept",
  theme: "warm",
  segments: ["workplaces"],

  client: "A Maharashtra leadership office · concept study",
  title: "Shivrai",
  standfirst:
    "A visual identity for a Maharashtra leadership office — courage, regional pride and forward movement, carried on the walls rather than announced on them.",
  facts: [
    { label: "Sector", value: "Leadership office" },
    { label: "Region", value: "Maharashtra" },
    { label: "Scope", value: "Arrival, waiting and leadership spaces" },
    { label: "Artworks", value: "Three original concept artworks" },
  ],

  cover: "shivrai/reception-bhagwa.jpg",

  brief: {
    intro:
      "A leadership office has a public role beyond its furniture and finishes. It receives people seeking direction, support, reassurance and action. The walls had to meet that, without turning the building into a monument.",
    requirements: [
      "Give arrival, waiting and leadership spaces a distinctive emotional presence.",
      "Draw on a cultural reference with real resonance in Maharashtra — not generic corporate art.",
      "Read as contemporary architecture, not as a museum or a memorabilia room.",
      "Give each space its own emotional job while staying one recognisable system.",
      "Carry weight without shouting: atmosphere, not announcement.",
    ],
  },

  interpretation: [
    "This was not conceived as political decoration. It was conceived as an atmosphere of courage, regional pride, responsibility and forward movement.",
    "Chhatrapati Shivaji Maharaj is used as a cultural reference with deep emotional resonance in Maharashtra — not as nostalgia, but as a living language of courage, leadership and collective purpose.",
    "The visual language balances heritage with a contemporary setting. Rather than reproducing historical imagery in a conventional or museum-like way, the artwork uses expressive brushwork and restrained neutrals. It makes history feel present-tense.",
    "Each wall was designed as an individual moment, while remaining part of one recognisable visual system.",
  ],

  palette: {
    intro:
      "Drawn from the subject itself rather than from a brand board — standards, stone, armour and weather.",
    entries: [
      { name: "Saffron", hex: "#E8622A", purpose: "The standard. Used sparingly, and always as the moment the eye lands on." },
      { name: "Parchment", hex: "#EFE6D4", purpose: "The ground everything else is drawn on." },
      { name: "Aged Stone", hex: "#C3B7A4", purpose: "Fort walls and masonry — warmth without brightness." },
      { name: "Weathered Steel", hex: "#8A8D91", purpose: "Armour and blade; the cool note that keeps saffron from turning decorative." },
      { name: "Monsoon Grey", hex: "#6E7B88", purpose: "Sky and distance — the depth behind the figure." },
      { name: "Charcoal", hex: "#2E2B28", purpose: "Line and weight, held back for the darkest accents only." },
    ],
    note:
      "The artwork uses movement rather than ornament: the horse, the wind, the flag and the brushstroke all carry the eye forward. Nothing in the palette is there to fill space.",
  },

  motifs: {
    intro:
      "Three original artworks, each composed for a specific kind of room. All three are also available as designs in their own right.",
    entries: [
      {
        name: "Chhatrapati Shivaji Maharaj",
        description:
          "Leadership, momentum and resolve. Composed rather than charging — the register for a principal reception or arrival wall.",
        image: "shivrai/art-shivaji-maharaj.jpg",
        href: "/products/maharaja-s-charge",
      },
      {
        name: "Shivrai",
        description:
          "Personal courage, decisiveness and command. The most direct of the three, drawn for a leadership cabin, boardroom or inner office.",
        image: "shivrai/art-shivrai.jpg",
        href: "/products/maharaj-s-charge",
      },
      {
        name: "Bhagwa Dhwaj",
        description:
          "Collective spirit, conviction and a larger cause. A crowd, a standard and a fort in the haze — built for a public-facing entry or waiting area.",
        image: "shivrai/art-bhagwa-dhwaj.jpg",
        href: "/products/maharaj-s-banner",
      },
    ],
  },

  chapters: [
    {
      space: "Public reception",
      title: "A Larger Cause",
      rationale:
        "The Bhagwa Dhwaj at architectural scale, behind the desk where everyone who enters is received. A crowd rather than a portrait: the wall speaks about collective conviction, not about a single person. It does not sit on the wall as framed art — it becomes the room's emotional centre, which is the whole point.",
      curated: "shivrai/reception-bhagwa.jpg",
      alt: "Design visualisation — Bhagwa Dhwaj mural across a reception wall",
      aspect: "3/2",
    },
    {
      space: "Leadership cabin & boardroom",
      title: "Decisiveness, Up Close",
      rationale:
        "Shivrai in motion, in the room where decisions actually get made. Quieter ground, warmer light, a single figure at close range — this is the one wall in the programme designed to be looked at by a handful of people rather than by everyone.",
      curated: "shivrai/boardroom-shivrai.jpg",
      alt: "Design visualisation — Shivrai mural in a boardroom",
      aspect: "3/2",
    },
    {
      space: "Entrance foyer",
      title: "Arrival, and Resolve",
      rationale:
        "The most composed of the three artworks, placed where a visitor first crosses the threshold. Momentum held rather than released — the register of an arrival wall, setting the tone before a word is spoken.",
      curated: "shivrai/foyer-maharaj.jpg",
      alt: "Design visualisation — Chhatrapati Shivaji Maharaj mural in an entrance foyer",
      aspect: "3/2",
    },
  ],

  process: {
    intro: "How the concept wall programme is developed.",
    steps: [
      {
        title: "Reading the room's public role",
        body: "Arrival, waiting and leadership spaces each receive people in a different state of mind. The emotional job of each space is agreed before any artwork is drawn.",
      },
      {
        title: "Finding the cultural register",
        body: "The reference is chosen for genuine local resonance, then deliberately pulled away from museum treatment — expressive brushwork and restrained neutrals rather than literal historical reproduction.",
      },
      {
        title: "Three artworks, one system",
        body: "Each wall is composed as its own moment, sharing palette, brush language and sense of movement so the building reads as one programme rather than three separate pictures.",
      },
      {
        title: "Visualise, approve, produce",
        body: "Artwork is set against the real architecture for approval before anything is printed, then built to the measured wall and produced to spec.",
      },
    ],
  },

  productionNote: {
    title: "About the images on this page",
    body:
      "Concept study. Original artwork and imagined room visualisations are shown to explore a Maharashtra leadership office. These are not photographs of an installed project.",
    points: [
      "An imagined leadership office in Maharashtra; no real client is represented.",
      "Room images are concept visualisations, not site photography.",
      "The three artworks are originals, composed for this concept programme.",
    ],
  },

  ask: {
    heading: "A concept for your space.",
    body:
      "If a space you are responsible for has something to say — a history, a region, a purpose — we design and produce the walls that say it. Tell us about the rooms and who walks into them.",
  },
};
