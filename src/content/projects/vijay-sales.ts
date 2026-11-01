import type { Project } from "./types";

/**
 * Commissioned Project 01 — the first entry that isn't speculative.
 *
 * Everything else in this folder is concept work for an invented client,
 * clearly labelled as such. This is the opposite: a real, ongoing account,
 * shown with the client's own name and logo. So it carries a different
 * `kind` ("commissioned") and a different cover label, and nothing here
 * should ever be softened into sounding like a pitch — it's a record of
 * work already dispatched and installed.
 *
 * One store stands in for the rollout, deliberately unnamed — the point
 * being made is the *system* (localised entrance, one grammar of surprise
 * running through every floor), not a specific address. All three images are
 * real artwork pulled directly from the design library — an entrance mural
 * design and two interior appliance-band designs — not renders and not
 * concept art. None of them are before/after pairs — there was no bare-wall
 * photo to pair them with — so every chapter here is a single full-bleed
 * plate.
 */
export const vijaySales: Project = {
  slug: "vijay-sales",
  kind: "commissioned",
  theme: "bright",
  segments: ["retail"],

  client: "Vijay Sales",
  clientLogo: "vijay-sales/vs-logo.svg",
  title: "Local at the Door. Unexpected Everywhere Else.",
  standfirst:
    "One idea running through every Vijay Sales store: the entrance belongs to the city it's in, and everything past it is deliberately, joyfully unreal.",
  facts: [
    { label: "Client", value: "Vijay Sales" },
    { label: "Sector", value: "Consumer electronics retail" },
    { label: "Scope", value: "Store rollout, ongoing" },
  ],

  cover: "vijay-sales/kitchen-curated-v3.jpg",

  brief: {
    intro:
      "A national electronics retailer, opening stores across very different cities, wanted every store to feel like it belonged to Vijay Sales — without every store feeling identical, and without the walls ever competing with the products on the shelves.",
    requirements: [
      "Make the entrance feel local, not generic — the first thing a customer reads about the store is the city itself.",
      "Break the monotony of a retail floor without slowing anyone down.",
      "Give the walls a job the merchandise can't do: curiosity. A reason to look up, and a reason to go upstairs.",
      "Hold together across a two-floor format, so the store reads as one experience rather than two.",
      "Never outshine the product. The wall's job is mood, not attention.",
    ],
  },

  interpretation: [
    "The idea splits the store into two deliberately different jobs.",
    "At the door, the wall is local. A skyline, a landmark, a piece of the city the store actually stands in — so walking in feels like arriving somewhere specific, not like entering a franchise template repeated nationwide.",
    "Past the entrance, the wall stops being realistic on purpose. Kettles the size of doorways. A television propped against a colour-block wall like a painting. None of it is trying to look real, because real is what the shelves are for — the walls' job is to make the browsing itself feel like discovery, and to plant the idea that there's more to find, including a whole floor most customers haven't gone up to yet.",
    "One grammar, two registers: rooted at the door, unreal everywhere past it.",
  ],

  palette: {
    intro: "Deliberately not one fixed palette — the entrance borrows the city's own colours; the interior sets its own, loud on purpose.",
    entries: [
      { name: "Signal Coral", hex: "#E85A4F", purpose: "The interior's loudest colour — kettles, blocks, attention." },
      { name: "Electric Teal", hex: "#4FB8B0", purpose: "The second interior tone, chosen to clash gently with coral." },
      { name: "Marigold", hex: "#F0B429", purpose: "Warmth and light — the interior's third block colour." },
      { name: "City Sky", hex: "#8FB2C9", purpose: "Whatever blue the entrance skyline actually is — not fixed, borrowed per store." },
      { name: "Terracotta Earth", hex: "#B9754A", purpose: "Ground and landmark stone at the entrance." },
      { name: "Showroom White", hex: "#FAFAF7", purpose: "Negative space — the wall gets loud, the ceiling and floor don't." },
    ],
    note:
      "The entrance palette is never fixed in advance — it's read off the real city each store opens in. The interior palette is fixed and repeats, on purpose: it's the constant that makes every store recognisably Vijay Sales, no matter which city's skyline is on the door.",
  },

  motifs: {
    intro: "Two motifs, kept deliberately far apart in mood.",
    entries: [
      { name: "The skyline", description: "A real landmark or city view, painted rather than photographed — the entrance's local signature." },
      { name: "The oversized object", description: "An everyday appliance, blown up past believable scale, on a flat colour block — the interior's whole trick." },
    ],
  },

  chapters: [
    {
      space: "Entrance",
      title: "The City Says Hello First",
      rationale:
        "Every store's entrance is drawn from the skyline it actually stands under — not a generic Indian cityscape, the real one outside the door. A customer's first read of the store is geographic before it's commercial: this is where you are, before it's what you can buy.",
      curated: "vijay-sales/entrance-curated-v2.jpg",
      alt: "Painted city skyline mural at a Vijay Sales store entrance",
      // Native art is a 4:1 wall band. The default 16:9 frame would centre-crop
      // it to ~44% of its width — checked, and while THIS composition still
      // reads fine that tight, there's no reason to lose over half a real
      // panorama when showing it whole costs nothing.
      aspect: "4/1",
    },
    {
      space: "Ground floor — kitchen & home appliances",
      title: "Everyday, Made Strange",
      rationale:
        "Real artwork from the design library: a fridge, a washing machine, a television and a microwave, each on its own flat colour block, drawn loose and oversized rather than photographed. Nothing here pretends to be a real kitchen — that's deliberate; a hyperreal kitchen would compete with the actual appliances on the shelf beside it.",
      curated: "vijay-sales/kitchen-curated-v3.jpg",
      alt: "Colourful oversized appliance mural — fridge, washing machine, television and microwave on flat colour blocks",
    },
    {
      space: "Ground floor — television & audio",
      title: "A Different Kind of Loud",
      rationale:
        "A second register for a different department: glossier, more rendered, still on flat colour blocks. Screens, speakers and a kettle rendered like product photography that's forgotten what scale is. The point of switching styles department to department is the same as switching colour at the door — nothing in this store should ever start to feel like wallpaper.",
      curated: "vijay-sales/electronics-curated-v2.jpg",
      alt: "Glossy oversized television and audio equipment mural on a colour-block wall",
      // Native art is a 4:1 wall band with content running edge to edge — the
      // TV sits at the far left, a second kettle and microwave at the far
      // right. A centre-crop into 16:9 (checked directly) loses the TV almost
      // entirely and cuts the right-hand appliances off completely, which
      // matters here specifically because the chapter's own rationale names
      // "screens" as the subject.
      aspect: "4/1",
    },
  ],

  process: {
    intro: "One system, applied city by city, floor by floor.",
    steps: [
      {
        title: "Reading the city",
        body: "Before anything else, the entrance is designed against the store's actual skyline or a landmark specific to it — never a stock cityscape.",
      },
      {
        title: "Setting the interior grammar",
        body: "The oversized-object language is fixed once, then applied per department — kitchen, TV & audio, white goods — so every zone is visibly the same store telling a different joke.",
      },
      {
        title: "Composed to the real wall",
        body: "Every band is built to the store's measured wall — width, height, panel breaks and overlap specified before anything is sent to print, the same discipline as every other Zyvorah installation.",
      },
      {
        title: "Printed, dispatched, installed",
        body: "This is not a rendering exercise — these are real orders, with real ZVY numbers, dispatched and installed on schedule.",
      },
    ],
  },

  productionNote: {
    title: "What this page is",
    body:
      "This is real, delivered work for Vijay Sales — not a concept. One store stands in for the rollout, shown without naming which one, because the idea being demonstrated is the system, not an address. Every image on this page is genuine artwork that has been printed and installed, not a rendering.",
    points: [
      "Vijay Sales stores are being fitted out on this system on an ongoing basis, city by city.",
      "Wall dimensions, panel counts and overlaps are specified per store from measured drawings.",
      "Colour is proofed and matched across every print run before install.",
    ],
  },

  ask: {
    heading: "Fitting out a multi-city retail rollout?",
    body:
      "Tell us the cities and the store format. We'll show you how the same system would read on your own walls.",
  },
};
