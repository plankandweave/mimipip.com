import type { FlipSpread, Project } from "./types";

type ClubSpace = {
  number: string;
  space: string;
  title: string;
  note: string;
  artwork: string;
  room: string;
  artworkAspect: string;
  roomAspect: string;
};

const spaces: ClubSpace[] = [
  {
    number: "01",
    space: "Entrance",
    title: "A Place in Common",
    note: "The first wall gathers arrivals rather than announcing status: players returning from the field, families crossing paths and familiar faces pausing beneath the old arches.",
    artwork: "the-club-through-generations/17-painted-entrance-mural-with-figures.jpg",
    room: "the-club-through-generations/02-entrance-a-place-in-common.jpg",
    artworkAspect: "3/2",
    roomAspect: "12/5",
  },
  {
    number: "02",
    space: "Pavilion lounge",
    title: "The Long Innings",
    note: "Cricket is shown as memory in motion — the poised stroke, the patient defence, the run begun — so the pavilion holds both sporting tradition and the generations still adding to it.",
    artwork: "the-club-through-generations/16-faithfully-preserved-pavilion-mural.jpg",
    room: "the-club-through-generations/05-pavilion-lounge-the-long-innings.jpg",
    artworkAspect: "3/2",
    roomAspect: "7/3",
  },
  {
    number: "03",
    space: "Long verandah",
    title: "An Afternoon, Unhurried",
    note: "Bougainvillea, cane chairs and passing conversations form a slow panorama. The art respects the verandah’s real luxury: time allowed to stretch.",
    artwork: "the-club-through-generations/18-painted-verandah-scene-with-figures.jpg",
    room: "the-club-through-generations/06-verandah-an-afternoon-unhurried.jpg",
    artworkAspect: "2/1",
    roomAspect: "12/5",
  },
  {
    number: "04",
    space: "Card room",
    title: "A Good Hand",
    note: "Concentration becomes graphic theatre: enlarged suits, concealed cards and overlapping hands create a wall with the wit and seriousness of the room itself.",
    artwork: "the-club-through-generations/19-classic-painted-card-room-gathering.jpg",
    room: "the-club-through-generations/03-card-room-a-good-hand.jpg",
    artworkAspect: "4/3",
    roomAspect: "2/1",
  },
  {
    number: "05",
    space: "Billiards room",
    title: "Angles of Intent",
    note: "Every line anticipates the next contact. Deep table green, chalk geometry and a single held cue turn the game’s quiet calculation into architecture.",
    artwork: "the-club-through-generations/20-classic-billiards-hall-mural.jpg",
    room: "the-club-through-generations/04-billiards-room-angles-of-intent.jpg",
    artworkAspect: "3/2",
    roomAspect: "12/5",
  },
  {
    number: "06",
    space: "Bar",
    title: "One More Story",
    note: "An evening Bombay palette holds a room of gestures, half-finished anecdotes and old friendships. The mural rewards the regular who notices someone new each time.",
    artwork: "the-club-through-generations/22-classic-bar-interior-mural.jpg",
    room: "the-club-through-generations/01-bar-one-more-story.jpg",
    artworkAspect: "3/2",
    roomAspect: "12/5",
  },
  {
    number: "07",
    space: "Dining room",
    title: "The Long Evening",
    note: "Portraits, flowers, textiles and harbour light overlap like conversation around a table. It is celebratory without turning dining into literal food imagery.",
    artwork: "the-club-through-generations/21-painted-dining-scene-mural.jpg",
    room: "the-club-through-generations/07-the-long-evening-dining-room.jpg",
    artworkAspect: "4/3",
    roomAspect: "2/1",
  },
  {
    number: "08",
    space: "Library",
    title: "Elsewhere, Together",
    note: "Readers sit within a landscape of pages, gardens and distant water. The mural opens the room imaginatively while keeping its volume low.",
    artwork: "the-club-through-generations/23-restored-library-interior-mural.jpg",
    room: "the-club-through-generations/08-library-elsewhere-together.jpg",
    artworkAspect: "4/3",
    roomAspect: "16/7",
  },
  {
    number: "09",
    space: "Sports passage",
    title: "The Joy of the Game",
    note: "Movement is cropped at its most alive — a reach, a turn, a swing, a leap. Women, men and children share the wall as participants, not decoration.",
    artwork: "the-club-through-generations/24-painted-sports-passage-mural.jpg",
    room: "the-club-through-generations/09-sports-passage-the-joy-of-the-game.jpg",
    artworkAspect: "11/6",
    roomAspect: "13/5",
  },
  {
    number: "10",
    space: "Family room",
    title: "Sunday Belongs to Everyone",
    note: "The room’s many small rituals share one generous scene: a game taught, a newspaper folded, a child listened to, and the dog that has settled under the same chair.",
    artwork: "the-club-through-generations/25-family-room-mural-artwork.jpg",
    room: "the-club-through-generations/10-sunday-belongs-to-everyone.jpg",
    artworkAspect: "3/2",
    roomAspect: "2/1",
  },
  {
    number: "11",
    space: "Children’s room",
    title: "The Club We Invented",
    note: "Rackets become bridges, cards become doors and the pool becomes an illustrated world. The imagery feels adventurous at a child’s eye line and beautifully composed from across the room.",
    artwork: "the-club-through-generations/26-painted-figures-in-a-classic-interior.jpg",
    room: "the-club-through-generations/11-children-s-room-the-club-we-invented.jpg",
    artworkAspect: "3/2",
    roomAspect: "12/5",
  },
  {
    number: "12",
    space: "Teen lounge",
    title: "Our Turn",
    note: "Music, movement, sport and friendship are given a sharper rhythm and their own confidence. It belongs to the same club without borrowing the adults’ nostalgia.",
    artwork: "the-club-through-generations/27-painted-figures-in-an-architectural-interior.jpg",
    room: "the-club-through-generations/12-teen-lounge-our-turn.jpg",
    artworkAspect: "3/2",
    roomAspect: "5/2",
  },
  {
    number: "13",
    space: "Poolside lounge",
    title: "Between Swims",
    note: "Pool blue, striped shadows and resting figures make the wall feel sunlit even after the afternoon has moved on. It is fresh, social and unmistakably club life.",
    artwork: "the-club-through-generations/28-poolside-mural-full-frame-painted-scene.jpg",
    room: "the-club-through-generations/13-poolside-lounge-between-swims.jpg",
    artworkAspect: "8/5",
    roomAspect: "12/5",
  },
  {
    number: "14",
    space: "Banquet foyer",
    title: "An Occasion to Remember",
    note: "Arrivals, dancing and evening light move across the foyer in one warm procession — festive enough for a wedding, composed enough for an ordinary Tuesday.",
    artwork: "the-club-through-generations/29-elegant-banquet-hall-painted-mural.jpg",
    room: "the-club-through-generations/14-banquet-foyer-an-occasion-to-remember.jpg",
    artworkAspect: "3/2",
    roomAspect: "2/1",
  },
  {
    number: "15",
    space: "Members’ passage",
    title: "Little Club Rituals",
    note: "Smaller observations reward the daily walk: the scorebook, a favourite chair, whites hung after play and the last quiet table beyond the garden.",
    artwork: "the-club-through-generations/30-grand-painted-passage-mural.jpg",
    room: "the-club-through-generations/15-members-passage-little-club-rituals.jpg",
    artworkAspect: "3/2",
    roomAspect: "23/10",
  },
  {
    number: "16",
    space: "Private meeting room",
    title: "A Meeting of Minds",
    note: "Layered profiles, hands and fragments of the city turn discussion into a quiet civic portrait — serious enough for committee business, human enough for everything after it.",
    artwork: "the-club-through-generations/38-heritage-club-meeting-room-painting.jpg",
    room: "the-club-through-generations/31-heritage-club-meeting-room-mural-study.jpg",
    artworkAspect: "3/2",
    roomAspect: "2/1",
  },
  {
    number: "17",
    space: "Fitness studio",
    title: "A Rhythm of Your Own",
    note: "Bodies in balance replace the visual noise of a conventional gym wall. The softer mineral palette brings motion while remaining at home beside old timber and tall windows.",
    artwork: "the-club-through-generations/37-south-mumbai-heritage-club-artwork.jpg",
    room: "the-club-through-generations/32-rhythm-in-the-heritage-fitness-studio.jpg",
    artworkAspect: "12/5",
    roomAspect: "12/5",
  },
  {
    number: "18",
    space: "Garden café",
    title: "The Morning Edition",
    note: "Tea service, newspapers and the first view of the ground make breakfast a club ritual of its own. The garden enters the room without losing the formality of the arches.",
    artwork: "the-club-through-generations/35-heritage-south-mumbai-caf-painting.jpg",
    room: "the-club-through-generations/33-heritage-club-caf-and-garden-mural.jpg",
    artworkAspect: "3/2",
    roomAspect: "2/1",
  },
  {
    number: "19",
    space: "Guest suite",
    title: "The Quiet Coast",
    note: "A restrained shoreline gives overnight guests a pause from the social rooms. The sea is remembered as atmosphere — pale sky, distant sails and a horizon that lets the bedroom settle.",
    artwork: "the-club-through-generations/36-south-mumbai-heritage-guest-suite-painting.jpg",
    room: "the-club-through-generations/34-the-quiet-coast-guest-suite.jpg",
    artworkAspect: "4/3",
    roomAspect: "2/1",
  },
];

