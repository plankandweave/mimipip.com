import type { FlipSpread, Project } from "./types";

type OfficeWall = {
  number: string;
  space: string;
  title: string;
  note: string;
  artwork: string;
  room: string;
};

export const roomForIdeasWalls: OfficeWall[] = [
  {
    number: "01",
    space: "Reception",
    title: "A Place for What’s Next",
    note: "A decisive first gesture: cobalt and jade forms gather around one coral signal, giving the arrival wall presence without turning it into signage.",
    artwork: "room-for-ideas/01-reception-artwork.jpg",
    room: "room-for-ideas/01-reception-room.jpg",
  },
  {
    number: "02",
    space: "Client meeting room",
    title: "A Different Angle",
    note: "Transparent planes overlap without resolving into one answer — a wall about changing perspective, drawn quietly enough to sit through a long meeting.",
    artwork: "room-for-ideas/02-different-angle-artwork.jpg",
    room: "room-for-ideas/02-different-angle-room.jpg",
  },
  {
    number: "03",
    space: "Informal lounge",
    title: "Possibility Loop",
    note: "One generous ribbon turns back through itself. The movement makes a waiting space feel optimistic while the open centre keeps it calm.",
    artwork: "room-for-ideas/03-possibility-loop-artwork.jpg",
    room: "room-for-ideas/03-possibility-loop-room.jpg",
  },
  {
    number: "04",
    space: "Ideas room",
    title: "What If?",
    note: "The question becomes the composition: large, direct and deliberately unresolved — a prompt for the room rather than corporate decoration.",
    artwork: "room-for-ideas/04-what-if-artwork.jpg",
    room: "room-for-ideas/04-what-if-room.jpg",
  },
  {
    number: "05",
    space: "Leadership cabin",
    title: "See Further",
    note: "A low horizon and distant coral sun lengthen the view behind the desk. The quieter geometry suits a room built for perspective and decisions.",
    artwork: "room-for-ideas/05-see-further-artwork.jpg",
    room: "room-for-ideas/05-see-further-room.jpg",
  },
  {
    number: "06",
    space: "Boardroom",
    title: "Many Minds, New Possibilities",
    note: "Fine streams meet, separate and meet again across the longest table in the office — collective thought shown as motion rather than a diagram.",
    artwork: "room-for-ideas/06-many-minds-artwork.jpg",
    room: "room-for-ideas/06-many-minds-room.jpg",
  },
  {
    number: "07",
    space: "Manager cabin",
    title: "Balanced View",
    note: "Three simple masses hold one another in tension. Its scale gives a compact cabin depth without crowding the working wall.",
    artwork: "room-for-ideas/07-balanced-view-artwork.jpg",
    room: "room-for-ideas/07-balanced-view-room.jpg",
  },
  {
    number: "08",
    space: "Open studio",
    title: "Room for Ideas",
    note: "Separate paths cross, pause and continue. The mural carries energy across a shared working floor while leaving visual air around the message.",
    artwork: "room-for-ideas/08-room-for-ideas-artwork.jpg",
    room: "room-for-ideas/08-room-for-ideas-room.jpg",
  },
  {
    number: "09",
    space: "Strategy room",
    title: "The Long View",
    note: "A field of orbital lines converges on a single warm point — the office palette at its most focused and most formal.",
    artwork: "room-for-ideas/09-long-view-artwork.jpg",
    room: "room-for-ideas/09-long-view-room.jpg",
  },
  {
    number: "10",
    space: "Focused work zone",
    title: "Quiet Circle",
    note: "Fine jade lines move around an untouched centre. The wall brings rhythm to the workstations without competing with concentration.",
    artwork: "room-for-ideas/10-quiet-circle-artwork.jpg",
    room: "room-for-ideas/10-quiet-circle-room.jpg",
  },
  {
    number: "11",
    space: "Team lounge",
    title: "Better, Together",
    note: "Interlocking shapes make the point before the words do. This is the social heart of the work floor, broad, warm and immediately legible.",
    artwork: "room-for-ideas/11-better-together-artwork.jpg",
    room: "room-for-ideas/11-better-together-room.jpg",
  },
  {
    number: "12",
    space: "Project room",
    title: "Start Somewhere",
    note: "A loose cobalt line finds its way to a bright four-point form — useful encouragement for the room where unfinished work is supposed to be visible.",
    artwork: "room-for-ideas/12-start-somewhere-artwork.jpg",
    room: "room-for-ideas/12-start-somewhere-room.jpg",
  },
  {
    number: "13",
    space: "Main corridor",
    title: "Follow Your Curiosity",
    note: "A continuous path runs the length of circulation, turning a necessary walk into the thread that connects the office’s rooms.",
    artwork: "room-for-ideas/13-follow-curiosity-artwork.jpg",
    room: "room-for-ideas/13-follow-curiosity-room.jpg",
  },
  {
    number: "14",
    space: "Phone booth",
    title: "Private Orbit",
    note: "A single orbital form gives the smallest room its own identity. The composition is cropped by the doorway and completed when the door closes.",
    artwork: "room-for-ideas/14-private-orbit-artwork.jpg",
    room: "room-for-ideas/14-private-orbit-room.jpg",
  },
  {
    number: "15",
    space: "Video-call booth",
    title: "Quiet Signal",
    note: "Large cropped forms create a clean, recognisable camera background without adding words behind the speaker’s head.",
    artwork: "room-for-ideas/15-quiet-signal-artwork.jpg",
    room: "room-for-ideas/15-quiet-signal-room.jpg",
  },
  {
    number: "16",
    space: "Learning lounge",
    title: "Stay Curious",
    note: "Lines open like a book and climb into motion. The gesture belongs beside shelves, reading chairs and conversations that are allowed to wander.",
    artwork: "room-for-ideas/16-stay-curious-artwork.jpg",
    room: "room-for-ideas/16-stay-curious-room.jpg",
  },
  {
    number: "17",
    space: "Cafeteria",
    title: "Good Things Start Here",
    note: "Citrus, leaves and geometric slices let the palette become playful where the office does. It is the scheme’s most social wall.",
    artwork: "room-for-ideas/17-good-things-artwork.jpg",
    room: "room-for-ideas/17-good-things-room.jpg",
  },
  {
    number: "18",
    space: "Coffee bar",
    title: "The Pause",
    note: "Two rising forms meet above the counter like steam. A small sentence slows the moment without making the wall feel like a poster.",
    artwork: "room-for-ideas/18-the-pause-artwork.jpg",
    room: "room-for-ideas/18-the-pause-room.jpg",
  },
  {
    number: "19",
    space: "Town-hall lounge",
    title: "The Next Idea",
    note: "A broad upward arc anchors stepped seating and gives the whole office a place to gather around a shared beginning.",
    artwork: "room-for-ideas/19-next-idea-artwork.jpg",
    room: "room-for-ideas/19-next-idea-room.jpg",
  },
  {
    number: "20",
    space: "Wellness lounge",
    title: "Room to Breathe",
    note: "The geometry dissolves into translucent jade layers. The final wall lowers the tempo and lets the visual system end in quiet.",
    artwork: "room-for-ideas/20-room-to-breathe-artwork.jpg",
    room: "room-for-ideas/20-room-to-breathe-room.jpg",
  },
];

