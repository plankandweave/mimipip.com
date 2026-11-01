import type { Chapter, Project } from "./types";

const projectSlug = "the-golf-club-three-ways";

type SpaceStudy = {
  slug: string;
  space: string;
  title: string;
  rationale: string;
};

const directions: {
  key: "contours" | "swing" | "fairway";
  name: string;
  subtitle: string;
  body: string;
  draws: string[];
  studies: SpaceStudy[];
}[] = [
  {
    key: "contours",
    name: "Contours of the Course",
    subtitle: "The golf landscape, made architectural",
    body:
      "Topographic fairways, water lines, bunkers and distant ridges become quiet mineral murals. This is the most restrained direction: tactile enough for a premium club, calm enough to live beside stone, timber and long views of the course.",
    draws: ["Course contours", "Bunker forms", "Water and tree lines", "Mineral greens and blue-grey"],
    studies: [
      { slug: "reception", space: "Reception", title: "First Tee", rationale: "A broad aerial composition turns arrival into orientation: the course is felt before it is seen, without a literal club crest or trophy wall." },
      { slug: "members-lounge", space: "Members’ lounge", title: "The Course Between Us", rationale: "Layered fairways hold the room together at conversational volume, giving the lounge a distinct identity without competing with people or the view." },
      { slug: "bar", space: "Bar", title: "Last Light on the Ninth", rationale: "Deeper greens and a low horizon bring evening weight to the bar while the contour lines keep the long wall moving." },
      { slug: "dining", space: "Dining room", title: "A Table in the Landscape", rationale: "A spacious course panorama extends the dining room visually and keeps the artwork composed behind changing table layouts." },
      { slug: "covered-terrace", space: "Covered terrace", title: "Where the Green Opens", rationale: "The mural echoes the real landscape beyond the glazing, connecting indoors and outdoors without trying to imitate the view exactly." },
      { slug: "locker-lounge", space: "Locker lounge", title: "The Walk Before Play", rationale: "A quieter landscape marks the pause between changing and stepping onto the course, making a functional room feel considered." },
      { slug: "pro-shop", space: "Pro shop", title: "Reading the Course", rationale: "An aerial composition gives the retail wall a strong destination while leaving merchandise, fittings and wayfinding visually clear." },
      { slug: "simulator-lounge", space: "Simulator lounge", title: "Course Memory", rationale: "Abstracted greens connect the digital round to the physical course and soften the screen-led character of the room." },
      { slug: "event-room", space: "Event room", title: "A Field for Gathering", rationale: "The landscape is broad and ceremonial enough for dinners and presentations, yet neutral enough to support changing event themes." },
      { slug: "fitness-studio", space: "Fitness studio", title: "Terrain in Motion", rationale: "Long, rising contours suggest endurance and pace without filling the studio with conventional athletic graphics." },
    ],
  },
  {
    key: "swing",
    name: "The Art of the Swing",
    subtitle: "Movement, trajectory and sporting confidence",
    body:
      "The golfer’s arc becomes a graphic system of silhouettes, flight lines and oversized ball geometry. Navy, warm white and vermilion make this the most recognisable sporting direction—bold, contemporary and legible from across large rooms.",
    draws: ["Swing arcs", "Ball flight", "Athletic silhouettes", "Navy, white and vermilion"],
    studies: [
      { slug: "reception", space: "Reception", title: "The Opening Drive", rationale: "One assured swing creates an immediate sense of purpose at arrival and makes the newer club feel contemporary rather than ceremonial." },
      { slug: "members-lounge", space: "Members’ lounge", title: "Follow-through", rationale: "A long arc travels behind the seating, adding energy while keeping the social foreground visually calm." },
      { slug: "bar", space: "Bar", title: "The Long Arc", rationale: "Deep navy carries into the evening palette and the red flight line gives the bar a memorable visual signature." },
      { slug: "dining", space: "Dining room", title: "A Game in Motion", rationale: "The composition stretches horizontally so the room reads as one gathering place, even when tables are rearranged." },
      { slug: "covered-terrace", space: "Covered terrace", title: "Against the Sky", rationale: "A clean athletic silhouette holds its own against bright daylight and the open course beyond the terrace." },
      { slug: "locker-lounge", space: "Locker lounge", title: "Ready Stance", rationale: "The poised figure captures anticipation rather than victory, fitting the private ritual just before a round." },
      { slug: "pro-shop", space: "Pro shop", title: "Built for the Swing", rationale: "Graphic movement gives the merchandise zone a confident backdrop without borrowing campaign photography or brand marks." },
      { slug: "simulator-lounge", space: "Simulator lounge", title: "Trajectory", rationale: "Flight lines bridge the physical gesture and the simulated result, giving the technology a human centre." },
      { slug: "event-room", space: "Event room", title: "The Winning Line", rationale: "The largest arc becomes a stage-like backdrop for club presentations, celebrations and tournament evenings." },
      { slug: "fitness-studio", space: "Fitness studio", title: "Power and Balance", rationale: "The controlled rotation of the swing brings athletic focus to the studio without turning it into a generic gym." },
    ],
  },
  {
    key: "fairway",
    name: "Beyond the Fairway",
    subtitle: "The social life that makes a club belong",
    body:
      "Painterly scenes bring members, families, guests and staff into one generous contemporary club culture. Lilac, terracotta, leaf green and sunlit yellow make this the warmest direction—the course is present, but the real subject is time spent together.",
    draws: ["Members and guests", "Post-round rituals", "Garden colour", "Lilac, terracotta and yellow"],
    studies: [
      { slug: "reception", space: "Reception", title: "Everyone Arrives", rationale: "A mixed social scene makes belonging visible at the threshold and sets a welcoming tone for members, families and guests." },
      { slug: "members-lounge", space: "Members’ lounge", title: "The Club After Play", rationale: "Conversation, rest and the view of the course replace formal portraiture with a recognisable picture of contemporary club life." },
      { slug: "bar", space: "Bar", title: "The Nineteenth Hole", rationale: "The mural treats the post-round gathering as the evening’s main story, with enough detail to reward regular viewing." },
      { slug: "dining", space: "Dining room", title: "A Longer Table", rationale: "Overlapping groups and garden colour make the room feel convivial while avoiding literal food or hospitality clichés." },
      { slug: "covered-terrace", space: "Covered terrace", title: "All Afternoon", rationale: "An easy outdoor gathering mirrors the terrace’s actual use and brings warmth to the wall when the course light turns flat." },
      { slug: "locker-lounge", space: "Locker lounge", title: "Between Rounds", rationale: "Small gestures and passing conversations humanise a transitional room without compromising its practical clarity." },
      { slug: "pro-shop", space: "Pro shop", title: "The New Clubhouse", rationale: "The shop becomes part of the social route through the club rather than a retail box detached from the rest of the experience." },
      { slug: "simulator-lounge", space: "Simulator lounge", title: "Play Continues", rationale: "The social scene balances the digital screen and frames simulation as another way members spend time together." },
      { slug: "event-room", space: "Event room", title: "An Open Invitation", rationale: "A celebratory panorama gives private events a sense of place while remaining useful for the club’s everyday calendar." },
      { slug: "fitness-studio", space: "Fitness studio", title: "Move Together", rationale: "A lively shared scene broadens the club’s idea of activity beyond the scorecard and makes fitness part of belonging." },
    ],
  },
];

