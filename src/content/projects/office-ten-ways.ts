import type { PaletteEntry, Project, ProjectTheme } from "./types";

export const OFFICE_TEN_WAYS_SLUGS = [
  "first-light",
  "fieldwork",
  "signal-studio",
  "quiet-ambition",
  "common-ground",
  "electric-current",
  "open-sky",
  "local-frequency",
  "play-theory",
  "long-view",
] as const;

export type OfficeTenWaysSlug = (typeof OFFICE_TEN_WAYS_SLUGS)[number];
type Zone = "arrival" | "work" | "meet" | "pause";

type Concept = {
  slug: OfficeTenWaysSlug;
  title: string;
  theme: ProjectTheme;
  standfirst: string;
  thesis: string;
  palette: PaletteEntry[];
  motifs: { name: string; description: string }[];
  walls: Record<Zone, { title: string; rationale: string }>;
};

const ZONES: Record<Zone, { space: string; label: string }> = {
  arrival: { space: "Arrival & reception", label: "Arrival" },
  work: { space: "Open-plan work area", label: "Work" },
  meet: { space: "Meeting room", label: "Meet" },
  pause: { space: "Pantry & pause room", label: "Pause" },
};

const ORDER = Object.keys(ZONES) as Zone[];
const key = (slug: OfficeTenWaysSlug, zone: Zone, view: "plain" | "room" | "artwork") =>
  `office-ten-ways/${slug}-${zone}-${view}.jpg`;

