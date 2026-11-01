import type { Point } from "./homography";

/**
 * Canvas mesh-warp primitives shared by the visualisers' composite exports
 * (RoomVisualizer's order-copy JPEG, BorderLineVisualizer's download). One
 * implementation, because two copies of affine-triangle algebra is two
 * chances for the exported image to disagree with the live preview.
 */

export function loadImage(src: string, crossOrigin = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    if (crossOrigin) im.crossOrigin = "anonymous";
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = src;
  });
}

/** Draw an affine-mapped texture triangle (src px → dst px) onto ctx. */
export function drawTriangle(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  s0: Point, s1: Point, s2: Point,
  d0: Point, d1: Point, d2: Point,
) {
  const denom = s0.x * (s2.y - s1.y) - s1.x * s2.y + s2.x * s1.y + (s1.x - s2.x) * s0.y;
  if (Math.abs(denom) < 1e-6) return;
  const a = -(s0.y * (d2.x - d1.x) - s1.y * d2.x + s2.y * d1.x + (s1.y - s2.y) * d0.x) / denom;
  const b = (s1.y * d2.y + s0.y * (d1.y - d2.y) - s2.y * d1.y + (s2.y - s1.y) * d0.y) / denom;
  const c = (s0.x * (d2.x - d1.x) - s1.x * d2.x + s2.x * d1.x + (s1.x - s2.x) * d0.x) / denom;
  const d = -(s1.x * d2.y + s0.x * (d1.y - d2.y) - s2.x * d1.y + (s2.x - s1.x) * d0.y) / denom;
  const e =
    (s0.x * (s2.y * d1.x - s1.y * d2.x) + s0.y * (s1.x * d2.x - s2.x * d1.x) +
      (s2.x * s1.y - s1.x * s2.y) * d0.x) / denom;
  const f =
    (s0.x * (s2.y * d1.y - s1.y * d2.y) + s0.y * (s1.x * d2.y - s2.x * d1.y) +
      (s2.x * s1.y - s1.x * s2.y) * d0.y) / denom;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(d0.x, d0.y);
  ctx.lineTo(d1.x, d1.y);
  ctx.lineTo(d2.x, d2.y);
  ctx.closePath();
  ctx.clip();
  ctx.transform(a, b, c, d, e, f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}
