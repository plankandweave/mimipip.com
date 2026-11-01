/**
 * Line-drawn appliance chassis, one per format, for previewing a wrap without
 * asking the customer for a photograph.
 *
 * Why this exists rather than only the photo visualiser: the photo route
 * ("See it on my fridge") answers "will this look right in MY kitchen", which
 * is a second question. The first is simply "what does this design look like
 * on a fridge at all" — and making someone photograph their kitchen before
 * they can see that is a wall between them and the product.
 *
 * GEOMETRY COMES FROM THE DATABASE. Every millimetre is read from the format's
 * own panel_spec, and the arrangement from its mockup_spec. An earlier version
 * of this file held a hand-written table of chassis that restated all of 0087's
 * panel sizes in TypeScript. With one appliance that was merely redundant; with
 * six it is a guarantee that a repriced or resized format will draw as its old
 * self until somebody notices. So the sizes live in one place, and this file
 * knows only how to arrange and dress them.
 *
 * Drawing order matters and is deliberate:
 *   carcass → design (clipped into each panel) → gaps, features, outlines
 *
 * Everything after the artwork lands ON TOP of it because that is physically
 * what happens: the wrap stops at each panel's edge and does not bridge the gap
 * between doors, does not cover an AC's air outlet, is cut around a washer's
 * porthole, and leaves a dishwasher's control strip and kick plate bare. Drawing
 * artwork across any of those would be a picture of a product we do not sell.
 *
 * Still no handles. Most appliances here have a recessed pull, and a drawn bar
 * implies a die-line cutout the panel does not have.
 */

import type { MockupFeature, MockupSpec, WrapFormat, WrapPanel } from "./wraps";
import { APPLIANCES } from "./appliances";
import type { ApplianceKey } from "./appliances";

export type MockupPanel = { x: number; y: number; w: number; h: number; rx: number };

/** A porthole resolved to mm, ready to draw. */
export type MockupPorthole = { cx: number; cy: number; r: number };

/** An unwrapped band along one edge of the face, resolved to mm. */
export type MockupStrip = {
  kind: "louvreStrip" | "controlStrip" | "lidStrip" | "kickPlate";
  x: number;
  y: number;
  w: number;
  h: number;
};

/**
 * One wrapped face of an appliance seen at an angle.
 *
 * `matrix` maps the artwork's own flat coordinate space onto this face, so the
 * SAME image drawn once per face lines up across the corner between them: the
 * front face shows the middle slice of the cut list and the side face the right
 * slice, and because they are adjacent slices of one composition the pattern
 * carries round the corner exactly as the printed panels do.
 *
 * An affine matrix is enough — and is exact, not an approximation — because the
 * projection is oblique rather than perspective: verticals stay vertical and
 * parallel edges stay parallel, which is what an affine transform is. True
 * perspective would need the mesh warp that lib/wrap-render.ts does for
 * photographs, and would buy nothing here: this is a drawing, not a photo.
 */
export type MockupFace = {
  /** The face outline in canvas mm, clockwise from its top-left. */
  points: [number, number][];
  /** The same outline as an SVG path, with the silhouette's corners rounded. */
  path: string;
  /** Maps artwork space -> this face. SVG matrix(a b c d e f). */
  matrix: [number, number, number, number, number, number];
  /** The artwork's box in its own space, before the matrix. */
  art: { w: number; h: number };
};

/**
 * A top-load washer drawn at three-quarter view.
 *
 * WHY THIS EXISTS. The three-side wrap was drawn as a flat elevation: front and
 * both flanks laid out side by side, which is precisely the cut list and
 * precisely not the product. It answered "how is this panel cut" when the only
 * question a customer has is "what will this look like on my machine" — and a
 * 1.7m-wide strip of three rectangles does not look like a washing machine at
 * all. A wrap whose whole selling point is that it turns the corner has to be
 * shown turning the corner.
 *
 * Front and right side only. Both flanks cannot be seen at once from any real
 * viewpoint, and inventing a view where they can would be the same mistake in a
 * different costume; the cut list in the caption is what says there are three.
 */
export type AngularBody = {
  front: MockupFace;
  side: MockupFace;
  /** The unwrapped lid and console: top surface, and its front and side bands. */
  lidTop: string;
  lidFront: string;
  lidSide: string;
};

