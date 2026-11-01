import type { Project } from "./types";
import { livingJourney } from "./living-journey";

const chapter = (space: string) => livingJourney.chapters.find((item) => item.space === space)!;

/** The paediatric collection from the Hospitals conversation. */
export const smallExplorersAtlas: Project = {
  slug: "small-explorers-atlas",
  kind: "concept",
  theme: "bright",
  segments: ["healthcare"],
  client: "Zyvorah for Healthcare",
  title: "The Small Explorers' Atlas",
  standfirst: "A paediatric hospital becomes a world children can follow, remember and gradually make their own.",
  facts: [
    { label: "Collection", value: "Paediatric care" },
    { label: "Applications", value: "17 hospital spaces" },
    { label: "Visual language", value: "Trail · characters · discovery" },
    { label: "Buying mode", value: "Individual wall or full story" },
  ],
  cover: "living-journey/paediatric-opd-curated.jpg",
  brief: {
    intro: "Make a children's hospital warm and navigable without turning it into an overstimulating themed play area.",
    requirements: [
      "Give children something to discover while they wait.",
      "Let recurring characters carry the story from reception to ward.",
      "Include older children and teenagers without making every space childish.",
      "Keep artwork original, durable and available as measured wallcovering.",
    ],
  },
  interpretation: [
    "The Small Explorers' Atlas uses a golden trail that changes from landscape route to forest, orbit, river and open-ended next chapter.",
    "A small cast of original companions gives children a way to recognise the hospital and talk about where they are going. Details reward repeated looking, while the composition stays composed enough for parents and staff to live with.",
    "The visual system deliberately quietens in PICU and family spaces, and becomes more graphic in adolescent areas. A paediatric hospital should not stop working at age ten.",
  ],
  palette: {
    intro: "A restrained illustrated palette: lively enough to invite discovery, controlled enough for a clinical building.",
    entries: [
      { name: "Cloud blue", hex: "#91B4C8", purpose: "Open sky and calm distance." },
      { name: "Leaf green", hex: "#8FAE86", purpose: "The world outside the hospital." },
      { name: "Warm cream", hex: "#F1E9D8", purpose: "Light and visual rest." },
      { name: "Muted coral", hex: "#D99184", purpose: "Character and warmth." },
      { name: "Aubergine", hex: "#66546E", purpose: "Depth for older children." },
      { name: "Restrained marigold", hex: "#E0A93F", purpose: "The trail and its small discoveries." },
    ],
  },
  motifs: {
    intro: "Browse by the moment in the child's journey.",
    entries: [
      { name: "The Meeting Place", description: "A welcoming entry chapter for reception and family arrival.", href: "https://zyvorah.com/hospitals/reception-waiting" },
      { name: "The Forest of Small Discoveries", description: "A longer waiting-room composition with details to find.", href: "https://zyvorah.com/hospitals/paediatrics" },
      { name: "The Orbit Room", description: "Controlled circles and routes for diagnostics and imaging.", href: "https://zyvorah.com/hospitals/diagnostics" },
      { name: "Between Worlds", description: "A more editorial, less childish register for adolescents.", href: "https://zyvorah.com/hospitals/corridors" },
    ],
  },
  chapters: [chapter("Paediatric OPD"), chapter("Children's ward"), chapter("Diagnostics and MRI"), chapter("Rehabilitation"), chapter("Family waiting")],
  process: {
    intro: "The same characters, adjusted for sightline, age and clinical intensity.",
    steps: [
      { title: "Lock the character system", body: "Proportions, gestures and visual roles are fixed before the hospital chapters are drawn." },
      { title: "Design for discovery", body: "The wall is composed at child height, with small routes and details that do not turn every department into a game." },
      { title: "Make the lower band replaceable", body: "The most handled part of a ward wall can be separately panelled and replaced without redoing the full elevation." },
    ],
  },
  productionNote: {
    title: "Original artwork, not licensed décor",
    body: "The characters and environments are an original Zyvorah visual system. The final artwork still has to be redrawn to the actual wall and the hospital's material requirements.",
    points: ["Original character proportions and master files", "Sightlines from beds, cots and waiting seats", "Lower-band protection and replaceable drops", "Cleaning and infection-control requirements", "Approved physical colour proofs"],
  },
  shop: {
    heading: "Shop the Small Explorers' Atlas edit",
    body: "Start with a paediatric room, compare the designs shot for it, enter the measured wall size and add the chosen mural to cart.",
    href: "https://zyvorah.com/hospitals/paediatrics",
    label: "Shop paediatric walls",
  },
  ask: { heading: "Start with one children's wall.", body: "Send a photograph of a waiting area, ward or diagnostics room and tell us the age group. We'll recommend the right chapter and scale." },
};