const flipSpreads: FlipSpread[] = [
  {
    type: "cover",
    image: "the-club-through-generations/05-pavilion-lounge-the-long-innings.jpg",
    alt: "The Long Innings mural in the pavilion lounge of a heritage members’ club",
  },
  {
    type: "passage",
    eyebrow: "The Club, Through Generations · Members’ club concept",
    title: "Every generation has its own club. Somehow, it is the same place.",
    body: [
      "A century-old club does not need its character replaced. It needs the life already inside it to become visible: the familiar table, the afternoon game, children growing up, friendships continuing and evenings that turn into family stories.",
      "This collection moves through nineteen spaces, from the formal arrival to the relaxed verandah, from card room concentration to poolside ease. Each artwork changes its tone with the room while recurring colour, linework and characters keep the property whole.",
      "The room view shows how gently art can inhabit old architecture. The standalone study beside it reveals the story carried by the wall itself.",
    ],
  },
  ...spaces.flatMap<FlipSpread>((space) => [
    {
      type: "plate",
      image: space.artwork,
      alt: `${space.title} — standalone mural artwork study`,
      aspect: space.artworkAspect,
      caption: {
        number: space.number,
        title: space.title,
        space: space.space,
        note: space.note,
      },
    },
    {
      type: "panorama",
      image: space.room,
      alt: `${space.title} visualised in the ${space.space.toLowerCase()}`,
      aspect: space.roomAspect,
      caption: {
        number: space.number,
        title: space.title,
        space: space.space,
      },
    },
  ]),
  { type: "palette" },
  {
    type: "index",
    heading: "A whole club, not a feature wall",
    intro:
      "Nineteen artworks form one property-wide programme. Their visual volume follows the way members use the building: formal rooms hold history quietly, social rooms carry wit, sport brings movement, and younger spaces take brighter colour.",
    groups: [
      { name: "Arrive and belong", spaces: ["Entrance", "Long verandah", "Members’ passage", "Private meeting room"] },
      { name: "Play and compete", spaces: ["Pavilion lounge", "Card room", "Billiards room", "Sports passage", "Fitness studio"] },
      { name: "Gather and celebrate", spaces: ["Bar", "Dining room", "Family room", "Garden café", "Banquet foyer"] },
      { name: "Read, rest and grow", spaces: ["Library", "Children’s room", "Teen lounge", "Poolside lounge", "Guest suite"] },
    ],
  },
  { type: "ask" },
];