const flipSpreads: FlipSpread[] = [
  {
    type: "cover",
    image: "room-for-ideas/01-reception-room.jpg",
    alt: "A Place for What’s Next — the reception mural in a modern office",
  },
  {
    type: "passage",
    eyebrow: "Room for Ideas · Workplace concept",
    title: "One office. Twenty ways to think.",
    body: [
      "A 5,000 sq. ft. office is not one room repeated. Arrival asks for confidence; a boardroom asks for focus; a corridor asks for momentum; a cafeteria asks people to loosen up.",
      "The artwork changes its job from wall to wall, but never changes its voice. Cobalt carries the energy, jade steadies it, coral marks the human moment, and warm ivory lets the architecture breathe.",
      "Each chapter shows the printable artwork first and the room it was designed to inhabit second — the idea, then its effect on space.",
    ],
  },
  ...roomForIdeasWalls.flatMap<FlipSpread>((wall) => [
    {
      type: "plate",
      image: wall.artwork,
      alt: `${wall.title} — the flat printable artwork`,
      aspect: "1/1",
      caption: {
        number: wall.number,
        title: wall.title,
        space: wall.space,
        note: wall.note,
      },
    },
    {
      type: "panorama",
      image: wall.room,
      alt: `${wall.title} visualised in the ${wall.space.toLowerCase()}`,
      aspect: "1/1",
      caption: {
        number: wall.number,
        title: wall.title,
        space: wall.space,
      },
    },
  ]),
  { type: "palette" },
  {
    type: "index",
    heading: "The complete office",
    intro:
      "Twenty walls were developed as one workplace programme, from the first welcome to the quietest room. The grouping controls intensity: formal rooms hold back, shared rooms move, and restorative rooms soften.",
    groups: [
      {
        name: "Arrival and movement",
        spaces: ["Reception", "Client waiting", "Main corridor", "Floor arrival", "Town-hall threshold"],
      },
      {
        name: "Meet and decide",
        spaces: ["Client meeting room", "Ideas room", "Boardroom", "Strategy room", "Project room"],
      },
      {
        name: "Work and focus",
        spaces: ["Open studio", "Leadership cabin", "Manager cabin", "Focused work zone", "Phone booth", "Video-call booth"],
      },
      {
        name: "Gather and restore",
        spaces: ["Informal lounge", "Team lounge", "Learning lounge", "Cafeteria", "Coffee bar", "Town-hall lounge", "Wellness lounge"],
      },
    ],
  },
  { type: "ask" },
];

