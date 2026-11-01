import { drawTriangle } from "./warp";
import type { Point } from "./homography";
import type { TextOverlay } from "./text-overlay";

/** Project lettering in WALL coordinates, independent of the mural's pan/flip. */
export function drawTextOverlayWarp(ctx: CanvasRenderingContext2D, tile: HTMLImageElement,
  o: TextOverlay, wallW: number, wallH: number, map: (x: number, y: number) => Point) {
  const n = 8, w = o.width * wallW, h = w / 2;
  for (let i=0; i<n; i++) for (let j=0; j<n; j++) {
    const x0=i/n, x1=(i+1)/n, y0=j/n, y1=(j+1)/n;
    const source = (x: number,y: number) => ({x:x*tile.naturalWidth,y:y*tile.naturalHeight});
    const dest = (x: number,y: number) => map(o.x*wallW+x*w,o.y*wallH+y*h);
    drawTriangle(ctx,tile,source(x0,y0),source(x1,y0),source(x1,y1),dest(x0,y0),dest(x1,y0),dest(x1,y1));
    drawTriangle(ctx,tile,source(x0,y0),source(x1,y1),source(x0,y1),dest(x0,y0),dest(x1,y1),dest(x0,y1));
  }
}
