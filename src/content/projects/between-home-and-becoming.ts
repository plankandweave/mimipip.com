import type { Project } from "./types";

/**
 * Education concept study — a contemporary residential school in Dehradun.
 *
 * The public and shared heart of the school leads the story. Residential,
 * pastoral and family-facing spaces follow, at a deliberately quieter volume.
 */
export const betweenHomeAndBecoming: Project = {
  slug: "between-home-and-becoming",
  kind: "concept",
  theme: "warm",
  segments: ["education"],

  client: "A residential school",
  title: "Between Home and Becoming",
  standfirst:
    "A Dehradun residential campus where academic ambition and everyday care belong to one story — helping students feel held when they arrive, connected while they live together and ready for the path beyond school.",
  facts: [
    { label: "School", value: "Residential K–12" },
    { label: "Setting", value: "Dehradun, Uttarakhand" },
    { label: "Spaces shown", value: "10 matched viewpoints" },
    { label: "Visual idea", value: "Many paths, a shared grove" },
  ],

  cover: "between-home-and-becoming/arrival-curated.jpg",

  brief: {
    intro:
      "A residential school is not only where a student studies. It is where they wake, eat, prepare, compete, recover, miss home, make friendships and gradually become more independent. The campus needed a visual identity capable of holding that whole arc without falling back on crests, shields, mottos or inherited colonial nostalgia.",
    requirements: [
      "Connect academic, residential, communal and pastoral spaces through one recognisable visual system.",
      "Make arrival reassuring for students and families without making the institution feel over-protective.",
      "Give house life warmth and identity without relying on heraldry, mascots, flags or competitive symbols.",
      "Let high-energy spaces feel collective while study, dormitory and wellbeing spaces remain calm.",
      "Design every intervention around real furniture, viewing distance, supervision, cleaning and nighttime use.",
    ],
  },

  interpretation: [
    "Paths are the central device: they arrive separately, meet beneath a shared grove and continue beyond it. The same line can describe the journey from home, the structure of a school day or the independence a student is gradually building.",
    "Sal-tree canopies and foothill contours ground the system in the Dehradun valley. Small constellation-like points act as distant windows — moments of orientation rather than a decorative star theme.",
    "Public rooms show the complete journey at a generous scale. Academic spaces make it more measured. House and dining spaces make it social. Dormitory, wellbeing and family rooms leave more open ground because belonging is not created by visual volume alone.",
  ],

  palette: {
    intro: "Sal groves, valley distance, brick, winter light and the warm ground of a shared campus.",
    entries: [
      { name: "Sal Green", hex: "#3F5847", purpose: "Shelter, continuity and the campus grove." },
      { name: "Valley Blue", hex: "#718791", purpose: "Distance, reflection and a wider horizon." },
      { name: "Brick Terracotta", hex: "#A2644D", purpose: "Warmth, human presence and the material campus." },
      { name: "Winter Gold", hex: "#C6A052", purpose: "Orientation, energy and small moments of confidence." },
      { name: "Warm Cream", hex: "#E8DFCE", purpose: "The open ground that keeps the system generous." },
      { name: "Bark", hex: "#775E4A", purpose: "A steady line through residential and adult spaces." },
    ],
    note:
      "Gold appears as a point, never a field. The deepest greens belong to communal rooms; cream and valley blue take over where rest, study or difficult conversations need quiet.",
  },

  motifs: {
    intro: "A residential-school language based on movement, shelter and the confidence to continue.",
    entries: [
      { name: "Arriving paths", description: "Individual routes acknowledge that every student enters with a different history." },
      { name: "The shared grove", description: "A sheltering sal canopy represents house, friendship and institutional care without becoming a badge." },
      { name: "Thresholds", description: "Rounded openings mark the movement between private, shared, academic and family life." },
      { name: "Foothill contours", description: "Measured layers ground the campus and become more directional in learning and sport." },
      { name: "Distant windows", description: "Small constellation points offer orientation and a sense of what lies beyond the present term." },
    ],
  },

  buildingLabel: "A student's day",
  buildings: {
    intro:
      "The presentation begins with the public, academic and communal spaces that establish the campus proposition, then follows the same system into residence, care, sport and family contact.",
    entries: [
      {
        name: "Arrive and understand",
        subtitle: "The first wall makes the whole journey legible",
        body: "Reception and the academic heart show separate paths finding shelter and moving forward, giving students and families confidence without ceremonial symbolism.",
        draws: ["The full grove", "Foothill paths", "Distant windows"],
      },
      {
        name: "Learn and prepare",
        subtitle: "Structure opens into possibility",
        body: "Library and prep spaces flatten the landscape into measured lines, balancing discipline with a horizon that remains open.",
        draws: ["Quiet contours", "Study lines", "Generous open ground"],
      },
      {
        name: "Live together",
        subtitle: "House and dining become the social centre",
        body: "Common and dining rooms allow routes to overlap and canopies to deepen, giving daily gathering a strong but unforced sense of belonging.",
        draws: ["Converging routes", "Shared clearings", "Warm seasonal colour"],
      },
      {
        name: "Be held and continue",
        subtitle: "Care, transition and return use a quieter register",
        body: "Dormitory, wellbeing, sport and visiting-family spaces adapt the same language to rest, recovery, momentum and reunion.",
        draws: ["Soft thresholds", "Sheltering branches", "Paths continuing outward"],
      },
    ],
  },

  chapters: [
    {
      space: "Main arrival and reception",
      title: "Every Path Can Belong Here",
      rationale:
        "A full sal grove rises from layered foothill routes and small points of orientation. The wall reassures a student entering residential life while showing families that independence and care are not opposite ideas.",
      plain: "between-home-and-becoming/arrival-plain.jpg",
      curated: "between-home-and-becoming/arrival-curated.jpg",
      alt: "Residential school reception with a sal-grove, foothill and pathways mural",
    },
    {
      space: "Central academic hall",
      title: "The Route Opens",
      rationale:
        "Parallel contours become paths that split, cross and move toward a light horizon. The composition gives a major academic junction direction and optimism without relying on motivational text.",
      plain: "between-home-and-becoming/academic-hall-plain.jpg",
      curated: "between-home-and-becoming/academic-hall-curated.jpg",
      alt: "Residential school academic hall with an abstract pathways and horizon mural",
    },
    {
      space: "Library and study hall",
      title: "Knowledge Accumulates Quietly",
      rationale:
        "A low grove, fine contours and sparse distant points create a long visual horizon above the books. The image belongs to evening study as comfortably as daytime reading because it does not demand attention.",
      plain: "between-home-and-becoming/library-study-plain.jpg",
      curated: "between-home-and-becoming/library-study-curated.jpg",
      alt: "Residential school library with a quiet sal grove and valley contour mural",
    },
    {
      space: "House common room",
      title: "Private Stories, Shared Ground",
      rationale:
        "Several routes arrive beneath one generous canopy. Rounded thresholds and warm earth fields make the composition social and domestic, giving house life identity without a name, mascot or shield.",
      plain: "between-home-and-becoming/house-common-room-plain.jpg",
      curated: "between-home-and-becoming/house-common-room-curated.jpg",
      alt: "Residential house common room with converging paths and sal canopy mural",
    },
    {
      space: "Dining hall",
      title: "The Whole School Meets Daily",
      rationale:
        "Paths widen into a shared clearing framed by seasonal groves. The largest daily gathering receives enough scale and colour to hold the room at its busiest while remaining more human than ceremonial.",
      plain: "between-home-and-becoming/dining-hall-plain.jpg",
      curated: "between-home-and-becoming/dining-hall-curated.jpg",
      alt: "Residential school dining hall with a large shared-clearing and sal-tree mural",
    },
    {
      space: "Dormitory corridor and landing",
      title: "From My Room to Our House",
      rationale:
        "Soft thresholds and gently meeting paths mark the movement from private room to shared landing. A sparse canopy gives nighttime circulation identity without creating visual noise close to sleep.",
      plain: "between-home-and-becoming/dormitory-corridor-plain.jpg",
      curated: "between-home-and-becoming/dormitory-corridor-curated.jpg",
      alt: "School dormitory landing with quiet thresholds, paths and canopy mural",
    },
    {
      space: "Evening supervised prep room",
      title: "Effort Has a Horizon",
      rationale:
        "Measured study lines move through a darkening valley toward a small field of distant points. The mural acknowledges sustained evening effort while keeping the room disciplined, calm and free of slogans.",
      plain: "between-home-and-becoming/evening-prep-plain.jpg",
      curated: "between-home-and-becoming/evening-prep-curated.jpg",
      alt: "Evening prep room with a restrained foothill horizon and constellation mural",
    },
    {
      space: "Wellbeing and infirmary waiting",
      title: "Held While You Find the Way Forward",
      rationale:
        "A light branch shelters a pale valley with one slow route through it. This is the quietest wall in the study, helping the room feel cared for without illustrating illness or asking an unsettled student to process more.",
      plain: "between-home-and-becoming/wellbeing-waiting-plain.jpg",
      curated: "between-home-and-becoming/wellbeing-waiting-curated.jpg",
      alt: "School wellbeing waiting room with a pale sheltering branch and valley mural",
    },
    {
      space: "Sports pavilion transition",
      title: "Practice Becomes Momentum",
      rationale:
        "Contour lines accelerate into intersecting routes and a broad green arc. The wall adds collective energy at the threshold to the field without depicting athletes, equipment or a winning slogan.",
      plain: "between-home-and-becoming/sports-transition-plain.jpg",
      curated: "between-home-and-becoming/sports-transition-curated.jpg",
      alt: "School sports pavilion with an energetic contour and intersecting-routes mural",
    },
    {
      space: "Visiting family lounge",
      title: "Return, Meet, Continue",
      rationale:
        "Two paths meet in a warm clearing beneath the grove and continue toward the horizon. The image acknowledges reunion and leaving again without turning a private family moment into sentimental scenery.",
      plain: "between-home-and-becoming/family-lounge-plain.jpg",
      curated: "between-home-and-becoming/family-lounge-curated.jpg",
      alt: "Residential school family lounge with meeting paths and a warm grove mural",
    },
  ],

  journeyHeading: "10 spaces, one life between terms.",
  process: {
    intro: "Map the student's whole day before deciding which walls should speak and which should stay quiet.",
    steps: [
      {
        title: "Follow a student's week",
        body: "Arrival, study, meals, house life, sport, care, family visits and evening circulation are mapped as one lived system rather than separate interior packages.",
      },
      {
        title: "Listen across the house",
        body: "Students, families, teachers, house staff, counsellors, nurses and facilities teams identify emotional pressure, operational reality and where identity is genuinely useful.",
      },
      {
        title: "Set the volume room by room",
        body: "The visual grammar is tested against energy, viewing distance, supervision and time of day before a composition is approved.",
      },
      {
        title: "Build for residential wear",
        body: "Exact elevations, corners, cleaning zones, material performance, panel seams and physical colour are resolved for a campus that is occupied far beyond classroom hours.",
      },
    ],
  },

  productionNote: {
    title: "A concept, presented honestly",
    body:
      "This is an invented residential school and every image is a concept visual. The emotional and production framework is real; a commissioned programme would be rebuilt around the school's own architecture, pastoral model and student community, including:",
    points: [
      "Student, family, teaching, residential and wellbeing-team input",
      "Age bands, house structure, safeguarding and supervision",
      "Exact elevations, furniture, doors, windows and sightlines",
      "Day and night viewing, sensory load and accessibility",
      "High-contact cleaning, abrasion, washability and fire requirements",
      "Panel widths, seam positions and approved physical colour proofs",
    ],
  },

  ask: {
    heading: "Show us where school becomes home.",
    body:
      "Send the campus plan, the first route to residence and photographs of one academic and one house wall. We will identify where a shared visual system can create the most meaningful continuity.",
  },
};