const concepts: Concept[] = [
  {
    slug: "first-light",
    title: "First Light",
    theme: "bright",
    standfirst:
      "An optimistic office in cobalt, apricot and warm ivory — four coordinated walls that make beginning feel possible.",
    thesis:
      "First Light treats optimism as a spatial quality rather than a slogan. Broad circles and overlapping horizons move from a decisive welcome to a softer place to pause.",
    palette: [
      { name: "Clear Cobalt", hex: "#1E4E9D", purpose: "Confidence and forward motion." },
      { name: "Morning Apricot", hex: "#E98E63", purpose: "Warmth at the point of arrival." },
      { name: "Working Ivory", hex: "#F2ECE0", purpose: "Light and visual breathing room." },
    ],
    motifs: [
      { name: "The rising circle", description: "A new thought appearing over the horizon." },
      { name: "The open arc", description: "Momentum that never closes the room down." },
      { name: "The crossing field", description: "Different minds meeting without losing their shape." },
    ],
    walls: {
      arrival: { title: "Start Something", rationale: "A single apricot circle gives the first wall a clear, optimistic point of focus." },
      work: { title: "Bigger Ideas", rationale: "A long cobalt sweep carries energy across the desk run without filling every inch." },
      meet: { title: "Different Mindsets", rationale: "Overlapping circles turn difference into the central composition of the room." },
      pause: { title: "A Brighter Day", rationale: "A low sun and generous negative space soften the scheme for coffee and conversation." },
    },
  },
  {
    slug: "fieldwork",
    title: "Fieldwork",
    theme: "calm",
    standfirst:
      "Botanical structure without floral decoration — leaf veins, branching paths and layered greens for a grounded workplace.",
    thesis:
      "Fieldwork studies the systems already present in leaves: branching, exchange, growth and resilience. Enlarged past recognition, those structures become an intelligent office pattern rather than botanical wallpaper.",
    palette: [
      { name: "Canopy Green", hex: "#244E3C", purpose: "The deep structural line." },
      { name: "Young Leaf", hex: "#819341", purpose: "Growth and forward movement." },
      { name: "Pressed Paper", hex: "#EFEEE3", purpose: "A quiet natural ground." },
    ],
    motifs: [
      { name: "Leaf architecture", description: "Fine veins enlarged into routes and networks." },
      { name: "Branching choices", description: "Paths that divide, reconnect and keep growing." },
      { name: "Layered canopy", description: "Broad overlapping forms for social rooms." },
    ],
    walls: {
      arrival: { title: "Ideas Take Root", rationale: "A strong branching silhouette gives reception presence while keeping the centre calm." },
      work: { title: "Small Ideas, Big Change", rationale: "Fine vein lines add rhythm behind desks without competing with concentration." },
      meet: { title: "Better Climate, Brighter Lives", rationale: "Large overlapping leaves create a generous, camera-friendly meeting backdrop." },
      pause: { title: "Good Ideas Taste Better Here", rationale: "The canopy becomes broader and warmer where the office gathers informally." },
    },
  },
  {
    slug: "signal-studio",
    title: "Signal Studio",
    theme: "precise",
    standfirst:
      "Cobalt, signal red and decisive geometry for a creative team that wants its workplace to feel active and unmistakable.",
    thesis:
      "Signal Studio works like a graphic identity translated into rooms. Every wall uses one bold signal, one piece of language and enough clear ground for both to land immediately.",
    palette: [
      { name: "Studio Cobalt", hex: "#174DC4", purpose: "The dominant graphic signal." },
      { name: "Action Red", hex: "#EE3F31", purpose: "Decisions, questions and human energy." },
      { name: "Inky Navy", hex: "#202641", purpose: "Depth in the meeting room." },
      { name: "Newsprint", hex: "#F3F0E7", purpose: "A crisp, tactile ground." },
    ],
    motifs: [
      { name: "The signal mark", description: "One form strong enough to be read from the door." },
      { name: "The progress line", description: "A measured sequence that turns effort into motion." },
      { name: "The speech form", description: "Conversation drawn as a collision of shapes." },
    ],
    walls: {
      arrival: { title: "Make Your Mark", rationale: "An eight-point cobalt mark makes the threshold unmistakable from across the office." },
      work: { title: "Focus, Build, Ship, Repeat", rationale: "A rising sequence gives the work floor tempo without becoming a busy repeat." },
      meet: { title: "Better Questions, Brighter Answers", rationale: "Two opposing forms make the meeting wall feel like an exchange, not a backdrop." },
      pause: { title: "Great Conversations Fuel What’s Next", rationale: "Speech forms loosen the system for the room where unplanned ideas happen." },
    },
  },
  {
    slug: "quiet-ambition",
    title: "Quiet Ambition",
    theme: "calm",
    standfirst:
      "Restrained navy lines, soft sage and walnut tones for offices that want direction without visual noise.",
    thesis:
      "Quiet Ambition is built for long attention. Fine lines gather and separate around large fields of warm paper, with deeper colour reserved for the room where decisions are made.",
    palette: [
      { name: "Measured Navy", hex: "#263C57", purpose: "Discipline and directional linework." },
      { name: "Soft Sage", hex: "#AEBCAF", purpose: "A composed working atmosphere." },
      { name: "Walnut", hex: "#806451", purpose: "Warmth alongside timber joinery." },
      { name: "Natural Paper", hex: "#EDE6D8", purpose: "Space for the room to breathe." },
    ],
    motifs: [
      { name: "Gathered lines", description: "Many small actions resolving into one direction." },
      { name: "The open field", description: "Restraint used as a positive part of the design." },
      { name: "The quiet orbit", description: "A longer view held around one warm centre." },
    ],
    walls: {
      arrival: { title: "Build with Intent", rationale: "A restrained sweep sets a thoughtful tone before anyone reaches the desk." },
      work: { title: "Better Work, Brighter Tomorrow", rationale: "Soft crossing lines give a long desk wall texture that remains calm all day." },
      meet: { title: "Different Conversations", rationale: "Pale rings on navy create depth and hold up cleanly behind people on camera." },
      pause: { title: "A Brighter You", rationale: "The lightest version of the system creates a gentle end to the working sequence." },
    },
  },
  {
    slug: "common-ground",
    title: "Common Ground",
    theme: "warm",
    standfirst:
      "Terracotta, aubergine and rounded geometry for a warm, sociable office built around exchange.",
    thesis:
      "Common Ground begins with forms that lean toward one another. The palette is earthy and conversational; the geometry grows more interlocked as the office moves from welcome to gathering.",
    palette: [
      { name: "Terracotta", hex: "#C7654F", purpose: "Warmth and approachability." },
      { name: "Aubergine", hex: "#743A47", purpose: "Depth without corporate navy." },
      { name: "Clay Rose", hex: "#D78B77", purpose: "The human middle tone." },
      { name: "Warm Plaster", hex: "#EFE2D2", purpose: "A soft architectural ground." },
    ],
    motifs: [
      { name: "The shared curve", description: "Separate forms finding one edge in common." },
      { name: "The held circle", description: "A person or idea supported by the larger group." },
      { name: "The social stack", description: "Different shapes becoming one stable composition." },
    ],
    walls: {
      arrival: { title: "Good Work Starts Here", rationale: "Warm curves make reception feel welcoming without losing professional clarity." },
      work: { title: "Same Curiosity, A Brighter Tomorrow", rationale: "A broad interlocking field gives the open office identity at the scale of the floor." },
      meet: { title: "Different Perspectives", rationale: "Nested loops turn opposing views into a balanced meeting-room composition." },
      pause: { title: "Good Ideas, Better Together", rationale: "Stacked social forms give the pantry its own warmer, more informal register." },
    },
  },
  {
    slug: "electric-current",
    title: "Electric Current",
    theme: "bright",
    standfirst:
      "Acid lime, graphite and violet waves for teams that want momentum visible in the room.",
    thesis:
      "Electric Current draws energy as a line that changes state: a pulse at arrival, a field at work, a crossing wave in meetings and a loose loop where people pause.",
    palette: [
      { name: "Current Lime", hex: "#C5F300", purpose: "Immediate energy and motion." },
      { name: "Graphite", hex: "#57585D", purpose: "The measured system underneath." },
      { name: "Electric Violet", hex: "#8D69B0", purpose: "Depth where ideas intersect." },
      { name: "Warm White", hex: "#F0EEE9", purpose: "Contrast without glare." },
    ],
    motifs: [
      { name: "The pulse", description: "Momentum made visible in one continuous line." },
      { name: "The wave field", description: "Many parallel efforts moving in the same direction." },
      { name: "The live loop", description: "Energy that returns as conversation." },
    ],
    walls: {
      arrival: { title: "Stay in Motion", rationale: "A single lime pulse makes the entrance energetic and immediately legible." },
      work: { title: "Ideas, Ship, Scale, Repeat", rationale: "Parallel waves carry movement across the desk wall while graphite keeps it grounded." },
      meet: { title: "Better Questions Build Brighter Founders", rationale: "Two violet fields cross behind the table like an active exchange." },
      pause: { title: "Good Ideas Taste Better Here", rationale: "The pulse opens into a loose lime loop above the pantry counter." },
    },
  },
  {
    slug: "open-sky",
    title: "Open Sky",
    theme: "calm",
    standfirst:
      "Airy blues, low horizons and open compositions for a workplace that needs clarity more than stimulation.",
    thesis:
      "Open Sky uses layered horizons to make compact rooms feel less enclosed. Deep blue stays low, pale sky carries the centre and one apricot sun marks the human point in the system.",
    palette: [
      { name: "Open Blue", hex: "#83BDD9", purpose: "Air and perceived distance." },
      { name: "Deep Horizon", hex: "#176C98", purpose: "A steady visual base." },
      { name: "Low Sun", hex: "#EC8A5C", purpose: "One warm point of attention." },
      { name: "Cloud", hex: "#F3EEE3", purpose: "Soft light between the layers." },
    ],
    motifs: [
      { name: "The low horizon", description: "A steady line that lengthens the room." },
      { name: "Cloud layers", description: "Overlapping forms with no hard visual edge." },
      { name: "The warm sun", description: "A small signal of optimism within the blue." },
    ],
    walls: {
      arrival: { title: "Room to Think", rationale: "A low horizon and open centre give the threshold a sense of space." },
      work: { title: "Better Ideas Ahead", rationale: "Long blue bands lead the eye across the desk run rather than stopping it." },
      meet: { title: "Different Perspectives, A Clearer Tomorrow", rationale: "Layered blue fields make a calm backdrop for long conversations and video calls." },
      pause: { title: "Good Coffee, Brighter Days", rationale: "The apricot sun warms the palette where people stop and reset." },
    },
  },
  {
    slug: "local-frequency",
    title: "Local Frequency",
    theme: "warm",
    standfirst:
      "Contemporary Indian textile rhythms in indigo, madder, turmeric and linen — cultural memory without imitation.",
    thesis:
      "Local Frequency takes the logic of Indian cloth—crossing threads, irregular grids and colour held in fibre—and rebuilds it at architectural scale. It feels rooted without borrowing a named motif.",
    palette: [
      { name: "Dyed Indigo", hex: "#174A69", purpose: "The main woven structure." },
      { name: "Madder", hex: "#AE4D39", purpose: "A warm crossing thread." },
      { name: "Turmeric", hex: "#DEA42F", purpose: "A bright local accent." },
      { name: "Loom Linen", hex: "#E6DDCA", purpose: "A tactile, breathable ground." },
    ],
    motifs: [
      { name: "The crossing thread", description: "Separate directions becoming a useful structure." },
      { name: "The irregular grid", description: "Order that keeps the evidence of the hand." },
      { name: "The colour bar", description: "One dyed band acting as a spatial marker." },
    ],
    walls: {
      arrival: { title: "New Ideas, Our Way", rationale: "A bold woven block establishes local confidence at the first threshold." },
      work: { title: "Same City, Brighter Work", rationale: "A finer indigo grid gives the open floor rhythm without pictorial distraction." },
      meet: { title: "Different Perspectives, A Brighter Tomorrow", rationale: "Broad madder and indigo crossings hold the meeting wall from every seat." },
      pause: { title: "A Fresh Thinking Break", rationale: "Turmeric becomes dominant where the office is allowed to feel lighter." },
    },
  },
  {
    slug: "play-theory",
    title: "Play Theory",
    theme: "bright",
    standfirst:
      "Playful geometry in electric blue, raspberry and yellow — confident colour with a grown-up graphic system.",
    thesis:
      "Play Theory gives experimentation a disciplined frame. Curves, circles and cropped blocks behave like pieces in an open-ended game, with each room making a different move.",
    palette: [
      { name: "Electric Blue", hex: "#164FC4", purpose: "The large, confident move." },
      { name: "Raspberry", hex: "#E72E70", purpose: "The unexpected human point." },
      { name: "Idea Yellow", hex: "#F0D44E", purpose: "Optimism and lift." },
      { name: "Game Paper", hex: "#F2EEE3", purpose: "A neutral field for strong colour." },
    ],
    motifs: [
      { name: "The move", description: "A curve or block that asks what could happen next." },
      { name: "The counterweight", description: "One shape balancing another across the room." },
      { name: "The bright point", description: "A small interruption that changes the composition." },
    ],
    walls: {
      arrival: { title: "What Happens Next?", rationale: "A large blue curve and bright points turn arrival into an invitation." },
      work: { title: "Same Curious People, Different Next", rationale: "Tall blocks and circles create a clear rhythm across the working floor." },
      meet: { title: "Different Angles, Better Answers", rationale: "Interlocking geometry gives the meeting room energy without small visual noise." },
      pause: { title: "A Brighter Break", rationale: "Balanced bowl-like forms make the pantry playful and warmly social." },
    },
  },
  {
    slug: "long-view",
    title: "Long View",
    theme: "dusk",
    standfirst:
      "Deep teal, copper and fine contour lines for strategic rooms, considered decisions and a quieter kind of confidence.",
    thesis:
      "Long View maps thought over time. Fine contours gather around slow circular fields; copper appears as a distant point, a route or the warmth of the room after work.",
    palette: [
      { name: "Deep Teal", hex: "#183F3E", purpose: "Depth and strategic calm." },
      { name: "Oxidised Copper", hex: "#A66A4B", purpose: "Time, warmth and a distant signal." },
      { name: "Sandstone", hex: "#CDBCA8", purpose: "A soft middle tone beside timber." },
      { name: "Contour Paper", hex: "#EDE5D8", purpose: "Space around the fine linework." },
    ],
    motifs: [
      { name: "The contour", description: "Small changes accumulating into a larger terrain." },
      { name: "The orbit", description: "People and ideas held in a long relationship." },
      { name: "The distant point", description: "A decision understood in the context of what follows." },
    ],
    walls: {
      arrival: { title: "Think Beyond", rationale: "Open contours and a deep teal edge establish confidence without spectacle." },
      work: { title: "Same Curiosity, Further", rationale: "Fine topographic lines give the work wall detail that rewards a longer look." },
      meet: { title: "Different People, A Brighter Orbit", rationale: "Copper orbits on deep teal give the meeting room focus and depth." },
      pause: { title: "Good Ideas Travel Further", rationale: "Warm copper fields loosen the scheme for the office’s social edge." },
    },
  },
];

