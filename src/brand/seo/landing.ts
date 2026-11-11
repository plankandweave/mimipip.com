/**
 * The pages a parent lands on from a search: one per search she named.
 * Every word comes from the catalogue, the product pages or prices.json. No
 * safety or material claim, no other brand. A page with nothing to sell is not
 * published: it is not in the sitemap and its address goes to the shop, and it
 * publishes itself the day its first design goes on sale.
 */
import editorial from '../review/editorial.json';
import { saleOf } from '../commerce/sale';
import { sellable, isWallpaper, listPrice, type Rec } from './site';

export type Landing = {
  key: string; h1: string; metaTitle: string; description: string; intro: string;
  sections: { heading: string; text: string }[]; products: string[];
};

const money = (m: { currency: string; amount: number } | null) =>
  m ? new Intl.NumberFormat(m.currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency: m.currency, maximumFractionDigits: m.amount % 1 ? 2 : 0 }).format(m.amount) : null;

const slugs = (test: (r: Rec) => boolean) => sellable.filter(test).map(r => r.slug);
const wallpapers = slugs(isWallpaper);
const hopscotch = slugs(r => r.collection.includes('hopscotch'));
const firstWall = wallpapers[0], firstGame = hopscotch[0];

const wallSale = firstWall ? saleOf(firstWall) : null;
const wallPrice = wallSale?.india?.rate && wallSale.abroad?.rate
  ? `In India wallpaper is ${money({ currency: 'INR', amount: wallSale.india.rate })} per sq ft including GST and delivery. Elsewhere it is ${money({ currency: 'USD', amount: wallSale.abroad.rate })} per sq ft, delivery included. The smallest order is billed as 20 sq ft.`
  : '';
const gamePrice = firstGame
  ? `Each hopscotch is ${money(listPrice(firstGame, 'IN'))} in India, GST and delivery included, and ${money(listPrice(firstGame, 'ABROAD'))} elsewhere, delivery included.`
  : '';
const howToPlay = 'Start below 1 on a clear, level indoor floor. Step onto 1, then place one foot on each square of the next pair. Follow the numbers to 10 and walk back beside the sticker.';
const measure = 'Measure the full wall in several places and enter its widest width and tallest height. Each wallpaper is made to those measurements.';

const fromEditorial = (key: keyof typeof editorial, metaTitle: string, description: string, sections: Landing['sections']): Landing => ({
  key, h1: editorial[key].title, metaTitle, description, intro: editorial[key].intro, sections,
  products: editorial[key].products.filter(s => sellable.some(r => r.slug === s)),
});