/**
 * A speculative collection for a century-old urban members’ club. No real
 * institution is named or represented; the architecture and rituals combine
 * familiar qualities of legacy clubs in Mumbai and Pune.
 */
export const theClubThroughGenerations: Project = {
  slug: "the-club-through-generations",
  kind: "concept",
  theme: "warm",
  segments: ["hospitality"],

  client: "An imagined century-old members’ club",
  title: "The Club, Through Generations",
  standfirst:
    "Nineteen murals for the rituals, games and friendships that make an old club feel alive — contemporary art composed to belong inside heritage rooms.",
  facts: [
    { label: "Setting", value: "Heritage urban club" },
    { label: "Programme", value: "19 member spaces" },
    { label: "Audience", value: "Every generation" },
    { label: "Through-line", value: "Rituals of belonging" },
  ],

  cover: "the-club-through-generations/05-pavilion-lounge-the-long-innings.jpg",

  brief: {
    intro:
      "Many legacy clubs have extraordinary architecture and deeply ordinary walls. Their timber doors, high ceilings, stone floors and long verandahs already carry a century of character; generic decoration can only flatten it. The opportunity is to make the club’s living culture visible without turning the building into a museum or erasing the rooms members love.",
    requirements: [
      "Preserve the old architecture, furniture and sense of ease rather than stage a wholesale interior redesign.",
      "Build a narrative broad enough for sport, dining, reading, celebration and quiet retreat.",
      "Represent women, men, children and older members as equal participants in club life.",
      "Let every room have its own emotional register while remaining recognisably part of one collection.",
      "Create a standalone mural study for every spatial concept, ready to be rebuilt against measured elevations.",
    ],
  },

  interpretation: [
    "The club is treated as a collection of recognisable rituals, not a crest, a skyline or a chronology. A hand held over a card game, the first tea on the verandah, a child copying an adult’s stance and three friends still talking after other tables have emptied carry more truth than a decorative history lesson.",
    "The architecture sets the volume. Formal rooms use painterly fields, mineral colour and generous quiet; social rooms deepen into oxblood, tobacco and evening indigo; sport introduces sharper geometry; children, teens and poolside spaces briefly lift into brighter blue and coral.",
    "Recurring figures and colours move across the property like familiar members. The effect is coherence without repetition: nineteen different rooms, one long sense of belonging.",
  ],

  palette: {
    intro:
      "The core palette begins with the materials already present in a heritage club, then adds three carefully controlled notes of life.",
    entries: [
      { name: "Club Ivory", hex: "#E7DDC4", purpose: "The breathable ground — plaster, paper and sun-warmed stone that lets large narrative walls sit lightly in old rooms.", share: "34%" },
      { name: "Pavilion Green", hex: "#294C3B", purpose: "The club’s steady register, drawn from billiard cloth, garden shade and painted timber.", share: "24%" },
      { name: "Bombay Indigo", hex: "#25465B", purpose: "Harbour depth, evening shadow and a cooler counterpoint to the timber-rich architecture.", share: "18%" },
      { name: "Oxblood Evening", hex: "#7C302D", purpose: "Ceremony and conversation — concentrated in the card room, dining room, bar and banquet foyer.", share: "14%" },
      { name: "Verandah Ochre", hex: "#BC754E", purpose: "The human warmth of saris, flowers, aged brass and afternoon light — the accent that makes a scene come alive.", share: "10%" },
    ],
    note:
      "Poolside and younger-member rooms lift indigo toward clear water blue. The guest suite desaturates the entire scheme into coastal mineral tones; both remain departures within the same family.",
  },

  motifs: {
    intro:
      "Five recurring observations make the collection feel discovered inside the club rather than imposed upon it.",
    entries: [
      { name: "The familiar table", description: "A place recognised by posture and ritual before any person needs to be named." },
      { name: "The held gesture", description: "A cue before contact, a card before play, a racket at the top of its arc — club life caught in anticipation." },
      { name: "The garden threshold", description: "Arches, leaves and long views that keep rooms connected to the ground beyond them." },
      { name: "The recurring member", description: "Figures glimpsed across different spaces and ages, turning separate murals into one social world." },
      { name: "The distant waterline", description: "A quiet South Mumbai atmosphere carried through harbour indigo, pale horizons and reflected light." },
    ],
  },

  chapters: spaces.map((space) => ({
    space: space.space,
    title: space.title,
    rationale: space.note,
    curated: space.room,
    alt: `${space.title} visualised in the ${space.space.toLowerCase()}`,
    aspect: space.roomAspect,
    series: [{ key: space.artwork, alt: `${space.title} — standalone mural artwork study`, caption: "The artwork" }],
  })),

  process: {
    intro:
      "A real commission begins with members’ memories and measured walls. The visual language is then made specific to that institution rather than copied from this imagined club.",
    steps: [
      { title: "Listen for the rituals", body: "Interview members and long-serving staff about the favourite chair, the Sunday habit, the annual event and the story everyone knows without writing down." },
      { title: "Read the building", body: "Map timber panelling, arches, doors, furniture, sightlines and the walls that should remain untouched before deciding where art can carry real presence." },
      { title: "Write one visual constitution", body: "Set the shared palette, painterly texture, recurring figures and rules of restraint, then let each room adjust the volume to its own use." },
      { title: "Compose to the elevation", body: "Rebuild every selected scene at final wall dimensions, placing faces, gestures and quiet fields around doors, joinery, furniture and the direction of approach." },
      { title: "Proof the atmosphere", body: "Test colour on the chosen wallcovering under the club’s actual daylight and evening lamps before approving the full print run." },
    ],
  },

  journeyHeading: "Nineteen spaces, one club life",

  ask: {
    heading: "Tell us what happens here every Sunday.",
    body: "Bring us the rituals, rooms and stories your members recognise. We’ll turn the life of your club into art that belongs to the building — and to the next generation.",
  },

  productionNote: {
    title: "A concept collection, ready for a real club’s story",
    body:
      "These images are speculative room visualisations and standalone raster artwork studies. They establish the collection’s narrative, placement and palette; they do not claim to document a real institution and are not final print files.",
    points: [
      "No real club, crest, archive or member is represented in this concept study.",
      "A commissioned collection would replace generic moments with approved stories drawn from the specific club and its staff.",
      "Each mural is rebuilt at measured wall dimensions with architectural obstructions and panel seams designed into the composition.",
      "Recognisable people and archival material are used only with permission and clear provenance.",
      "Final colour is approved through a physical substrate proof viewed in the room’s actual light.",
    ],
  },

  flip: { spreads: flipSpreads },
};
