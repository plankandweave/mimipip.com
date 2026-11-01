import type { Project } from "./types";

/**
 * Concept Study 05 — hospitality.
 *
 * A hotel study cannot sell identity the way a workplace study does: nobody
 * works here, and nobody stays long enough to learn a system. What a hotel
 * sells is the feeling of having arrived somewhere specific — which is
 * exactly what the industry's own art budgets usually destroy, because the
 * safest thing to hang in a lobby is the thing that could hang in any lobby.
 *
 * So the argument here is singular rather than plural: ONE subject, the
 * river the city was built on, drawn nine different ways as the guest moves
 * inward. Downstream at the door, upstream by bedtime. It is a device that
 * survives the two tests a hotel scheme actually faces — a photograph of any
 * one wall has to look intentional on its own, and the nine together have to
 * look like a place rather than a portfolio.
 *
 * Source imagery arrived as nine finished room views with no matching bare
 * frames, so every chapter renders as a single full-bleed plate rather than
 * a plain|curated reveal. Three frames are 3:2 rather than 16:9 and carry an
 * explicit aspect override — the lobby mural in particular is a full-height
 * composition that a 16:9 crop would decapitate.
 */
export const riverHouse: Project = {
  slug: "river-house",
  kind: "concept",
  theme: "warm",
  segments: ["hospitality"],

  client: "A riverside city hotel",
  title: "Everything Here Comes From the River",
  standfirst:
    "A guest forgets a lobby the moment they leave it, unless the lobby was about something. This one is about the water the city was built on — followed inward, room by room, from the embankment at the front door to the riverbed behind the bed.",
  facts: [
    { label: "Sector", value: "Hospitality" },
    { label: "Setting", value: "A river city" },
    { label: "Walls shown", value: "9 spaces" },
    { label: "Through-line", value: "One river, nine readings" },
  ],

  cover: "river-house/reception-curated.jpg",

  brief: {
    intro:
      "A hotel with a strong architectural shell, a serious food and beverage programme, and the usual problem: the interiors were resolved and the walls were not. Art had been budgeted as a decorating line — a per-room allowance and a supplier list — which reliably produces rooms that photograph well individually and add up to nothing.",
    requirements: [
      "Make the building feel like it could only be in this city, without printing a single landmark postcard.",
      "Give four very different restaurants their own character while keeping them recognisably one house.",
      "Hold the lobby at full volume and let the guest floors go almost silent.",
      "Give the guest something that rewards a second look on day three, not just a first look at check-in.",
      "Work as a system a hotel operator can extend later — a new outlet, a refurbished floor — without a redesign.",
    ],
  },

  interpretation: [
    "We took one subject and refused to take a second. The river is the reason the city exists, the reason the hotel has its address, and the only thing every guest crosses on the way in — so it becomes the single subject the whole building draws from.",
    "It is never illustrated the same way twice. At reception it is an etched embankment, the city drawn as a surveyor would draw it. In the lobby it is a survey map, the water rendered as geology rather than view. In the corridor it becomes the river seen from its bridges; in the lift lobby, the city at three distances at once — pavement, rooftop, and the drawing board it was set out on. By the restaurants it has left the city altogether — the source in the mountains, the fields it irrigates, the shallows it runs through. In the guest room there is no river left at all, only the stone it spent a few thousand years cutting.",
    "That progression is the whole scheme. A guest moving from the front door to their bed is moving upstream, from the public city to something geological and quiet, and the walls get slower and less talkative at exactly the rate the guest does.",
  ],

  palette: {
    intro: "Six colours, drawn off the water and the stone it runs over — and what each one is asked to do to the person standing in front of it.",
    entries: [
      { name: "Embankment", hex: "#E3D8C6", purpose: "Warm stone, and the calm that comes with it. Nothing placed on this colour looks loud." },
      { name: "River Ink", hex: "#2D3B4C", purpose: "Deep water after dark. Serious and steady — the colour people trust without knowing why." },
      { name: "Silt Gold", hex: "#B78A46", purpose: "Lamplight. Used sparingly it reads as gold; used freely it reads as gold plating." },
      { name: "Lacquer", hex: "#8B2C24", purpose: "Appetite and occasion. One room only — red stops meaning anything the second time you meet it." },
      { name: "Bank Moss", hex: "#59684F", purpose: "The planted bank. Green is the one colour a tired eye reads straight away as rest." },
      { name: "Riverbed", hex: "#8A8B84", purpose: "Wet grey stone. Barely a colour at all, which is precisely what a bedroom wants." },
    ],
    note:
      "The palette does not change between rooms — its volume does. The lobby carries all six at full strength; the guest room is allowed two, and one of them is barely a colour.",
  },

  motifs: {
    intro: "One subject, five ways of drawing it. Which one a room gets is decided by how long a guest stays in it.",
    entries: [
      { name: "The embankment etching", description: "The waterfront drawn in fine line, as a nineteenth-century surveyor would have recorded it." },
      { name: "The survey map", description: "The same river as contour and channel — geology, not scenery. The pre-function lobby's full-height mural." },
      { name: "The bridge view", description: "Nocturnes from the crossings, framed rather than mural, for spaces people walk through." },
      { name: "The source", description: "Mountains, cloud and moon above the headwaters. Kept for the darkest room in the hotel." },
      { name: "The riverbed", description: "Cut stone, mineral veining, no horizon and nothing to read. Bedrooms only." },
    ],
  },

  chapters: [
    {
      space: "Main lobby — reception",
      title: "The City, Before Anyone Speaks",
      rationale:
        "The main hotel lobby, where guests check in. The wall behind the desk is a single etched line drawing of the waterfront the hotel stands on — palaces, quays, a bridge, the water carrying smoke. It is the one moment the scheme is allowed to be literal, because a guest who has just travelled deserves to be told plainly where they are. Everything after this gets more abstract, not less.",
      curated: "river-house/reception-curated.jpg",
      alt: "Hotel reception desk against a full-width etched drawing of a city waterfront",
    },
    {
      space: "Pre-function lobby — meetings and banquets",
      title: "The River as Geology",
      rationale:
        "The same house, a different door: this is the lobby on the way to the meeting rooms, and the one every conference, banquet and private event gathers in before it goes through. Double height, and the only wall in the building that takes the full drop. The river is drawn as a survey map — channel, contour, the faint grid of a city recorded around it — in ink and gold leaf across nine panels. From the seating it reads as weather; from the mezzanine it resolves into a map. That second reading is the point: it is the wall a returning guest notices something new in.",
      curated: "river-house/lobby-lounge-curated.jpg",
      alt: "Double-height hotel lobby with a full-height ink and gold survey-map mural",
      aspect: "3/2",
    },
    {
      space: "Gallery corridor",
      title: "Seen From the Bridges",
      rationale:
        "A walking space, so the river stops being a mural and becomes a sequence of framed nocturnes — the skyline from each crossing, in order, so the corridor is a walk along the water rather than a hang of pictures. Framed work also survives what corridors do to walls: luggage, trolleys, a decade of shoulders.",
      curated: "river-house/gallery-corridor-curated.jpg",
      alt: "Panelled hotel corridor lined with lit, framed nocturne drawings of a city skyline",
      aspect: "3/2",
    },
    {
      space: "Lift lobby",
      title: "The City, Drawn Three Ways",
      rationale:
        "Three lift cars, three drawings, one city — the same river read at three distances. The first car is the embankment at eye level, from the pavement a guest has just walked. The second climbs above the roofs and gives them the whole bend of the water and its bridges. The third abandons the view entirely for the drawing office: elevations, a plan, and the setting-out lines still showing. A guest uses this space perhaps eight times in a stay and never for more than forty seconds, so each car has to land as one image — and the set only assembles itself across a week of arriving at whichever door opens first. It is the last look at the city; above this floor the scheme goes quiet.",
      curated: "river-house/lift-lobby-curated-v2.jpg",
      alt: "Hotel lift lobby with three bronze-framed lift cars, each carrying a different sepia pen drawing on aged paper — a canal embankment, the river from above, and a sheet of church elevations",
      series: [
        { key: "river-house/lift-study-embankment-v2.jpg", alt: "Sepia pen drawing of a canal embankment lined with baroque palaces, small boats on the water and a balustraded quay in the foreground", caption: "Car one — the embankment" },
        { key: "river-house/lift-study-aerial-v2.jpg", alt: "Sepia pen drawing looking down on a river city — the water curving between packed rooftops, spires and two arched bridges", caption: "Car two — from above" },
        { key: "river-house/lift-study-elevations-v2.jpg", alt: "Drawing-office sheet of church elevations and a floor plan in sepia ink, the setting-out lines and construction geometry still visible", caption: "Car three — the drawing office" },
      ],
    },
    {
      space: "Tea lounge",
      title: "The Planted Bank",
      rationale:
        "The most classical room in the hotel, so the river arrives here as its garden — branch and blossom on an aged ground, drawn at a scale that lets afternoon light do most of the work. A framed fragment of the same artwork hangs on the return wall, so the mural reads as a work with an edition rather than as a covering.",
      curated: "river-house/tea-lounge-curated.jpg",
      alt: "Panelled tea lounge with a soft blossom-and-branch mural above banquette seating",
    },
    {
      space: "Chinese dining room",
      title: "Upstream, at Night",
      rationale:
        "The darkest room in the building, and the only one that gets lacquer. The river is taken all the way back to its source: mountains in silver line, three moons on gold leaf, the whole thing dropped to near-black so the room is lit by candles and the wall rather than by fixtures. The single red is the reason no other room is allowed one.",
      curated: "river-house/dining-room-curated.jpg",
      alt: "Dark fine-dining room with a gold and silver mural of mountains and moons",
    },
    {
      space: "All-day restaurant",
      title: "What the River Feeds",
      rationale:
        "The fields the water irrigates and the table they end on, drawn as vertical bands with plates, grains and working hands held inside them. Warm and busy on purpose: this room runs from breakfast to late, it is never empty and never quiet, and a contemplative wall would have been the wrong instrument for it.",
      curated: "river-house/all-day-restaurant-curated.jpg",
      alt: "Indian all-day restaurant with a tall mural of coloured bands, plates and hands",
    },
    {
      space: "Garden café",
      title: "The Shallows",
      rationale:
        "Indigo on paper-white — the river where it runs thin over stones and weed. The palette drops to two colours and a red seal because the room already has the garden outside it, and a wall that competes with a window loses.",
      curated: "river-house/garden-cafe-curated.jpg",
      alt: "Daylit garden café with tall indigo botanical panels behind a low credenza",
    },
    {
      space: "Guest room",
      title: "Nothing Left to Read",
      rationale:
        "The end of the journey upstream, and the quietest wall in the hotel: cut riverbed stone behind the bed, with a single copper vein running the width of it. No horizon, no landmark, nothing to interpret at two in the morning. This is the room that decides whether the scheme was curated or supplied.",
      curated: "river-house/guest-room-curated.jpg",
      alt: "Hotel guest room with a stone-strata mural running the full width behind the bed",
      aspect: "3/2",
    },
  ],

  wallHierarchy: {
    intro:
      "A hotel is the easiest building in the world to over-decorate, because every wall has a budget line and every supplier has a catalogue. The volumes below were agreed before a single artwork was drawn.",
    levels: [
      { level: "Full voice", purpose: "The two lobbies and the two signature dining rooms — the walls that carry the whole idea.", share: 20 },
      { level: "Half voice", purpose: "Tea lounge, garden café, gallery corridor — character, at conversational volume.", share: 25 },
      { level: "A murmur", purpose: "Lift lobbies and landings — one panel per car, understood in forty seconds.", share: 15 },
      { level: "Silent", purpose: "Guest corridors, bedroom side walls, back of house. Plaster, paint and nothing else.", share: 40 },
    ],
    note:
      "Two fifths of the walls in this hotel are deliberately left with nothing on them. That is not an economy — it is the only reason the other three fifths land.",
  },

  journeys: {
    intro: "The same nine walls, met by three people who want completely different things from the building.",
    entries: [
      {
        who: "The arriving guest",
        route: ["Main lobby", "Pre-function lobby", "Lift lobby", "Guest room"],
        body: "Four walls in under ten minutes, getting quieter each time. They will not consciously register the sequence — they will register that the room felt like a relief rather than a surprise.",
      },
      {
        who: "The local who never books a room",
        route: ["Tea lounge", "Garden café", "All-day restaurant"],
        body: "This guest sees the hotel entirely through its restaurants and comes back monthly. The three rooms have to feel like three places while sharing one hand, or the hotel reads as a food court.",
      },
      {
        who: "The guest on night three",
        route: ["Gallery corridor", "Pre-function lobby", "Chinese dining room"],
        body: "Long enough in the building to start looking properly. The map resolves, the corridor turns out to be in order, the moons turn out to be the same river. Everything held back at check-in is spent here.",
      },
    ],
  },

  process: {
    intro: "Working out what the building is about before working out what goes on it.",
    steps: [
      {
        title: "One subject, chosen ruthlessly",
        body: "The city offered a dozen usable themes. Eleven were discarded, because a hotel with a dozen themes is a hotel with none — and a single subject is the only thing that lets nine rooms differ without drifting.",
      },
      {
        title: "The volume map",
        body: "Every wall in the building is assigned a volume — full, half, murmur, silent — before any artwork exists. The silent list is written first and defended hardest.",
      },
      {
        title: "One hand, nine treatments",
        body: "Etching, map, nocturne, gold-leaf night, banded fresco, indigo, stone. Different techniques, one palette and one subject, tested side by side at full scale so no room could quietly become a different project.",
      },
      {
        title: "Built to the wall, not to a roll",
        body: "Each mural is composed at the true dimensions of its wall, panelled to suit the joinery and lighting, and colour-checked against physical proofs under the room's own lamps before anything is printed.",
      },
    ],
  },

  productionNote: {
    title: "A note on what this is",
    body:
      "The hotel is invented and these are concept visuals — the method is real, the property is not. For an actual commission, every mural is rebuilt as print-ready artwork against:",
    points: [
      "Final wall measurements and joinery setting-out",
      "Doors, sockets, sprinklers, service panels and switch plates",
      "Furniture, banquette heights and back-of-sofa lines",
      "The room's own lighting — colour temperature, angle and level",
      "Panel widths, seam positions and access for later replacement",
      "Approved physical colour proofs, viewed in the room they are for",
    ],
  },

  ask: {
    heading: "Send us your lobby.",
    body:
      "A render, a floor plan, or a photograph taken from the front door. We'll tell you what we think the building is about — and show you one wall that proves it. No cost, no obligation.",
  },
};
