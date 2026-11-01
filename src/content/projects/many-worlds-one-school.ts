import type { Project } from "./types";

/**
 * Education concept study — an international K–12 school in Bengaluru.
 *
 * Main student and parent-facing spaces lead the story. The quieter support
 * spaces follow, so the case study proves that a campus system can carry both
 * public confidence and everyday care without treating every wall alike.
 */
export const manyWorldsOneSchool: Project = {
  slug: "many-worlds-one-school",
  kind: "concept",
  theme: "bright",
  segments: ["education"],

  client: "An international school",
  title: "Many Worlds, One School",
  standfirst:
    "A Bengaluru K–12 campus where global-minded learning begins with a strong sense of place — one visual language, adjusted from a child's first classroom to the rooms where adults plan and listen.",
  facts: [
    { label: "School", value: "International K–12" },
    { label: "Setting", value: "Bengaluru" },
    { label: "Spaces shown", value: "10 matched viewpoints" },
    { label: "Visual idea", value: "Routes that meet and grow" },
  ],

  cover: "many-worlds-one-school/main-arrival-curated.jpg",

  brief: {
    intro:
      "An international school can easily look international in the most generic way: flags, maps, quotations and borrowed symbols of the world. This campus needed a more meaningful answer — an environment that supports curiosity, belonging and many ways of thinking while remaining unmistakably rooted in Bengaluru.",
    requirements: [
      "Create one recognisable campus language without repeating one mural across every age group.",
      "Let local landscape and climate provide the visual ground, without turning Bengaluru into a set of landmarks.",
      "Make early years feel generous and discoverable, senior spaces more structured, and support spaces quieter.",
      "Give inquiry, making, performance and social life equal status alongside conventional academic spaces.",
      "Design for real walls, furniture, sightlines and daily circulation rather than isolated presentation renders.",
    ],
  },

  interpretation: [
    "The rain tree becomes the campus's shared canopy: not a logo and not a literal botanical illustration, but a branching structure under which different routes can meet.",
    "Seeds, leaves, intersecting paths and modular grids form a flexible grammar. The organic elements carry growth and belonging; the constructed grid carries inquiry, making and the confidence to test an idea.",
    "The balance changes by space. Early years receives larger and softer forms. Corridors gain direction. The maker lab becomes precise. The library, wellbeing room and faculty lounge leave more ground untouched, because attention sometimes needs less visual volume, not more.",
  ],

  palette: {
    intro: "Bengaluru's canopy, earth, flowering season and softened morning light — interpreted, never illustrated literally.",
    entries: [
      { name: "Rain-tree Green", hex: "#314E3C", purpose: "The shared canopy and the steadiness of place." },
      { name: "Laterite", hex: "#A85F42", purpose: "Warmth, making and material intelligence." },
      { name: "Soft Indigo", hex: "#4B6280", purpose: "Structure, thought and the routes between ideas." },
      { name: "Jacaranda", hex: "#82739B", purpose: "Moments of imagination and performance." },
      { name: "Mineral Blue", hex: "#A7BECC", purpose: "Air, pause and a wider field of possibility." },
      { name: "Warm Chalk", hex: "#EDE5D6", purpose: "The quiet ground that keeps the system calm." },
    ],
    note:
      "Colour becomes more social in gathering spaces and deliberately recedes in rooms for reading, counselling and adult concentration.",
  },

  motifs: {
    intro: "One grammar that can grow with a child and change register without losing its identity.",
    entries: [
      { name: "The shared canopy", description: "Rain-tree branches create shelter, connection and a sense of common ground." },
      { name: "Routes", description: "Fine paths split, cross and rejoin — different ways of arriving at understanding." },
      { name: "Seeds and leaves", description: "Potential shown as a living process rather than a finished achievement." },
      { name: "The making grid", description: "A modular structure that becomes more precise in older and project-based spaces." },
      { name: "Open ground", description: "Unprinted breathing room used as deliberately as colour, especially where focus and care matter." },
    ],
  },

  buildingLabel: "Campus movements",
  buildings: {
    intro:
      "The presentation begins with the spaces that define the school publicly, then moves toward the less visible rooms that sustain it every day.",
    entries: [
      {
        name: "Arrive",
        subtitle: "Trust, orientation and the first reading of the school",
        body: "Reception gives families the whole proposition at once: many routes, one generous canopy, and an institution confident enough to be local and outward-looking together.",
        draws: ["Full canopy", "Intersecting routes", "A broad, welcoming scale"],
      },
      {
        name: "Learn",
        subtitle: "A language that changes as students grow",
        body: "Early years, primary inquiry, secondary circulation and the library share one grammar, but its scale, rhythm and density change with the emotional and cognitive job of each space.",
        draws: ["Child-scale seed forms", "Inquiry paths", "Quiet horizons"],
      },
      {
        name: "Make and gather",
        subtitle: "Ideas become visible and communities take shape",
        body: "The maker lab, performance foyer and dining commons carry more structure, rhythm and overlap — places where private thought becomes something shared.",
        draws: ["Modular grids", "Ensemble arcs", "Gathering circles"],
      },
      {
        name: "Support",
        subtitle: "The rooms that make learning possible",
        body: "Wellbeing and faculty spaces use the same identity at a lower volume, acknowledging that listening, recovery and preparation are central parts of school life.",
        draws: ["Open ground", "A quiet canopy", "Resolved routes"],
      },
    ],
  },

  chapters: [
    {
      space: "Main arrival atrium",
      title: "Many Routes, One Canopy",
      rationale:
        "The largest wall carries the complete visual argument. Bengaluru's rain-tree canopy holds intersecting routes, seeds and making grids together, giving families a first impression of a school where difference belongs inside one community.",
      plain: "many-worlds-one-school/main-arrival-plain.jpg",
      curated: "many-worlds-one-school/main-arrival-curated.jpg",
      alt: "International school arrival atrium with a rain-tree and intersecting-routes mural",
    },
    {
      space: "Early-years learning commons",
      title: "The First Questions Are Large",
      rationale:
        "Forms become larger, softer and closer to a child's scale. Branches, leaves and simple routes turn the wall into an invitation to notice and explore without becoming cartoon scenery.",
      plain: "many-worlds-one-school/early-years-commons-plain.jpg",
      curated: "many-worlds-one-school/early-years-commons-curated.jpg",
      alt: "Early-years learning commons with a gentle large-scale botanical and pathways mural",
    },
    {
      space: "Primary inquiry studio",
      title: "Questions Find Their Routes",
      rationale:
        "Branching pathways split and reconnect around modular fragments. The composition mirrors inquiry itself: a question can take several directions before the pieces begin to form a whole.",
      plain: "many-worlds-one-school/primary-inquiry-plain.jpg",
      curated: "many-worlds-one-school/primary-inquiry-curated.jpg",
      alt: "Primary inquiry studio with a branching pathways and modular forms mural",
    },
    {
      space: "Secondary academic corridor",
      title: "Movement With Direction",
      rationale:
        "The campus language stretches into a long, directional composition. Routes cross, grids become more disciplined and the canopy keeps the passage connected to the living campus outside.",
      plain: "many-worlds-one-school/secondary-corridor-plain.jpg",
      curated: "many-worlds-one-school/secondary-corridor-curated.jpg",
      alt: "Secondary-school corridor with a long directional rain-tree and grid mural",
    },
    {
      space: "Library and media centre",
      title: "A Wider Quiet",
      rationale:
        "The visual system slows down. A low canopy and sparse routes sit inside a large mineral-blue field, giving the room identity without competing with the private act of reading.",
      plain: "many-worlds-one-school/library-media-plain.jpg",
      curated: "many-worlds-one-school/library-media-curated.jpg",
      alt: "School library with a quiet rain-tree horizon mural behind the reading area",
    },
    {
      space: "Maker lab",
      title: "Ideas Become Structures",
      rationale:
        "Organic routes resolve into construction grids, nodes and prototypes. The wall connects observation to making — not by illustrating tools, but by showing how living systems can become designed ones.",
      plain: "many-worlds-one-school/maker-lab-plain.jpg",
      curated: "many-worlds-one-school/maker-lab-curated.jpg",
      alt: "School maker lab with a structured botanical and modular systems mural",
    },
    {
      space: "Performing arts foyer",
      title: "Many Voices, One Ensemble",
      rationale:
        "Overlapping arcs, branches and gathering forms give the tall foyer a more rhythmic register. It feels collective and anticipatory before the auditorium doors open, without depicting music literally.",
      plain: "many-worlds-one-school/performing-arts-plain.jpg",
      curated: "many-worlds-one-school/performing-arts-curated.jpg",
      alt: "Performing arts foyer with a tall rhythmic canopy and gathering mural",
    },
    {
      space: "Dining commons",
      title: "The School Meets Itself",
      rationale:
        "Circles overlap more freely and the palette warms. Dining is treated as a major social room — where ages, languages and daily stories cross — rather than a leftover service space.",
      plain: "many-worlds-one-school/dining-commons-plain.jpg",
      curated: "many-worlds-one-school/dining-commons-curated.jpg",
      alt: "School dining commons with a warm mural of canopy, circles and crossing routes",
    },
    {
      space: "Student wellbeing room",
      title: "A Room That Does Not Ask Too Much",
      rationale:
        "The quietest wall in the study uses a light canopy, a few slowly moving paths and generous unprinted ground. It belongs to the campus while reducing visual demand for someone who may already be carrying enough.",
      plain: "many-worlds-one-school/wellbeing-room-plain.jpg",
      curated: "many-worlds-one-school/wellbeing-room-curated.jpg",
      alt: "Student wellbeing room with a restrained canopy and pathways mural",
    },
    {
      space: "Faculty collaboration lounge",
      title: "Where Many Disciplines Resolve",
      rationale:
        "Branching routes become more measured and settle into a shared grid. The adult expression of the system recognises planning, conversation and teacher wellbeing as part of the school's learning culture.",
      plain: "many-worlds-one-school/faculty-lounge-plain.jpg",
      curated: "many-worlds-one-school/faculty-lounge-curated.jpg",
      alt: "Faculty collaboration room with an adult botanical and modular planning mural",
    },
  ],

  journeyHeading: "10 spaces, one school culture.",
  process: {
    intro: "Start with the school's lived culture, then give it a visual system that can survive scale.",
    steps: [
      {
        title: "Listen before naming the theme",
        body: "Leadership, teachers, students and campus teams are asked where the school already feels most itself — and where the environment currently contradicts that ambition.",
      },
      {
        title: "Map age, energy and attention",
        body: "Every wall is classified by audience, dwell time, viewing distance and emotional load before visual density is decided.",
      },
      {
        title: "Build one adaptable grammar",
        body: "Canopy, routes, seeds, grids and open ground are tested across the real architecture so the identity can change register without breaking apart.",
      },
      {
        title: "Measure, panel and prove",
        body: "Approved compositions are rebuilt to exact elevations, resolved around interruptions, divided for production and physically colour-checked before installation.",
      },
    ],
  },

  productionNote: {
    title: "A concept, presented honestly",
    body:
      "This is an invented international school and every image is a concept visual. The campus strategy and production method are real; an actual programme would be rebuilt around the institution's own people, architecture and operating constraints, including:",
    points: [
      "Age bands, curriculum and safeguarding requirements",
      "Final wall measurements and architectural interruptions",
      "Student, parent, teacher and facilities-team input",
      "Viewing distance, sensory load and accessibility",
      "Washability, durability, fire and material requirements",
      "Panel widths, seam positions and approved physical colour proofs",
    ],
  },

  ask: {
    heading: "Show us where your school begins.",
    body:
      "Send the floor plan and a photograph of the first wall students or families meet. We will identify the spaces where one coherent campus story can do the most useful work.",
  },
};
