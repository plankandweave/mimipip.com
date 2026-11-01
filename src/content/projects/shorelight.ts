import type { Project } from "./types";

/**
 * Concept Study — real estate, an entire development.
 *
 * The flagship of the real-estate programme and the first FLIP BOOK: read
 * left to right, one spread per gesture, because the study's argument IS a
 * walkthrough — a visitor moves through the building the way a buyer would,
 * arrival to rooftop. The classic vertical book explains a project; this one
 * performs it.
 *
 * Everything here is governed by one aesthetic constitution: a single
 * painterly world that climbs from sea (arrival) through shore and garden
 * (clubhouse) and canopy (residential floors) to open sky (rooftop). Twelve
 * design families cover the hundred-and-six spaces the programme considered;
 * the towers, Dawn and Dusk, are two colourways of ONE set of artworks, not
 * two designs. The night rooms (library, games) darken the book's own pages
 * — the paper participates in the story.
 *
 * Concept-marked, always: the development is imagined, and a reader who
 * later works out that a "case study" was invented has been misled. The
 * rigour is commissioned-grade; the label is honest.
 */
export const shorelight: Project = {
  slug: "shorelight",
  kind: "concept",
  theme: "dusk",
  segments: [],

  client: "An imagined Mumbai development",
  title: "Shorelight",
  standfirst:
    "Two towers, twenty floors, one hundred and six walls considered — one story, told from the sea to the sky.",
  facts: [
    { label: "Sector", value: "Real estate — residential" },
    { label: "Setting", value: "Two towers, Mumbai" },
    { label: "Walls shown", value: "90 designs · 106 spaces considered" },
    { label: "Through-line", value: "The sea to the sky" },
  ],

  cover: "shorelight/cover.jpg",

  brief: {
    intro:
      "A luxury residential development with two towers, twenty floors and every kind of shared room a family will use for decades — and the usual fate awaiting its walls: paint in the lobby, a stock canvas in the lift lobby, a mural in the kids' room that dates in three years. The brief was one visual identity for the entire property, from the porte-cochère to the rooftop, that reads as curated rather than decorated.",
    requirements: [
      "One hand across every resident-facing wall — a buyer should feel a single author from arrival to rooftop.",
      "The lift lobbies must vary floor by floor without becoming twenty designs.",
      "Two towers that read as siblings where residents live — and one shared clubhouse that belongs to both, never doubled.",
      "Restraint before impact: these are walls nobody chose and everybody sees, daily, for twenty years.",
      "Every important space considered — and the unglamorous ones knowingly left quiet.",
    ],
  },

  interpretation: [
    "Mumbai rises from the sea, and so does the building. The whole property tells one vertical story: water at the arrival, shore and garden through the clubhouse, canopy up the residential floors, open sky at the roof. A resident rises through the story every day.",
    "The two towers are two lights on the same world — and the split follows the architecture, not decoration. A development has two entrance lobbies, two staircases, two runs of lift lobbies and corridors, two roofs: those carry Dawn in one tower and Dusk in the other. It has ONE clubhouse, one pool, one gym, one library. Those are singular, and their walls are singular too.",
    "So the colourway is a statement about the building rather than a palette choice: below the podium, where the towers meet, the artwork is one; above it, where a family goes home, it is theirs.",
    "The night rooms — the library, the games room — belong to the world after dark: the same garden, the same sea, drawn at moonrise. In this book their pages darken with them.",
  ],

  palette: {
    intro:
      "Six colours, all of them drawn from one coastline at the end of the day, and each with a job in the buildings.",
    entries: [
      {
        name: "Deepwater",
        hex: "#23304A",
        purpose: "The ground of the Dusk tower — the sea the whole story rises from. It is what makes every lighter colour read as light.",
        share: "30-35%",
      },
      {
        name: "Powder Tide",
        hex: "#A8BAD4",
        purpose: "The middle water and the middle air; the colour the building breathes between statements.",
        share: "25%",
      },
      {
        name: "Silvered Air",
        hex: "#C9CFD6",
        purpose: "Mist, cloud and distance — the quiet that keeps a hundred walls from shouting at once.",
        share: "18%",
      },
      {
        name: "Foam Ivory",
        hex: "#EDE6D6",
        purpose: "The lacework: foam, veining, moonlight on a leaf edge. Every family's drawing hand.",
        share: "15%",
      },
      {
        name: "Oxblood",
        hex: "#6B2430",
        purpose: "The drifting petal — a few controlled touches per wall, never a field. The pulse of the scheme.",
        share: "Approximately 4%",
      },
      {
        name: "Antique Gold",
        hex: "#A98748",
        purpose: "The fleck of last light on a crest or a wingtip; generous only once, in the banquet hall.",
        share: "Approximately 3%",
      },
    ],
    note: "Most of the building's walls stay plain plaster. The programme's claim is not that every wall carries artwork — it is that every wall was considered, and most were deliberately left quiet.",
  },

  motifs: {
    intro: "One vocabulary serves all twelve families, so a lift lobby and a banquet hall are recognisably the same building.",
    entries: [
      {
        name: "Foam lace",
        description: "The sea's linework — foam drawn as fine ivory lace. It becomes leaf-veins in the canopy and cloud-edges at the roof.",
      },
      {
        name: "The drifting petal",
        description: "A few oxblood petals carried through every artwork — in the tide at arrival, along the stair, resting on the library's still water.",
      },
      {
        name: "The climbing ribbon",
        description: "One continuous current that climbs the grand staircase the way the stair climbs, loosening into fronds by the landing.",
      },
      {
        name: "The cranes",
        description: "Reserved through the whole ascent and spent only at the rooftop, where the flock finally rises into open air.",
      },
    ],
  },

  chapters: [
    {
      space: "The double-height foyer",
      title: "Tide",
      rationale: "The arrival wall: open sea, layered swells and foam lace, grand at six metres and quiet enough for year twenty.",
      curated: "shorelight/cover.jpg",
      alt: "Tide — the double-height entrance lobby",
    },
    {
      space: "The grand staircase",
      title: "Ascent",
      rationale: "One continuous artwork that climbs with the stair — water below each sweep, leaves by the landing.",
      curated: "shorelight/ascent-render.jpg",
      alt: "Ascent — the grand staircase",
    },
    {
      space: "The lift lobbies, every floor",
      title: "Twenty Floors",
      rationale: "The most repeated wall in the project — one design bought forty times over, dense enough to reward ninety seconds of standing still.",
      curated: "shorelight/liftlobby-render.jpg",
      alt: "Twenty Floors — a residential lift lobby",
    },
    {
      space: "The clubhouse entrance",
      title: "Shore Threshold",
      rationale: "The chapter-change wall, composed around a quiet centre so the arch frames it.",
      curated: "shorelight/clubentrance-render.jpg",
      alt: "Shore Threshold — the clubhouse entrance",
    },
    {
      space: "The residents' lounge",
      title: "Shore Lounge",
      rationale: "The garden sitting down — low planting the length of the wall, silvered air above it.",
      curated: "shorelight/resilounge-render.jpg",
      alt: "Shore Lounge — the residents' lounge",
    },
    {
      space: "The library",
      title: "Hush",
      rationale: "A dim room where the wall is the most evenly lit thing in it; a moth, a snail and a sleeping bird for the three-hundredth look.",
      curated: "shorelight/hush-render.jpg",
      alt: "Hush — the library",
    },
    {
      space: "The banquet hall",
      title: "Feast",
      rationale: "A festive river of petals shot with gold — empty most of the year, photographed when it isn't, dressed for any occasion.",
      curated: "shorelight/feast-render.jpg",
      alt: "Feast — the banquet hall",
    },
    {
      space: "The gymnasium",
      title: "Pulse",
      rationale: "One long deep-water current — depth and momentum to settle into from a treadmill, calm when the mirrors double it.",
      curated: "shorelight/pulse-render.jpg",
      alt: "Pulse — the gymnasium",
    },
    {
      space: "The kids' club",
      title: "Grove",
      rationale: "The same sea drawn young — turtles, crabs and leaping fish to find on the hundredth visit, nothing licensed, nothing loud.",
      curated: "shorelight/grove-render.jpg",
      alt: "Grove — the kids' club",
    },
    {
      space: "The games room",
      title: "Play",
      rationale: "The world after dark: a velvet night garden, a fox slipping through, warmth that holds beside a lit table.",
      curated: "shorelight/play-render.jpg",
      alt: "Play — the games room",
    },
    {
      space: "The indoor pool",
      title: "Lagoon",
      rationale: "Sunlight through clear water, mirrored again in the real water below it.",
      curated: "shorelight/lagoon-render.jpg",
      alt: "Lagoon — the indoor pool",
    },
    {
      space: "The rooftop lounge",
      title: "Sky",
      rationale: "The resolution: the flock finally rises, and the painted sea meets the real one beyond the balustrade.",
      curated: "shorelight/sky-render.jpg",
      alt: "Sky — the rooftop lounge",
    },
  ],

  process: {
    intro: "The same discipline as a commissioned programme, end to end.",
    steps: [
      {
        title: "One constitution",
        body: "Architecture, light and drawing hand fixed once — every image of the project is judged against it, so a hundred walls read as one author.",
      },
      {
        title: "Families, not designs",
        body: "Twelve families cover a hundred and six spaces through programmed variation — tower colourway, elevation, room register — instead of a hundred and six unrelated walls.",
      },
      {
        title: "The building decides",
        body: "Every artwork is drawn for its wall's real job: the lift lobby for a ninety-second stare, the banquet hall for photographs behind a crowd, the gym for mirrors.",
      },
    ],
  },

  productionNote: {
    title: "What we would say in the first site meeting",
    body: "The programme is designed to be bought at any scale — one wall, one amenity floor, the whole property — and to survive handover.",
    points: [
      "Panels are made to your real elevations, and we keep the files: a damaged drop years later is one panel replaced, not a wall re-done.",
      "Signage, call panels and fire notices are placed before artwork is finalised — a design cut around hardware looks specified; one punched through looks like an accident.",
      "Lift-car interiors are supplied as designs for panel lamination, not as wallcovering.",
      "Wet and humid areas take the appropriate finishes; the treated wall keeps its distance from direct water.",
      "The unglamorous rooms — plant, refuse, back-of-house — are deliberately left out. Coverage means considered, not covered.",
    ],
  },

  journeyHeading: "Twelve families, one building",

  ask: {
    heading: "Bring us one building.",
    body: "Start with a lobby, an amenity floor or the whole property. You design the building — we give its walls a memory.",
  },

  flip: {
    spreads: [
      { type: "cover", image: "shorelight/cover.jpg", alt: "The Shorelight entrance lobby — Tide at double height" },

      {
        type: "passage",
        eyebrow: "Shorelight · Mumbai",
        title: "The building rises from the sea.",
        body: [
          "One story climbs the property: water at the arrival, shore and garden through the clubhouse, canopy up the residential floors, open sky at the roof.",
          "Two towers carry it in two lights — but only where a resident lives. From the tower lobby upward, the stair, the lift lobbies, the corridors and the roof are Dawn in one tower and Dusk in the other, so a family knows which tower is theirs by the light on its walls.",
          "The clubhouse is the opposite. There is one pool, one gym, one library, one banquet hall — larger for serving two towers, never doubled — and their walls are single. Below the podium the building is one; above it, it is two.",
        ],
      },

      {
        type: "pair",
        aspect: "2/3",
        images: [
          { key: "shorelight/tide-dusk.jpg", alt: "Tide in the Dusk Tower colourway" },
          { key: "shorelight/tide-dawn.jpg", alt: "Tide in the Dawn Tower colourway" },
        ],
        caption: {
          number: "01",
          title: "Tide",
          space: "The double-height foyer",
          note: "One artwork, two towers. Every family in the programme exists in both lights — Dusk in indigo and oxblood, Dawn in sand and rose-gold — the same composition, wave for wave. Siblings, never copies.",
        },
      },
      { type: "panorama", image: "shorelight/cover.jpg", alt: "Tide — the the double-height foyer, Dusk Tower", aspect: "3/2", caption: { number: "01", title: "Tide", space: "The Dusk Tower" } },
      { type: "panorama", image: "shorelight/tide-dawn-render.jpg", alt: "Tide — the same room in the Dawn Tower", aspect: "3/2", caption: { number: "01", title: "Tide", space: "The Dawn Tower" } },
      {
        type: "pair",
        aspect: "2/3",
        images: [
          { key: "shorelight/ascent-dusk.jpg", alt: "Ascent in the Dusk Tower colourway" },
          { key: "shorelight/ascent-dawn.jpg", alt: "Ascent in the Dawn Tower colourway" },
        ],
        caption: {
          number: "02",
          title: "Ascent",
          space: "The grand staircase",
          note: "One continuous current climbs the way the stair climbs — water below each sweep, leaves by the landing.",
        },
      },
      { type: "panorama", image: "shorelight/ascent-render.jpg", alt: "Ascent — the the grand staircase, Dusk Tower", aspect: "3/2", caption: { number: "02", title: "Ascent", space: "The Dusk Tower" } },
      { type: "panorama", image: "shorelight/ascent-dawn-render.jpg", alt: "Ascent — the same room in the Dawn Tower", aspect: "3/2", caption: { number: "02", title: "Ascent", space: "The Dawn Tower" } },
      {
        type: "pair",
        aspect: "3/2",
        images: [
          { key: "shorelight/liftlobby-dusk.jpg", alt: "Twenty Floors in the Dusk Tower colourway" },
          { key: "shorelight/liftlobby-dawn.jpg", alt: "Twenty Floors in the Dawn Tower colourway" },
        ],
        caption: {
          number: "03",
          title: "Twenty Floors",
          space: "The lift lobbies",
          note: "The most repeated wall in the project — bought once, installed on every floor, dense enough to reward the daily ninety-second stare.",
        },
      },
      { type: "panorama", image: "shorelight/liftlobby-render.jpg", alt: "Twenty Floors — the the lift lobbies, Dusk Tower", aspect: "3/2", caption: { number: "03", title: "Twenty Floors", space: "The Dusk Tower" } },
      { type: "panorama", image: "shorelight/liftlobby-dawn-render.jpg", alt: "Twenty Floors — the same room in the Dawn Tower", aspect: "3/2", caption: { number: "03", title: "Twenty Floors", space: "The Dawn Tower" } },

      {
        type: "passage",
        eyebrow: "The podium",
        title: "The shore.",
        body: [
          "The clubhouse is where the property gathers, and where the story steps out of the water — grasses, blossom, the last of the sea winding into a garden.",
        ],
      },

      {
        type: "plate",
        aspect: "2/3",
        image: "shorelight/clubentrance-dusk.jpg",
        alt: "Shore Threshold — the artwork",
        caption: {
          number: "04",
          title: "Shore Threshold",
          space: "The clubhouse entrance",
          note: "The chapter-change wall, composed around a quiet centre so the arch frames it.",
        },
      },
      { type: "panorama", image: "shorelight/clubentrance-render.jpg", alt: "Shore Threshold — the the clubhouse entrance, Dusk Tower", aspect: "3/2", caption: { number: "04", title: "Shore Threshold", space: "Shared by both towers" } },
      {
        type: "plate",
        aspect: "3/2",
        image: "shorelight/resilounge-dusk.jpg",
        alt: "Shore Lounge — the artwork",
        caption: {
          number: "05",
          title: "Shore Lounge",
          space: "The residents' lounge",
          note: "The garden sitting down — low planting the width of the wall, silvered air above it.",
        },
      },
      { type: "panorama", image: "shorelight/resilounge-render.jpg", alt: "Shore Lounge — the the residents' lounge, Dusk Tower", aspect: "3/2", caption: { number: "05", title: "Shore Lounge", space: "Shared by both towers" } },
      {
        type: "plate",
        aspect: "3/2",
        image: "shorelight/feast-dusk.jpg",
        alt: "Feast — the artwork",
        caption: {
          number: "07",
          title: "Feast",
          space: "The banquet hall",
          note: "A festive river of petals shot with gold. Empty most of the year, photographed when it isn't, dressed for any occasion.",
        },
      },
      { type: "panorama", image: "shorelight/feast-render.jpg", alt: "Feast — the the banquet hall, Dusk Tower", aspect: "3/2", caption: { number: "07", title: "Feast", space: "Shared by both towers" } },
      {
        type: "plate",
        aspect: "3/2",
        image: "shorelight/pulse-dusk.jpg",
        alt: "Pulse — the artwork",
        caption: {
          number: "08",
          title: "Pulse",
          space: "The gymnasium",
          note: "One long deep-water current: depth to settle into from a treadmill, calm when the mirrors double it.",
        },
      },
      { type: "panorama", image: "shorelight/pulse-render.jpg", alt: "Pulse — the the gymnasium, Dusk Tower", aspect: "3/2", caption: { number: "08", title: "Pulse", space: "Shared by both towers" } },
      {
        type: "plate",
        aspect: "3/2",
        image: "shorelight/grove-dusk.jpg",
        alt: "Grove — the artwork",
        caption: {
          number: "09",
          title: "Grove",
          space: "The kids' club",
          note: "The same sea drawn young — turtles, crabs and leaping fish to find on the hundredth visit.",
        },
      },
      { type: "panorama", image: "shorelight/grove-render.jpg", alt: "Grove — the the kids' club, Dusk Tower", aspect: "3/2", caption: { number: "09", title: "Grove", space: "Shared by both towers" } },

      {
        type: "passage",
        dark: true,
        eyebrow: "After dark",
        title: "Night.",
        body: [
          "Two rooms belong to the world after dark — the library and the games room. The same garden, the same sea, drawn at moonrise.",
          "So for a few pages, the paper darkens with them. In the Dawn tower, the same rooms wake first.",
        ],
      },

      {
        type: "plate",
        aspect: "3/2",
        dark: true,
        image: "shorelight/hush-dusk.jpg",
        alt: "Hush — the artwork",
        caption: {
          number: "06",
          title: "Hush",
          space: "The library",
          note: "Midnight canopy with small things hidden in it — a moth, a snail, a sleeping bird — for the reader's three-hundredth evening.",
        },
      },
      { type: "panorama", dark: true, image: "shorelight/hush-render.jpg", alt: "Hush — the the library, Dusk Tower", aspect: "3/2", caption: { number: "06", title: "Hush", space: "Shared by both towers" } },
      {
        type: "plate",
        aspect: "3/2",
        dark: true,
        image: "shorelight/play-dusk.jpg",
        alt: "Play — the artwork",
        caption: {
          number: "10",
          title: "Play",
          space: "The games room",
          note: "The world after dark: a fox in a velvet garden, warmth that holds beside a lit table.",
        },
      },
      { type: "panorama", dark: true, image: "shorelight/play-render.jpg", alt: "Play — the the games room, Dusk Tower", aspect: "3/2", caption: { number: "10", title: "Play", space: "Shared by both towers" } },

      {
        type: "passage",
        eyebrow: "The ascent completes",
        title: "Water, and then sky.",
        body: [
          "The pool returns the story to water for pleasure; the rooftop lets it go.",
        ],
      },

      {
        type: "plate",
        aspect: "3/2",
        image: "shorelight/lagoon-dusk.jpg",
        alt: "Lagoon — the artwork",
        caption: {
          number: "11",
          title: "Lagoon",
          space: "The indoor pool",
          note: "Sunlight through clear water — mirrored again in the real water below it.",
        },
      },
      { type: "panorama", image: "shorelight/lagoon-render.jpg", alt: "Lagoon — the the indoor pool, Dusk Tower", aspect: "3/2", caption: { number: "11", title: "Lagoon", space: "Shared by both towers" } },
      {
        type: "pair",
        aspect: "3/2",
        images: [
          { key: "shorelight/sky-dusk.jpg", alt: "Sky in the Dusk Tower colourway" },
          { key: "shorelight/sky-dawn.jpg", alt: "Sky in the Dawn Tower colourway" },
        ],
        caption: {
          number: "12",
          title: "Sky",
          space: "The rooftop lounge",
          note: "The resolution: the cranes finally rise, and the painted sea meets the real one beyond the balustrade.",
        },
      },
      { type: "panorama", image: "shorelight/sky-render.jpg", alt: "Sky — the the rooftop lounge, Dusk Tower", aspect: "3/2", caption: { number: "12", title: "Sky", space: "The Dusk Tower" } },
      { type: "panorama", image: "shorelight/sky-dawn-render.jpg", alt: "Sky — the same room in the Dawn Tower", aspect: "3/2", caption: { number: "12", title: "Sky", space: "The Dawn Tower" } },

      {
        type: "pair",
        aspect: "3/2",
        images: [
          { key: "shorelight/passage-dusk.jpg", alt: "Passage in the Dusk Tower colourway" },
          { key: "shorelight/passage-dawn.jpg", alt: "Passage in the Dawn Tower colourway" },
        ],
        caption: {
          number: "13",
          title: "Passage",
          space: "The apartment corridors",
          note: "The wall a resident passes five hundred times a year, read walking and in both directions. Events spaced like footsteps along one quiet current — and, being a tower wall, it carries both lights.",
        },
      },
      { type: "panorama", image: "shorelight/passage-render.jpg", alt: "Passage — an apartment corridor", aspect: "3/2", caption: { number: "13", title: "Passage", space: "The Dusk Tower" } },
      { type: "panorama", image: "shorelight/passage-dawn-render.jpg", alt: "Passage — the same corridor in the Dawn Tower", aspect: "3/2", caption: { number: "13", title: "Passage", space: "The Dawn Tower" } },
      {
        type: "plate",
        aspect: "3/2",
        image: "shorelight/breath-dusk.jpg",
        alt: "Breath — the artwork",
        caption: {
          number: "14",
          title: "Breath",
          space: "The spa and meditation rooms",
          note: "The one wall in the building that must almost disappear — read lying down, in half-light, at the edge of sleep. A garden seen through fog, at the lowest contrast the programme allows.",
        },
      },
      { type: "panorama", image: "shorelight/breath-render.jpg", alt: "Breath — the spa lounge", aspect: "3/2", caption: { number: "14", title: "Breath", space: "Shared by both towers" } },
      {
        type: "plate",
        aspect: "3/2",
        image: "shorelight/the-telling-dusk.jpg",
        alt: "The Telling — the artwork",
        caption: {
          number: "15",
          title: "The Telling",
          space: "The sales gallery",
          note: "The whole programme compressed into one band a sales associate can walk a buyer along: sea at the left, shore, canopy, cloud, and the cranes released at the right. The building's story, told before the building exists.",
        },
      },
      { type: "panorama", image: "shorelight/the-telling-render.jpg", alt: "The Telling — the sales gallery", aspect: "3/2", caption: { number: "15", title: "The Telling", space: "Shared by both towers" } },

      {
        type: "passage",
        eyebrow: "Every wall, considered",
        title: "The clubhouse",
        body: ["Where the property gathers — one of each room, sized for two towers."],
      },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/discussion-lounge/Zyvorah-Discussion-lounge-Discussion-lounge.png", alt: "Discussion lounge", aspect: "3/2", caption: { title: "Discussion lounge", space: "Shared by both towers", note: "Two currents meeting and turning together." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/reading-room/Zyvorah-Reading-room-Reading-room.png", alt: "Reading room", aspect: "3/2", caption: { title: "Reading room", space: "Shared by both towers", note: "Dense still foliage in ivory line on deep slate." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/co-working-lounge/Zyvorah-Co-working-lounge-Co-working-lounge.png", alt: "Co-working lounge", aspect: "3/2", caption: { title: "Co-working lounge", space: "Shared by both towers", note: "Long calm bands — quiet enough to sit behind a call." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/private-meeting-room/Zyvorah-Private-meeting-room-Private-meeting-room.png", alt: "Private meeting room", aspect: "3/2", caption: { title: "Private meeting room", space: "Shared by both towers", note: "One broad sweep of water, foam on its upper edge only." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/caf/Zyvorah-Caf-Caf.png", alt: "Café", aspect: "3/2", caption: { title: "Café", space: "Shared by both towers", note: "The shore in the morning, light on the waterline." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/restaurant/Zyvorah-Restaurant-Restaurant.png", alt: "Restaurant", aspect: "3/2", caption: { title: "Restaurant", space: "Shared by both towers", note: "Evening water, gold along the crests." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/bar-lounge/Zyvorah-Bar-lounge-Bar-lounge.png", alt: "Bar lounge", aspect: "3/2", caption: { title: "Bar lounge", space: "Shared by both towers", note: "Night water — luminous foam on near-black indigo." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/private-dining-room/Zyvorah-Private-dining-room-Private-dining-room.png", alt: "Private dining room", aspect: "3/2", caption: { title: "Private dining room", space: "Shared by both towers", note: "One great blossoming branch, ceremonial but intimate." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/pre-function-area/Zyvorah-Pre-function-area-Pre-function-area.png", alt: "Pre-function area", aspect: "3/2", caption: { title: "Pre-function area", space: "Shared by both towers", note: "Blossom gathering before a celebration." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/party-room/Zyvorah-Party-room-Party-room.png", alt: "Party room", aspect: "3/2", caption: { title: "Party room", space: "Shared by both towers", note: "A bright festive current, quicker than the banquet hall." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/outdoor-dining-pavilion/Zyvorah-Outdoor-dining-pavilion-Outdoor-dining-pavilion.png", alt: "Outdoor dining pavilion", aspect: "3/2", caption: { title: "Outdoor dining pavilion", space: "Shared by both towers", note: "A garden table's view, warm in the late light." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/viewing-lounge/Zyvorah-Viewing-lounge-Viewing-lounge.png", alt: "Viewing lounge", aspect: "3/2", caption: { title: "Viewing lounge", space: "Shared by both towers", note: "Open water under high light, cranes small near the top." } },
      {
        type: "passage",
        eyebrow: "Every wall, considered",
        title: "Fitness and wellness",
        body: ["The building's loudest rooms and its quietest, a few steps apart."],
      },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/cardio-zone/Zyvorah-Cardio-zone-Cardio-zone.png", alt: "Cardio zone", aspect: "3/2", caption: { title: "Cardio zone", space: "Shared by both towers", note: "One fast current, streaming in a single direction." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/strength-training-zone/Zyvorah-Strength-training-zone-Strength-training-zone.png", alt: "Strength-training zone", aspect: "3/2", caption: { title: "Strength-training zone", space: "Shared by both towers", note: "Deep water under pressure — weight rather than motion." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/yoga-studio/Zyvorah-Yoga-studio-Yoga-studio.png", alt: "Yoga studio", aspect: "3/2", caption: { title: "Yoga studio", space: "Shared by both towers", note: "Slow breath on water, the softest sheet in the programme." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/pilates-studio/Zyvorah-Pilates-studio-Pilates-studio.png", alt: "Pilates studio", aspect: "3/2", caption: { title: "Pilates studio", space: "Shared by both towers", note: "Measured water, current-lines at quiet intervals." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/dance-studio/Zyvorah-Dance-studio-Dance-studio.png", alt: "Dance studio", aspect: "3/2", caption: { title: "Dance studio", space: "Shared by both towers", note: "Wind through canopy, every leaf streaming one way." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/spa-reception/Zyvorah-Spa-reception-Spa-reception.png", alt: "Spa reception", aspect: "3/2", caption: { title: "Spa reception", space: "Shared by both towers", note: "Mist over still water at the threshold of quiet." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/meditation-room/Zyvorah-Meditation-room-Meditation-room.png", alt: "Meditation room", aspect: "3/2", caption: { title: "Meditation room", space: "Shared by both towers", note: "Almost nothing: breath leaving warm water, no gold at all." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/sauna-steam-transition/Zyvorah-Sauna-steam-transition-Sauna-steam-transition.png", alt: "Sauna & steam transition", aspect: "3/2", caption: { title: "Sauna & steam transition", space: "Shared by both towers", note: "Steam rising, blurred at every edge." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/changing-room/Zyvorah-Changing-room-Changing-room.png", alt: "Changing room", aspect: "3/2", caption: { title: "Changing room", space: "Shared by both towers", note: "Calm shallow water over pale sand." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/wellness-lounge/Zyvorah-Wellness-lounge-Wellness-lounge.png", alt: "Wellness lounge", aspect: "3/2", caption: { title: "Wellness lounge", space: "Shared by both towers", note: "A garden seen through fog, at the lowest contrast allowed." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/reflexology-area/Zyvorah-Reflexology-area-Reflexology-area.png", alt: "Reflexology area", aspect: "3/2", caption: { title: "Reflexology area", space: "Shared by both towers", note: "Slow concentric rings spreading across the sheet." } },
      {
        type: "passage",
        eyebrow: "Every wall, considered",
        title: "Water",
        body: ["The story returns to water — this time for pleasure."],
      },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/pool-entrance/Zyvorah-Pool-entrance-Pool-entrance.png", alt: "Pool entrance", aspect: "3/2", caption: { title: "Pool entrance", space: "Shared by both towers", note: "The moment before water, light gathering into clear blue." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/pool-lounge/Zyvorah-Pool-lounge-Pool-lounge.png", alt: "Pool lounge", aspect: "3/2", caption: { title: "Pool lounge", space: "Shared by both towers", note: "Light resting on still water." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/pool-deck-wall/Zyvorah-Pool-deck-wall-Pool-deck-wall.png", alt: "Pool deck wall", aspect: "3/2", caption: { title: "Pool deck wall", space: "Shared by both towers", note: "Built to be doubled: the pool carries its reflection." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/pool-pavilion/Zyvorah-Pool-pavilion-Pool-pavilion.png", alt: "Pool pavilion", aspect: "3/2", caption: { title: "Pool pavilion", space: "Shared by both towers", note: "Water under shade, dappled ivory light." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/pool-caf/Zyvorah-Pool-caf-Pool-caf.png", alt: "Pool café", aspect: "3/2", caption: { title: "Pool café", space: "Shared by both towers", note: "Bright shallow water, cheerful gold." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/children-s-pool-area/Zyvorah-Children-s-pool-area-Children-s-pool-area.png", alt: "Children's pool area", aspect: "3/2", caption: { title: "Children's pool area", space: "Shared by both towers", note: "A shallow lagoon drawn young — a turtle, small fish, quiet space." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/pool-changing-area/Zyvorah-Pool-changing-area-Pool-changing-area.png", alt: "Pool changing area", aspect: "3/2", caption: { title: "Pool changing area", space: "Shared by both towers", note: "Water seen from just below the surface." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/jacuzzi-lounge/Zyvorah-Jacuzzi-lounge-Jacuzzi-lounge.png", alt: "Jacuzzi lounge", aspect: "3/2", caption: { title: "Jacuzzi lounge", space: "Shared by both towers", note: "Warm dark water, slow rising bubbles." } },
      {
        type: "passage",
        eyebrow: "Every wall, considered",
        title: "The children's floor",
        body: ["The same world drawn young — and growing up, room by room."],
      },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/children-s-playroom/Zyvorah-Children-s-playroom-Children-s-playroom.png", alt: "Children's playroom", aspect: "3/2", caption: { title: "Children's playroom", space: "Shared by both towers", note: "A young shoreline at play." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/toddler-room/Zyvorah-Toddler-room-Toddler-room.png", alt: "Toddler room", aspect: "3/2", caption: { title: "Toddler room", space: "Shared by both towers", note: "Three or four large simple creatures, widely spaced." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/children-s-library/Zyvorah-Children-s-library-Children-s-library.png", alt: "Children's library", aspect: "3/2", caption: { title: "Children's library", space: "Shared by both towers", note: "A young canopy with things to find in it." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/activity-room/Zyvorah-Activity-room-Activity-room.png", alt: "Activity room", aspect: "3/2", caption: { title: "Activity room", space: "Shared by both towers", note: "A lively rock pool — starfish, a small octopus." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/art-craft-room/Zyvorah-Art-craft-room-Art-craft-room.png", alt: "Art & craft room", aspect: "3/2", caption: { title: "Art & craft room", space: "Shared by both towers", note: "Drawn as a child's eye would: bold shapes, visible marks." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/homework-room/Zyvorah-Homework-room-Homework-room.png", alt: "Homework room", aspect: "3/2", caption: { title: "Homework room", space: "Shared by both towers", note: "Calm water with a steady rhythm, easy to concentrate in front of." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/teen-lounge/Zyvorah-Teen-lounge-Teen-lounge.png", alt: "Teen lounge", aspect: "3/2", caption: { title: "Teen lounge", space: "Shared by both towers", note: "The young register grown up — deeper water, bolder oxblood." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/children-s-party-room/Zyvorah-Children-s-party-room-Children-s-party-room.png", alt: "Children's party room", aspect: "3/2", caption: { title: "Children's party room", space: "Shared by both towers", note: "A celebration in shallow water." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/family-lounge/Zyvorah-Family-lounge-Family-lounge.png", alt: "Family lounge", aspect: "3/2", caption: { title: "Family lounge", space: "Shared by both towers", note: "A shore where a family would sit, one turtle to find." } },
      {
        type: "passage",
        dark: true,
        eyebrow: "Every wall, considered",
        title: "After hours",
        body: ["The games floor keeps the night register — and so do these pages."],
      },
      { type: "panorama", dark: true, image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/snooker-room/Zyvorah-Snooker-room-Snooker-room.png", alt: "Snooker room", aspect: "3/2", caption: { title: "Snooker room", space: "Shared by both towers", note: "The night canopy at its deepest, an owl half hidden." } },
      { type: "panorama", dark: true, image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/table-tennis-room/Zyvorah-Table-tennis-room-Table-tennis-room.png", alt: "Table-tennis room", aspect: "3/2", caption: { title: "Table-tennis room", space: "Shared by both towers", note: "A quick rhythm, arcs alternating across the sheet." } },
      { type: "panorama", dark: true, image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/foosball-area/Zyvorah-Foosball-area-Foosball-area.png", alt: "Foosball area", aspect: "3/2", caption: { title: "Foosball area", space: "Shared by both towers", note: "A fast night current, staccato foam." } },
      { type: "panorama", dark: true, image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/card-room/Zyvorah-Card-room-Card-room.png", alt: "Card room", aspect: "3/2", caption: { title: "Card room", space: "Shared by both towers", note: "A walled night garden at close quarters." } },
      { type: "panorama", dark: true, image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/board-games-room/Zyvorah-Board-games-room-Board-games-room.png", alt: "Board-games room", aspect: "3/2", caption: { title: "Board-games room", space: "Shared by both towers", note: "An ordered night garden, a calm repeating rhythm." } },
      { type: "panorama", dark: true, image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/mini-theatre/Zyvorah-Mini-theatre-Mini-theatre.png", alt: "Mini-theatre", aspect: "3/2", caption: { title: "Mini-theatre", space: "Shared by both towers", note: "For near-darkness: the faintest luminous foam." } },
      { type: "panorama", dark: true, image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/music-room/Zyvorah-Music-room-Music-room.png", alt: "Music room", aspect: "3/2", caption: { title: "Music room", space: "Shared by both towers", note: "Leaves spaced along flowing lines like notes on a stave." } },
      { type: "panorama", dark: true, image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/karaoke-room/Zyvorah-Karaoke-room-Karaoke-room.png", alt: "Karaoke room", aspect: "3/2", caption: { title: "Karaoke room", space: "Shared by both towers", note: "A warm night with a swing to it." } },
      { type: "panorama", dark: true, image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/private-entertainment-room/Zyvorah-Private-entertainment-room-Private-entertainment-room.png", alt: "Private entertainment room", aspect: "3/2", caption: { title: "Private entertainment room", space: "Shared by both towers", note: "Deep night water at rest." } },
      { type: "panorama", dark: true, image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/hobby-room/Zyvorah-Hobby-room-Hobby-room.png", alt: "Hobby room", aspect: "3/2", caption: { title: "Hobby room", space: "Shared by both towers", note: "A garden studied closely, drawn with botanical care." } },
      { type: "panorama", dark: true, image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/art-studio/Zyvorah-Art-studio-Art-studio.png", alt: "Art studio", aspect: "3/2", caption: { title: "Art studio", space: "Shared by both towers", note: "A sheet that shows its own making." } },
      {
        type: "passage",
        eyebrow: "Every wall, considered",
        title: "Outdoors, and above",
        body: ["Where the building meets the air."],
      },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/grand-lawn-backdrop/Zyvorah-Grand-lawn-backdrop-Grand-lawn-backdrop.png", alt: "Grand lawn backdrop", aspect: "3/2", caption: { title: "Grand lawn backdrop", space: "Shared by both towers", note: "Open coastal grassland bending in one wind." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/landscaped-garden-pavilion/Zyvorah-Landscaped-garden-pavilion-Landscaped-garden-pavilion.png", alt: "Landscaped garden pavilion", aspect: "3/2", caption: { title: "Landscaped garden pavilion", space: "Shared by both towers", note: "The garden at its fullest." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/sky-lounge/Zyvorah-Sky-lounge-Sky-lounge.png", alt: "Sky lounge", aspect: "3/2", caption: { title: "Sky lounge", space: "Shared by both towers", note: "High open air, a distant pair of cranes." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/viewing-deck/Zyvorah-Viewing-deck-Viewing-deck.png", alt: "Viewing deck", aspect: "3/2", caption: { title: "Viewing deck", space: "Shared by both towers", note: "The air at the edge of a view." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/party-terrace/Zyvorah-Party-terrace-Party-terrace.png", alt: "Party terrace", aspect: "3/2", caption: { title: "Party terrace", space: "Shared by both towers", note: "Evening air in celebration, cranes rising at one side." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/meditation-garden/Zyvorah-Meditation-garden-Meditation-garden.png", alt: "Meditation garden", aspect: "3/2", caption: { title: "Meditation garden", space: "Shared by both towers", note: "Stillness: sparse stems and a great deal of empty space." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/amphitheatre-wall/Zyvorah-Amphitheatre-wall-Amphitheatre-wall.png", alt: "Amphitheatre wall", aspect: "3/2", caption: { title: "Amphitheatre wall", space: "Shared by both towers", note: "Built to be legible at fifty feet." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/pergola-seating/Zyvorah-Pergola-seating-Pergola-seating.png", alt: "Pergola seating", aspect: "3/2", caption: { title: "Pergola seating", space: "Shared by both towers", note: "Foliage in dappled light, bands falling through the slats." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/garden-corridor/Zyvorah-Garden-corridor-Garden-corridor.png", alt: "Garden corridor", aspect: "3/2", caption: { title: "Garden corridor", space: "Shared by both towers", note: "One planted band, events spaced like footsteps." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/children-s-outdoor-play-zone/Zyvorah-Children-s-outdoor-play-zone-Children-s-outdoor-play-zone.png", alt: "Children's outdoor play zone", aspect: "3/2", caption: { title: "Children's outdoor play zone", space: "Shared by both towers", note: "A bright shore drawn young, strong enough for full sun." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/senior-citizens-area/Zyvorah-Senior-citizens-area-Senior-citizens-area.png", alt: "Senior citizens' area", aspect: "3/2", caption: { title: "Senior citizens' area", space: "Shared by both towers", note: "A calm garden at eye level, generous space between stems." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/pet-park-entrance/Zyvorah-Pet-park-entrance-Pet-park-entrance.png", alt: "Pet park entrance", aspect: "3/2", caption: { title: "Pet park entrance", space: "Shared by both towers", note: "Open grass and air, a small bird low among the stems." } },
      {
        type: "passage",
        eyebrow: "Every wall, considered",
        title: "Where it is sold",
        body: ["The rooms that carry the building's story before the building exists."],
      },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/project-entrance-experience-wall/Zyvorah-Project-entrance-experience-wall-Project-entrance-experience-wall.png", alt: "Project entrance experience wall", aspect: "3/2", caption: { title: "Project entrance experience wall", space: "Shared by both towers", note: "An overture: sea lifting into pale air." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/sample-flat-entrance/Zyvorah-Sample-flat-entrance-Sample-flat-entrance.png", alt: "Sample-flat entrance", aspect: "3/2", caption: { title: "Sample-flat entrance", space: "Shared by both towers", note: "The programme's voice at the scale of a home." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/material-finish-presentation-wall/Zyvorah-Material-finish-presentation-wall-Material-finish-presentation-wall.png", alt: "Material & finish presentation wall", aspect: "3/2", caption: { title: "Material & finish presentation wall", space: "Shared by both towers", note: "A calm ground that flatters samples pinned in front of it." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/developer-story-wall/Zyvorah-Developer-story-wall-Developer-story-wall.png", alt: "Developer story wall", aspect: "3/2", caption: { title: "Developer story wall", space: "Shared by both towers", note: "The whole journey in one band, left to right." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/project-model-room/Zyvorah-Project-model-room-Project-model-room.png", alt: "Project model room", aspect: "3/2", caption: { title: "Project model room", space: "Shared by both towers", note: "A broad calm field that sits quietly behind an object." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/customer-lounge/Zyvorah-Customer-lounge-Customer-lounge.png", alt: "Customer lounge", aspect: "3/2", caption: { title: "Customer lounge", space: "Shared by both towers", note: "A welcoming shore." } },
      { type: "panorama", image: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/booking-consultation-room/Zyvorah-Booking-consultation-room-Booking-consultation-room.png", alt: "Booking & consultation room", aspect: "3/2", caption: { title: "Booking & consultation room", space: "Shared by both towers", note: "Settled calm water, one steady band." } },

      {
        type: "gallery",
        heading: "Ninety walls",
        intro:
          "Every wall of the preceding pages at once — seventy shared amenities and fifteen families, ninety designs. Seen together, the argument is no longer any single room: it is that one hand drew all of them.",
        images: [
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/activity-room/Zyvorah-Activity-room-Activity-room.png", alt: "Activity room" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/amphitheatre-wall/Zyvorah-Amphitheatre-wall-Amphitheatre-wall.png", alt: "Amphitheatre wall" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/art-craft-room/Zyvorah-Art-craft-room-Art-craft-room.png", alt: "Art & craft room" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/art-studio/Zyvorah-Art-studio-Art-studio.png", alt: "Art studio" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/bar-lounge/Zyvorah-Bar-lounge-Bar-lounge.png", alt: "Bar lounge" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/board-games-room/Zyvorah-Board-games-room-Board-games-room.png", alt: "Board-games room" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/booking-consultation-room/Zyvorah-Booking-consultation-room-Booking-consultation-room.png", alt: "Booking & consultation room" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/caf/Zyvorah-Caf-Caf.png", alt: "Café" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/card-room/Zyvorah-Card-room-Card-room.png", alt: "Card room" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/cardio-zone/Zyvorah-Cardio-zone-Cardio-zone.png", alt: "Cardio zone" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/changing-room/Zyvorah-Changing-room-Changing-room.png", alt: "Changing room" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/children-s-library/Zyvorah-Children-s-library-Children-s-library.png", alt: "Children's library" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/children-s-outdoor-play-zone/Zyvorah-Children-s-outdoor-play-zone-Children-s-outdoor-play-zone.png", alt: "Children's outdoor play zone" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/children-s-party-room/Zyvorah-Children-s-party-room-Children-s-party-room.png", alt: "Children's party room" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/children-s-playroom/Zyvorah-Children-s-playroom-Children-s-playroom.png", alt: "Children's playroom" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/children-s-pool-area/Zyvorah-Children-s-pool-area-Children-s-pool-area.png", alt: "Children's pool area" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/co-working-lounge/Zyvorah-Co-working-lounge-Co-working-lounge.png", alt: "Co-working lounge" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/customer-lounge/Zyvorah-Customer-lounge-Customer-lounge.png", alt: "Customer lounge" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/dance-studio/Zyvorah-Dance-studio-Dance-studio.png", alt: "Dance studio" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/developer-story-wall/Zyvorah-Developer-story-wall-Developer-story-wall.png", alt: "Developer story wall" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/discussion-lounge/Zyvorah-Discussion-lounge-Discussion-lounge.png", alt: "Discussion lounge" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/family-lounge/Zyvorah-Family-lounge-Family-lounge.png", alt: "Family lounge" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/foosball-area/Zyvorah-Foosball-area-Foosball-area.png", alt: "Foosball area" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/garden-corridor/Zyvorah-Garden-corridor-Garden-corridor.png", alt: "Garden corridor" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/grand-lawn-backdrop/Zyvorah-Grand-lawn-backdrop-Grand-lawn-backdrop.png", alt: "Grand lawn backdrop" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/hobby-room/Zyvorah-Hobby-room-Hobby-room.png", alt: "Hobby room" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/homework-room/Zyvorah-Homework-room-Homework-room.png", alt: "Homework room" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/jacuzzi-lounge/Zyvorah-Jacuzzi-lounge-Jacuzzi-lounge.png", alt: "Jacuzzi lounge" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/karaoke-room/Zyvorah-Karaoke-room-Karaoke-room.png", alt: "Karaoke room" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/landscaped-garden-pavilion/Zyvorah-Landscaped-garden-pavilion-Landscaped-garden-pavilion.png", alt: "Landscaped garden pavilion" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/material-finish-presentation-wall/Zyvorah-Material-finish-presentation-wall-Material-finish-presentation-wall.png", alt: "Material & finish presentation wall" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/meditation-garden/Zyvorah-Meditation-garden-Meditation-garden.png", alt: "Meditation garden" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/meditation-room/Zyvorah-Meditation-room-Meditation-room.png", alt: "Meditation room" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/mini-theatre/Zyvorah-Mini-theatre-Mini-theatre.png", alt: "Mini-theatre" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/music-room/Zyvorah-Music-room-Music-room.png", alt: "Music room" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/outdoor-dining-pavilion/Zyvorah-Outdoor-dining-pavilion-Outdoor-dining-pavilion.png", alt: "Outdoor dining pavilion" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/party-room/Zyvorah-Party-room-Party-room.png", alt: "Party room" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/party-terrace/Zyvorah-Party-terrace-Party-terrace.png", alt: "Party terrace" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/pergola-seating/Zyvorah-Pergola-seating-Pergola-seating.png", alt: "Pergola seating" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/pet-park-entrance/Zyvorah-Pet-park-entrance-Pet-park-entrance.png", alt: "Pet park entrance" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/pilates-studio/Zyvorah-Pilates-studio-Pilates-studio.png", alt: "Pilates studio" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/pool-caf/Zyvorah-Pool-caf-Pool-caf.png", alt: "Pool café" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/pool-changing-area/Zyvorah-Pool-changing-area-Pool-changing-area.png", alt: "Pool changing area" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/pool-deck-wall/Zyvorah-Pool-deck-wall-Pool-deck-wall.png", alt: "Pool deck wall" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/pool-entrance/Zyvorah-Pool-entrance-Pool-entrance.png", alt: "Pool entrance" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/pool-lounge/Zyvorah-Pool-lounge-Pool-lounge.png", alt: "Pool lounge" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/pool-pavilion/Zyvorah-Pool-pavilion-Pool-pavilion.png", alt: "Pool pavilion" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/pre-function-area/Zyvorah-Pre-function-area-Pre-function-area.png", alt: "Pre-function area" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/private-dining-room/Zyvorah-Private-dining-room-Private-dining-room.png", alt: "Private dining room" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/private-entertainment-room/Zyvorah-Private-entertainment-room-Private-entertainment-room.png", alt: "Private entertainment room" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/private-meeting-room/Zyvorah-Private-meeting-room-Private-meeting-room.png", alt: "Private meeting room" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/project-entrance-experience-wall/Zyvorah-Project-entrance-experience-wall-Project-entrance-experience-wall.png", alt: "Project entrance experience wall" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/project-model-room/Zyvorah-Project-model-room-Project-model-room.png", alt: "Project model room" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/reading-room/Zyvorah-Reading-room-Reading-room.png", alt: "Reading room" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/reflexology-area/Zyvorah-Reflexology-area-Reflexology-area.png", alt: "Reflexology area" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/restaurant/Zyvorah-Restaurant-Restaurant.png", alt: "Restaurant" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/sample-flat-entrance/Zyvorah-Sample-flat-entrance-Sample-flat-entrance.png", alt: "Sample-flat entrance" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/sauna-steam-transition/Zyvorah-Sauna-steam-transition-Sauna-steam-transition.png", alt: "Sauna & steam transition" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/senior-citizens-area/Zyvorah-Senior-citizens-area-Senior-citizens-area.png", alt: "Senior citizens' area" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/sky-lounge/Zyvorah-Sky-lounge-Sky-lounge.png", alt: "Sky lounge" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/snooker-room/Zyvorah-Snooker-room-Snooker-room.png", alt: "Snooker room" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/spa-reception/Zyvorah-Spa-reception-Spa-reception.png", alt: "Spa reception" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/strength-training-zone/Zyvorah-Strength-training-zone-Strength-training-zone.png", alt: "Strength-training zone" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/table-tennis-room/Zyvorah-Table-tennis-room-Table-tennis-room.png", alt: "Table-tennis room" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/teen-lounge/Zyvorah-Teen-lounge-Teen-lounge.png", alt: "Teen lounge" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/toddler-room/Zyvorah-Toddler-room-Toddler-room.png", alt: "Toddler room" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/viewing-deck/Zyvorah-Viewing-deck-Viewing-deck.png", alt: "Viewing deck" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/viewing-lounge/Zyvorah-Viewing-lounge-Viewing-lounge.png", alt: "Viewing lounge" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/wellness-lounge/Zyvorah-Wellness-lounge-Wellness-lounge.png", alt: "Wellness lounge" },
        { key: "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/yoga-studio/Zyvorah-Yoga-studio-Yoga-studio.png", alt: "Yoga studio" },
        ],
      },

      { type: "palette" },

      {
        type: "index",
        heading: "Every wall, considered",
        intro:
          "The programme covered the spaces a resident, a visitor or a buyer actually experiences — and left the back-of-house knowingly quiet. Every shared amenity below carries its own design; the tower spaces carry two, one per tower. Ninety designs against this list.",
        groups: [
          {
            name: "Arrival and foyer",
            spaces: [
              "Main entrance lobby", "Porte-cochère arrival wall", "Double-height foyer", "Concierge wall",
              "Reception lounge", "Grand staircase", "Beneath the staircase", "Staircase landing",
              "Under-stair niche", "Decorative wall recesses", "Visitor waiting area", "Tower entrance lobby",
            ],
          },
          {
            name: "Vertical journey",
            spaces: [
              "Ground-floor lift lobby", "Typical residential lift lobby", "Tower A lift lobby", "Tower B lift lobby",
              "Lift interiors", "Floor arrival wall", "Lift-to-apartment corridor", "Staircase landings",
              "Service transition areas", "Wall niches at apartment entrances",
            ],
          },
          {
            name: "Clubhouse and social",
            spaces: [
              "Clubhouse entrance", "Residents' lounge", "Discussion lounge", "Library", "Reading room",
              "Co-working lounge", "Private meeting room", "Café", "Restaurant", "Bar lounge",
              "Private dining room", "Banquet hall", "Pre-function area", "Party room",
              "Outdoor dining pavilion", "Viewing lounge",
            ],
          },
          {
            name: "Fitness and wellness",
            spaces: [
              "Gymnasium", "Cardio zone", "Strength-training zone", "Yoga studio", "Pilates studio",
              "Dance and movement studio", "Spa reception", "Spa treatment room", "Meditation room",
              "Sauna and steam transition", "Changing rooms", "Wellness lounge", "Reflexology area",
            ],
          },
          {
            name: "Pool and aquatic",
            spaces: [
              "Pool entrance", "Indoor pool", "Pool lounge", "Pool deck wall", "Pool pavilion",
              "Pool café", "Children's pool area", "Pool changing area", "Jacuzzi lounge",
            ],
          },
          {
            name: "Children and family",
            spaces: [
              "Kids' club", "Children's playroom", "Toddler room", "Children's library", "Activity room",
              "Art and craft room", "Homework room", "Teen lounge", "Children's party room", "Family lounge",
            ],
          },
          {
            name: "Indoor recreation",
            spaces: [
              "Pool table room", "Snooker room", "Billiards room", "Table-tennis room", "Foosball area",
              "Card room", "Board-games room", "Indoor games lounge", "Mini-theatre", "Music room",
              "Karaoke room", "Private entertainment room", "Hobby room", "Art studio",
            ],
          },
          {
            name: "Outdoor and elevated",
            spaces: [
              "Grand lawn backdrop", "Landscaped garden pavilion", "Rooftop lounge", "Sky lounge",
              "Viewing deck", "Party terrace", "Meditation garden", "Amphitheatre wall", "Pergola seating",
              "Garden corridor", "Children's outdoor play zone", "Senior citizens' area", "Pet park entrance",
            ],
          },
          {
            name: "Developer and sales",
            spaces: [
              "Sales gallery", "Project entrance experience wall", "Sample-flat entrance",
              "Material and finish presentation wall", "Developer story wall", "Project model room",
              "Customer lounge", "Booking and consultation room",
            ],
          },
        ],
      },

      { type: "ask" },
    ],
  },
};
