import type { Project } from "./types";

/**
 * Concept Study 01.
 *
 * The client is invented. That is stated on the cover and again in
 * the production note — speculative work is entirely legitimate for a design
 * practice, but only while the reader knows it from the first screen. The
 * upside of saying so plainly is that the study stops being a claim about
 * past work (contestable) and becomes a demonstration of method (not).
 */
export const pulsegrid: Project = {
  slug: "pulsegrid",
  kind: "concept",
  theme: "precise",
  segments: ["workplaces"],

  client: "A corporate office campus",
  title: "Signals Become Systems",
  standfirst:
    "A conceptual workplace narrative for a 4,80,000 sq. ft. technology campus in Bengaluru — nine walls across three buildings, designed as one continuous journey.",
  facts: [
    { label: "Sector", value: "Technology workplace" },
    { label: "Scale", value: "4,80,000 sq. ft." },
    { label: "City", value: "Bengaluru" },
    { label: "Walls", value: "9 across 3 buildings" },
  ],

  cover: "pulsegrid/reception-curated.jpg",

  brief: {
    intro:
      "The client wanted its Bengaluru campus to feel intelligent, global and energetic — but not like another generic technology office.",
    requirements: [
      "Connect three buildings and multiple floors into one journey.",
      "Reflect how separate ideas become intelligent systems.",
      "Give each workplace zone a distinct emotional job.",
      "Carry a recognisable Bengaluru identity without using landmarks.",
      "Avoid circuitry, world maps, slogans and predictable technology graphics.",
    ],
  },

  interpretation: [
    "We began with a single signal.",
    "As people move through the campus, that signal observes, connects, divides, grows, scales and eventually becomes a complete system.",
    "Every mural is different because every space has a different role. What connects them is the same underlying visual grammar.",
  ],

  palette: {
    entries: [
      { name: "Midnight Indigo", hex: "#1B2A5B", purpose: "Depth, intelligence and considered thinking." },
      { name: "Cobalt", hex: "#2B57C4", purpose: "The active signal connecting the complete campus." },
      { name: "Signal Coral", hex: "#E8593F", purpose: "Human decisions and moments of consequence." },
      { name: "Monsoon Lime", hex: "#A8CF3A", purpose: "Experimentation, discovery and new possibilities." },
      { name: "Cloud Grey", hex: "#D8DBDE", purpose: "Visual breathing room and clarity." },
      { name: "Bengaluru Stone", hex: "#C6BBA9", purpose: "Connection to the architecture and local material context." },
    ],
    note:
      "Coral and lime are deliberately controlled. They become more visible in collaborative and social spaces, then almost disappear in leadership and wellness areas.",
  },

  motifs: {
    intro:
      "Five motifs make up the grammar. Every wall in the campus is built from these and nothing else, which is why ten different murals still read as one hand.",
    entries: [
      { name: "The signal point", description: "The smallest unit. One thought, person or input." },
      { name: "Bengaluru lake contours", description: "Slower, organic fields beneath the technical network." },
      { name: "Rain-tree branching", description: "A local natural structure that behaves like an expanding system." },
      { name: "The woven grid", description: "Separate disciplines working together." },
      { name: "The expanding network", description: "The organisation growing from observation to global scale." },
    ],
  },

  // Ordered as a visitor walks the campus, which is NOT the order the source
  // frames were numbered in. "Campus entrance / The First Signal" is absent
  // because no frame exists for it yet; the arc still reads without it.
  chapters: [
    {
      space: "Main reception",
      title: "Many Minds, One System",
      rationale:
        "Separate lines gather behind the reception desk and form the first complete network.",
      // No bare frame for this wall — it renders as a single plate.
      curated: "pulsegrid/reception-curated.jpg",
      alt: "Reception wall mural behind the desk",
    },
    {
      space: "Waiting lounge",
      title: "Patterns of Possibility",
      rationale:
        "Routes remain open and unresolved, because visitors are still observing and considering.",
      plain: "pulsegrid/lounge-plain.jpg",
      curated: "pulsegrid/lounge-curated.jpg",
      alt: "Waiting lounge wall mural behind the curved sofa",
    },
    {
      space: "Lift lobby",
      title: "The Threshold",
      rationale: "Lines rise and divide, preparing people to enter different workplace chapters.",
      plain: "pulsegrid/lift-lobby-plain.jpg",
      curated: "pulsegrid/lift-lobby-curated.jpg",
      alt: "Lift lobby wall mural between the lift banks",
    },
    {
      space: "Collaboration hub",
      title: "Connect",
      rationale:
        "The network becomes energetic and dense, because this is where people actively exchange ideas.",
      plain: "pulsegrid/collab-plain.jpg",
      curated: "pulsegrid/collab-curated.jpg",
      alt: "Collaboration hub wall mural beside the working tables",
    },
    {
      space: "Floor arrival",
      title: "Observe",
      rationale: "Fine details gather around an open centre, expressing attention before conclusions.",
      plain: "pulsegrid/floor-arrival-plain.jpg",
      curated: "pulsegrid/floor-arrival-curated.jpg",
      alt: "Floor arrival wall mural seen through the lift doors",
    },
    {
      space: "Circulation corridor",
      title: "Scale",
      rationale: "The mural becomes more interconnected as people walk forward through the campus.",
      plain: "pulsegrid/corridor-plain.jpg",
      curated: "pulsegrid/corridor-curated.jpg",
      alt: "Curved circulation corridor wall mural",
    },
    {
      space: "Leadership lounge",
      title: "The Long View",
      rationale:
        "Detail gives way to measured horizons and negative space. The wall supports perspective.",
      plain: "pulsegrid/leadership-plain.jpg",
      curated: "pulsegrid/leadership-curated.jpg",
      alt: "Leadership lounge wall mural behind the seating",
    },
    {
      space: "Cafeteria",
      title: "The Social Current",
      rationale:
        "Coral and lime become more expressive as the formal system loosens into conversation.",
      plain: "pulsegrid/cafeteria-plain.jpg",
      curated: "pulsegrid/cafeteria-curated.jpg",
      alt: "Cafeteria wall mural above the dining tables",
    },
    {
      space: "Wellness room",
      title: "The Still Point",
      rationale: "The complete identity is reduced to one line, one pause and one small coral point.",
      plain: "pulsegrid/wellness-plain.jpg",
      curated: "pulsegrid/wellness-curated.jpg",
      alt: "Wellness room wall mural, a single quiet line",
    },
  ],

  process: {
    intro: "These four visuals show that this is not artwork selected from a catalogue.",
    steps: [
      {
        title: "Research and motif development",
        body: "Rain-tree studies, Bengaluru lake contours, woven structures, network diagrams and wall elevations are brought together to establish the project's visual language.",
        image: "pulsegrid/process-research.jpg",
      },
      {
        title: "Palette calibration",
        body: "Colours are tested against the actual architectural materials: pale oak, grey stone, black metal, off-white wall substrate and natural greenery.",
        image: "pulsegrid/process-palette.jpg",
      },
      {
        title: "Digital artwork construction",
        body: "The mural is built digitally in layers. Fine linework, contours, branching structures, washes and individual nodes are composed around the exact wall elevation.",
        image: "pulsegrid/process-artwork.jpg",
      },
      {
        title: "Architectural installation",
        body: "The final artwork is divided into production panels, colour-checked and installed with precise seam alignment. It is designed for the wall's real dimensions, not enlarged arbitrarily.",
      },
    ],
  },

  productionNote: {
    title: "A note on what this is",
    body:
      "The client is invented and these are concept visuals — the method is real, the campus is not. For an actual project, every mural is rebuilt as print-ready artwork against:",
    points: [
      "Final wall measurements",
      "Doors, sockets, screens and architectural interruptions",
      "Furniture positions",
      "Viewing distance",
      "Panel width and seam locations",
      "Approved physical colour proofs",
    ],
  },
};
