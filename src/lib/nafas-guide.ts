/** Short, scripted audio descriptions using the collection's saved voice. */
export type GuideTrack = { id: string; title: string; text: string; src: string };
export const GUIDE_DWELL_MS = 1100;
export function canFollowArtwork(enabled: boolean, automatic: boolean, paused: boolean, playing: boolean, candidate: string | null, heard: ReadonlySet<string>): boolean {
  return enabled && automatic && !paused && !playing && !!candidate && !heard.has(candidate);
}
export function visibleArtworkScore(top: number, bottom: number, viewport: number): number {
  const visible = Math.max(0, Math.min(bottom, viewport - 80) - Math.max(top, 110));
  if (visible < 60) return -Infinity;
  return visible / Math.min(bottom - top, viewport - 190) - Math.abs((Math.max(top,110)+Math.min(bottom,viewport-80))/2 - viewport/2) / viewport;
}
export const NAFAS_GUIDE: Record<string, GuideTrack> = {
  "nafas-pizza-pal": {
    id: "nafas-pizza-pal",
    title: "Pizza Pal",
    text: "Look, my pizza is waving hello! I drew it for the children's eating area in a mall. It's got a little tongue sticking out. You could sit here and have your lunch together!",
    src: "/nafas/audio/nafas-pizza-pal.mp3"
  },
  "intro": {
    "id": "intro",
    "title": "Welcome to my collection",
    "text": "Hi, I'm Nafas. Welcome to my collection! There are colourful faces, pencil animals, flowers, cars and footballs. Have a look around. I'll tell you about each picture as you go.",
    "src": "/nafas/audio/intro.mp3"
  },
  "pencil": {
    "id": "pencil",
    "title": "Why black and white?",
    "text": "I like it black and white, and I'd like them to be black and white. These are my pencil animals. A puppy, a fish, and a panda with a little bird on its head.",
    "src": "/nafas/audio/pencil.mp3"
  },
  "nafas-pink-pop": {
    "id": "nafas-pink-pop",
    "title": "Pink Pop",
    "text": "This is Pink Pop. Look at her big pink hair! She has little gummy-bear earrings, and colourful sprinkles all around her.",
    "src": "/nafas/audio/nafas-pink-pop.mp3"
  },
  "nafas-ruby-and-snow": {
    "id": "nafas-ruby-and-snow",
    "title": "Ruby & Snow",
    "text": "This is Ruby and Snow. One side of her hair is red, and the other side is white. Can you see the shapes behind her? They look like coffee beans.",
    "src": "/nafas/audio/nafas-ruby-and-snow.mp3"
  },
  "nafas-face-parade-pattern": {
    "id": "nafas-face-parade-pattern",
    "title": "Face Parade",
    "text": "Here are both faces together. Pink Pop, Ruby and Snow, then Pink Pop again! They go all the way across the wall.",
    "src": "/nafas/audio/nafas-face-parade-pattern.mp3"
  },
  "nafas-patch-the-puppy": {
    "id": "nafas-patch-the-puppy",
    "title": "Patch the Puppy",
    "text": "Here's my puppy. Look at the patches around its eyes, and the little dots by its nose. I wanted my pencil animals to stay black and white.",
    "src": "/nafas/audio/nafas-patch-the-puppy.mp3"
  },
  "nafas-bubbles-the-fish": {
    "id": "nafas-bubbles-the-fish",
    "title": "Bubbles the Fish",
    "text": "Here's my fish. Can you count its bubbles? One, two, three! Look at the stripes and the little fins. This one stays in pencil, too.",
    "src": "/nafas/audio/nafas-bubbles-the-fish.mp3"
  },
  "nafas-panda-and-tweet": {
    "id": "nafas-panda-and-tweet",
    "title": "Panda & Tweet",
    "text": "Look at my panda. There's a tiny bird sitting on its head, and the bird is singing! Can you find the music notes? I've kept them black and white.",
    "src": "/nafas/audio/nafas-panda-and-tweet.mp3"
  },
  "nafas-daisy-days": {
    "id": "nafas-daisy-days",
    "title": "Daisy Days",
    "text": "These are my little flowers on pink. Some are yellow, and some are purple. There are green leaves, too. You can follow the flowers all across the wall.",
    "src": "/nafas/audio/nafas-daisy-days.mp3"
  },
  "nafas-spiral-bloom": {
    "id": "nafas-spiral-bloom",
    "title": "Spiral Bloom",
    "text": "This is my big crayon flower. Look at the red petals, and the colours going round and round in the middle. You can still see all the crayon marks.",
    "src": "/nafas/audio/nafas-spiral-bloom.mp3"
  },
  "nafas-wheels-and-goals": {
    "id": "nafas-wheels-and-goals",
    "title": "Wheels & Goals",
    "text": "Here are my blue cars and footballs. The cars are all going the same way! Can you follow them across the blue background?",
    "src": "/nafas/audio/nafas-wheels-and-goals.mp3"
  }
};