export type WrapChassis = {
  /** Format code this chassis draws. */
  code: string;
  appliance: ApplianceKey;
  /** Human label, for the picker. */
  label: string;
  /** The fit band, for alt text: "6–8 kg", "1.5 ton". */
  capacityLabel: string | null;
  /** viewBox in mm: [w, h] with the origin at 0,0. */
  size: [number, number];
  /** The carcass behind the wrapped faces. */
  cabinet: MockupPanel;
  /** Faces the artwork is clipped into, in drawing order. */
  panels: MockupPanel[];
  /** Bands left unwrapped, drawn over the artwork. */
  strips: MockupStrip[];
  /** The door cut-out on a front-loader or dryer, if any. */
  porthole: MockupPorthole | null;
  /**
   * Vertical room left below the cabinet for the contact shadow.
   *
   * NOT a drawn plinth standing under the appliance. An earlier version put a
   * dark rounded bar below the cabinet with a gap above it, which read as a
   * black line floating under the appliance rather than as a base. A fridge
   * meets the floor, and a soft contact shadow is the whole of what says so.
   *
   * Zero on a wall-hung appliance: a split AC does not meet the floor, and a
   * contact shadow under one would be a shadow cast on nothing.
   */
  baseShadow: number;
  /** A fridge stands; a split AC hangs. Decides the shadow and the framing. */
  anchor: "floor" | "wall";
  /**
   * Set instead of `panels` when the format is drawn at three-quarter view.
   * When present the renderer draws this and ignores panels/strips.
   */
  angular: AngularBody | null;
};

/** Panels share one continuous artwork, so the union box is what gets filled. */
export function panelUnion(panels: MockupPanel[]): MockupPanel {
  const x = Math.min(...panels.map((p) => p.x));
  const y = Math.min(...panels.map((p) => p.y));
  const r = Math.max(...panels.map((p) => p.x + p.w));
  const b = Math.max(...panels.map((p) => p.y + p.h));
  return { x, y, w: r - x, h: b - y, rx: 0 };
}

/** What a format without a mockup_spec falls back to: a plain stacked panel. */
const DEFAULT_SPEC: MockupSpec = {
  layout: "stack",
  gapMm: 14,
  revealMm: 12,
  anchor: "floor",
  features: [],
};

/**
 * The three-quarter view's projection.
 *
 * A cabinet oblique: the front face keeps its true proportions and the side
 * recedes at an angle. VIEW_ANGLE is how far round the corner you stand;
 * DEPTH_SCALE foreshortens the receding face, because drawing the depth at full
 * length is the giveaway of an unconvincing axonometric — the eye reads a 560mm
 * flank drawn 560mm long as much deeper than the machine really is.
 */
/**
 * An outline with selected corners rounded, as an SVG path.
 *
 * `radii` is per vertex, and a zero leaves that corner sharp — which is the
 * point. Only the SILHOUETTE gets rounded: the corner where the front face meets
 * the receding flank has to stay crisp, because that edge is the fold the wrap
 * turns, and rounding it would open a gap between two faces that are physically
 * continuous. Rounding everything is what makes an axonometric look like a
 * cartoon; rounding only the outline is what makes it look like an object.
 */
function roundedPath(points: [number, number][], radii: number[]): string {
  const n = points.length;
  const at = (i: number) => points[(i + n) % n];
  const lerp = (
    a: [number, number],
    b: [number, number],
    d: number,
  ): [number, number] => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const t = Math.min(d / len, 0.5);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };
  let d = "";
  for (let i = 0; i < n; i++) {
    const cur = at(i);
    const r = radii[i] ?? 0;
    if (r <= 0) {
      d += `${i === 0 ? "M" : "L"} ${cur[0]} ${cur[1]} `;
      continue;
    }
    const entry = lerp(cur, at(i - 1), r);
    const exit = lerp(cur, at(i + 1), r);
    d += `${i === 0 ? `M ${entry[0]} ${entry[1]} ` : `L ${entry[0]} ${entry[1]} `}`;
    d += `Q ${cur[0]} ${cur[1]} ${exit[0]} ${exit[1]} `;
  }
  return d + "Z";
}

const VIEW_ANGLE = (26 * Math.PI) / 180;
const DEPTH_SCALE = 0.6;

const PANEL_RADIUS = 10;
const CABINET_RADIUS = 26;
const FLOOR_SHADOW = 34;

function isStrip(f: MockupFeature): f is Extract<MockupFeature, { edge: "top" | "bottom" }> {
  return f.kind !== "porthole";
}

