export const NEW_YORK_COLLECTION_TAG = "New York: The Skyline He Carried";
export const NEW_YORK_MEDIA_BASE = "https://zyvorah.com/media/product-images/new-york-skyline-v1";
export const NEW_YORK_DESIGNS = [
  {
    "slug": "the-view-he-kept",
    "name": "The View He Kept",
    "description": "A luminous remembered skyline, held across the quiet breadth of the Hudson.",
    "settings": [
      "Grand living salon",
      "Walnut study",
      "Dining gallery"
    ]
  },
  {
    "slug": "clockside",
    "name": "Clockside",
    "description": "The octagonal waterfront clock and the skyline beyond, drawn in warm stone and charcoal.",
    "settings": [
      "Collector’s entrance hall",
      "Listening lounge",
      "Private meeting salon"
    ]
  },
  {
    "slug": "bronx-in-brick",
    "name": "Bronx, In Brick",
    "description": "Brick façades, stoops and tree shade bring the city down to the scale of a neighbourhood.",
    "settings": [
      "Library snug",
      "Breakfast room",
      "Boutique guest lounge"
    ]
  },
  {
    "slug": "hudson-blue",
    "name": "Hudson Blue",
    "description": "River, sky and the remembered towers settle into soft layers of blue.",
    "settings": [
      "Master bedroom",
      "Curved conversation lounge",
      "Serene dining room"
    ]
  },
  {
    "slug": "wall-street-before-nine",
    "name": "Wall Street, Before Nine",
    "description": "Morning light travels between stone façades in an imagined financial-district street.",
    "settings": [
      "Executive home office",
      "Chess room",
      "Stone entrance gallery"
    ]
  },
  {
    "slug": "the-walk-home",
    "name": "The Walk Home",
    "description": "An empty bench, autumn branches and a riverside railing open towards the distant skyline.",
    "settings": [
      "Reading retreat",
      "Garden breakfast room",
      "Staircase landing"
    ]
  },
  {
    "slug": "two-in-the-morning-light",
    "name": "Two in the Morning Light",
    "description": "The remembered towers rise through a gentle wash of peach, silver and early light.",
    "settings": [
      "Master bedroom",
      "Dressing salon",
      "Morning sitting room"
    ]
  },
  {
    "slug": "windows-after-dark",
    "name": "Windows After Dark",
    "description": "Warm windows gather across layered rooftops as the city moves into evening.",
    "settings": [
      "Cocktail lounge",
      "Music room",
      "Intimate dining room"
    ]
  },
  {
    "slug": "water-tank-reverie",
    "name": "Water Tank Reverie",
    "description": "Timber tanks, brick parapets and fine rooftop silhouettes reveal another rhythm of New York.",
    "settings": [
      "Loft living room",
      "Creative studio",
      "Reading gallery"
    ]
  },
  {
    "slug": "the-river-between",
    "name": "The River Between",
    "description": "Muted blue-green reflections carry the space between the waterfront clock and the skyline.",
    "settings": [
      "Dining salon",
      "Master bedroom sitting area",
      "Arrival lounge"
    ]
  },
  {
    "slug": "new-york-held-close",
    "name": "New York, Held Close",
    "description": "A garden terrace and soft tree canopy frame the river and the city beyond.",
    "settings": [
      "Family salon",
      "Private library",
      "Conservatory dining room"
    ]
  }
] as const;
export function newYorkImage(slug: string, scene: number | "flat") {
  return `${NEW_YORK_MEDIA_BASE}/${slug}/${scene === "flat" ? "flat.png" : `scene-${scene}.png`}`;
}

