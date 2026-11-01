/** Approved Indian-home settings; tags match the room pictured. */
export const BLUE_ROOMS: Record<string, {label:string;scene:string;tag:string}> = {
  "willow-canal": {
    "label": "Apartment living room",
    "scene": "living",
    "tag": "Living Room"
  },
  "willow-canal-repeat": {
    "label": "Family dining room",
    "scene": "dining",
    "tag": "Dining Room"
  },
  "windmill-meadows": {
    "label": "Balcony dining room",
    "scene": "dining",
    "tag": "Dining Room"
  },
  "windmill-meadows-repeat": {
    "label": "Breakfast nook",
    "scene": "dining",
    "tag": "Dining Room"
  },
  "lakeside-chateau": {
    "label": "Master bedroom",
    "scene": "bedroom",
    "tag": "Bedroom"
  },
  "lakeside-chateau-repeat": {
    "label": "Family sitting room",
    "scene": "living",
    "tag": "Living Room"
  },
  "woodland-stream": {
    "label": "Home study",
    "scene": "office",
    "tag": "Home Office"
  },
  "woodland-stream-repeat": {
    "label": "Reading corner",
    "scene": "library",
    "tag": "Library & Reading Corners"
  },
  "orchard-pavilion": {
    "label": "Family dining room",
    "scene": "dining",
    "tag": "Dining Room"
  },
  "orchard-pavilion-repeat": {
    "label": "Apartment living room",
    "scene": "living",
    "tag": "Living Room"
  },
  "harbour-sails": {
    "label": "Coastal city living room",
    "scene": "living",
    "tag": "Living Room"
  },
  "harbour-sails-repeat": {
    "label": "Family dining room",
    "scene": "dining",
    "tag": "Dining Room"
  },
  "heron-wetlands": {
    "label": "Reading room",
    "scene": "library",
    "tag": "Library & Reading Corners"
  },
  "heron-wetlands-repeat": {
    "label": "Breakfast room",
    "scene": "dining",
    "tag": "Dining Room"
  },
  "tulip-country": {
    "label": "Family dining room",
    "scene": "dining",
    "tag": "Dining Room"
  },
  "tulip-country-repeat": {
    "label": "Family living room",
    "scene": "living",
    "tag": "Living Room"
  },
  "mountain-lake": {
    "label": "Apartment living room",
    "scene": "living",
    "tag": "Living Room"
  },
  "mountain-lake-repeat": {
    "label": "Home office",
    "scene": "office",
    "tag": "Home Office"
  },
  "italian-terrace": {
    "label": "Balcony dining room",
    "scene": "dining",
    "tag": "Dining Room"
  },
  "italian-terrace-repeat": {
    "label": "Master bedroom",
    "scene": "bedroom",
    "tag": "Bedroom"
  },
  "moonlit-river": {
    "label": "Reading corner",
    "scene": "library",
    "tag": "Library & Reading Corners"
  },
  "moonlit-river-repeat": {
    "label": "Family lounge",
    "scene": "living",
    "tag": "Living Room"
  }
};

export function blueRoom(slug:string, repeat=false) {
  return BLUE_ROOMS[`${slug}${repeat?'-repeat':''}`];
}
