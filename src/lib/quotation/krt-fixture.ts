import { GST_RATE, type Quotation } from "./model";

/**
 * ZYV/Q/2026-27/KRT-01 Rev. 1 — the Knowledge Realty Trust quotation of
 * 6 October 2026, as data. The first quotation in the series and the fixture
 * every renderer test draws: if a change makes its two documents' totals move
 * off ₹12,08,294 (supply) and ₹2,14,866 (installation), ₹14,23,160 in all,
 * the change is wrong.
 */
export const KRT_QUOTATION: Quotation = {
  number: "ZYV/Q/2026-27/KRT-01",
  revision: 1,
  dateKey: "2026-10-06",
  validUntil: "2026-11-05",
  title: "Mural wallpaper design for the common areas",
  preparedFor: {
    organisation: "Knowledge Realty Trust",
    site: "OIC, Parel, Mumbai",
    attention: "Ms Priyanka Singh",
  },
  measurementSource: "Zyvorah",
  lines: [
    { seq: 1, location: "Boundary wall, forecourt", basis: "Inclined wall 72′6″ and six straight bays, all 10′ high", material: "outdoor-wall-film", sqft: 1448 },
    { seq: 2, location: "Driveway wall, right side", basis: "Five bays at 7′8″ high", material: "outdoor-wall-film", sqft: 246 },
    { seq: 3, location: "Driveway wall, left side (ramp)", basis: "Three 36′ bays following the ramp slope", material: "outdoor-wall-film", sqft: 698 },
    { seq: 4, location: "Main lobby, ATM side wall", basis: "Main wall 31′ × 10′10″ with column returns", material: "non-woven", sqft: 500 },
    { seq: 5, location: "Main lobby, wall opposite ATM", basis: "320 sq ft less door 3′ × 7′ (21 sq ft)", material: "non-woven", sqft: 299 },
    { seq: 6, location: "Escalator side panels", basis: "13′1″ × 5′6″ and 10′2″ × 5′6″", material: "non-woven", sqft: 128 },
    { seq: 7, location: "Escalator front fascia", basis: "31′4″ × 5′6″", material: "non-woven", sqft: 175 },
  ],
  rates: [
    { material: "outdoor-wall-film", supplyExGst: 350, installExGst: 60 },
    { material: "non-woven", supplyExGst: 169.49, installExGst: 35 },
  ],
  materialNotes: [
    { material: "outdoor-wall-film", text: "Outdoor wall film for the boundary wall and both driveway walls: a white 0.1 mm polymer film with a high-tack adhesive, rated for five years of vertical outdoor exposure and a working range of −40 to 60 °C." },
    { material: "non-woven", text: "Non-woven wallpaper for all interior walls in the lobby and at the escalators: a paste-the-wall paper with a smooth, sheen-free matte finish, printed to the exact size of each wall." },
  ],
  sitePrep: [
    "Wall levelling, repairs and surface preparation, as each wall requires, before our team arrives.",
    "Outdoor walls (boundary and driveway): washed and cleaned one day before application, and dry and free of dust, grease and loose material on the day. Any freshly painted surface needs at least three weeks to cure.",
    "Interior walls (lobby and escalators): cleaned and primed with an oil-based primer, including the travertine panels at the escalators.",
  ],
  terms: [],
  gstRate: GST_RATE,
};

/** The walls each material goes on, as the specification sheet says it. */
export const KRT_SPEC_SHEETS = [
  { material: "outdoor-wall-film", kicker: "KRT boundary wall", forWhat: "the KRT boundary wall" },
  { material: "non-woven", kicker: "KRT interior walls", forWhat: "the KRT interior walls" },
];
