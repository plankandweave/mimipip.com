import type { Point } from "./homography";

/**
 * Coons-patch mapping for the room visualizer's "curved surface" mode — lets
 * a mural wrap a column or an arched corner instead of only lying flat on a
 * quad. Same [tl, tr, br, bl] corners as homography.ts, plus one extra
 * "curve handle" per edge (top, right, bottom, left) the customer can drag
 * to bow that edge in or out.
 */

/** Curve handles for the top, right, bottom and left edges, in that order —
 *  same fractional/px space as the corners they belong to. */
export type EdgeMids = [Point, Point, Point, Point];

function mid(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** The "flat" default: each handle sits at its edge's straight midpoint. */
export function straightMids(corners: [Point, Point, Point, Point]): EdgeMids {
  const [tl, tr, br, bl] = corners;
  return [mid(tl, tr), mid(tr, br), mid(br, bl), mid(bl, tl)];
}

/**
 * The quadratic-bézier control point that makes the curve from a to b pass
 * exactly through `mid` at t=0.5 (bézier(0.5) = a/4 + c/2 + b/4, solved for c).
 */
export function bezierControl(a: Point, b: Point, midPoint: Point): Point {
  return {
    x: 2 * midPoint.x - (a.x + b.x) / 2,
    y: 2 * midPoint.y - (a.y + b.y) / 2,
  };
}

function quadPoint(a: Point, c: Point, b: Point, t: number): Point {
  const mt = 1 - t;
  return {
    x: mt * mt * a.x + 2 * mt * t * c.x + t * t * b.x,
    y: mt * mt * a.y + 2 * mt * t * c.y + t * t * b.y,
  };
}

/** True once any curve handle has been dragged off its straight midpoint. */
export function isCurved(
  corners: [Point, Point, Point, Point],
  mids: EdgeMids,
  eps = 0.004,
): boolean {
  const straight = straightMids(corners);
  return mids.some((m, i) => Math.hypot(m.x - straight[i].x, m.y - straight[i].y) > eps);
}

/**
 * Forward Coons-patch map: returns a function taking a point (u,v) inside
 * the w×h source rectangle and returning where it lands inside the patch
 * bounded by [tl,tr,br,bl] with each edge bowed through its curve handle.
 * Each edge is a quadratic bézier through the matching `mids` handle; the
 * four are bilinearly blended per the standard Coons-patch formula:
 *   S(u,v) = (1−v)·T(u) + v·B(u) + (1−u)·L(v) + u·R(v)
 *            − [(1−u)(1−v)·tl + u(1−v)·tr + uv·br + (1−u)v·bl]
 * Degenerates to the plain bilinear quad (quadMapper) when mids are
 * straightMids(corners) — the bézier controls collapse onto the straight edges.
 */
export function coonsMapper(
  w: number,
  h: number,
  corners: [Point, Point, Point, Point],
  mids: EdgeMids,
): (u: number, v: number) => Point {
  const [tl, tr, br, bl] = corners;
  const [topMid, rightMid, bottomMid, leftMid] = mids;

  const topC = bezierControl(tl, tr, topMid);
  const rightC = bezierControl(tr, br, rightMid);
  const bottomC = bezierControl(bl, br, bottomMid);
  const leftC = bezierControl(tl, bl, leftMid);

  return (u: number, v: number) => {
    const U = w > 0 ? u / w : 0;
    const V = h > 0 ? v / h : 0;
    const T = quadPoint(tl, topC, tr, U);
    const B = quadPoint(bl, bottomC, br, U);
    const L = quadPoint(tl, leftC, bl, V);
    const R = quadPoint(tr, rightC, br, V);
    const x =
      (1 - V) * T.x + V * B.x + (1 - U) * L.x + U * R.x -
      ((1 - U) * (1 - V) * tl.x + U * (1 - V) * tr.x + U * V * br.x + (1 - U) * V * bl.x);
    const y =
      (1 - V) * T.y + V * B.y + (1 - U) * L.y + U * R.y -
      ((1 - U) * (1 - V) * tl.y + U * (1 - V) * tr.y + U * V * br.y + (1 - U) * V * bl.y);
    return { x, y };
  };
}
