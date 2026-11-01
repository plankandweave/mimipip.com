/**
 * The human silhouette both visualisers stand next to the artwork for scale.
 *
 * Shared deliberately: this figure is the reference the customer judges every
 * size against, so a copy that drifts — in proportion, or in how it meets the
 * floor — quietly corrupts that judgement. One drawing, one set of numbers.
 *
 * The viewBox is the drawing's exact visual bounds INCLUDING the stroke (which
 * straddles the path by half its width), so the box edges are the ink edges.
 * That means `height` is the figure's true rendered height — not a box it
 * floats inside — and its bottom edge is the sole of the foot, so a caller
 * places it on the floor with `top = floorY - height`.
 */

/** Reference adult height (ft) — what the figure's label claims and renders. */
export const FIGURE_HEIGHT_FT = 5.5;

// Visual bounds of the paths below, stroke included. RE-MEASURE (getBBox plus
// the stroke width) if the drawing changes, or the figure stops being true.
const VB = { x: 5.5, y: 1, w: 23, h: 93.5 };

/** Width that keeps the figure in proportion at a given rendered height. */
export const figureWidth = (height: number) => (height * VB.w) / VB.h;

export function ScaleFigure({
  height,
  className,
  style,
}: {
  /** Rendered height in px — the figure's true height, sole to crown. */
  height: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      width={figureWidth(height)}
      height={height}
      viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}
      className={className}
      style={style}
    >
      <circle cx="17" cy="9" r="7.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M17 18.5c-6.5 0-11 4.5-11 11v19c0 2.5 1.8 4.5 4 4.5v39a2 2 0 0 0 2 2h1.2a2 2 0 0 0 2-1.9l1-30.1h1.6l1 30.1a2 2 0 0 0 2 1.9h1.2a2 2 0 0 0 2-2V53c2.2 0 4-2 4-4.5v-19c0-6.5-4.5-11-11-11Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