/**
 * Concept study for a compact innovation workplace. The images began as a
 * single 20-room exploration and were then rebuilt as twenty furniture-free,
 * square artworks. Keeping both in the book makes the production distinction
 * visible: a room render explains intent; the flat file is what becomes wall.
 */
export const roomForIdeas: Project = {
  slug: "room-for-ideas",
  kind: "concept",
  theme: "bright",
  segments: ["workplaces"],

  client: "An imagined innovation office",
  title: "Room for Ideas",
  standfirst:
    "Twenty artwork moments for a 5,000 sq. ft. workplace — one visual language moving from reception and boardroom to cafeteria and quiet room.",
  facts: [
    { label: "Sector", value: "Contemporary workplace" },
    { label: "Scale", value: "5,000 sq. ft." },
    { label: "Spaces", value: "20 artwork moments" },
    { label: "Through-line", value: "Curiosity to clarity" },
  ],

  cover: "room-for-ideas/01-reception-room.jpg",

  brief: {
    intro:
      "Imagine the creative confidence of a leading technology company inside a 5,000 sq. ft. office: modern, elegant and memorable, with enough personality to make the first arrival feel like a promise. The challenge was to give twenty very different rooms a sense of wonder without turning the workplace into a theme park or a collection of motivational posters.",
    requirements: [
      "One recognisable visual system across reception, meeting rooms, cabins, shared work areas and social spaces.",
      "A different emotional register for every room, appropriate to what people do there.",
      "Messaging used sparingly and composed as part of the artwork, never pasted on afterwards.",
      "Enough impact for a visitor to remember the office, with enough restraint for employees to live with it every day.",
      "A separate, furniture-free printable artwork for every room concept.",
    ],
  },

  interpretation: [
    "The programme follows the rhythm of a working day. It opens with confident, declarative shapes at reception; becomes inquisitive in meeting rooms; tightens into focus around cabins and boardrooms; gains movement through shared work; loosens in the social rooms; and finally dissolves into quiet at wellness.",
    "Cobalt is the office’s active line — the thought in motion. Jade makes the scheme feel intelligent and grounded. Coral appears as a decision, a question or a human spark. Warm ivory is not empty background; it is the pause that lets twenty walls belong in one compact office.",
    "Words appear only where the room can answer them. ‘What if?’ belongs in an ideas room. ‘Stay curious’ belongs beside books. The boardroom needs no slogan: its converging lines already say enough.",
  ],

  palette: {
    intro:
      "Four colours do the work of a much larger palette. Their proportions shift by room, but the ingredients never do.",
    entries: [
      {
        name: "Idea Cobalt",
        hex: "#1546C8",
        purpose: "The active gesture — loops, paths, horizons and lines that carry thought through the office.",
        share: "35%",
      },
      {
        name: "Grounded Jade",
        hex: "#167B6B",
        purpose: "Balance and composure, especially in focused rooms and the quieter half of each composition.",
        share: "28%",
      },
      {
        name: "Human Coral",
        hex: "#EF604A",
        purpose: "The warm interruption — a decision point, question, sun or conversational spark.",
        share: "12%",
      },
      {
        name: "Working Ivory",
        hex: "#F2E8D5",
        purpose: "The architectural field that keeps large walls bright, breathable and easy to live with.",
        share: "25%",
      },
    ],
    note:
      "The cafeteria briefly adds citrus yellow; the wellness wall dilutes jade into translucent layers. Both are controlled departures, not new schemes.",
  },

  motifs: {
    intro:
      "Five recurring gestures make twenty artworks feel like one authored collection rather than twenty chosen patterns.",
    entries: [
      { name: "The open loop", description: "A thought allowed to return, change direction and remain unfinished." },
      { name: "The horizon", description: "A steady line for rooms where distance and judgment matter." },
      { name: "The crossing path", description: "Separate teams, disciplines and conversations meeting without losing their own direction." },
      { name: "The coral signal", description: "One warm point that marks a choice, a person or a new beginning." },
      { name: "The breathing field", description: "Fine lines and translucent layers that lower the visual volume in focused and restorative rooms." },
    ],
  },

  chapters: roomForIdeasWalls.map((wall) => ({
    space: wall.space,
    title: wall.title,
    rationale: wall.note,
    curated: wall.room,
    alt: `${wall.title} visualised in the ${wall.space.toLowerCase()}`,
    series: [
      {
        key: wall.artwork,
        alt: `${wall.title} — the flat printable artwork`,
        caption: "The artwork",
      },
    ],
  })),

  process: {
    intro:
      "The room pictures establish the spatial idea; the flat artworks prove that each wall can move from concept to production.",
    steps: [
      {
        title: "Programme the office",
        body: "Map every wall to a job — welcome, question, focus, movement, gathering or pause — before drawing a single form.",
      },
      {
        title: "Write one visual constitution",
        body: "Fix the palette, shapes, line weights, messaging rules and overall level of restraint so all twenty rooms share one voice.",
      },
      {
        title: "Compose for each elevation",
        body: "Place quiet centres, statements and focal points around desks, doors, screens, seating and the direction people enter the room.",
      },
      {
        title: "Rebuild the print artwork",
        body: "Remove furniture and perspective, then prepare each approved composition against measured wall dimensions, panel seams and colour proofs.",
      },
    ],
  },

  journeyHeading: "Twenty artwork moments, one office",

  ask: {
    heading: "Bring us one working day.",
    body: "Show us how people arrive, meet, focus, gather and pause. We’ll give every important wall a role — and the whole office one memory.",
  },

  productionNote: {
    title: "What the square artworks prove — and what they do not",
    body:
      "These are concept visuals and raster artwork studies for an imagined office. They establish composition, palette and placement; they are not yet full-wall production files.",
    points: [
      "Every selected artwork is rebuilt at the wall’s final measured dimensions and viewing distance.",
      "Doors, switches, screens, cameras, joinery and furniture are plotted before the composition is locked.",
      "Text is redrawn and proof-read at production scale; it is never enlarged from the concept raster.",
      "Panel widths and seam positions are designed into the artwork rather than decided after approval.",
      "A physical colour proof is approved against the actual wallcovering substrate before the full run.",
    ],
  },

  flip: { spreads: flipSpreads },
};