/**
 * The three-quarter body for a three-side wrap.
 *
 * `doors` is the cut list in packing order: left flank, front, right flank. The
 * front's width is the machine's width and a flank's width is its depth, which
 * is why the two are not interchangeable — a 6-8kg top-loader is 560mm across
 * and 580mm deep.
 */
function buildAngular(
  doors: WrapPanel[],
  lidMm: number,
  reveal: number,
  /**
   * Whether one composition spans the whole wrap, or each panel carries its own.
   *
   * This follows the ARTWORK, not a preference. A design drawn across all three
   * panels (≈2.15:1) spans, and the pattern carries round the corner. A design
   * drawn at one panel's proportions (≈0.7:1, which is what the fridge library
   * is) is printed once per panel — stretching a single door composition across
   * 1.7m would keep about a quarter of it, and repeating it per panel is both the
   * better picture and what the press would actually do with that file.
   */
  perPanel: boolean,
): { body: AngularBody; cabinet: MockupPanel; size: [number, number] } {
  // Left flank first in the cut list, but it is the face turned away from us.
  const [left, front, right] = [doors[0], doors[1] ?? doors[0], doors[2] ?? doors[0]];
  const wF = front.widthMm;
  const wR = right.widthMm;
  const h = Math.max(...doors.map((d) => d.heightMm));

  const ox = wR * DEPTH_SCALE * Math.cos(VIEW_ANGLE);
  const oy = wR * DEPTH_SCALE * Math.sin(VIEW_ANGLE);

  // Spanning: one composition across the three panel widths laid end to end, no
  // gaps — the fold takes no artwork with it, because the wrap turns the corner
  // rather than being cut there. Per panel: each face carries the whole design.
  const spanArt = { w: left.widthMm + wF + wR, h };
  const frontArt = perPanel ? { w: wF, h } : spanArt;
  const sideArt = perPanel ? { w: wR, h } : spanArt;
  const frontSrcX = perPanel ? 0 : left.widthMm;
  const sideSrcX = perPanel ? 0 : left.widthMm + wF;

  const x0 = reveal;
  const y0 = reveal + oy + lidMm; // top of the WRAPPED front face

  const front4: [number, number][] = [
    [x0, y0],
    [x0 + wF, y0],
    [x0 + wF, y0 + h],
    [x0, y0 + h],
  ];
  const side4: [number, number][] = [
    [x0 + wF, y0],
    [x0 + wF + ox, y0 - oy],
    [x0 + wF + ox, y0 - oy + h],
    [x0 + wF, y0 + h],
  ];

  // Front face: the artwork's middle slice, at true size, simply translated.
  const frontMatrix: [number, number, number, number, number, number] = [
    1, 0, 0, 1, x0 - frontSrcX, y0,
  ];
  // Side face: the right slice sheared into the receding parallelogram. The
  // artwork's x axis maps to (ox, -oy) over wR; its y axis stays vertical.
  const a = ox / wR;
  const b = -oy / wR;
  const sideMatrix: [number, number, number, number, number, number] = [
    a, b, 0, 1, x0 + wF - a * sideSrcX, y0 - b * sideSrcX,
  ];

  // Rounded only where the outline turns, never on the front-to-flank fold.
  const R = PANEL_RADIUS * 1.6;
  const lidTop = roundedPath(
    [
      [x0, y0 - lidMm],
      [x0 + ox, y0 - lidMm - oy],
      [x0 + wF + ox, y0 - lidMm - oy],
      [x0 + wF, y0 - lidMm],
    ],
    // The two back corners are silhouette; the two front ones meet the bands.
    [0, R, R, 0],
  );
  const lidFront = roundedPath(
    [
      [x0, y0 - lidMm],
      [x0 + wF, y0 - lidMm],
      [x0 + wF, y0],
      [x0, y0],
    ],
    [R, 0, 0, 0],
  );
  const lidSide = roundedPath(
    [
      [x0 + wF, y0 - lidMm],
      [x0 + wF + ox, y0 - lidMm - oy],
      [x0 + wF + ox, y0 - oy],
      [x0 + wF, y0],
    ],
    [0, R, 0, 0],
  );

  const cabinet: MockupPanel = {
    x: 0,
    y: 0,
    w: wF + ox + reveal * 2,
    h: lidMm + h + oy + reveal * 2,
    rx: CABINET_RADIUS,
  };
  return {
    body: {
      // front4 is [TL, TR, BR, BL]: only the bottom-left is silhouette — the top
      // meets the lid band and the right edge is the fold.
      front: { points: front4, path: roundedPath(front4, [0, 0, 0, R]), matrix: frontMatrix, art: frontArt },
      // side4 is [TL(fold), TR, BR, BL(fold)]: the two right corners are outline.
      side: { points: side4, path: roundedPath(side4, [0, R, R, 0]), matrix: sideMatrix, art: sideArt },
      lidTop,
      lidFront,
      lidSide,
    },
    cabinet,
    size: [cabinet.w, cabinet.h],
  };
}

