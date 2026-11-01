import type { Project } from "./types";
import { livingJourney } from "./living-journey";

const chapter = (space: string) => livingJourney.chapters.find((item) => item.space === space)!;

/** The mother-and-baby collection from the Hospitals conversation. */
export const firstLight: Project = {
  slug: "first-light-healthcare",
  kind: "concept",
  theme: "calm",
  segments: ["healthcare"],
  client: "Zyvorah for Healthcare",
  title: "The First Light",
  standfirst: "A connected visual journey for mothers, babies and the people caring for them.",
  facts: [
    { label: "Collection", value: "Mother & baby" },
    { label: "Applications", value: "15 hospital spaces" },
    { label: "Visual language", value: "Seed · stem · shelter · horizon" },
    { label: "Buying mode", value: "Individual wall or full story" },
  ],
  cover: "living-journey/mother-child-curated.jpg",
  brief: {
    intro: "Create a maternity environment that feels gentle and considered without falling into predictable baby imagery or gendered colour.",
    requirements: [
      "Carry one story from consultation through delivery, recovery and discharge.",
      "Give each room a distinct emotional job while keeping the floor coherent.",
      "Work for mothers, families and staff rather than only for a photographic reveal.",
      "Make every wall available as a measured, made-to-order mural.",
    ],
  },
  interpretation: [
    "The First Light follows a single line as it changes from horizon to seed, stem, protective arc, constellation and finally an open doorway.",
    "It is a story about beginnings without literal babies, prams or nursery clichés. The visual system can therefore move from fertility and ultrasound spaces to labour, nursery, recovery and homeward departure without breaking tone.",
    "The same language is also quiet enough to cross over into a home nursery or a family clinic — making the hospital collection useful beyond one large commission.",
  ],
  palette: {
    intro: "Soft enough for long viewing, with small points of warmth so the environment never feels anonymous.",
    entries: [
      { name: "Chalk", hex: "#F0EDE6", purpose: "Light and breathing space." },
      { name: "Warm oat", hex: "#D9C7AC", purpose: "Grounding without heaviness." },
      { name: "Soft sage", hex: "#9BAE93", purpose: "Organic growth and balance." },
      { name: "Mineral blue", hex: "#6B87A3", purpose: "Steadiness and depth." },
      { name: "Muted clay", hex: "#C98679", purpose: "Human warmth in small doses." },
      { name: "Honey gold", hex: "#E0A93F", purpose: "Tiny moments of arrival." },
    ],
  },
  motifs: {
    intro: "Shop the visual language by the room it needs to serve.",
    entries: [
      { name: "Growing Together", description: "Seed, stem and leaf for maternity and obstetrics waiting areas.", href: "https://zyvorah.com/hospitals/patient-rooms" },
      { name: "The Quiet Horizon", description: "Low-contrast botanical and celestial forms for nursery and recovery spaces.", href: "https://zyvorah.com/hospitals/patient-rooms" },
      { name: "Towards You", description: "A continuous route for corridors, labour and the journey home.", href: "https://zyvorah.com/hospitals/corridors" },
      { name: "Possibility", description: "Abstract points of light and emerging forms for fertility and IVF environments.", href: "https://zyvorah.com/hospitals/diagnostics" },
    ],
  },
  chapters: [chapter("Mother and child floor"), chapter("Nursery"), chapter("Family waiting"), chapter("Main reception")],
  process: {
    intro: "One maternity story, adjusted to the way each room is actually occupied.",
    steps: [
      { title: "Map the care journey", body: "The visual language is planned from first appointment to discharge, so the floor reads as one connected experience." },
      { title: "Set the viewing rhythm", body: "Long corridors receive movement; rooms and recovery spaces receive larger, quieter forms." },
      { title: "Measure and compose", body: "Each mural is rebuilt to the elevation, bed position, doors, services and selected material before print." },
    ],
  },
  productionNote: {
    title: "A concept collection, ready for a real brief",
    body: "These are concept visuals for an invented healthcare programme. A live project is rebuilt against the hospital's drawings and procurement requirements.",
    points: ["Final wall measurements", "Bed, cot, chair and equipment positions", "Cleaning and infection-control requirements", "Panel divisions and service interruptions", "Approved physical colour proofs"],
  },
  shop: {
    heading: "Shop the First Light edit",
    body: "Choose a room-led healthcare edit, enter the wall size, preview the crop, select the material and add the measured mural to cart.",
    href: "https://zyvorah.com/hospitals/patient-rooms",
    label: "Shop mother & baby walls",
  },
  ask: { heading: "Start with one maternity wall.", body: "Send a photograph or elevation of a waiting room, nursery or recovery wall. We can turn this visual language into a measured project for your building." },
};
