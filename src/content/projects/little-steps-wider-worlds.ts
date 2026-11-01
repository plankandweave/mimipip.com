import type { Project } from "./types";

/** A small standalone preschool ending at Senior KG, before the larger school. */
export const littleStepsWiderWorlds: Project = {
  slug: "little-steps-wider-worlds",
  kind: "concept",
  theme: "bright",
  segments: ["education"],
  client: "A Nursery-to-Senior-KG preschool",
  title: "Little Steps, Wider Worlds",
  standfirst:
    "A small neighbourhood preschool where Nursery, Junior KG and Senior KG share one identity that gradually opens up — from familiar shapes and daily routines to the confidence of finding a way into a bigger school.",
  facts: [
    { label: "Programme", value: "Nursery → Junior KG → Senior KG" },
    { label: "Setting", value: "A converted neighbourhood bungalow" },
    { label: "School", value: "Standalone preschool, not a K–12 campus" },
    { label: "Spaces shown", value: "8 matched rooms and corners" },
  ],
  cover: "little-steps-wider-worlds/senior-kg-curated.jpg",
  brief: {
    intro:
      "This is the little school before the big school: a standalone preschool that carries children through Nursery, Junior KG and Senior KG, then hands them on to a larger institution. It needs more progression than a play-only environment, but the answer should not be rigid desks, premature academic pressure or walls covered with lessons.",
    requirements: [
      "Keep the scale of a small converted property and make the three stages visibly related but not identical.",
      "Let Nursery feel familiar and exploratory, Junior KG more rhythmic, and Senior KG more connected and directional.",
      "Keep play, stories, movement and daily routines present alongside classroom activity.",
      "Use original spatial graphics rather than alphabets, worksheets, slogans or licensed cartoon characters.",
      "Show the less visible care, transition and adult spaces as part of a complete preschool proposition.",
    ],
  },
  interpretation: [
    "Small openings, rounded blocks, trees, meeting paths and repeat patterns form a little neighbourhood. It is a visual grammar a child can revisit, not an illustrated curriculum or a promise of measurable developmental outcomes.",
    "The grammar changes stage by stage. Nursery has fewer, larger, softer forms. Junior KG introduces rhythm and sequence. Senior KG links the pieces into a wider world, with routes that can be followed and several places for the eye to arrive.",
    "The setting stays modest: former domestic rooms, ordinary windows, low group tables and familiar tile floors. Progression is expressed through composition, not through a bigger building or increasingly adult furniture.",
  ],
  palette: {
    intro: "A soft neighbourhood palette with enough range to change register across three stages.",
    entries: [
      { name: "Garden Mint", hex: "#92AAA0", purpose: "A familiar shared ground across the preschool." },
      { name: "Slate Sky", hex: "#91ACBB", purpose: "Paths, distance and a little more structure." },
      { name: "Marigold", hex: "#CBB16F", purpose: "Small moments of rhythm and orientation." },
      { name: "Brick Pink", hex: "#C89D8C", purpose: "Human warmth in thresholds and gathering." },
      { name: "Paper Cream", hex: "#ECE6D8", purpose: "Breathing room around active learning and play." },
    ],
    note: "Colour is held in clear clusters. The classroom materials and children's work still need room to contribute their own visual life.",
  },
  motifs: {
    intro: "From recognising a shape to connecting a little world.",
    entries: [
      { name: "Small openings", description: "Soft arches and windows suggest familiar places without prescribing one narrative." },
      { name: "Rounded blocks", description: "Simple forms can appear alone, repeat or become part of a connected composition." },
      { name: "Rhythm and sequence", description: "A quieter sense of order enters the Junior-KG expression without becoming a teaching chart." },
      { name: "Meeting paths", description: "Senior KG connects the forms into routes, choices and a wider horizon." },
      { name: "Open ground", description: "Unprinted wall space protects the clarity of the room and the visibility of real activity." },
    ],
  },
  buildingLabel: "Three stages, one little school",
  buildings: {
    intro: "The principal classroom progression leads the presentation. Shared and supporting corners then demonstrate the same identity throughout a normal preschool day.",
    entries: [
      { name: "Nursery", subtitle: "Notice and feel familiar", body: "Fewer rounded shapes and familiar thresholds create the softest expression of the school's shared grammar.", draws: ["Large soft forms", "Simple openings", "Generous cream ground"] },
      { name: "Junior KG", subtitle: "Find rhythm and relationships", body: "Forms repeat, move in sequence and begin to connect, giving the room a more organised visual rhythm without increasing pressure.", draws: ["Repeated arches", "Ordered clusters", "Short connecting routes"] },
      { name: "Senior KG", subtitle: "Connect and look outward", body: "Paths link the small places into a wider neighbourhood, giving the last preschool stage its own confident register before transition to a larger school.", draws: ["Meeting paths", "A wider horizon", "Several points of arrival"] },
    ],
  },
  chapters: [
    {
      space: "Compact reception and handover",
      title: "A Little School With a Clear Story",
      rationale: "A connected neighbourhood of soft openings and paths gives parents the whole proposition at the threshold. It signals an organised preschool while retaining the familiarity and proportions of a small house.",
      plain: "little-steps-wider-worlds/reception-plain.jpg",
      curated: "little-steps-wider-worlds/reception-curated.jpg",
      alt: "Small converted-home preschool reception with rounded openings and connected-path wallpaper",
    },
    {
      space: "Nursery room",
      title: "Start With What Feels Close",
      rationale: "Large rounded islands, a few simple openings and soft tree forms make the most spacious composition in the system. The room remains play-led, with quiet wall ground around its low shelves and activity materials.",
      plain: "little-steps-wider-worlds/nursery-plain.jpg",
      curated: "little-steps-wider-worlds/nursery-curated.jpg",
      alt: "Domestic-scale Nursery classroom with soft rounded blocks and tree-form wallpaper",
    },
    {
      space: "Junior KG room",
      title: "Things Begin to Relate",
      rationale: "Arches, blocks and trees appear in loose sequences joined by short paths. It is a more rhythmic version of the Nursery grammar, not a denser wall of lessons, leaving the teacher and activity table central.",
      plain: "little-steps-wider-worlds/junior-kg-plain.jpg",
      curated: "little-steps-wider-worlds/junior-kg-curated.jpg",
      alt: "Small Junior-KG room with rhythmic arches, rounded blocks and connecting-path wallpaper",
    },
    {
      space: "Senior KG room",
      title: "I Can Find My Way",
      rationale: "Paths connect the small openings and trees into a wider neighbourhood. The composition becomes more directional and confident without copying a primary-school classroom or treating school readiness as a wallpaper outcome.",
      plain: "little-steps-wider-worlds/senior-kg-plain.jpg",
      curated: "little-steps-wider-worlds/senior-kg-curated.jpg",
      alt: "Small Senior-KG classroom with a connected neighbourhood and wider-horizon wallpaper mural",
    },
    {
      space: "Shared story and reading nook",
      title: "A Story Can Open Another Window",
      rationale: "Only a few rounded windows and a slow path remain above the books. This shared corner gives every stage somewhere to slow down, with enough identity to belong and enough blank ground to listen.",
      plain: "little-steps-wider-worlds/reading-nook-plain.jpg",
      curated: "little-steps-wider-worlds/reading-nook-curated.jpg",
      alt: "Compact preschool reading nook with restrained rounded-window and pathway wallpaper",
    },
    {
      space: "Covered movement and play patio",
      title: "The Day Is Larger Than the Classroom",
      rationale: "Rounded routes and rhythmic clusters stretch along the sheltered wall beside movement play. The visual language becomes more active without drawing activities that children must imitate or expanding the small patio into a campus playground.",
      plain: "little-steps-wider-worlds/play-patio-plain.jpg",
      curated: "little-steps-wider-worlds/play-patio-curated.jpg",
      alt: "Small covered preschool play patio with rhythmic routes and rounded-block wallpaper",
    },
    {
      space: "Daily-care and bag transition",
      title: "A Routine I Can Recognise",
      rationale: "Small clusters and a single route connect the bags, bench and dry upper wall. Wet splash tiles stay untouched: the practical environment remains readable and the graphic intervention stays in its proper place.",
      plain: "little-steps-wider-worlds/care-transition-plain.jpg",
      curated: "little-steps-wider-worlds/care-transition-curated.jpg",
      alt: "Compact preschool care transition with sparse wallpaper on dry wall and retained sink splash tiles",
    },
    {
      space: "Teacher and parent conversation corner",
      title: "The Next Step Is a Shared Conversation",
      rationale: "Measured blocks and two meeting paths form the quiet adult expression of the system. The little room supports planning, parent discussion and the eventual handover to a bigger school without adopting corporate-office imagery.",
      plain: "little-steps-wider-worlds/teacher-parent-plain.jpg",
      curated: "little-steps-wider-worlds/teacher-parent-curated.jpg",
      alt: "Tiny teacher and parent room with restrained connected-block and pathway wallpaper",
    },
  ],
  journeyHeading: "8 spaces, three stages, one next step.",
  process: {
    intro: "Design the progression with educators, then test the grammar against the actual small property.",
    steps: [
      { title: "Understand the programme", body: "The school's educators define its Nursery, Junior-KG and Senior-KG routines, language context and approach to transition; the visual design follows that programme rather than inventing one." },
      { title: "Map attention and activity", body: "Wall density is set against furniture, teaching materials, supervision, play, movement and quiet use in each room." },
      { title: "Test three related registers", body: "One original set of forms is tested from soft recognition to rhythm and connected routes, with the differences visible side by side." },
      { title: "Measure, proof and install", body: "Real elevations, dry substrates, interruptions, cleaning conditions, material requirements and panel seams are resolved with physical colour proofs before installation." },
    ],
  },
  productionNote: {
    title: "An honest concept for the school before school",
    body: "This is an invented standalone preschool and every image is a concept visual. No board affiliation, pedagogical certification, building approval or learning outcome is claimed. A real project would be developed with the operator, educators and appropriate local professionals around:",
    points: [
      "The actual programme, child groups, language context and school-transition approach",
      "Property suitability, permitted use, capacity, access and evacuation",
      "Safeguarding, supervised handover, adult sightlines and accessibility",
      "Age-appropriate furniture, fittings and individual sensory requirements",
      "Ventilation, hygiene, dry walls, splash zones and material performance",
      "Final measurements, seams, installation edges and physical colour proofs",
    ],
  },
  ask: {
    heading: "Show us the little school before the big school.",
    body: "Send the small-property plan and one photograph each of Nursery, Junior KG and Senior KG. We will show how a shared identity can change register across the stages while keeping your everyday rooms practical and recognisably yours.",
  },
};