/** Standalone plates keep the aspect generated for the composition. */
const artworkHeights: Record<string, number> = {
  "contours-reception": 533,
  "contours-event-room": 511,
  "swing-reception": 640,
  "swing-members-lounge": 463,
  "swing-dining": 448,
  "swing-event-room": 640,
  "swing-fitness-studio": 592,
  "fairway-members-lounge": 640,
  "fairway-dining": 510,
  "fairway-covered-terrace": 640,
  "fairway-pro-shop": 640,
  "fairway-simulator-lounge": 710,
  "fairway-event-room": 480,
};

const chapters: Chapter[] = directions.flatMap((direction) =>
  direction.studies.map((study) => {
    const base = `${projectSlug}/${direction.key}-${study.slug}`;
    return {
      space: `${direction.name} · ${study.space}`,
      title: study.title,
      rationale: study.rationale,
      plain: `${base}-before.jpg`,
      curated: `${base}-after.jpg`,
      alt: `${study.title} mural from ${direction.name} in a contemporary golf-club ${study.space.toLowerCase()}`,
      aspect: "3/2",
      series: [
        {
          key: `${base}-artwork.jpg`,
          alt: `${study.title} standalone mural artwork from ${direction.name}`,
          caption: "The standalone artwork",
          aspect: `1080/${artworkHeights[`${direction.key}-${study.slug}`] ?? 720}`,
        },
      ],
    };
  }),
);

