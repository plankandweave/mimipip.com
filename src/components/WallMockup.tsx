"use client";

import { useEffect, useRef, useState } from "react";
import { quadMapper, type Point } from "@/lib/homography";
import { drawTriangle, loadImage } from "@/lib/warp";

/**
 * The chosen creative, standing on the real wall.
 *
 * This is the store's room visualiser applied to a partner survey: the same
 * homography and the same triangle-mesh warp, but the quad comes from vision
 * instead of a customer dragging corners, because sixteen showroom photos
 * arrive at once and nobody is going to align them by hand.
 *
 * A mesh rather than one CSS matrix3d: the composed run is often 20:1, and a
 * single transformed image resamples badly at that ratio — subdividing keeps
 * the far end of a long wall from smearing. Falls back to the plain photo if
 * anything at all goes wrong; a missing mockup is a small loss, a wrong one
 * would mislead an approval.
 */
export default function WallMockup({
  photoUrl, artUrl, quad, alt, className, onReady,
}: {
  photoUrl: string;
  artUrl: string;
  quad: [Point, Point, Point, Point];
  alt: string;
  className?: string;
  /** Called with the finished canvas once the warp has been drawn.
   *
   *  Exists so a caller can export exactly what is on screen — a wall study's
   *  PDF is assembled on a server that has no canvas, so the browser that drew
   *  the mockup is the only thing that can produce that picture. Exporting the
   *  same canvas rather than re-rendering server-side is what stops the PDF and
   *  the screen from quietly disagreeing.
   *
   *  Both source images are loaded with crossOrigin="anonymous", so the canvas
   *  is not tainted and toBlob() works. Do not change that without checking
   *  this. */
  onReady?: (canvas: HTMLCanvasElement) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  // Held in a ref so a caller passing an inline arrow does not re-run the warp
  // on every render — the effect redraws on photo, art and quad, and nothing
  // else should be able to retrigger it. Kept current in its own effect rather
  // than assigned during render, which React does not allow.
  const onCanvas = useRef(onReady);
  useEffect(() => { onCanvas.current = onReady; }, [onReady]);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const [photo, art] = await Promise.all([
          loadImage(photoUrl, true),
          loadImage(artUrl, true),
        ]);
        if (dead) return;
        const c = ref.current;
        if (!c) return;
        // Cap the canvas: these are review thumbnails, not print files.
        const W = Math.min(photo.naturalWidth || 1200, 1400);
        const H = Math.round(W * ((photo.naturalHeight || 800) / (photo.naturalWidth || 1200)));
        c.width = W; c.height = H;
        const ctx = c.getContext("2d");
        if (!ctx) { setFailed(true); return; }
        ctx.drawImage(photo, 0, 0, W, H);

        const px = quad.map((p) => ({ x: p.x * W, y: p.y * H })) as [Point, Point, Point, Point];
        const map = quadMapper(art.naturalWidth, art.naturalHeight, px[0], px[1], px[2], px[3]);
        if (!map) { setFailed(true); return; }

        // Mesh density follows the run: a long band needs more columns than a
        // column face, but bound it so a 20:1 wall stays quick to draw.
        const cols = Math.max(8, Math.min(64, Math.round((art.naturalWidth / art.naturalHeight) * 4)));
        const rows = 4;
        const sw = art.naturalWidth / cols, sh = art.naturalHeight / rows;
        for (let i = 0; i < cols; i++) {
          for (let j = 0; j < rows; j++) {
            const u0 = i * sw, v0 = j * sh, u1 = (i + 1) * sw, v1 = (j + 1) * sh;
            const s = [{ x: u0, y: v0 }, { x: u1, y: v0 }, { x: u1, y: v1 }, { x: u0, y: v1 }];
            const d = s.map((p) => map(p.x, p.y));
            drawTriangle(ctx, art, s[0]!, s[1]!, s[2]!, d[0]!, d[1]!, d[2]!);
            drawTriangle(ctx, art, s[0]!, s[2]!, s[3]!, d[0]!, d[2]!, d[3]!);
          }
        }
        // Only after the warp has actually landed — a caller exporting this
        // must never be handed a canvas holding the bare photograph.
        if (!dead) onCanvas.current?.(c);
      } catch {
        if (!dead) setFailed(true);
      }
    })();
    return () => { dead = true; };
  }, [photoUrl, artUrl, quad]);

  if (failed) return <img src={photoUrl} alt={alt} className={className} />;
  return <canvas ref={ref} aria-label={alt} className={className} />;
}