/**
 * Build the drawable chassis for a format.
 *
 * The panel rectangles are the format's real cut list, so the proportions are
 * honest: a single fridge door really is about 1:2, a side-by-side really is
 * nearly square, an AC front cover really is a long shallow strip. The cabinet
 * adds a reveal on each side because the wrap covers the face, not the carcass
 * edges.
 */
export function buildChassis(format: WrapFormat): WrapChassis {
  const spec = format.mockupSpec ?? DEFAULT_SPEC;
  const reveal = spec.revealMm ?? DEFAULT_SPEC.revealMm;
  const gap = spec.gapMm ?? DEFAULT_SPEC.gapMm;
  const anchor = spec.anchor ?? DEFAULT_SPEC.anchor;

  // Made-to-measure has no cut list of its own, so it borrows the shape of the
  // appliance's first standard format at draw time (see chassisFor). Reaching
  // here with no panels at all means a misconfigured row; one nominal door is a
  // better answer than a division by zero.
  const doors: WrapPanel[] = format.panels.length
    ? format.panels
    : [{ widthMm: 620, heightMm: 1250 }];

  // Three-quarter view: a different drawing entirely, so it short-circuits the
  // rectangle layout below rather than trying to be a variant of it.
  if (spec.view === "angular" && doors.length >= 2) {
    const lidMm =
      (spec.features ?? []).find(
        (f): f is Extract<MockupFeature, { edge: "top" | "bottom" }> =>
          f.kind === "lidStrip" || f.kind === "controlStrip",
      )?.sizeMm ?? 0;
    const { body, cabinet, size } = buildAngular(
      doors,
      lidMm,
      reveal,
      spec.artworkSpan === "panel",
    );
    return {
      code: format.code,
      appliance: format.appliance,
      label: format.label,
      capacityLabel: format.capacityLabel,
      size: [size[0], size[1] + FLOOR_SHADOW],
      cabinet,
      panels: [],
      strips: [],
      porthole: null,
      baseShadow: FLOOR_SHADOW,
      anchor: "floor",
      angular: body,
    };
  }

  const panels: MockupPanel[] = [];
  if (spec.layout === "side") {
    let x = reveal;
    for (const d of doors) {
      panels.push({ x, y: reveal, w: d.widthMm, h: d.heightMm, rx: PANEL_RADIUS });
      x += d.widthMm + gap;
    }
  } else {
    // Stacked panels share the widest face, so a freezer door above a fridge
    // door reads as one cabinet rather than a step.
    const w = Math.max(...doors.map((d) => d.widthMm));
    let y = reveal;
    for (const d of doors) {
      panels.push({ x: reveal, y, w, h: d.heightMm, rx: PANEL_RADIUS });
      y += d.heightMm + gap;
    }
  }

  const u = panelUnion(panels);
  const cabinet = {
    x: 0,
    y: 0,
    w: u.w + reveal * 2,
    h: u.h + reveal * 2,
    rx: CABINET_RADIUS,
  };

  // Strips are positioned against the artwork's union, not the cabinet: they
  // mark where the wrap stops, and the wrap is on the face.
  const strips: MockupStrip[] = [];
  let porthole: MockupPorthole | null = null;
  for (const f of spec.features ?? []) {
    if (isStrip(f)) {
      strips.push({
        kind: f.kind,
        x: u.x,
        y: f.edge === "top" ? u.y : u.y + u.h - f.sizeMm,
        w: u.w,
        h: Math.min(f.sizeMm, u.h),
      });
    } else {
      // rFrac is a fraction of the face's WIDTH, which is how a real appliance
      // door is proportioned — a front-loader's is about 45% of the cabinet
      // width whatever the cabinet's height.
      //
      // It was the shorter axis at first, and on a near-square front that came
      // out as a black disc over roughly a third of the panel: it read as the
      // product rather than as a door, and buried the design the preview exists
      // to show. Clamped so it can never exceed the face it is cut into.
      const r = Math.min(u.w * f.rFrac, u.w / 2, u.h / 2);
      porthole = {
        cx: u.x + u.w * f.cxFrac,
        cy: u.y + u.h * f.cyFrac,
        r,
      };
    }
  }

  const baseShadow = anchor === "floor" ? FLOOR_SHADOW : 0;

  return {
    code: format.code,
    appliance: format.appliance,
    label: format.label,
    capacityLabel: format.capacityLabel,
    size: [cabinet.w, cabinet.h + baseShadow],
    cabinet,
    panels,
    strips,
    porthole,
    baseShadow,
    anchor,
    angular: null,
  };
}

