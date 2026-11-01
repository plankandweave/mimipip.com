import { WRAP_MTM_RATE, WRAP_MTM_LEAD_DAYS, TRIM_ALLOWANCE_MM } from "@/lib/wraps";
import { WRAP_COLLECTIONS } from "@/lib/wrap-collections";
import { STANDARD_SHIPPING } from "@/lib/shipping";

/**
 * Editorial copy for the fridge-wrap surfaces, in one place so the landing
 * page, the size guide and the FAQ structured data cannot drift from each
 * other — the FAQ answers are also emitted as FAQPage JSON-LD, and a rich
 * result that disagrees with the page it links to is worse than no rich result.
 */

export type FridgeCollectionLink = {
  handle: string;
  /** The row's DISPLAY name. Not the tag — "Dolce Gabbana Inspired" is shown,
   *  "Dolce Gabbana" is what the designs are tagged. Matching a design by this
   *  finds nothing for the two rows whose label and tag differ. */
  title: string;
  /** The design's product tag — 0092 sets rule_tag to this. Use this, never
   *  `title`, to select the row's designs or to scope its listing link. */
  key: string;
};

/**
 * The aesthetic rows, in the order the studio upload form uses. Derived from
 * `WRAP_COLLECTIONS` rather than restated, so a row cannot exist as an upload
 * option and be missing from the page that sells it.
 *
 * The rows themselves are a FAMILY fact, not a fridge one — a Florals batch is
 * a Florals batch whether it lands on a fridge or an air conditioner. What is
 * fridge-specific is the handle each row links to, and those still read
 * `fridge-*` because they are live URLs (see wrap-collections.ts). So this list
 * is safe to reuse verbatim on the fridge page and would need re-pointing, not
 * re-listing, on another appliance's page.
 *
 * The list is deliberately independent of what the catalogue contains: a row is
 * an editorial fact before any design activates, and the page has to render
 * honestly on an empty catalogue — `getPopulatedWrapRows` (which counts designs
 * on THIS appliance) decides which rows can be LINKED, not which exist. It has
 * to be counted per appliance rather than read off `parent_handle`: 0096 moved
 * every wrap listing under the `wraps` hub, so asking for the children of
 * `fridge-wraps` returns nothing at all.
 */
export const FRIDGE_COLLECTION_LINKS: FridgeCollectionLink[] = WRAP_COLLECTIONS.map((c) => ({
  handle: c.handle,
  title: c.label,
  key: c.key,
}));

export type Faq = { q: string; a: string };

/**
 * The published FAQ.
 *
 * Question three is the one this site can be caught on and is therefore
 * answered before it is asked: wallpaper sells at ₹200/sq ft here, and a
 * ₹1,000 single-door set is plainly less per square foot than that. The answer
 * is true and it is short. What it must never do is state the fridge figure —
 * a per-sq-ft number on a standard format turns a set price into an arithmetic
 * problem the customer will then do on every other format.
 */
export const FRIDGE_FAQ: Faq[] = [
  {
    q: "Will it fit my refrigerator?",
    a: "That is the only hard question, so it is the first thing we answer. Tell the fit finder your brand and model number and it returns the format, the panels and the price. For a handful of models we have read the door dimensions off the manufacturer's own specification sheet and we say so; for the rest the format is assigned by capacity and door type, and we ask you to confirm with two measurements rather than pretend otherwise.",
  },
  {
    q: "What if my model isn't listed?",
    a: "Measure the door face — width and height, edge to edge — and enter the two numbers. Almost every refrigerator sold in India falls into one of the five standard formats. If yours doesn't, that isn't a dead end: Format Z is made to your own measurements.",
  },
  {
    q: "Why does a fridge wrap cost less per square foot than your wallpaper?",
    a: `The five standard formats share fixed shapes and cost less to prepare. Custom fit is laid out for one fridge and is priced at ₹${WRAP_MTM_RATE} per square foot on your own measurements.`,
  },
  {
    q: "Why are the panels bigger than my door?",
    a: `Every panel ships ${TRIM_ALLOWANCE_MM} mm oversize on each edge and you trim it against the door itself. That is deliberate. Cutting to a measurement means your measurement has to be right; trimming to an edge means the door is the ruler. It is a far more forgiving job, and it is the reason five formats can cover a fleet of hundreds of models.`,
  },
  {
    q: "What is the material?",
    a: "Matte self-adhesive vinyl — a removable peel-and-stick film with no gloss. It is designed to peel away dry when you want the door back. We would not put it on a door whose finish is already lifting or flaking.",
  },
  {
    q: "Does it cover the handles and the sides?",
    a: "No. The panels cover the door faces, which is the surface you see. Handles, hinges and the cabinet sides are left alone, and you cut around any fixture on the face as you trim.",
  },
  {
    q: "Can I see the film before I commit?",
    // Samples are cut from the same film as the panels, so they open with the
    // range (lib/wrap-sales-gate.ts) — the answer must not invite an order the
    // site cannot take yet.
    a: "Yes, once the range opens. A design sample of the design you are considering — an actual print at full quality on the film itself, ₹200, delivered — is cut from the same film as the panels, so samples open on the same day they do. Colour on a screen is a guess; colour in your own kitchen light is a decision.",
  },
  {
    q: "How long does it take?",
    a: `A standard format is dispatched within ${STANDARD_SHIPPING.productionWorkingDays} working days, free across India. Custom fit takes ${WRAP_MTM_LEAD_DAYS} working days before dispatch because it is laid out for your fridge alone.`,
  },
];
