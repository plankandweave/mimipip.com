export type Point = { x: number; y: number };

/**
 * CSS matrix3d() that maps a w×h rectangle (origin top-left) onto an
 * arbitrary quad [tl, tr, br, bl] — a 2D homography. The element must
 * have `transform-origin: 0 0`.
 */
export function quadTransform(
  w: number,
  h: number,
  tl: Point,
  tr: Point,
  br: Point,
  bl: Point,
): string | null {
  const { x: x0, y: y0 } = tl;
  const { x: x1, y: y1 } = tr;
  const { x: x2, y: y2 } = br;
  const { x: x3, y: y3 } = bl;

  const dx1 = x1 - x2;
  const dy1 = y1 - y2;
  const dx2 = x3 - x2;
  const dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3;
  const sy = y0 - y1 + y2 - y3;

  const den = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(den) < 1e-9) return null;

  const g = (sx * dy2 - sy * dx2) / den;
  const hh = (dx1 * sy - dy1 * sx) / den;

  const a = x1 - x0 + g * x1;
  const b = x3 - x0 + hh * x3;
  const c = x0;
  const d = y1 - y0 + g * y1;
  const e = y3 - y0 + hh * y3;
  const f = y0;

  const m = [
    a / w, d / w, 0, g / w,
    b / h, e / h, 0, hh / h,
    0, 0, 1, 0,
    c, f, 0, 1,
  ];
  if (m.some((v) => !Number.isFinite(v))) return null;
  return `matrix3d(${m.join(",")})`;
}

/**
 * Forward projective map: returns a function taking a point (u,v) inside the
 * w×h source rectangle and returning where it lands on the quad [tl,tr,br,bl].
 * Same homography as quadTransform, but usable for canvas mesh-warping when
 * rasterising the preview (e.g. for the order-copy PDF).
 */
export function quadMapper(
  w: number,
  h: number,
  tl: Point,
  tr: Point,
  br: Point,
  bl: Point,
): ((u: number, v: number) => Point) | null {
  const { x: x0, y: y0 } = tl;
  const { x: x1, y: y1 } = tr;
  const { x: x2, y: y2 } = br;
  const { x: x3, y: y3 } = bl;

  const dx1 = x1 - x2;
  const dy1 = y1 - y2;
  const dx2 = x3 - x2;
  const dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3;
  const sy = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(den) < 1e-9) return null;

  const g = (sx * dy2 - sy * dx2) / den;
  const hh = (dx1 * sy - dy1 * sx) / den;
  const a = x1 - x0 + g * x1;
  const b = x3 - x0 + hh * x3;
  const c = x0;
  const d = y1 - y0 + g * y1;
  const e = y3 - y0 + hh * y3;
  const f = y0;
  if (![a, b, c, d, e, f, g, hh].every(Number.isFinite)) return null;

  return (u: number, v: number) => {
    const U = u / w;
    const V = v / h;
    const wgt = g * U + hh * V + 1;
    return { x: (a * U + b * V + c) / wgt, y: (d * U + e * V + f) / wgt };
  };
}
