import type { Project } from "./types";

/**
 * Education concept study — a K–12 hill campus in Shillong.
 *
 * The sequence begins with the public and academic heart of the school, then
 * moves into the smaller transition and staff spaces that make a wet-climate
 * campus work every day.
 */
export const schoolThatListensToRain: Project = {
  slug: "school-that-listens-to-rain",
  kind: "concept",
  theme: "calm",
  segments: ["education"],

  client: "A Northeast hill campus",
  title: "The School That Listens to Rain",
  standfirst:
    "A Shillong K–12 campus shaped by cloud, slope and the daily movement between indoors and out — a visual system that treats rain as part of learning, not an inconvenience outside it.",
  facts: [
    { label: "School", value: "K–12 hill campus" },
    { label: "Setting", value: "Shillong, Meghalaya" },
    { label: "Spaces shown", value: "10 matched viewpoints" },
    { label: "Visual idea", value: "Rain becomes a living system" },
  ],

  cover: "school-that-listens-to-rain/arrival-hall-curated.jpg",

  brief: {
    intro:
      "A school in the Northeast should not feel like a plains-campus template placed on a hill. In Shillong, rain changes how students arrive, wait, gather, move and look outside. The opportunity was to build an identity from that lived climate while avoiding decorative borrowing from communities whose symbols require context and permission.",
    requirements: [
      "Let rain, mist, contour and living systems provide the visual grammar without turning the campus into scenic wallpaper.",
      "Treat covered routes and wet-weather thresholds as important learning and belonging spaces, not leftover circulation.",
      "Connect ecology, science, art and community life through one adaptable campus system.",
      "Ground the work regionally without reproducing tribal motifs, textiles or sacred forms as surface decoration.",
      "Reduce visual volume in reflective and adult spaces while keeping them unmistakably part of the same school.",
    ],
  },

  interpretation: [
    "Cloud layers, rain paths and hillside contours create the shared structure. Water is shown as a connector: it travels across roofs and slopes, feeds fern systems and makes the campus read as one watershed.",
    "Fern fronds and living roots soften the geometry, while wet-stone fields and fine contour lines give the system architectural discipline. The result belongs to the climate without borrowing a cultural language that is not ours to claim.",
    "The public spaces receive the fullest weather story. Learning spaces become more analytical. Walkways and bag-drop zones turn transition into ritual, while staff rooms use only a residue of mist, root and contour so concentration still has room.",
  ],

  palette: {
    intro: "Cloud, wet stone, fern, bark and the brief colour that appears through Shillong mist.",
    entries: [
      { name: "Cloud White", hex: "#E8ECE7", purpose: "Light and breathing room through long wet seasons." },
      { name: "Wet Stone", hex: "#354247", purpose: "The grounding structure of slope and architecture." },
      { name: "Fern Green", hex: "#42664F", purpose: "Regeneration, ecology and close observation." },
      { name: "Rain Blue", hex: "#7095A5", purpose: "Movement, atmosphere and connected water systems." },
      { name: "Rhododendron", hex: "#A45257", purpose: "A measured accent for energy and gathering." },
      { name: "Warm Bark", hex: "#8A6B50", purpose: "Human warmth against mist, stone and rain." },
    ],
    note:
      "The palette is deeper in arrival and gathering spaces, more analytical in science rooms, and deliberately pale where students or staff need calm.",
  },

  motifs: {
    intro: "A climate-led grammar built from processes that students can observe around them.",
    entries: [
      { name: "Rain paths", description: "Fine vertical and diagonal routes show movement, collection and return." },
      { name: "Cloud layers", description: "Soft overlapping fields create depth without demanding constant attention." },
      { name: "Hillside contours", description: "Measured lines connect architecture, topography and orientation." },
      { name: "Fern and root", description: "Living structures represent resilience, interdependence and regrowth." },
      { name: "Open mist", description: "Unprinted ground keeps the system spacious and lets real windows and landscape remain active." },
    ],
  },

  buildingLabel: "Campus movements",
  buildings: {
    intro:
      "The main presentation establishes the school's public, communal and academic character first. Supporting spaces follow to show that the same idea can improve the quieter parts of daily life.",
    entries: [
      {
        name: "Arrive and gather",
        subtitle: "The campus introduces itself through weather",
        body: "Arrival and assembly make rain, contour and canopy legible at the largest scale, giving families a school identity built from its actual setting.",
        draws: ["Cloud fields", "A connected watershed", "Sheltering root structures"],
      },
      {
        name: "Learn and observe",
        subtitle: "Landscape becomes a way of thinking",
        body: "Library, ecology lab and covered learning routes shift the same grammar between quiet attention, scientific observation and movement through changing weather.",
        draws: ["Fine contours", "Rain-data rhythms", "Open mist"],
      },
      {
        name: "Make and belong",
        subtitle: "Collective life has colour and rhythm",
        body: "Art, music, dining and student commons allow the system to overlap more freely, making room for performance, conversation and informal exchange.",
        draws: ["Rhododendron accents", "Layered fronds", "Converging paths"],
      },
      {
        name: "Transition and sustain",
        subtitle: "Small spaces carry the culture too",
        body: "Wet-weather storage and faculty planning use a quieter register, proving that practical thresholds and adult workspaces belong inside the campus story.",
        draws: ["Draining routes", "Measured roots", "Generous open ground"],
      },
    ],
  },

  chapters: [
    {
      space: "Main arrival hall",
      title: "The Campus Begins With Weather",
      rationale:
        "Cloud, contour, rain and root systems meet on the first wall. The composition turns the school's wet hill setting into a confident welcome rather than treating climate as something the architecture must hide.",
      plain: "school-that-listens-to-rain/arrival-hall-plain.jpg",
      curated: "school-that-listens-to-rain/arrival-hall-curated.jpg",
      alt: "Shillong school arrival hall with a cloud, rain path and hillside contour mural",
    },
    {
      space: "Assembly commons",
      title: "Many Streams, One Gathering",
      rationale:
        "Rain paths converge into one broad watershed across the communal wall. The image gives assembly a sense of shared purpose while the softer cloud layers keep a large room from becoming visually hard.",
      plain: "school-that-listens-to-rain/assembly-commons-plain.jpg",
      curated: "school-that-listens-to-rain/assembly-commons-curated.jpg",
      alt: "Hill-campus assembly commons with an expansive watershed and cloud mural",
    },
    {
      space: "Library and reading room",
      title: "A Quiet Held by Mist",
      rationale:
        "The system lowers to a pale horizon of mist, fern and distant contour. It makes the reading room recognisably part of the campus without competing with books or the landscape beyond the windows.",
      plain: "school-that-listens-to-rain/library-plain.jpg",
      curated: "school-that-listens-to-rain/library-curated.jpg",
      alt: "School library with a restrained mist, fern and contour mural",
    },
    {
      space: "Science and ecology lab",
      title: "Follow the Water",
      rationale:
        "Rain routes become observational diagrams that move through root, soil and leaf structures. The wall links the campus watershed to scientific inquiry without becoming an instructional poster.",
      plain: "school-that-listens-to-rain/ecology-lab-plain.jpg",
      curated: "school-that-listens-to-rain/ecology-lab-curated.jpg",
      alt: "School ecology lab with an abstract rain, root and living systems mural",
    },
    {
      space: "Covered hillside walkway",
      title: "The Route Is Part of School",
      rationale:
        "Long contours and rain paths follow the direction of travel, turning an essential covered edge into orientation, shelter and a continuing encounter with the hill rather than a blank connector between rooms.",
      plain: "school-that-listens-to-rain/covered-walkway-plain.jpg",
      curated: "school-that-listens-to-rain/covered-walkway-curated.jpg",
      alt: "Covered school walkway with a directional hillside and rain mural",
    },
    {
      space: "Art and music studio",
      title: "Weather Finds a Rhythm",
      rationale:
        "Rain lines loosen into cadence, cloud fields overlap and rhododendron accents appear. The room receives more improvisation while staying connected to the natural system used across the academic campus.",
      plain: "school-that-listens-to-rain/art-music-studio-plain.jpg",
      curated: "school-that-listens-to-rain/art-music-studio-curated.jpg",
      alt: "School art and music studio with a rhythmic rain and cloud mural",
    },
    {
      space: "Dining hall",
      title: "The Watershed Becomes a Table",
      rationale:
        "Streams, roots and contour bands gather into a warmer communal composition. Dining is shown as a daily meeting of routes and stories, with enough visual energy to hold the room at its busiest.",
      plain: "school-that-listens-to-rain/dining-hall-plain.jpg",
      curated: "school-that-listens-to-rain/dining-hall-curated.jpg",
      alt: "School dining hall with a warm watershed, roots and contour mural",
    },
    {
      space: "Student commons",
      title: "Room Between the Timetable",
      rationale:
        "Loose cloud forms and branching paths overlap around places to sit and talk. The mural gives informal student life its own identity while keeping sightlines and furniture visually clear.",
      plain: "school-that-listens-to-rain/student-commons-plain.jpg",
      curated: "school-that-listens-to-rain/student-commons-curated.jpg",
      alt: "Student commons with a layered cloud, fern and branching paths mural",
    },
    {
      space: "Wet-weather transition",
      title: "Arrival Continues at the Threshold",
      rationale:
        "A practical bag-and-rainwear zone receives downward-moving lines, small contour markers and clear open ground. The wall makes an untidy daily ritual feel considered without disguising what the space must do.",
      plain: "school-that-listens-to-rain/wet-weather-transition-plain.jpg",
      curated: "school-that-listens-to-rain/wet-weather-transition-curated.jpg",
      alt: "School wet-weather bag drop with a restrained rain path and contour mural",
    },
    {
      space: "Faculty planning room",
      title: "Where the Weather Settles",
      rationale:
        "The adult expression is reduced to fine contour, root and mist. It carries the campus identity at a lower volume, giving teachers a composed setting for planning, collaboration and pause.",
      plain: "school-that-listens-to-rain/faculty-planning-plain.jpg",
      curated: "school-that-listens-to-rain/faculty-planning-curated.jpg",
      alt: "Faculty planning room with a quiet contour, root and mist mural",
    },
  ],

  journeyHeading: "10 spaces, one climate-aware campus.",
  process: {
    intro: "Begin with climate and lived movement, then build the campus story with local participation.",
    steps: [
      {
        title: "Walk the campus in rain",
        body: "Routes, pauses, views, wet thresholds and maintenance pressure are recorded when the climate is active, not inferred from a dry plan.",
      },
      {
        title: "Listen locally",
        body: "Students, educators, facilities teams and local cultural collaborators determine what feels true, what needs permission and what should remain outside the visual system.",
      },
      {
        title: "Change register by space",
        body: "One grammar is tested at public, academic, communal and support scales so energy follows the purpose of the room.",
      },
      {
        title: "Resolve for wet conditions",
        body: "Exact elevations, substrate moisture, ventilation, cleaning, panel joints and material performance are resolved before colour proofing and installation.",
      },
    ],
  },

  productionNote: {
    title: "A concept, presented honestly",
    body:
      "This is an invented Shillong school and every image is a concept visual. It deliberately avoids reproducing community-specific motifs. A real programme would be developed with the school, local collaborators and the actual architecture, including:",
    points: [
      "Student, educator, family and local-community consultation",
      "Permission and attribution for any culturally specific reference",
      "Exact wall measurements, views and architectural interruptions",
      "Damp substrates, moisture, ventilation and cleaning conditions",
      "Sensory load, accessibility, safeguarding and age requirements",
      "Fire performance, panel planning and approved physical colour proofs",
    ],
  },

  ask: {
    heading: "Show us the route the rain changes.",
    body:
      "Send the campus contour plan, one wet-weather circulation route and photographs of the walls students meet along it. We will show where climate can become a useful, coherent part of the school identity.",
  },
};
