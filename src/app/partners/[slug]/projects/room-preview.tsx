"use client";
import { useEffect, useRef, useState } from "react";
import { coverLayout } from "@/lib/visualizer";
import { quadMapper, type Point } from "@/lib/homography";
import { drawTriangle, loadImage } from "@/lib/warp";
export const DEFAULT_WALL_CORNERS: Point[] = [
  { x: 0.15, y: 0.15 },
  { x: 0.85, y: 0.15 },
  { x: 0.85, y: 0.75 },
  { x: 0.15, y: 0.75 },
];
export type PreviewPlacement = {
  zoom: number;
  cropX: number;
  cropY: number;
  flipH: boolean;
  flipV: boolean;
};

/** Draw the art onto a flat texture exactly as the print composition crops
 *  it — the same cover/zoom/crop/flip the production specification pins. */
export function drawArt(
  t: CanvasRenderingContext2D,
  art: HTMLImageElement,
  w: number,
  h: number,
  placement: PreviewPlacement,
) {
  const { imgW, imgH } = coverLayout(
    w,
    h,
    art.naturalWidth / art.naturalHeight,
    placement.zoom,
  );
  t.save();
  if (placement.flipH || placement.flipV) {
    t.translate(placement.flipH ? w : 0, placement.flipV ? h : 0);
    t.scale(placement.flipH ? -1 : 1, placement.flipV ? -1 : 1);
  }
  t.drawImage(
    art,
    -(imgW - w) * placement.cropX,
    -(imgH - h) * placement.cropY,
    imgW,
    imgH,
  );
  t.restore();
}

/** Paint the room photo with the composition warped onto the wall quad.
 *  Shared by the on-screen preview and the downloadable PDF, so the PDF is
 *  the picture the designer approved, not a second rendering of it. */
export function drawRoomPreview(
  c: HTMLCanvasElement,
  photo: HTMLImageElement,
  art: HTMLImageElement,
  width: number,
  height: number,
  placement: PreviewPlacement,
  corners: Point[],
) {
  c.width = Math.min(1400, photo.naturalWidth);
  c.height = Math.round((c.width * photo.naturalHeight) / photo.naturalWidth);
  const ctx = c.getContext("2d");
  if (!ctx) return;
  ctx.drawImage(photo, 0, 0, c.width, c.height);
  const texture = document.createElement("canvas");
  texture.width = 800;
  texture.height = Math.round((800 * height) / width);
  const t = texture.getContext("2d");
  if (!t) return;
  drawArt(t, art, texture.width, texture.height, placement);
  const points = corners.map((p) => ({ x: p.x * c.width, y: p.y * c.height }));
  const map = quadMapper(
    texture.width,
    texture.height,
    points[0],
    points[1],
    points[2],
    points[3],
  );
  if (!map) return;
  for (let y = 0; y < 12; y++)
    for (let x = 0; x < 12; x++) {
      const a = { x: (x / 12) * texture.width, y: (y / 12) * texture.height },
        b = { x: ((x + 1) / 12) * texture.width, y: a.y },
        d = { x: a.x, y: ((y + 1) / 12) * texture.height },
        e = { x: b.x, y: d.y };
      drawTriangle(ctx, texture, a, b, e, map(a.x, a.y), map(b.x, b.y), map(e.x, e.y));
      drawTriangle(ctx, texture, a, e, d, map(a.x, a.y), map(e.x, e.y), map(d.x, d.y));
    }
}

/** Room simulation uses the same cover/zoom/crop as the pinned production specification. */
export default function RoomPreview({
  photoUrl,
  artUrl,
  width,
  height,
  placement,
  corners,
  onCorners,
}: {
  photoUrl: string;
  artUrl: string;
  width: number;
  height: number;
  placement: PreviewPlacement;
  corners: Point[];
  onCorners?: (points: Point[]) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState("");
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    setError("");
    Promise.all([loadImage(photoUrl, true), loadImage(artUrl, true)])
      .then(([photo, art]) => {
        const c = canvas.current;
        if (!c || cancelled) return;
        drawRoomPreview(c, photo, art, width, height, placement, corners);
      })
      .catch(() => setError("Room preview could not be loaded"));
    return () => {
      cancelled = true;
    };
  }, [photoUrl, artUrl, width, height, placement, corners]);
  return (
    <div>
      <div
        className="relative mt-3 touch-none"
        onPointerMove={(e) => {
          if (active === null || !onCorners) return;
          const r = e.currentTarget.getBoundingClientRect();
          onCorners(
            corners.map((p, i) =>
              i === active
                ? {
                    x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
                    y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
                  }
                : p,
            ),
          );
        }}
        onPointerUp={() => setActive(null)}
        onPointerCancel={() => setActive(null)}
      >
        <canvas ref={canvas} className="w-full rounded" />
        {onCorners &&
          corners.map((p, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Wall corner ${i + 1}`}
              style={{
                position: "absolute",
                left: `${p.x * 100}%`,
                top: `${p.y * 100}%`,
                transform: "translate(-50%,-50%)",
              }}
              className="h-8 w-8 rounded-full border-2 border-white bg-stone-800 text-xs text-white"
              onPointerDown={(e) => {
                e.currentTarget.parentElement?.setPointerCapture(e.pointerId);
                setActive(i);
              }}
            >
              {i + 1}
            </button>
          ))}
      </div>
      {onCorners && (
        <p className="mt-2 text-xs text-stone-500">
          Drag corners 1–4 around the wall: top left, top right, bottom right,
          bottom left. Room simulation is illustrative; the exact print
          composition remains above.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
