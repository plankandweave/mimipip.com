/**
 * The material library behind every technical specification sheet.
 *
 * A B2B quotation always leaves with a specification sheet for each material
 * it quotes (Roheena, 6 October 2026: "especially in the B2B business, like
 * the IT companies or LTM … a technical specification sheet"). The sheet is
 * generated from this library, so adding a material here once means every
 * later quotation on it carries its sheet, and a sheet can never be attached
 * for a material that was not quoted.
 *
 * EVERY FIGURE HERE MUST BE TRUE AND SOURCED. The outdoor film rows are the
 * supplier's tested ratings as printed on the KRT sheet of 6 October 2026 and
 * are worded as ratings, not guarantees. The non-woven, linen, self-adhesive
 * and canvas entries say only what the catalogue and the office specification
 * already say (src/lib/office-spec.ts, the materials table). Fire rating,
 * scrub class and VOC certificates are deliberately absent until the
 * certificates exist — a wrong number on a specification is something a
 * client builds on.
 *
 * `{for}` in a template is replaced with the walls the quotation puts the
 * material on ("the KRT boundary wall", "the interior walls at OIC, Parel").
 */

export type SpecStat = { value: string; label: string };
export type SpecPoint = { title: string; body: string };
export type SpecRow = { k: string; v: string; sub?: string };
export type SpecGroup = { heading: string; rows: SpecRow[] };

export type MaterialSpec = {
  /** The key a quotation line names. Stable; never renamed. */
  key: string;
  /** materials.slug when the material is in the catalogue, for its live price. */
  catalogueSlug: string | null;
  name: string;
  /** How a quotation's scope table names it. */
  shortName: string;
  outdoor: boolean;
  /** Whether our own team fits it (and so whether installation is quoted). */
  installable: boolean;
  /** Two sentences for the quotation's Materials block. `{for}` allowed. */
  note: string;
  /** The sheet's opening paragraph. `{for}` allowed. */
  intro: string;
  /** Three headline figures, or none. */
  stats: SpecStat[];
  /** The sage panel: "Why it suits {for}". */
  suits: { heading: string; points: SpecPoint[] };
  /** The technical rows; empty groups are not printed. */
  groups: SpecGroup[];
  /** The "before application" strip, when the material has one. */
  before: { heading: string; steps: string[] } | null;
  disclaimer: string;
};

