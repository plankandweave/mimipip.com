import { ensurePrintMaster } from "./print-master";

/**
 * A4 sample sheets — the sample desk's half of the print engine's /sample/sheet.
 *
 * A sample is the only place a client inspects our print from 30 cm instead of
 * 2 m, and it is usually the thing that decides an order. The engine renders and
 * releases; this module decides WHAT to render: which designs, on which medium,
 * at what scale, and in a pair rather than singly.
 *
 * Two cards go per design, because a client asks two different questions and
 * neither card can answer the other's:
 *   crop — a 1:1 window of the mural, so the texture in the hand is the texture
 *          on the wall. This is the card that proves the resolution.
 *   fit  — the whole design shrunk onto the card, so they can see what they are
 *          actually buying.
 */

/** The media the engine can name on a card. Anything outside this list prints
 *  no material line at all (it reports `material_unresolved` instead of
 *  guessing at a vendor's word for it), so the desk never offers one. */
export const SAMPLE_MEDIA_SLUGS = [
  "self-adhesive-vinyl",
  "smooth-matt",
  "linen-touch",
  "eco-cotton-canvas",
  "border",
] as const;

export type SampleMediaSlug = (typeof SAMPLE_MEDIA_SLUGS)[number];

/**
 * The wall a sample is scaled against when nobody names one.
 *
 * The 1:1 card has to be 1:1 against SOMETHING, and a design has no single
 * finished size — the same artwork sells at 8 ft and at 14 ft, at different
 * resolutions. Sampling every design against one reference wall means two cards
 * from two designs are directly comparable, and it means clicking a design is
 * genuinely one click. Editable per release for a client whose wall is known.
 */
export const SAMPLE_WALL_FT = { w: 10, h: 9 };
export const FT_TO_CM = 30.48;

/** A card's own size, for the sheet-length arithmetic the desk shows. */
export const SAMPLE_CARD_H_CM = 29.7;

export type SampleMedia = {
  slug: string;
  name: string;
  rollWidthMm: number | null;
  printableCm: number | null;
};

/**
 * Printable width for a medium, in cm.
 *
 * `materials.roll_width_mm` is the PHYSICAL ROLL width, not the printable one.
 * That is worth stating because this file used to claim the opposite: the MGI
 * OS records the same media as `printWidthMm`, consistently 20 mm less (Soft
 * Matte 1360 roll / 1340 printable), so reading this column as "printable"
 * overstates every medium by 20 mm.
 *
 * It survives that error today only because the panel cap clamps to
 * MAX_PANEL_CM (130) before the width binds — true of every medium at 1320 mm
 * and up. It was NOT true of linen at its old 1200 mm, which planned 120 cm
 * strips against a 118 cm printable until migration 0136 moved it to 1360.
 * Anything added here for a narrower medium must subtract the rail explicitly
 * rather than inherit that accident.
 *
 * Returns null when the medium has no width on record, because a guessed width
 * silently costs a whole column of samples; the desk asks for the number.
 */
export function printableCmFor(rollWidthMm: number | null | undefined): number | null {
  return rollWidthMm && rollWidthMm > 0 ? rollWidthMm / 10 : null;
}

export type SamplePick = { handle: string; title: string; cropX?: number; cropY?: number };

type EngineSpec = {
  key: string;
  master_url: string;
  master_ref?: string;
  kind: "sample";
  card_style: "crop" | "fit";
  design_title: string;
  design_handle: string;
  material_label: string;
  mural_width_cm: number;
  mural_height_cm: number;
  crop_x: number;
  crop_y: number;
  sample_ref?: string;
};

/**
 * Resolve one design to the pair of cards the engine should render.
 *
 * Master resolution follows the same rule as every other print path: the master
 * if there is one, the web flat if there is not. It deliberately does NOT fail
 * when only the flat exists — the engine reports each card's true resolution
 * against the mural, so a soft design comes back flagged rather than refused,
 * and the desk shows the warning before anything is couriered.
 */