function project(c: Concept): Project {
  return {
    slug: c.slug,
    kind: "concept",
    theme: c.theme,
    segments: ["workplaces"],
    client: "An imagined contemporary office",
    title: c.title,
    standfirst: c.standfirst,
    facts: [
      { label: "Sector", value: "Contemporary workplace" },
      { label: "Concept", value: c.title },
      { label: "Spaces", value: "Arrival · Work · Meet · Pause" },
      { label: "Study", value: "4 walls · 12 images" },
    ],
    cover: key(c.slug, "arrival", "room"),
    brief: {
      intro:
        "A modern office needs more than one feature wall. This concept tests a complete visual language across the four moments every workplace shares: arriving, working, meeting and pausing.",
      requirements: [
        "Four coordinated artworks with a distinct job in each workspace.",
        "A consistent palette and motif system without repeating one design four times.",
        "Words composed as part of the artwork, never applied as separate signage.",
        "A matched plain-room frame and furnished visual for every wall.",
        "A separate, furniture-free artwork that can be prepared to the measured elevation.",
      ],
    },
    interpretation: [
      c.thesis,
      "Arrival is the clearest signal, Work carries rhythm over a longer run, Meet is composed to hold behind people and Pause is allowed to become warmer and more conversational.",
      "The four pieces can be bought individually by workspace or together as one office concept.",
    ],
    palette: { entries: c.palette },
    motifs: { entries: c.motifs },
    chapters: ORDER.map((zone) => ({
      space: ZONES[zone].space,
      title: c.walls[zone].title,
      rationale: c.walls[zone].rationale,
      plain: key(c.slug, zone, "plain"),
      curated: key(c.slug, zone, "room"),
      alt: `${c.walls[zone].title} from ${c.title} in a modern ${ZONES[zone].label.toLowerCase()} workspace`,
      aspect: "1/1",
      series: [
        {
          key: key(c.slug, zone, "artwork"),
          alt: `${c.walls[zone].title} — the furniture-free artwork`,
          caption: "The artwork",
        },
      ],
    })),
    process: {
      intro:
        "Each wall is presented three ways so the design intent and the production handoff cannot be confused.",
      steps: [
        { title: "Begin with the room", body: "Keep the same camera, furniture, lighting and architecture in the plain and designed views." },
        { title: "Give the wall one job", body: "Compose differently for welcome, concentration, conversation and pause while keeping one concept language." },
        { title: "Separate the artwork", body: "Remove furniture and perspective so the approved idea exists as its own clean image." },
        { title: "Prepare to measure", body: "Rebuild the chosen artwork to the final wall elevation, then place panels, joins and interruptions before proofing." },
      ],
    },
    journeyHeading: `${c.title}: four moments of work`,
    ask: {
      heading: `Bring ${c.title} into your office.`,
      body: "Choose one wall or buy the coordinated four-room concept. Enter your dimensions online; we prepare the final artwork and proof it for your actual elevation.",
    },
    productionNote: {
      title: "Concept image first. Production artwork after measurement.",
      body:
        "The square artwork establishes composition, colour and placement. Before printing, the selected design is prepared against the wall’s measured proportions and viewing distance.",
      points: [
        "Doors, screens, sockets, joinery and furniture are plotted before the crop is approved.",
        "Typography is checked and redrawn at production scale where required.",
        "Panel widths and seam positions are composed into the final elevation.",
        "A physical colour proof is approved on the selected wallcovering before the full run.",
      ],
    },
  };
}

export const OFFICE_TEN_WAYS_PROJECTS = concepts.map(project);