export const MATERIAL_SPECS: readonly MaterialSpec[] = [
  {
    // The standard outdoor film for plastered walls (KRT Parel and, Roheena
    // says, most projects). IILM's exterior will need a DIFFERENT film and
    // gets its own entry when it is specified; this one is never quoted for it.
    key: "outdoor-wall-film",
    catalogueSlug: null,
    name: "Outdoor wall film",
    shortName: "Outdoor wall film",
    outdoor: true,
    installable: true,
    note:
      "Outdoor wall film for {for}: a white 0.1 mm polymer film with a high-tack adhesive, rated for five years of vertical outdoor exposure and a working range of −40 to 60 °C.",
    intro:
      "The film we will use for {for}. A white polymer film with a high-tack adhesive, made for long-term outdoor use and for surfaces that are difficult to apply to.",
    stats: [
      { value: "5 years", label: "Outdoor durability" },
      { value: "−40 to 60 °C", label: "Working temperature range" },
      { value: "0.1 mm", label: "Film thickness" },
    ],
    suits: {
      heading: "Why it suits {for}",
      points: [
        { title: "Made for outdoor use", body: "Rated for 5 years of vertical outdoor exposure, which is how an outdoor wall stands." },
        { title: "Holds up to salt and moisture", body: "No change after 100 hours in a 35 °C seawater test." },
        { title: "Steady in heat and cold", body: "Performs from −40 °C to 60 °C, with short-term exposure up to 80 °C." },
        { title: "Grips difficult surfaces", body: "A high-tack adhesive, chosen for walls that are difficult to apply to." },
      ],
    },
    groups: [
      {
        heading: "Film and adhesive",
        rows: [
          { k: "Film", v: "White polymer PVC, 0.1 mm" },
          { k: "Adhesive", v: "Solvent-based polyacrylate, high tack, grey, 0.035 mm" },
          { k: "Adhesion strength", v: "28 N/25 mm", sub: "After 24 hours, on stainless steel" },
        ],
      },
      {
        heading: "Weather and durability",
        rows: [
          { k: "Outdoor durability", v: "5 years", sub: "Vertical outdoor exposure, unprinted" },
          { k: "Temperature range", v: "−40 °C to 60 °C", sub: "Short-term exposure up to 80 °C" },
          { k: "Seawater resistance", v: "No change", sub: "After 100 hours at 35 °C, on aluminium" },
          { k: "Chemical resistance", v: "Oils, greases, fuels, weak acids, salts, alkalis, isopropyl alcohol and mild washing solution", sub: "At room temperature" },
        ],
      },
      {
        heading: "Application",
        rows: [{ k: "Application temperature", v: "4 °C and above" }],
      },
    ],
    before: {
      heading: "Before application",
      steps: [
        "A clean wall, free of dust, grease and contamination.",
        "Fresh paint dried for at least three weeks.",
        "Applied at a temperature of 4 °C or above.",
      ],
    },
    disclaimer:
      "Figures are tested ratings under the stated conditions, not a guarantee. Performance on site depends on the condition and preparation of the wall.",
  },
  {
    key: "non-woven",
    catalogueSlug: "smooth-matt",
    name: "Non-woven wallpaper",
    shortName: "Non-woven wallpaper",
    outdoor: false,
    installable: true,
    note:
      "Non-woven wallpaper for {for}: a paste-the-wall paper with a smooth, sheen-free matte finish, sized to each wall.",
    intro:
      "The wallpaper we will use for {for}. A non-woven, paste-the-wall paper with a smooth, sheen-free matte surface, sized to each wall.",
    stats: [],
    suits: {
      heading: "Why it suits {for}",
      points: [
        { title: "A calm, matte surface", body: "Smooth and soft to the touch, with no visible grain and no sheen, so light settles on the wall instead of glaring off it." },
        { title: "Stays flat and true", body: "Non-woven paper holds its size when pasted, so panels meet cleanly at the seams." },
        { title: "Breathes with the wall", body: "A breathable base that lets the wall behind it stay dry." },
        { title: "Strong and easy to hang", body: "Tear-resistant, with paste applied to the wall rather than the paper, which keeps hanging tidy." },
      ],
    },
    groups: [
      {
        heading: "Material and finish",
        rows: [
          { k: "Material", v: "Non-woven wallpaper" },
          { k: "Finish", v: "Soft Matte, smooth and sheen-free" },
          { k: "Printing", v: "Sized to your wall" },
        ],
      },
      {
        heading: "Use and application",
        rows: [
          { k: "Use", v: "Interior walls, for long-term use" },
          { k: "Application", v: "Paste-the-wall, panels hung in order from left to right" },
          { k: "Wall preparation", v: "A clean, dry, smooth wall, free of dust and loose paint" },
        ],
      },
    ],
    before: null,
    disclaimer:
      "Qualities described are those of non-woven wallpaper in general. Results on site depend on the condition and preparation of the wall.",
  },
  {
    key: "linen-textured",
    catalogueSlug: "linen-touch",
    name: "Linen Textured wallpaper",
    shortName: "Linen Textured",
    outdoor: false,
    installable: true,
    note:
      "Linen Textured wallpaper for {for}: a non-woven, paste-the-wall paper with a soft tactile linen finish, felt more than seen, sized to each wall.",
    intro:
      "The wallpaper we will use for {for}. A non-woven, paste-the-wall paper with a soft tactile linen finish, where the texture is felt more than seen, sized to each wall.",
    stats: [],
    suits: {
      heading: "Why it suits {for}",
      points: [
        { title: "A quiet texture", body: "A fine linen surface that softens light and reads as fabric up close, without competing with the artwork." },
        { title: "Stays flat and true", body: "Non-woven paper holds its size when pasted, so panels meet cleanly at the seams." },
        { title: "Breathes with the wall", body: "A breathable base that lets the wall behind it stay dry." },
        { title: "Strong and easy to hang", body: "Tear-resistant, with paste applied to the wall rather than the paper, which keeps hanging tidy." },
      ],
    },
    groups: [
      {
        heading: "Material and finish",
        rows: [
          { k: "Material", v: "Non-woven wallpaper" },
          { k: "Finish", v: "Linen Textured, soft tactile, sheen-free" },
          { k: "Printing", v: "Sized to your wall" },
        ],
      },
      {
        heading: "Use and application",
        rows: [
          { k: "Use", v: "Interior walls, for long-term use" },
          { k: "Application", v: "Paste-the-wall, panels hung in order from left to right" },
          { k: "Wall preparation", v: "A clean, dry, smooth wall, free of dust and loose paint" },
        ],
      },
    ],
    before: null,
    disclaimer:
      "Qualities described are those of non-woven wallpaper in general. Results on site depend on the condition and preparation of the wall.",
  },
  {
    key: "self-adhesive",
    catalogueSlug: "self-adhesive-vinyl",
    name: "Self-adhesive wall film",
    shortName: "Self-adhesive film",
    outdoor: false,
    installable: true,
    note:
      "Self-adhesive wall film for {for}: a smooth matte peel-and-stick film, sized to each wall, for interior walls where paste is not practical.",
    intro:
      "The film we will use for {for}. A smooth matte self-adhesive film, sized to each wall, for interior walls where paste is not practical.",
    stats: [],
    suits: {
      heading: "Why it suits {for}",
      points: [
        { title: "No paste on site", body: "Peel and stick, so a wall is dressed without a paste table or wet trimming." },
        { title: "A smooth matte face", body: "A sheen-free surface that lets the artwork read without glare." },
        { title: "Sized to your wall", body: "Sized to your wall, in panels labelled in hanging order." },
        { title: "Removable", body: "Intended to come away when its time is done; results depend on the wall's preparation and paint." },
      ],
    },
    groups: [
      {
        heading: "Material and finish",
        rows: [
          { k: "Material", v: "Self-adhesive vinyl film" },
          { k: "Finish", v: "Smooth matte" },
          { k: "Printing", v: "Sized to your wall" },
        ],
      },
      {
        heading: "Use and application",
        rows: [
          { k: "Use", v: "Interior walls" },
          { k: "Application", v: "Peel and stick, panels applied in order from left to right" },
          { k: "Wall preparation", v: "A clean, dry, smooth wall, free of dust and loose paint; fresh paint fully cured" },
        ],
      },
    ],
    before: null,
    disclaimer:
      "Removal results depend on the condition of the wall and its paint. Results on site depend on the condition and preparation of the wall.",
  },
  {
    key: "canvas",
    catalogueSlug: "eco-cotton-canvas",
    name: "Canvas",
    shortName: "Canvas",
    outdoor: false,
    installable: false,
    note:
      "Canvas for {for}: museum-grade fine-art canvas, sized to fit and supplied unframed, rolled in a protective tube, ready to frame or stretch.",
    intro:
      "The canvas we will use for {for}. Museum-grade fine-art canvas, sized to fit and supplied unframed, rolled in a protective tube, ready to frame or stretch to your preference.",
    stats: [],
    suits: {
      heading: "Why it suits {for}",
      points: [
        { title: "A fine-art surface", body: "A woven canvas face that gives the artwork depth and a hand-made feel." },
        { title: "Framed or stretched", body: "Supplied unframed, so it can be framed, stretched or mounted to suit the space." },
        { title: "Sized to fit", body: "Made to the measurement given, so the piece fits the wall it was drawn for." },
        { title: "Travels safely", body: "Rolled in a protective tube rather than shipped flat." },
      ],
    },
    groups: [
      {
        heading: "Material and finish",
        rows: [
          { k: "Material", v: "Museum-grade fine-art canvas" },
          { k: "Supplied as", v: "Unframed, rolled in a protective tube" },
          { k: "Printing", v: "Sized to your wall" },
        ],
      },
      {
        heading: "Use",
        rows: [
          { k: "Use", v: "Interior walls, framed or stretched locally" },
          { k: "Not included", v: "Frames, stretching and installation, unless listed on the quotation" },
        ],
      },
    ],
    before: null,
    disclaimer: "Frames and installation are not included unless explicitly listed on the quotation.",
  },
];

export function materialSpec(key: string): MaterialSpec | null {
  return MATERIAL_SPECS.find((m) => m.key === key) ?? null;
}

export function requireMaterialSpec(key: string): MaterialSpec {
  const m = materialSpec(key);
  if (!m) throw new Error(`quotation: unknown material "${key}"`);
  return m;
}

/** "{for}" → the walls, with a lower-case first letter so it sits mid-sentence. */
export function fill(template: string, forWhat: string): string {
  return template.replace(/\{for\}/g, forWhat);
}
