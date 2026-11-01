import type { Project } from "./types";

/**
 * Concept Study 04 — education.
 *
 * The argument here is different from the other three. A workplace study
 * sells identity, a hospital study sells restraint; this one sells belonging
 * under pressure — the specific weight carried by a student arriving from a
 * smaller town into an institution built to feel large. The Devanagari अ
 * (the first letter, "the first sound") recurring quietly through the
 * chapters is the mechanism: never typography, never a slogan, just a mark
 * that says the beginning matters.
 *
 * Source imagery for this project arrived as twelve plain|curated diptychs
 * in single frames rather than as matched file pairs — split down the middle
 * before upload (see the staging step in project history), so the object
 * keys below follow the same -plain/-curated convention as every other
 * project despite the different source format.
 */
export const rootedRoutes: Project = {
  slug: "rooted-routes",
  kind: "concept",
  theme: "warm",
  segments: ["education"],

  client: "A college campus",
  title: "Where You Begin Shapes What You Build",
  standfirst:
    "Education is not only what happens inside a classroom. It is also what a young person feels while finding their way through a corridor, waiting for a lift, or walking back to their hostel room at the end of a long day.",
  facts: [
    { label: "Sector", value: "Higher education" },
    { label: "Setting", value: "Maharashtra" },
    { label: "Walls shown", value: "12 matched viewpoints" },
    { label: "Origin mark", value: "The Devanagari अ" },
  ],

  cover: "rooted-routes/reception-curated.jpg",

  brief: {
    intro:
      "For many students, especially those arriving from smaller towns and rural Maharashtra, college is their first real step into a larger world. The walls needed to acknowledge that moment — without becoming generic urban décor or motivational posters.",
    requirements: [
      "Make students feel rooted in where they come from, while quietly showing them how far they can go.",
      "Draw on Maharashtra's real landscape — basalt stone, monsoon skies, red earth, field patterns — translated, not used literally as regional symbols.",
      "Give every space along the daily route its own emotional job, from arrival to hostel room.",
      "Carry one quiet origin mark through the campus without it ever reading as a slogan.",
      "Feel contemporary enough for a future-facing institution, familiar enough to feel like home.",
    ],
  },

  interpretation: [
    "A subtle Devanagari form appears as an origin marker in selected spaces. It is not used as typography or a slogan. It works as a visual reminder of the first sound, the first step, the beginning of a journey.",
    "Around it, lines become routes, forms gather into communities, and landscapes gradually open into possibility. The creative language draws from Maharashtra's real landscape and spirit — basalt stone, monsoon skies, red earth, field patterns, growing forms, pathways, hands that make, horizons that open out — translated into a modern visual system rather than used as literal regional symbols.",
    "The story moves across the campus in chapters: from roots to routes, from self-belief to contribution, from the place a student comes from to the future they have the power to shape.",
  ],

  palette: {
    intro: "Drawn from the land itself, not from a brand board.",
    entries: [
      { name: "Basalt Grey", hex: "#5B5A52", purpose: "The weight and steadiness of the Deccan stone underfoot." },
      { name: "Red Earth", hex: "#B45B3A", purpose: "Roots — where a student comes from." },
      { name: "Monsoon Sky", hex: "#5E7A8C", purpose: "The horizon opening outward." },
      { name: "Field Gold", hex: "#D9A441", purpose: "Growth, harvest, arrival — used at moments of pride." },
      { name: "Growing Green", hex: "#6E8C5E", purpose: "New forms, new possibility." },
      { name: "Chalk Stone", hex: "#EFE9DD", purpose: "Breathing room, and the ground every colour sits on." },
    ],
    note:
      "Warmth is constant, but scale changes: expansive and layered at arrival, quiet and close in the dormitory passage, almost silent at the library threshold.",
  },

  motifs: {
    intro: "One origin mark, one landscape grammar, applied differently by what each space asks of a student.",
    entries: [
      { name: "The अ mark", description: "The first letter, the first step — never typography, never a slogan." },
      { name: "Basalt contour", description: "The land itself, drawn as a steady horizontal ground." },
      { name: "Field pathway", description: "A route through cultivated land — becomes literal circulation in corridors." },
      { name: "The growing form", description: "A sapling, a branch, a rising line — progress without a graph." },
      { name: "Hands that make", description: "Craft and effort, drawn rather than photographed." },
    ],
  },

  buildings: {
    intro:
      "Not four buildings but four movements through one day — arrival, learning, belonging, rest — each with its own emotional register.",
    entries: [
      {
        name: "Arrival",
        subtitle: "Trust, pride and the first step",
        body: "Reception and admissions tell parents and students that this is an institution with purpose, history and ambition — a moment the walls should meet with the same weight the family brings to it.",
        draws: ["The अ origin mark", "Monsoon sky", "Field pathway opening outward"],
      },
      {
        name: "Structure",
        subtitle: "Academic corridors and mentorship",
        body: "Pathways, ideas, movement and layered forms make everyday circulation feel like progress — every class, conversation and experiment part of something being built.",
        draws: ["Layered linework", "Hands that make", "Growing forms"],
      },
      {
        name: "Belonging",
        subtitle: "Shared spaces and community life",
        body: "A more energetic palette reflects exchange — friendships, different viewpoints, collaboration, the confidence that comes from being part of a larger community.",
        draws: ["Field gold", "Circular, gathering compositions", "Growing green"],
      },
      {
        name: "Return",
        subtitle: "Dormitory, lift lobby and library",
        body: "The softer close of the day: a walk back to oneself, a shared meeting point crossed daily, and a threshold where the story slows down into concentration and reflection.",
        draws: ["Basalt contour", "The अ mark, quieter", "Chalk stone breathing room"],
      },
    ],
  },

  chapters: [
    {
      space: "Main reception",
      title: "The First Step",
      rationale:
        "The origin mark appears here in its fullest form, rising from a landscape of fields and hills. This is where a family arrives, sometimes from a very small town, into an institution that has to feel like it was built with purpose. The wall does that work before anyone speaks.",
      plain: "rooted-routes/reception-plain.jpg",
      curated: "rooted-routes/reception-curated.jpg",
      alt: "College reception with the origin mark rising from a landscape mural",
    },
    {
      space: "Admissions office",
      title: "Trust, Quietly Stated",
      rationale:
        "A smaller, calmer room for the conversation that decides a family's biggest decision. The mural is muted — a single sapling against soft hills — because this space needs to reassure, not impress.",
      plain: "rooted-routes/admissions-office-plain.jpg",
      curated: "rooted-routes/admissions-office-curated.jpg",
      alt: "Admissions counselling room with a soft sapling-and-hills mural",
    },
    {
      space: "Mentorship room",
      title: "Hands That Make",
      rationale:
        "A meeting room reads as a small studio: the illustrated wall shows hands planting, a path climbing in steps, a community built stage by stage. Not a motivational poster — a picture of what building something actually looks like.",
      plain: "rooted-routes/mentorship-room-plain.jpg",
      curated: "rooted-routes/mentorship-room-curated.jpg",
      alt: "Mentorship room with an illustrated mural of hands, steps and community",
    },
    {
      space: "Academic corridor",
      title: "Progress, Made Visible",
      rationale:
        "The visual language becomes more structured here: pathways, layered forms, ideas in motion. Everyday circulation between classes starts to feel like part of something being built, not just a walk between rooms.",
      plain: "rooted-routes/academic-corridor-plain.jpg",
      curated: "rooted-routes/academic-corridor-curated.jpg",
      alt: "Academic corridor with a structured technical linework mural",
    },
    {
      space: "Reading hall",
      title: "Rows, and a Horizon",
      rationale:
        "Behind the desks where dozens of students study, the wall opens into calm hills and a wide sky — a horizon to look up at, deliberately unclaimed by anything more specific than possibility.",
      plain: "rooted-routes/reading-hall-plain.jpg",
      curated: "rooted-routes/reading-hall-curated.jpg",
      alt: "Reading hall with rows of desks and a calm hills mural",
    },
    {
      space: "Library lounge",
      title: "A Quieter Room to Read In",
      rationale:
        "Armchairs and low light call for a gentler version of the same landscape — the same hills, held closer, so the room feels private rather than institutional.",
      plain: "rooted-routes/library-lounge-plain.jpg",
      curated: "rooted-routes/library-lounge-curated.jpg",
      alt: "Library lounge with armchairs and a soft landscape mural",
    },
    {
      space: "Cafeteria",
      title: "Where Exchange Happens",
      rationale:
        "The palette turns energetic here — circular, overlapping forms in gold and blue, built from the same grammar but let loose. This is where friendships and different viewpoints actually meet.",
      plain: "rooted-routes/cafeteria-plain.jpg",
      curated: "rooted-routes/cafeteria-curated.jpg",
      alt: "Cafeteria wall with an energetic circular mural above the tables",
    },
    {
      space: "Outdoor walkway",
      title: "Footprints and Horizons",
      rationale:
        "Beside the sports courts, the origin mark sits within a field of movement — waves, footprints, open colour. A wall that keeps pace with people running past it rather than asking them to stop.",
      plain: "rooted-routes/outdoor-walkway-plain.jpg",
      curated: "rooted-routes/outdoor-walkway-curated.jpg",
      alt: "Outdoor walkway beside the sports courts with a bold mural of movement",
    },
    {
      space: "Central atrium",
      title: "A Community, Gathering",
      rationale:
        "The largest composition on campus: hands, steps and a travelling community drawn across a full wall, with the origin mark held quietly within it. Students cross this daily without needing to be told what it means.",
      plain: "rooted-routes/central-atrium-plain.jpg",
      curated: "rooted-routes/central-atrium-curated.jpg",
      alt: "Central atrium with a large narrative mural of a travelling community",
    },
    {
      space: "Dormitory passage",
      title: "The Walk Back to Oneself",
      rationale:
        "A softer chapter. Shared paths, hills, growing forms and a quieter sense of home — the message is not written, but felt: you may have come from somewhere small, but you are not alone, and your journey is moving forward.",
      plain: "rooted-routes/dormitory-passage-plain.jpg",
      curated: "rooted-routes/dormitory-passage-curated.jpg",
      alt: "Dormitory corridor with a quiet mural of hills and growing forms",
    },
    {
      space: "Lift lobby",
      title: "The Meeting Point",
      rationale:
        "Bolder and more collective than anywhere else, with the origin mark sitting inside a field of movement and possibility. Students cross this space every single day — it becomes a small, repeated reminder that beginnings matter.",
      plain: "rooted-routes/lift-lobby-plain.jpg",
      curated: "rooted-routes/lift-lobby-curated.jpg",
      alt: "Lift lobby with the origin mark inside a bold collective mural",
    },
    {
      space: "Library threshold",
      title: "Room to Think",
      rationale:
        "The story slows all the way down. Calmer colours, more spacious forms, contemplative imagery — a wall about concentration and the private work of becoming capable. It creates room to think, rather than demanding attention.",
      plain: "rooted-routes/library-threshold-plain.jpg",
      curated: "rooted-routes/library-threshold-curated.jpg",
      alt: "Library threshold with a calm, spacious mural either side of the doors",
    },
  ],

  process: {
    intro: "Reading the land before drawing a single line.",
    steps: [
      {
        title: "Where roots come from",
        body: "Basalt stone, monsoon skies, red earth and field patterns are studied first — not as decoration, but as the actual visual grammar the campus is built from.",
      },
      {
        title: "The origin mark",
        body: "The Devanagari अ is developed as a recurring but never literal presence — tested at scale against real elevations until it reads as a feeling, not a letter someone has to notice.",
      },
      {
        title: "One grammar, twelve emotional jobs",
        body: "The same lines, forms and palette are recomposed per space — expansive at arrival, energetic in shared spaces, quiet in the dormitory and at the library threshold — so the campus reads as one story rather than twelve murals.",
      },
      {
        title: "Composed, panelled, installed",
        body: "Each mural is built at the exact dimensions of its wall, divided into production panels and colour-checked against approved proofs before installation.",
      },
    ],
  },

  productionNote: {
    title: "A note on what this is",
    body:
      "The campus is invented and these are concept visuals — the method is real, the institution is not. For an actual project, every mural is rebuilt as print-ready artwork against:",
    points: [
      "Final wall measurements",
      "Doors, sockets, screens and architectural interruptions",
      "Furniture and seating positions",
      "Viewing distance and student sightlines",
      "Panel width and seam locations",
      "Approved physical colour proofs",
    ],
  },

  ask: {
    heading: "Send us your campus.",
    body:
      "A floor plan, a set of renders, or a photograph of the wall students see first. We'll show you where the story could begin — and what it would feel like to walk it every day.",
  },
};