/**
 * The chassis to draw for a format, given every format we know.
 *
 * Made-to-measure (Z) has no fixed shape of its own, so it borrows the first
 * standard format of its appliance — the honest choice, since the preview is
 * about the artwork and Z is most often one ordinary door.
 */
export function chassisFor(
  formats: WrapFormat[],
  code: string | null | undefined,
): WrapChassis | null {
  if (!formats.length) return null;
  const wanted = code ? formats.find((f) => f.code === code) : null;
  const format = wanted ?? formats[0];
  if (!format.isMadeToMeasure) return buildChassis(format);

  const standIn =
    formats.find((f) => f.appliance === format.appliance && !f.isMadeToMeasure) ?? null;
  return standIn ? buildChassis({ ...standIn, code: format.code }) : buildChassis(format);
}

/**
 * One canvas every chassis of ONE APPLIANCE is drawn into, in millimetres.
 *
 * Two things fall out of sharing it within an appliance, and both are the point.
 *
 * A FIXED FLOOR LINE. Every chassis is placed with its base on the bottom of
 * this canvas, so switching format grows the appliance UPWARD instead of
 * re-centring it. On the studio's sticky stage the base then never moves while
 * the chips scroll past — an appliance that hops up and down as you click reads
 * as a glitch, not a choice.
 *
 * TRUE RELATIVE SIZE. Because the canvas is fixed and the geometry is real
 * millimetres, a mini fridge draws smaller than a side-by-side. Fitting each
 * chassis to the available width instead — which is what this did first — made
 * a 45 L bar fridge look the same size as a 700 L American one, which is a
 * lie about the product the customer is choosing between.
 *
 * PER APPLIANCE, not across the range, and that is the one thing that changed
 * when the range grew. A shared canvas wide enough for a 1.9 m top-load wrap
 * would draw a dishwasher door as a stamp in the corner of it. Relative size is
 * information when you are choosing between two fridges and noise when you are
 * choosing between a fridge and an air conditioner — nobody is deciding which
 * appliance to own based on our mockup.
 */
export function mockupFrame(formats: WrapFormat[]): [number, number] {
  const drawable = formats.filter((f) => !f.isMadeToMeasure && f.panels.length);
  if (!drawable.length) return [1000, 1000];
  const all = drawable.map(buildChassis);
  const w = Math.max(...all.map((c) => c.cabinet.w));
  const h = Math.max(...all.map((c) => c.cabinet.h + c.baseShadow));
  return [w, h];
}

/** Every format of one appliance that has a shape worth drawing. */
export function drawableFormats(formats: WrapFormat[], appliance: ApplianceKey): WrapFormat[] {
  return formats
    .filter((f) => f.appliance === appliance && f.active && !f.isMadeToMeasure && f.panels.length)
    .sort((a, b) => a.position - b.position);
}

/**
 * Alt text that says what is being shown, for a screen reader.
 *
 * Built from the APPLIANCE plus its fit band, not from the format's own label.
 * The label is written for a picker, where the appliance is already established
 * by the page — read aloud on its own it produces "a top-load washer, 3-side
 * wrap top-load washing machine", because the label and the appliance name each
 * contain most of the other.
 */
export function chassisAlt(c: WrapChassis, designAlt?: string): string {
  const cfg = APPLIANCES[c.appliance];
  const subject = c.capacityLabel ? `${cfg.altNoun}, ${c.capacityLabel}` : cfg.altNoun;
  return designAlt ? `${designAlt} shown on a ${subject}` : `Wrap shown on a ${subject}`;
}