export async function sampleSpecsFor(
  pick: SamplePick,
  opts: {
    mediaLabel: string;
    muralWidthCm: number;
    muralHeightCm: number;
    sampleRef?: string;
    flatUrl?: string | null;
  },
): Promise<EngineSpec[]> {
  const master = await ensurePrintMaster(pick.handle);
  const source: Pick<EngineSpec, "master_url" | "master_ref"> = master?.engine
    // An engine-held master: name it, don't link it. The engine's own master
    // route is auth-gated, so a URL it would have to fetch from itself answers
    // 401 for a file already on its volume.
    ? { master_url: "", master_ref: master.url.split("/").pop() ?? pick.handle }
    : { master_url: master?.url ?? opts.flatUrl ?? "" };

  const base = {
    ...source,
    kind: "sample" as const,
    design_title: pick.title,
    design_handle: pick.handle,
    material_label: opts.mediaLabel,
    mural_width_cm: opts.muralWidthCm,
    mural_height_cm: opts.muralHeightCm,
    crop_x: pick.cropX ?? 0.5,
    crop_y: pick.cropY ?? 0.5,
    sample_ref: opts.sampleRef,
  };

  return [
    { ...base, key: `${pick.handle}-crop`, card_style: "crop" },
    { ...base, key: `${pick.handle}-fit`, card_style: "fit" },
  ];
}

export type SampleSheetResult = {
  ref: string;
  released: boolean;
  order_no: string | null;
  filename: string | null;
  preview: string | null;
  media_slug: string | null;
  media_width_cm: number;
  width_warning: string | null;
  cards: {
    key: string; card_style?: string; design_title?: string; design_handle?: string;
    placed?: boolean; error?: string; effective_dpi?: number; below_min_dpi?: boolean;
    material_unresolved?: string | null;
  }[];
  cards_placed: number;
  columns: number;
  rows: number;
  sheet_len_cm: number;
  paper_m: number;
  quality_warning: string | null;
};

export function engineConfigured(): boolean {
  return Boolean(process.env.MIMAKI_BACKEND_URL && process.env.MIMAKI_SERVICE_KEY);
}

/**
 * Compose (or release) one sheet on the engine.
 *
 * Unlike the rest of the fulfilment calls this one THROWS on failure. Those
 * fail soft because a courier hiccup must never break a paid order; this is a
 * desk standing in front of the printer waiting to be told what happened, and
 * a silent false would leave them pressing the button again.
 */
export async function composeSampleSheet(params: {
  ref: string;
  samples: EngineSpec[];
  printableCm: number | null;
  mediaSlug: string;
  mediaName: string;
  fillWidth: boolean;
  copies?: number;
  rows: number;
  release: boolean;
}): Promise<SampleSheetResult> {
  if (!engineConfigured()) throw new Error("the print engine is not configured for this deployment");

  const res = await fetch(`${process.env.MIMAKI_BACKEND_URL!.replace(/\/$/, "")}/sample/sheet`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Service-Key": process.env.MIMAKI_SERVICE_KEY!,
    },
    body: JSON.stringify({
      ref: params.ref,
      media_width_cm: params.printableCm,
      media_slug: params.mediaSlug,
      media_name: params.mediaName,
      samples: params.samples,
      fill_width: params.fillWidth,
      copies: params.copies ?? 1,
      rows: params.rows,
      release: params.release,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    // The engine's 400s are written to be read by a person ("media 27 cm is too
    // narrow for an A4 card plus edge rails"), so pass the words through rather
    // than replacing them with a status code.
    let detail = text;
    try { detail = JSON.parse(text).detail ?? text; } catch { /* not JSON */ }
    throw new Error(String(detail));
  }
  return JSON.parse(text) as SampleSheetResult;
}

/** The engine serves its previews off its own host, so a bare /output/… path
 *  would resolve against the website and 404. */
export function engineFileUrl(name: string | null): string | null {
  if (!name) return null;
  return `${process.env.MIMAKI_BACKEND_URL!.replace(/\/$/, "")}/output/${name}`;
}
