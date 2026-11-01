import type { Project } from "./types";

/**
 * Concept Study 03 — healthcare.
 *
 * This one carries a different argument from the workplace studies. A campus
 * study sells identity; a hospital study has to prove restraint under
 * emotional load — that the studio knows an oncology wall and a paediatric
 * wall are not the same job, and that some rooms need the artwork to get out
 * of the way. The `calm` theme exists for exactly this.
 */
export const livingJourney: Project = {
  slug: "living-journey",
  kind: "concept",
  theme: "calm",
  segments: ["healthcare"],

  client: "A multi-speciality hospital",
  title: "The Living Journey",
  standfirst:
    "Every department has a different emotional job. Its walls should too — one visual language, twelve rooms, twelve different things asked of it.",
  facts: [
    { label: "Sector", value: "Healthcare" },
    { label: "Departments", value: "12, reception to staff room" },
    { label: "Walls shown", value: "12 matched viewpoints" },
    { label: "Palette", value: "One system, six colours" },
  ],

  cover: "living-journey/reception-curated.jpg",

  shop: {
    heading: "Bring The Living Journey into your hospital",
    body:
      "Browse the healthcare collection, choose a department and adapt the visual language to your walls, sightlines and care environment.",
    href: "https://zyvorah.com/hospitals",
    label: "Shop healthcare wallpapers",
  },

  brief: {
    intro:
      "The goal was not to make the hospital look more attractive. The walls needed to support the people using the space — and to keep supporting them on the fiftieth viewing, not just the first.",
    requirements: [
      "Give patients clarity and calm.",
      "Give children distraction without visual chaos.",
      "Respect uncertainty in family areas rather than forcing positivity.",
      "Acknowledge that care is collective, in the spaces staff use.",
      "Hold together across floors, departments and future extensions.",
    ],
  },

  interpretation: [
    "A hospital is never experienced as one room. It is a sequence of moments: arriving, finding one's way, waiting, receiving news, beginning treatment, recovering, working and caring for someone else.",
    "So instead of selecting unrelated wallpapers department by department, one visual language runs through the whole building. A single continuous line travels through it and changes meaning as the emotional purpose of each space changes.",
    "At reception it is a broad landscape. In paediatrics, a path of discovery. In maternity, a story of growth. In diagnostics, a route for the eye. In rehabilitation, a sequence of milestones. In staff areas, separate lines meeting as a network of care.",
    "The result is a hospital that feels connected without every department looking the same.",
  ],

  palette: {
    intro:
      "Designed for long periods of viewing — soft enough for clinical environments, but not so pale that the hospital feels anonymous.",
    entries: [
      { name: "Mineral Blue", hex: "#6B87A3", purpose: "Trust, steadiness and visual clarity." },
      { name: "Sage Green", hex: "#9BAE93", purpose: "Nature, recovery and balance." },
      { name: "Warm Sand", hex: "#D9C7AC", purpose: "Warmth without heaviness." },
      { name: "Chalk", hex: "#F0EDE6", purpose: "Light, breathing space and architectural calm." },
      { name: "Muted Coral", hex: "#D99184", purpose: "Human warmth and gentle energy." },
      { name: "Marigold", hex: "#E0A93F", purpose: "Small moments of optimism, attention and movement." },
    ],
    note:
      "No colour is used at the same intensity everywhere. Paediatrics carries the coral and marigold; oncology and the general wards lean on mineral blue, sage and sand; diagnostics uses controlled contrast to create focus. The palette connects the hospital — the balance of it tells you which kind of space you have walked into.",
  },

  motifs: {
    intro:
      "One line, drawn simply enough to survive twelve very different rooms. Everything below is a state of the same line.",
    entries: [
      { name: "The horizon", description: "The line at rest. Reception, general wards, family waiting — somewhere for the eye to settle." },
      { name: "The trail", description: "The line as a route to follow, with recurring characters and small discoveries. Paediatrics." },
      { name: "Seed, stem, bloom", description: "The line growing. Abstract rather than literal, for the mother-and-child floor." },
      { name: "The seasonal branch", description: "The line changing slowly, promising no outcome. Oncology and long-stay care." },
      { name: "The network", description: "Many lines moving separately, then meeting. Staff areas." },
    ],
  },

  chapters: [
    {
      space: "Main reception",
      title: "The Landscape of Care",
      rationale:
        "A wide, layered landscape of flowing contours, soft botanical forms and a clear horizon. It is deliberately broad and grounded — it does not compete with the signage, it gives the eye somewhere to settle. Reception has to communicate the hospital's purpose without a wall of claims and awards.",
      plain: "living-journey/reception-plain.jpg",
      curated: "living-journey/reception-curated.jpg",
      alt: "Hospital main reception with a wide layered landscape mural behind the desk",
    },
    {
      space: "Paediatric OPD",
      title: "The Adventure Begins",
      rationale:
        "The line lifts from the landscape and becomes a trail, with a small cast of recurring characters. Detailed enough to reward repeated looking, but not the visual overload of a themed play area — adults still get a composed clinical environment. It also gives a caregiver an easy way to start a conversation: where is the character going?",
      plain: "living-journey/paediatric-opd-plain.jpg",
      curated: "living-journey/paediatric-opd-curated.jpg",
      alt: "Paediatric outpatient waiting area with a character trail mural",
    },
    {
      space: "Children's ward",
      title: "Familiar Friends Return",
      rationale:
        "The same characters reappear, but the story develops — a longer journey with quieter resting points. A child moving from consultation to admission does not enter an unfamiliar visual world. Details sit at a child's natural sightline, and the wall reads from the beds.",
      plain: "living-journey/childrens-ward-plain.jpg",
      curated: "living-journey/childrens-ward-curated.jpg",
      alt: "Children's ward corridor with the story continuing along the wall",
    },
    {
      space: "Mother and child floor",
      title: "From Beginning to Growth",
      rationale:
        "The line becomes an organic sequence: seed, stem, leaf, shelter, bloom. Abstract rather than literal, so the wall can speak about birth without predictable baby imagery. Curved forms carry a sense of protection across consultation, maternity and postnatal areas.",
      plain: "living-journey/mother-child-plain.jpg",
      curated: "living-journey/mother-child-curated.jpg",
      alt: "Mother and child floor lounge with an abstract growth mural",
    },
    {
      space: "Nursery",
      title: "The Quiet Horizon",
      rationale:
        "The softest expression of the concept. Botanical silhouettes meet a restrained celestial horizon; contrast is deliberately low, edges softened, marigold reduced to tiny points. A nursery should not be a stimulating children's room — its first job is rest and attentive care.",
      plain: "living-journey/nursery-plain.jpg",
      curated: "living-journey/nursery-curated.jpg",
      alt: "Hospital nursery seen through glass, with a low-contrast botanical horizon",
    },
    {
      space: "Oncology and long-stay",
      title: "Seasons of Change",
      rationale:
        "A bare branch, new leaves, shifting light, a steady horizon. Nothing promises an outcome. Nothing asks a patient to be positive. People view this wall repeatedly and during difficult moments, so it has to offer depth without becoming emotionally demanding. Restraint here is the most important design decision, not the absence of one.",
      plain: "living-journey/oncology-plain.jpg",
      curated: "living-journey/oncology-curated.jpg",
      alt: "Oncology day-care wall with a restrained seasonal landscape",
    },
    {
      space: "Diagnostics and MRI",
      title: "A Place for the Eye to Travel",
      rationale:
        "Controlled curves, orbits and destinations — follow one route, find a marker, move to the next. The geometry is clearer here than anywhere else; mineral blue gives structure, marigold is a sparing focal cue. Waiting before a scan heightens anxiety, and attention needs somewhere neutral to go.",
      plain: "living-journey/diagnostics-plain.jpg",
      curated: "living-journey/diagnostics-curated.jpg",
      alt: "Diagnostics waiting corridor with a composed visual route along the wall",
    },
    {
      space: "General ward",
      title: "Rest for the Eye",
      rationale:
        "A broad horizon, sparse natural forms, generous negative space and no dominant focal point. A patient can look at it without being asked to decode anything. A wall seen for several days has to age well — the objective is sustained comfort, not immediate impact.",
      plain: "living-journey/general-ward-plain.jpg",
      curated: "living-journey/general-ward-curated.jpg",
      alt: "General ward room with a quiet horizon mural beside the bed",
    },
    {
      space: "Corridors",
      title: "The Story Becomes Wayfinding",
      rationale:
        "The line turns directional. Department colours, recurring motifs and shifts in rhythm separate one zone from another. It does not replace statutory signage — it supports it. A visitor navigating under stress remembers the sage botanical corridor more easily than a sequence of room numbers.",
      plain: "living-journey/corridors-plain.jpg",
      curated: "living-journey/corridors-curated.jpg",
      alt: "Corridor junction where the mural marks a change of department",
    },
    {
      space: "Rehabilitation",
      title: "Progress Made Visible",
      rationale:
        "Measured stages — arcs, markers, stepping forms, gradual shifts in elevation. Movement without athletes, finish lines or motivational clichés. The milestones can align with real distances along the wall, giving therapist and patient a reference point during repeated exercises.",
      plain: "living-journey/rehabilitation-plain.jpg",
      curated: "living-journey/rehabilitation-curated.jpg",
      alt: "Rehabilitation gym wall marked with a sequence of visual milestones",
    },
    {
      space: "Family waiting",
      title: "A Place to Pause",
      rationale:
        "Layered sheltering forms: a canopy, a distant horizon, open areas where the eye can rest. The composition does not tell families how to feel. Coral and marigold are almost absent. The wall's job is not to entertain or inspire — it is to reduce visual harshness and give the room a sense of shelter.",
      plain: "living-journey/family-waiting-plain.jpg",
      curated: "living-journey/family-waiting-curated.jpg",
      alt: "Family waiting area with a sheltering canopy of foliage across the wall",
    },
    {
      space: "Staff areas",
      title: "The Network of Care",
      rationale:
        "Multiple lines move independently, then connect into a calm network of paths and shared nodes. Care is never delivered by one person alone — doctors, nurses, technicians, attendants and support teams work through different routes that meet around the patient. No teamwork slogans, no oversized value words.",
      plain: "living-journey/staff-plain.jpg",
      curated: "living-journey/staff-curated.jpg",
      alt: "Staff room with a network mural of connecting paths and nodes",
    },
  ],

  process: {
    intro: "Designing one hospital, not twelve wallpapers.",
    steps: [
      {
        title: "Mapping the emotional job",
        body: "The complete patient, family and staff journey is mapped first, and every space is given a role: establish trust, reduce confusion, create distraction, support rest, mark progress, recognise care. Only then are palette, motifs and composition developed.",
      },
      {
        title: "Testing against the real room",
        body: "Artwork is checked against architectural elevations, furniture, signage, doors, bed positions and real sightlines. The same motif is adjusted for a child in a low seat, a patient lying in bed and a visitor moving quickly down a corridor.",
        image: "living-journey/process-system.jpg",
      },
      {
        title: "Colour as one system",
        body: "Reviewed hospital-wide rather than wall by wall. Motifs are simplified where longer viewing needs restraint, and made more active where discovery or movement is useful.",
      },
      {
        title: "Composed, divided, installed",
        body: "Each mural is built at the exact dimensions of its wall, divided into vertical drops and planned for left-to-right installation, so the visual journey stays continuous on site.",
      },
    ],
  },

  productionNote: {
    title: "A note on what this is",
    body:
      "The hospital is invented and these are concept visuals — the method is real, the building is not. For an actual project, every mural is rebuilt as print-ready artwork against:",
    points: [
      "Final wall measurements",
      "Doors, sockets, screens, gas lines and architectural interruptions",
      "Bed, chair and equipment positions",
      "Viewing distance and patient sightlines",
      "Panel width and seam locations",
      "Approved physical colour proofs",
      "The hospital's infection-control and cleaning requirements",
    ],
  },

  ask: {
    heading: "Start with one department.",
    body:
      "Send us a floor plan or a photograph of a single waiting area, and tell us what that room is for. We'll come back with the chapter we'd write for it — including, where it matters, the case for leaving a wall quiet.",
  },
};