export const theGolfClubThreeWays: Project = {
  slug: projectSlug,
  kind: "concept",
  theme: "bright",
  segments: ["hospitality"],

  client: "A new-generation golf club",
  title: "The Golf Club, Three Ways",
  standfirst:
    "Three complete art directions for ten golf-club spaces—from quiet course contours to the energy of the swing and the social life beyond the fairway.",
  facts: [
    { label: "Directions", value: "3 complete worlds" },
    { label: "Spaces", value: "10 per direction" },
    { label: "Designs", value: "30 available concepts" },
    { label: "Format", value: "Before · after · artwork" },
  ],
  cover: `${projectSlug}/fairway-reception-after.jpg`,

  brief: {
    intro:
      "Imagine the golf club as a newer, more open counterpart to the traditional members’ club: fewer inherited rituals, broader amenity use and an audience that expects hospitality, wellness, sport and social life to feel part of one place.",
    requirements: [
      "Create three genuinely different visual directions, not colourways of one idea.",
      "Carry each direction through reception, lounge, bar, dining, terrace, lockers, retail, simulation, events and fitness.",
      "Show every proposal as the same room before and after so the wall’s effect is visible.",
      "Separate the artwork from the room view so each design can be selected and prepared for a real wall.",
      "Keep architecture, furniture, daylight and sightlines intact; the transformation must come from the wall.",
    ],
  },
  interpretation: [
    "A golf club is not only about golf. It is an arrival, a morning ritual, a place to recover, meet, eat, work, train and stay after the round.",
    "The three directions answer three different commercial briefs. Contours is quiet and premium. Swing is bold and sporting. Beyond the Fairway is warm, social and inclusive. A club can adopt one throughout or combine them deliberately by zone.",
    "Every slider uses a matched architectural frame. The furniture does not perform the makeover; the wall does.",
  ],
  palette: {
    intro: "Three related worlds share natural grounds, then change tempo through their accents.",
    entries: [
      { name: "Warm mineral", hex: "#D8CCB7", purpose: "The common architectural ground", share: "28%" },
      { name: "Fairway green", hex: "#667255", purpose: "Landscape, calm and continuity", share: "22%" },
      { name: "Deep navy", hex: "#17365D", purpose: "Sporting weight and long graphic arcs", share: "18%" },
      { name: "Vermilion", hex: "#C94E35", purpose: "Trajectory, emphasis and pace", share: "10%" },
      { name: "Garden lilac", hex: "#A98EB5", purpose: "A contemporary social note", share: "10%" },
      { name: "Sunlit yellow", hex: "#E3B94B", purpose: "Warmth, welcome and activity", share: "12%" },
    ],
    note: "One direction should lead each room. The palette connects the property; it is not permission to place every colour on every wall.",
  },
  motifs: {
    intro: "Each family has one recognisable visual grammar that can expand or quieten with the room.",
    entries: directions.map((direction) => ({
      name: direction.name,
      description: direction.subtitle,
      image: `${projectSlug}/${direction.key}-reception-artwork.jpg`,
      href: `https://zyvorah.com/concepts/${projectSlug}?design=${encodeURIComponent(`${direction.name} · Reception`)}`,
    })),
  },
  chapters,
  buildingLabel: "The three concept directions",
  buildings: {
    intro:
      "These are complete property concepts, each tested in the same ten amenity spaces. Choose a world first; then choose the individual walls that deserve to speak.",
    entries: directions.map((direction) => ({
      name: direction.name,
      subtitle: direction.subtitle,
      body: direction.body,
      draws: direction.draws,
    })),
  },
  wallHierarchy: {
    intro:
      "A strong club programme is remembered for a few decisive walls and the rhythm between them. Coverage is planned by role, not sold by square metre.",
    note: "Reception, bar and event room can anchor the story; lounges and amenity rooms carry it; the remaining architecture stays quiet.",
    levels: [
      { level: "Anchor", purpose: "Large identity walls at arrival and gathering points", share: 20 },
      { level: "Supporting", purpose: "Selected social, retail, sport and wellness walls", share: 35 },
      { level: "Quiet", purpose: "Uncovered stone, timber, glazing and calm circulation", share: 45 },
    ],
  },
  journeys: {
    intro: "One club, read through three common visits.",
    entries: [
      { who: "The regular round", route: ["Reception", "Locker lounge", "Course", "Bar", "Dining"], body: "The art moves from anticipation to release, ending where the post-round story becomes social." },
      { who: "The family afternoon", route: ["Reception", "Members’ lounge", "Covered terrace", "Dining", "Event room"], body: "Belonging is visible even for someone who is not playing; the club feels generous beyond the fairway." },
      { who: "The contemporary member", route: ["Fitness studio", "Pro shop", "Simulator lounge", "Members’ lounge"], body: "Wellness, retail and technology are treated as part of the same designed experience, not secondary rooms." },
    ],
  },
  process: {
    intro: "The concept is ready to choose. A purchased design then becomes a measured wall package.",
    steps: [
      { title: "Choose the direction", body: "Compare the three worlds at property scale and decide which one expresses the club." },
      { title: "Choose the walls", body: "Select individual concepts by room instead of covering every available surface." },
      { title: "Fit the real architecture", body: "Share wall dimensions, openings and site photographs so the chosen artwork can be recomposed for the exact elevation." },
      { title: "Prepare and proof", body: "Final files are rebuilt to production scale, divided into panels, colour-managed and proofed before printing." },
    ],
  },
  journeyHeading: "Three directions. Ten spaces each. Drag every room from before to after.",
  ask: {
    heading: "Which golf club should these walls belong to?",
    body: "Buy an individual concept, build a complete look from one direction, or commission a club-specific collection drawn from the course, landscape and member culture.",
  },
  productionNote: {
    title: "Concept artwork, prepared for your wall after selection",
    body:
      "The standalone images show the complete design intent and make each concept selectable. They are not yet press files for an unknown wall: final output depends on the measured elevation, viewing distance, substrate, panel width and printer profile.",
    points: [
      "Confirm exact wall dimensions, doors, glazing, joinery and protected areas.",
      "Recompose and rebuild artwork to final scale rather than enlarging the presentation image blindly.",
      "Add bleed, panel divisions and installation marks for the selected material and printer.",
      "Approve a colour-managed physical proof before the full run.",
    ],
  },
};
