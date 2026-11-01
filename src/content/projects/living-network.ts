import type { Project } from "./types";

/**
 * Concept Study 02 — a corporate district rather than a single building.
 *
 * The client is invented and the frames are concept visuals; the cover says so
 * before the imagery does any work, for the same reason PulseGrid's does.
 *
 * This is the study that carries the wall-hierarchy argument. Four buildings
 * and eleven walls make it credible to say half the surfaces should stay
 * quiet — which is the difference between reading as a curator and reading as
 * a supplier, and it is the one claim a competitor cannot copy cheaply.
 */
export const livingNetwork: Project = {
  slug: "living-network",
  kind: "concept",
  theme: "warm",
  segments: ["workplaces"],

  client: "A corporate district",
  title: "The Living Network",
  standfirst:
    "One campus. Four buildings. One visual story — carried from the security gate to the exit road across eleven walls.",
  facts: [
    { label: "Scale", value: "7.5 lakh sq. ft." },
    { label: "Daily users", value: "~7,000 people" },
    { label: "Buildings", value: "Four, plus a shared pavilion" },
    { label: "Walls shown", value: "11 matched viewpoints" },
  ],

  cover: "living-network/arrival-curated.jpg",

  brief: {
    intro:
      "A corporate district of four office buildings around a shared arrival pavilion and landscaped commons, used by around 7,000 people every day — with a food hall, auditorium, client experience centre, innovation spaces, executive floors, a wellness centre and a crèche.",
    requirements: [
      "Carry one visual story across four buildings without repeating it.",
      "Let each building represent a different part of that story.",
      "Help visitors navigate by artwork rather than by signage alone.",
      "Give tenants their own identity without breaking the district's.",
      "Know which walls should stay quiet.",
    ],
  },

  interpretation: [
    "Every organisation begins with one idea. It grows when people, knowledge and possibilities connect.",
    "The entire visual story is built around a single line. At the campus entrance it appears as one simple mark. As people enter, the line collects other lines — landscapes, human gestures, architectural drawings, ideas and cultural references — and becomes a network.",
    "In different buildings the network takes on a different character: more energetic in collaboration spaces, quieter in work areas, warmer in social spaces, more expansive in leadership and innovation floors. The language stays recognisable, but it never becomes repetitive.",
    "At the exit, the network does not close with a logo. The many lines open outward into a larger horizon — people leave carrying ideas and relationships into the world beyond the campus.",
  ],

  palette: {
    intro:
      "Mineral and earth rather than corporate primaries — the district sits in its landscape, and the walls are read against travertine, pale oak and terrazzo every day for years.",
    entries: [
      { name: "Quarry Stone", hex: "#C8B49B", purpose: "The ground note, tuned to the building's own travertine." },
      { name: "Terracotta", hex: "#C1703F", purpose: "Human warmth — conversation, food, gathering." },
      { name: "Clay Rose", hex: "#D79A7E", purpose: "Softness in social and family spaces." },
      { name: "Slate Blue", hex: "#5A6E86", purpose: "Structure and thinking beneath the warmth." },
      { name: "Ochre", hex: "#D9A441", purpose: "Moments of arrival and celebration." },
      { name: "Paper", hex: "#EFE8DC", purpose: "Breathing room — the half of the campus that stays quiet." },
    ],
    note:
      "Colour intensity is spent, not spread. It peaks in the commons and the food hall, and drops almost to nothing on executive floors and in the wellness centre.",
  },

  motifs: {
    intro:
      "Five motifs make the grammar. Every wall in the district is built from these, which is why eleven different murals still read as one hand.",
    entries: [
      { name: "The single line", description: "One idea, before anything has connected to it." },
      { name: "Collected lines", description: "Many journeys — people, industries, languages — arriving in one place." },
      { name: "Human gesture", description: "Abstract figures, drawn rather than photographed, for social spaces." },
      { name: "Architectural fragment", description: "Sketches, grids and elevations, for the making and innovation floors." },
      { name: "The open horizon", description: "The network unclosing — for leadership floors and the exit." },
    ],
  },

  buildings: {
    intro:
      "The district has one master story, but each building represents a different part of it. This is what stops four lobbies looking like four versions of the same mural.",
    entries: [
      {
        name: "Ground",
        subtitle: "Culture, place and identity",
        body: "Connects the campus to its location. The ground-floor lobby is rich and layered; as people rise through the building the artwork becomes quieter and more abstract. No tourist imagery, no predictable monuments.",
        draws: ["Regional architecture", "Indigenous flora", "Material culture", "Maps and historical fragments"],
      },
      {
        name: "Exchange",
        subtitle: "People, communication and collaboration",
        body: "About different people working together. Collaboration floors can be expressive; focus zones and meeting rooms use calmer, reduced versions of the same grammar.",
        draws: ["Intersecting lines", "Layered transparencies", "Handwritten gestures", "Conversation rhythms"],
      },
      {
        name: "Making",
        subtitle: "Process, craft and problem-solving",
        body: "How ideas become real — sketch, system, experiment, material, iteration, outcome. Technical linework and material texture rather than gears, machinery or lightbulbs.",
        draws: ["Sketches", "Systems", "Materials", "Iterations"],
      },
      {
        name: "Horizon",
        subtitle: "Leadership, innovation and the future",
        body: "The most restrained building. The network opens outward rather than growing more complex. It should feel confident and architectural, not decorative.",
        draws: ["Visual breathing space", "Fine lines", "Mineral colour fields", "Abstract horizons"],
      },
    ],
  },

  chapters: [
    {
      space: "Arrival pavilion",
      title: "Many Paths Arrive",
      rationale:
        "The single line becomes many — people, companies, industries, languages, cities. The reception wall is a commissioned artwork at architectural scale, carrying no logos and no company values. It says that many different journeys are entering one shared place.",
      plain: "living-network/arrival-plain.jpg",
      curated: "living-network/arrival-curated.jpg",
      alt: "Arrival pavilion reception wall, a mineral landscape at architectural scale",
    },
    {
      space: "Central atrium",
      title: "Where People Meet",
      rationale:
        "In the commons the network becomes social. Abstract human figures gather along the internal street — conversation, food, movement, ideas passing between people. Warmer and more colourful than anywhere else on the campus.",
      plain: "living-network/atrium-plain.jpg",
      curated: "living-network/atrium-curated.jpg",
      alt: "Central atrium wall with figurative mural along the internal street",
    },
    {
      space: "Food hall",
      title: "The Social Current",
      rationale:
        "Not the reception mural repeated in brighter colours. The original line relaxes into rhythm — table forms, ingredients, local food culture, playful hand-drawn marks. Workplaces are also communities.",
      plain: "living-network/food-hall-plain.jpg",
      curated: "living-network/food-hall-curated.jpg",
      alt: "Food hall wall mural above the dining tables",
    },
    {
      space: "Town hall",
      title: "The Collective Backdrop",
      rationale:
        "A room that exists for the whole company to face one direction. The wall is built to hold a crowd's attention without competing with whoever is speaking in front of it.",
      plain: "living-network/town-hall-plain.jpg",
      curated: "living-network/town-hall-curated.jpg",
      alt: "Town hall auditorium wall mural behind the stage",
    },
    {
      space: "Ground-floor lift lobby",
      title: "The Threshold",
      rationale:
        "Each building's own chapter is introduced here — the first stage of its idea, before anyone has arrived at a floor. Inside the lift itself, only a fragment travels upward.",
      plain: "living-network/lift-lobby-plain.jpg",
      curated: "living-network/lift-lobby-curated.jpg",
      alt: "Ground-floor lift lobby with the building's chapter introduced on the column",
    },
    {
      space: "Workplace reception",
      title: "Where the District Meets the Tenant",
      rationale:
        "The campus story becomes the background and the tenant's culture becomes a new layer on top of it. Different companies belong to the district without losing their individuality.",
      plain: "living-network/tenant-reception-plain.jpg",
      curated: "living-network/tenant-reception-curated.jpg",
      alt: "Curved tenant workplace reception with a soft abstract mural",
    },
    {
      space: "Client lounge",
      title: "Anticipation",
      rationale:
        "Where a visitor waits, and where the walls do the most work. Human silhouettes move through a fine network — enough to reward a long look without demanding one.",
      plain: "living-network/client-lounge-plain.jpg",
      curated: "living-network/client-lounge-curated.jpg",
      alt: "Client lounge wall with human figures moving through a fine network",
    },
    {
      space: "Meeting-room corridor",
      title: "Connective Tissue",
      rationale:
        "A connecting wall, deliberately quieter than a landmark one. It gives identity and orientation to a long run of rooms without shouting down the length of the floor.",
      plain: "living-network/corridor-plain.jpg",
      curated: "living-network/corridor-curated.jpg",
      alt: "Meeting-room corridor with a quiet contour mural along its length",
    },
    {
      space: "Innovation lab",
      title: "Making",
      rationale:
        "The Making chapter at full volume: technical linework, material texture, grids and expressive interventions over a working studio. The wall behaves like the room does.",
      plain: "living-network/innovation-plain.jpg",
      curated: "living-network/innovation-curated.jpg",
      alt: "Innovation lab wall mural above the model-making tables",
    },
    {
      space: "Wellness centre",
      title: "Breathing Space",
      rationale:
        "The narrative reduces to nature, rhythm and space. Almost none of the district's colour survives into this room, which is the point.",
      plain: "living-network/wellness-plain.jpg",
      curated: "living-network/wellness-curated.jpg",
      alt: "Wellness centre wall, the narrative reduced to a quiet rhythm",
    },
    {
      space: "Crèche",
      title: "The Same Story, Told to Someone Smaller",
      rationale:
        "The district's language translated into imagination and play — recognisably the same grammar, pitched at a two-year-old rather than a board.",
      plain: "living-network/creche-plain.jpg",
      curated: "living-network/creche-curated.jpg",
      alt: "Crèche wall with the district's motifs redrawn for children",
    },
  ],

  wallHierarchy: {
    intro:
      "A campus where every wall is heavily illustrated looks like a wallpaper showroom. Curation means knowing which walls should speak and which should stay quiet.",
    levels: [
      { level: "Landmark walls", purpose: "Major arrival and identity moments.", share: 5 },
      { level: "Chapter walls", purpose: "Explain buildings, floors and cultures.", share: 15 },
      { level: "Connecting walls", purpose: "Carry the visual language between spaces.", share: 30 },
      { level: "Quiet walls", purpose: "Give the architecture and the people breathing space.", share: 50 },
    ],
    note:
      "Half the walls in this district are designed to say nothing at all. That restraint is what makes the other half land.",
  },

  journeys: {
    intro: "The same eleven walls, read by three different people.",
    entries: [
      {
        who: "The visitor",
        route: ["Gate", "Pavilion", "Reception", "Lift lobby", "Floor arrival", "Client lounge", "Café", "Departure"],
        body: "The walls help a first-time visitor understand the place without constant signage.",
      },
      {
        who: "The employee",
        route: ["Drop-off", "Connector", "Lobby", "Floor", "Collaboration", "Food hall", "Wellness", "Home"],
        body: "The story becomes familiar over time, but parts of it keep revealing themselves.",
      },
      {
        who: "Leadership and clients",
        route: ["Premium arrival", "Executive lounge", "Boardroom", "Experience centre", "Private dining"],
        body: "Quieter, more architectural, more exclusive — the network opening rather than thickening.",
      },
    ],
  },

  process: {
    intro: "Research → narrative → visual system → artwork → production → installation.",
    steps: [
      {
        title: "Research and narrative",
        body: "The land, the city's growth, the client's own history and the master plan are read before a single line is drawn. The story comes out of the site, not out of a catalogue.",
      },
      {
        title: "Palette calibration",
        body: "Colours are tested as physical samples against the real materials — travertine, pale oak, terrazzo, glass and planting — under the building's own light.",
        image: "living-network/process-palette.jpg",
      },
      {
        title: "Visual system and artwork",
        body: "Five motifs are fixed, then each wall is composed against its own elevation. Volume is assigned per wall before any artwork is finished, so restraint is designed rather than discovered late.",
      },
      {
        title: "Production and installation",
        body: "Artwork is divided into production panels, colour-checked against approved proofs and installed with precise seam alignment — built for the wall's real dimensions, never enlarged arbitrarily.",
      },
    ],
  },

  productionNote: {
    title: "A note on what this is",
    body:
      "The district is invented and these are concept visuals — the method is real, the campus is not. For an actual project, every mural is rebuilt as print-ready artwork against:",
    points: [
      "Final wall measurements",
      "Doors, sockets, screens and architectural interruptions",
      "Furniture positions",
      "Viewing distance",
      "Panel width and seam locations",
      "Approved physical colour proofs",
    ],
  },

  ask: {
    heading: "Share your master plan.",
    body:
      "Renders, key elevations or even a floor plate is enough. We'll read the site and show you where the story can begin — and, just as importantly, which walls we'd leave alone.",
  },
};
