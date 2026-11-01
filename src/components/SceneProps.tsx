/**
 * Line-art room props shared by the true-scale scenes — the canvas room
 * (WallScaleVisualizer) and the border placement room (BorderPlacementScene).
 * Shared for the same reason as ScaleFigure: these are the objects the
 * customer judges real size against, so a copy that drifts in proportion
 * quietly corrupts that judgement. One drawing, one set of numbers.
 *
 * Each viewBox is its drawing's exact visual bounds — INCLUDING the stroke,
 * which straddles the path by half its width. That makes the box edges the
 * ink edges, so sizing an element to a real height renders the prop at truly
 * that height, and putting its bottom edge on the floor line stands it on the
 * floor. KEEP THE BOXES IN SYNC with the paths below — re-measure (getBBox +
 * stroke) if a path changes.
 */

export const SOFA_VB = { x: 0.75, y: 1.75, w: 166.5, h: 62.5 };
export const PLANT_VB = { x: 12.75, y: 20.75, w: 30.9, h: 88.5 };

// Staircase geometry — a real residential pitch, 7 in rise on a 10 in going.
// Shared because two surfaces make claims from it: the placement scene DRAWS
// the flight at this pitch, and the reach graphic SAYS how many metres a
// ten-step run takes. If they disagree, one of them is lying to the customer.
export const STEP_RISE_FT = 7 / 12;
export const STEP_TREAD_FT = 10 / 12;
export const STEP_COUNT = 10;
/** The flight's angle from horizontal (~35°). */
export const STAIR_ANGLE_DEG = (Math.atan2(STEP_RISE_FT, STEP_TREAD_FT) * 180) / Math.PI;
/** Length of a border following the nosings up the whole flight, in feet. */
export const STAIR_RUN_FT = STEP_COUNT * Math.hypot(STEP_RISE_FT, STEP_TREAD_FT);

/** Real-world sofa width the drawing represents, shared by every scene. */
export const SOFA_W_FT = 7;
// The sofa is drawn to a real 7 ft width, so its back height follows from the
// drawing's own proportions rather than being asserted separately — hang rules
// (canvas lifted above the sofa back) depend on it being the true height.
export const SOFA_H_FT = (SOFA_W_FT * SOFA_VB.h) / SOFA_VB.w;

const vbStr = (v: { x: number; y: number; w: number; h: number }) => `${v.x} ${v.y} ${v.w} ${v.h}`;

type PropSvgProps = { className?: string; style?: React.CSSProperties };

/** 7 ft three-seater, line art. Size via style {width, height} from SOFA_VB. */
export function SofaSvg({ className, style }: PropSvgProps) {
  return (
    <svg
      viewBox={vbStr(SOFA_VB)}
      className={className}
      style={style}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <rect x="12" y="3" width="144" height="36" rx="9" />
      <rect x="2" y="20" width="21" height="33" rx="8" />
      <rect x="145" y="20" width="21" height="33" rx="8" />
      <rect x="25" y="38" width="39" height="15" rx="5" />
      <rect x="65" y="38" width="38" height="15" rx="5" />
      <rect x="105" y="38" width="39" height="15" rx="5" />
      <path d="M16 53v10M152 53v10" />
    </svg>
  );
}

/** Potted plant, line art. Size via style {width, height} from PLANT_VB. */
export function PlantSvg({ className, style }: PropSvgProps) {
  return (
    <svg
      viewBox={vbStr(PLANT_VB)}
      className={className}
      style={style}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <path d="M18 84h24l-3 24H21l-3-24Z" />
      <path d="M30 84V46" />
      <path d="M30 62c-8-4-16-14-16-28 10 2 16 12 16 28Z" />
      <path d="M30 54c8-6 14-16 12-32-10 4-14 18-12 32Z" />
      <path d="M30 70c-5-1-12 1-16 8 7 2 13-2 16-8Z" />
    </svg>
  );
}