const all: Landing[] = [
  fromEditorial('kids-wallpaper', "Kids' wallpaper, made to measure for your wall | MimiPip",
    "Kids' wallpaper made to your wall's measurements: animals, gardens, skies, sport and imaginative scenes for children's bedrooms and playrooms.",
    [{ heading: 'Made for your wall', text: measure }, { heading: 'What it costs', text: wallPrice }]),
  fromEditorial('kids-room-wallpaper', "Kids' room wallpaper and wall murals | MimiPip",
    "Wallpaper and wall murals for a child's room, from calm nursery scenes to bold playroom murals, each made to your wall's measurements.",
    [{ heading: 'Choosing for the room', text: 'Start with the room: a bedroom, a nursery or a playroom. Then choose by colour or by the story your child loves. Every design page shows the scene in a room and the artwork on its own.' }, { heading: 'What it costs', text: wallPrice }]),
  {
    key: 'nursery-wallpaper', h1: 'Nursery wallpaper for the first room',
    metaTitle: 'Nursery wallpaper, made to measure | MimiPip',
    description: 'Nursery wallpaper in gentle florals, skies, meadows and animal scenes, made to the measurements of your wall.',
    intro: 'Soft florals, quiet skies, meadows and friendly animals for a baby’s room. Every design here is one we show in a nursery, and each is made to the measurements of your wall.',
    sections: [{ heading: 'Made for your wall', text: measure }, { heading: 'What it costs', text: wallPrice }],
    products: slugs(r => isWallpaper(r) && r.space.includes('nursery') && r.age.includes('baby')),
  },
  fromEditorial('winter-wonder-wallpaper', "Winter wonderland wallpaper for kids' rooms | MimiPip",
    "Snowy gardens, moonlit skies and gentle winter scenes as made-to-measure wallpaper for children's rooms.", []),
  fromEditorial('superhero-adventure-wallpaper', "Adventure wallpaper for kids' rooms: city, climbing and play | MimiPip",
    "Original adventure wallpaper for children's rooms: city rooftops, climbing and movement, made to your wall's measurements.", []),
  {
    key: 'floor-game-stickers', h1: 'Floor game stickers for kids',
    metaTitle: 'Floor game stickers for kids: hopscotch for the playroom | MimiPip',
    description: 'Floor game stickers that turn a clear patch of indoor floor into a game. A connected hopscotch number trail, 75 × 260 cm, in three colourways.',
    intro: 'A game that lives on the floor, ready whenever there are ten minutes to play. Our hopscotch is one connected floor sticker, a number trail from 1 to 10, in three colourways.',
    sections: [
      { heading: 'How it is played', text: howToPlay + ' Try small hops when comfortable.' },
      { heading: 'Size and what arrives', text: 'One connected contour-cut floor sticker, 75 × 260 cm. It arrives rolled in one piece, in a 77 cm tube. Lay it out before peeling the backing so you can choose its spot. Stickers only: furniture and room accessories are not included.' },
      { heading: 'What it costs', text: gamePrice },
    ],
    products: hopscotch,
  },
  {
    key: 'hopscotch-floor-sticker', h1: 'Hopscotch floor sticker',
    metaTitle: 'Hopscotch floor sticker for kids, 75 × 260 cm | MimiPip',
    description: 'A hopscotch floor sticker for indoor play: one connected number trail from 1 to 10, 75 × 260 cm, in Peach Pop, Pastel Play and Bold Adventure.',
    intro: 'Hopscotch, indoors. One connected floor sticker with the numbers 1 to 10, 75 × 260 cm, in three colourways: Peach Pop, Pastel Play and Bold Adventure.',
    sections: [
      { heading: 'How to play', text: howToPlay },
      { heading: 'Secret Stop', text: 'Choose a number before starting. Freeze on that number, then continue to 10. Take turns choosing the next stop.' },
      { heading: 'Measure your floor first', text: 'Measure 75 × 260 cm on your floor and leave space to move around the game. Identify the surface and finish before ordering.' },
      { heading: 'What it costs', text: gamePrice },
    ],
    products: hopscotch,
  },
  {
    key: 'birthday-gifts-for-kids', h1: 'A birthday gift they can play',
    metaTitle: 'Birthday gifts for kids: a hopscotch floor game | MimiPip',
    description: 'A birthday gift for kids that gets played: a hopscotch floor game sticker, 75 × 260 cm, rolled in a tube and delivered to your door.',
    intro: 'For a child of preschool or school age, a gift that becomes a game on the floor of their room. The hopscotch arrives rolled in one piece, in a 77 cm tube.',
    sections: [
      { heading: 'What they unroll', text: 'One connected floor sticker with the numbers 1 to 10, 75 × 260 cm, in Peach Pop, Pastel Play or Bold Adventure.' },
      { heading: 'A game for two', text: 'Secret Stop: choose a number before starting. Freeze on that number, then continue to 10. Take turns choosing the next stop.' },
      { heading: 'What it costs', text: gamePrice },
    ],
    products: hopscotch,
  },
  {
    key: 'return-gifts-for-kids', h1: 'Return gifts children take home and play',
    metaTitle: 'Return gifts for kids: floor games for a birthday party | MimiPip',
    description: 'Return gifts for a child’s birthday party: hopscotch floor game stickers, each rolled in its own tube. Choose a colourway and the quantity you need.',
    intro: 'For a birthday party where each child goes home with a game. Each hopscotch floor sticker is rolled in one piece, in a 77 cm tube. Choose a colourway and set the quantity on the design page.',
    sections: [
      { heading: 'Three colourways', text: 'Peach Pop, Pastel Play and Bold Adventure. Each is one connected number trail from 1 to 10, 75 × 260 cm.' },
      { heading: 'What it costs', text: gamePrice + ' The price is per piece.' },
    ],
    products: hopscotch,
  },
  {
    key: 'kids-wall-stickers', h1: 'Kids’ wall stickers',
    metaTitle: "Kids' wall stickers and wall borders | MimiPip",
    description: "Wall stickers and wall borders for children's rooms and bathrooms.",
    intro: 'Friendly faces and little stories for the walls of a child’s room. Stickers only: furniture and room accessories are not included.',
    sections: [],
    products: slugs(r => r.type.includes('wall-sticker') || r.type.includes('border')),
  },
  {
    key: 'colourable-wallpaper', h1: 'Wallpaper to colour in',
    metaTitle: 'Colour-in wallpaper for kids | MimiPip',
    description: 'Colour & Create: wallpaper drawn in outline for children to colour.',
    intro: 'Colour & Create wallpaper, made to the measurements of your wall.',
    sections: [],
    products: slugs(r => r.collection.includes('colour-create')),
  },
];

/** Only a page with something to sell is published. */
export const landings: Landing[] = all.filter(l => l.products.length > 0);
export const unpublishedLandings = all.filter(l => l.products.length === 0).map(l => l.key);
export const allLandingKeys = all.map(l => l.key);
export const landingOf = (key: string) => landings.find(l => l.key === key) ?? null;
