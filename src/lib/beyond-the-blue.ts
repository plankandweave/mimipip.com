export const BLUE_DESIGNS = [
  {
    "number": "01",
    "slug": "willow-canal",
    "name": "Willow Canal",
    "story": "Willows lean towards the water. Beyond the bridge, the day has nowhere it needs to be.",
    "mood": "Wander"
  },
  {
    "number": "02",
    "slug": "windmill-meadows",
    "name": "Windmill Meadows",
    "story": "A little wind, a wide horizon. Open meadows bring a generous breath of space to the room.",
    "mood": "Breathe"
  },
  {
    "number": "03",
    "slug": "lakeside-chateau",
    "name": "Lakeside Château",
    "story": "Across the lake, a château waits among the trees. A landscape for afternoons that linger.",
    "mood": "Dream"
  },
  {
    "number": "04",
    "slug": "woodland-stream",
    "name": "Woodland Stream",
    "story": "Follow the stream into the trees. Ferns, shade and a distant clearing draw the eye deeper.",
    "mood": "Wander"
  },
  {
    "number": "05",
    "slug": "orchard-pavilion",
    "name": "Orchard Pavilion",
    "story": "An orchard in blossom, a pavilion at the turn of a path. Spring, held quietly on the wall.",
    "mood": "Bloom"
  },
  {
    "number": "06",
    "slug": "harbour-sails",
    "name": "Harbour Sails",
    "story": "Sails rest above still water. The harbour opens the room to a softer, slower rhythm.",
    "mood": "Drift"
  },
  {
    "number": "07",
    "slug": "heron-wetlands",
    "name": "Heron Wetlands",
    "story": "Herons stand among the reeds. White water and delicate irises leave space for the eye to rest.",
    "mood": "Breathe"
  },
  {
    "number": "08",
    "slug": "tulip-country",
    "name": "Tulip Country",
    "story": "Tulips gather beside a country path. A garden with a little wildness and a long view.",
    "mood": "Bloom"
  },
  {
    "number": "09",
    "slug": "mountain-lake",
    "name": "Mountain Lake",
    "story": "The mountains grow paler with distance. A luminous lake brings the feeling of a faraway morning.",
    "mood": "Dream"
  },
  {
    "number": "10",
    "slug": "italian-terrace",
    "name": "Italian Terrace",
    "story": "Past the balustrade, the lake opens. Cypress, lemon boughs and a terrace made for lingering.",
    "mood": "Drift"
  },
  {
    "number": "11",
    "slug": "moonlit-river",
    "name": "Moonlit River",
    "story": "A small boat rests under the moon. The river carries the last light through the trees.",
    "mood": "Rest"
  }
] as const;
export type BlueDesign = (typeof BLUE_DESIGNS)[number];
export const blueAsset = (slug: string, kind: string) => `/beyond-the-blue/${slug}-${kind}${["room", "room-small", "repeat-room"].includes(kind) ? "-v3" : ""}.webp`;
export const blueHandle = (slug: string, repeat = false) => `beyond-the-blue-${slug}${repeat ? '-repeat' : ''}`;
