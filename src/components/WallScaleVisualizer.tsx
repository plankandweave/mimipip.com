"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { coverLayout, cropRect, scalePercent, type CropData } from "@/lib/visualizer";
import { CM_PER_INCH } from "@/lib/pricing";
import { FIGURE_HEIGHT_FT, ScaleFigure } from "@/components/ScaleFigure";
import { PLANT_VB, PlantSvg, SOFA_H_FT, SOFA_W_FT, SofaSvg } from "@/components/SceneProps";

// The fixed room scene every ready-size product hangs in: a 12 ft × 10 ft wall
// (real ceilings are ~10 ft; walls read wider than tall) plus a shallow floor
// band. The scene never changes — only the canvas does — so switching sizes
// shows the true difference between a 24″ and a 48″ piece.
const WALL_W_FT = 12;
const WALL_H_FT = 10;
const FLOOR_FT = 1.6;
// Gallery convention: the centre of the artwork sits at eye level, 57 in from
// the floor — unless the sofa forces it higher (min. 8 in above the sofa back).
const EYE_CENTER_FT = 57 / 12;
const SOFA_GAP_FT = 8 / 12;
const PLANT_H_FT = 3.2;

// The sofa, plant and figure drawings (and their exact-ink viewBoxes) are
// shared with the border placement scene — see SceneProps and ScaleFigure —
// so the objects the customer judges size against can't drift between scenes.

const fmtIn = (inches: number) =>
  inches % 12 === 0 ? `${inches / 12} ft` : `${Math.floor(inches / 12)} ft ${inches % 12} in`;

/**
 * True-size wall preview for FIXED-SIZE products (Canvas Wall Art). Unlike the
 * made-to-measure DesignVisualizer — where the frame IS the customer's wall —
 * this renders the finished canvas at exact scale on a constant 12 ft × 10 ft
 * room wall, hung at gallery eye level above a sofa, with a 5.5 ft figure and
 * dimension callouts. Size changes animate so the jump from 24″ to 48″ is
 * felt, not read. Emits the same normalised offsetX/offsetY/zoom/flip crop
 * model as every other surface — what's framed in the canvas is exactly what
 * prints; WHERE it hangs on the demo wall is presentation only and never
 * touches crop_data.
 */
export function WallScaleVisualizer({
  imageUrl,
  imageAlt,
  artWidthIn,
  artHeightIn,
  offsetX,
  offsetY,
  zoom,
  flipH = false,
  flipV = false,
  textureUrl,
  sizePicker,
  onChange,
  onImageMeta,
}: {
  imageUrl: string;
  imageAlt: string;
  artWidthIn: number;
  artHeightIn: number;
  offsetX: number;
  offsetY: number;
  zoom: number;
  flipH?: boolean;
  flipV?: boolean;
  textureUrl?: string | null;
  /** The ready-size chooser, rendered immediately under the wall so the canvas
   *  is still on screen when the size changes — the whole point of the scene is
   *  the before/after, and it's lost if you have to scroll away to switch. */
  sizePicker?: React.ReactNode;
  onChange: (next: { offsetX: number; offsetY: number; zoom: number; flipH: boolean; flipV: boolean }) => void;
  onImageMeta: (meta: { aspect: number; sourceW: number; sourceH: number }) => void;
}) {
  const [aspect, setAspect] = useState<number | null>(null);
  // Measured from the DOM as well as from onLoad — a cached image is already
  // decoded before React attaches the handler, so its load event has fired
  // and will never fire again, leaving `aspect` null forever and silently
  // disabling drag + zoom. Measure on mount and never rely solely on onLoad
  // (mirrors the same fix in DesignVisualizer).
  const imgRef = useRef<HTMLImageElement | null>(null);
  const measuredFor = useRef<string | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const panLast = useRef<{ x: number; y: number } | null>(null);

  const ready = artWidthIn > 0 && artHeightIn > 0;
  const flipTransform = `scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect;
      setBox({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready]);

  // Scene geometry — everything is placed in feet, then mapped to px.
  const pxPerFt = Math.min(box.w / WALL_W_FT, box.h / (WALL_H_FT + FLOOR_FT));
  const floorY = WALL_H_FT * pxPerFt; // top edge of the floor band
  const artWFt = artWidthIn / 12;
  const artHFt = artHeightIn / 12;
  // Hang at eye level, lifted if the sofa back would crowd the bottom edge.
  const artBottomFt = Math.max(EYE_CENTER_FT - artHFt / 2, SOFA_H_FT + SOFA_GAP_FT);
  const frameW = artWFt * pxPerFt;
  const frameH = artHFt * pxPerFt;
  const frameLeft = (box.w - frameW) / 2;
  const frameTop = floorY - (artBottomFt + artHFt) * pxPerFt;

  const layout = useMemo(
    () => (aspect && frameW > 0 ? coverLayout(frameW, frameH, aspect, zoom) : null),
    [aspect, frameW, frameH, zoom],
  );

  useEffect(() => {
    if (measuredFor.current === imageUrl) return;
    const el = imgRef.current;
    if (!el?.complete || !el.naturalWidth || !el.naturalHeight) return;
    measuredFor.current = imageUrl;
    const a = el.naturalWidth / el.naturalHeight;
    setAspect(a);
    onImageMeta({ aspect: a, sourceW: el.naturalWidth, sourceH: el.naturalHeight });
  });

  // Minimap: the full artwork with the visible crop window marked, so the
  // customer still sees what the cover-fit + zoom is cropping away (the
  // made-to-measure visualiser shows this as a blurred backdrop; a room
  // scene can't, so this small inset carries that honesty instead).
  const miniRect = useMemo(() => {
    if (!aspect || !ready) return null;
    const crop = {
      wallWidthCm: artWidthIn * CM_PER_INCH,
      wallHeightCm: artHeightIn * CM_PER_INCH,
      offsetX,
      offsetY,
      zoom,
    } as CropData;
    return cropRect(crop, aspect);
  }, [aspect, ready, artWidthIn, artHeightIn, offsetX, offsetY, zoom]);
  // Sizes now follow the artwork's own shape, so any residual difference is a
  // rounding artefact — 3:5 sold at 0.600 against a flat measured at 0.5955
  // clips about 4 mm off a 4 ft print. Flag a crop only once it's something a
  // customer could actually see, or the minimap cries wolf on every size.
  const cropped = miniRect ? miniRect.w < 0.98 || miniRect.h < 0.98 : false;
  const miniW = aspect ? (aspect >= 1 ? 76 : Math.round(64 * aspect)) : 0;
  const miniH = aspect ? Math.round(miniW / aspect) : 0;

  const onPan = (e: React.PointerEvent) => {
    if (!panLast.current || !layout) return;
    const dx = e.clientX - panLast.current.x;
    const dy = e.clientY - panLast.current.y;
    panLast.current = { x: e.clientX, y: e.clientY };
    const spanX = layout.imgW - frameW;
    const spanY = layout.imgH - frameH;
    const nx = spanX > 1 ? Math.min(1, Math.max(0, offsetX - dx / spanX)) : offsetX;
    const ny = spanY > 1 ? Math.min(1, Math.max(0, offsetY - dy / spanY)) : offsetY;
    onChange({ offsetX: nx, offsetY: ny, zoom, flipH, flipV });
  };

  // Every prop stands on the floor: its element height maps 1:1 onto the ink
  // box, so `top = floorY - height` puts the drawn feet/legs/pot on the line.
  // Widths follow each viewBox's aspect so nothing is stretched.
  const silhouetteH = FIGURE_HEIGHT_FT * pxPerFt;
  const sofaW = SOFA_W_FT * pxPerFt;
  const sofaH = SOFA_H_FT * pxPerFt;
  const plantH = PLANT_H_FT * pxPerFt;
  const plantW = (plantH * PLANT_VB.w) / PLANT_VB.h;

  return (
    <div id="wall-preview">
      <p className="caps mb-1 text-slate">Artwork size preview</p>
      <p className="mb-3 text-xs text-slate">
        Your canvas at exact scale on a {WALL_W_FT} ft wall. Switch sizes to compare. Drag the
        artwork to reposition. Zoom to set the crop.
      </p>

      <div
        ref={wrapRef}
        className="relative w-full select-none overflow-hidden rounded-[16px]"
        style={{ aspectRatio: `${WALL_W_FT / (WALL_H_FT + FLOOR_FT)}` }}
      >
        {/* the wall — warm greige, soft daylight falling from the top left */}
        <div
          className="absolute inset-x-0 top-0"
          style={{
            height: floorY,
            background:
              "radial-gradient(120% 90% at 22% 0%, rgba(255,252,244,0.9) 0%, rgba(255,252,244,0) 55%), linear-gradient(180deg, #e8e2d8 0%, #ddd5c8 100%)",
          }}
        />
        {/* ceiling shadow line */}
        <div
          className="absolute inset-x-0 top-0"
          style={{ height: Math.max(3, pxPerFt * 0.12), background: "linear-gradient(180deg, rgba(74,68,60,0.18), rgba(74,68,60,0))" }}
        />
        {/* skirting board */}
        <div
          className="absolute inset-x-0"
          style={{
            top: floorY - 0.38 * pxPerFt,
            height: 0.38 * pxPerFt,
            background: "linear-gradient(180deg, #f4f0e8 0%, #e6e0d4 100%)",
            boxShadow: "0 -1px 0 rgba(74,68,60,0.15)",
          }}
        />
        {/* floor */}
        <div
          className="absolute inset-x-0 bottom-0"
          style={{
            top: floorY,
            background: "linear-gradient(180deg, #cdb695 0%, #b99f7d 100%)",
            boxShadow: "inset 0 2px 4px rgba(74,68,60,0.18)",
          }}
        />

        {ready && box.w > 0 && (
          <>
            {/* soft contact shadows on the floor */}
            <div
              className="absolute rounded-[50%]"
              style={{
                left: (box.w - sofaW) / 2,
                top: floorY - 4,
                width: sofaW,
                height: 0.5 * pxPerFt,
                background: "radial-gradient(50% 50% at 50% 50%, rgba(60,52,42,0.28), rgba(60,52,42,0))",
              }}
            />

            {/* sofa — line art, 7 ft wide, centred under the artwork */}
            <SofaSvg
              className="absolute"
              style={{ left: (box.w - sofaW) / 2, top: floorY - sofaH, width: sofaW, height: sofaH, color: "#4a443c", opacity: 0.5 }}
            />

            {/* 5.5 ft figure — the same silhouette as the wallpaper visualiser */}
            <div
              className="absolute flex flex-col items-center"
              style={{ left: 0.55 * pxPerFt, top: floorY - silhouetteH }}
            >
              <ScaleFigure height={silhouetteH} style={{ color: "#4a443c", opacity: 0.45 }} />
              <span className="mt-0.5 whitespace-nowrap text-[0.62rem] font-medium" style={{ color: "#4a443c", opacity: 0.75 }}>
                {FIGURE_HEIGHT_FT} ft
              </span>
            </div>

            {/* potted plant — right edge */}
            <PlantSvg
              className="absolute"
              style={{ left: box.w - 0.5 * pxPerFt - plantW, top: floorY - plantH, width: plantW, height: plantH, color: "#4a443c", opacity: 0.4 }}
            />

            {/* dimension callouts — width above, height beside */}
            <div
              className="absolute flex items-center transition-all duration-300 ease-out"
              style={{ left: frameLeft, width: frameW, top: frameTop - 0.42 * pxPerFt }}
            >
              <span className="h-px flex-1" style={{ background: "rgba(74,68,60,0.45)" }} />
              <span className="whitespace-nowrap px-1.5 text-[0.64rem] font-semibold" style={{ color: "#4a443c" }}>
                {fmtIn(artWidthIn)}
              </span>
              <span className="h-px flex-1" style={{ background: "rgba(74,68,60,0.45)" }} />
            </div>
            <div
              className="absolute flex flex-col items-center transition-all duration-300 ease-out"
              style={{ left: frameLeft + frameW + 0.18 * pxPerFt, top: frameTop, height: frameH }}
            >
              <span className="w-px flex-1" style={{ background: "rgba(74,68,60,0.45)" }} />
              <span className="whitespace-nowrap py-1 text-[0.64rem] font-semibold" style={{ color: "#4a443c", writingMode: "vertical-rl" }}>
                {fmtIn(artHeightIn)}
              </span>
              <span className="w-px flex-1" style={{ background: "rgba(74,68,60,0.45)" }} />
            </div>

            {/* the canvas itself — true to scale, animated between sizes */}
            <div
              className="absolute cursor-move overflow-hidden transition-all duration-300 ease-out"
              style={{
                left: frameLeft,
                top: frameTop,
                width: frameW,
                height: frameH,
                touchAction: "none",
                borderRadius: 2,
                boxShadow:
                  "0 18px 38px -14px rgba(50,42,32,0.5), 0 5px 12px -4px rgba(50,42,32,0.28), inset 0 0 0 1px rgba(0,0,0,0.06)",
              }}
              onPointerDown={(e) => {
                panLast.current = { x: e.clientX, y: e.clientY };
                try {
                  (e.target as HTMLElement).setPointerCapture(e.pointerId);
                } catch {}
              }}
              onPointerMove={onPan}
              onPointerUp={() => (panLast.current = null)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={imageUrl}
                alt={imageAlt}
                draggable={false}
                onLoad={(e) => {
                  const w = e.currentTarget.naturalWidth;
                  const h = e.currentTarget.naturalHeight;
                  const a = w / h;
                  measuredFor.current = imageUrl;
                  setAspect(a);
                  onImageMeta({ aspect: a, sourceW: w, sourceH: h });
                }}
                className="absolute max-w-none transition-all duration-300 ease-out"
                style={
                  layout
                    ? {
                        width: layout.imgW,
                        height: layout.imgH,
                        left: -offsetX * (layout.imgW - frameW),
                        top: -offsetY * (layout.imgH - frameH),
                        transform: flipTransform,
                      }
                    : { inset: 0, width: "100%", height: "100%", objectFit: "cover", transform: flipTransform }
                }
              />
              {textureUrl && (
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    backgroundImage: `url(${textureUrl})`,
                    backgroundSize: "150px 150px",
                    backgroundRepeat: "repeat",
                    mixBlendMode: "soft-light",
                    opacity: 0.55,
                  }}
                />
              )}
              {/* gallery-wrap depth — a hint of the 1.5 in stretcher edge */}
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "linear-gradient(270deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0) 3.5%), linear-gradient(0deg, rgba(0,0,0,0.14) 0%, rgba(0,0,0,0) 3.5%), linear-gradient(90deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 3%)",
                }}
              />
              {frameW > 150 && (
                <span className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-charcoal/60 px-3 py-1.5 text-[0.66rem] font-semibold text-surface">
                  + Drag to reposition
                </span>
              )}
            </div>

            {/* full-artwork minimap — shows what the crop leaves out */}
            {aspect && miniRect && cropped && miniW > 0 && (
              <div className="absolute right-2 top-2 rounded-[10px] bg-charcoal/70 p-1.5 backdrop-blur-[2px]">
                <div className="relative overflow-hidden rounded-[6px]" style={{ width: miniW, height: miniH }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl}
                    alt=""
                    draggable={false}
                    className="absolute inset-0 h-full w-full object-cover"
                    style={{ transform: flipTransform, opacity: 0.55 }}
                  />
                  <div
                    className="absolute rounded-[2px] ring-1 ring-surface"
                    style={{
                      left: miniRect.x * miniW,
                      top: miniRect.y * miniH,
                      width: miniRect.w * miniW,
                      height: miniRect.h * miniH,
                    }}
                  />
                </div>
                <p className="mt-1 text-center text-[0.55rem] font-medium text-surface/85">Full artwork</p>
              </div>
            )}
          </>
        )}
      </div>

      {sizePicker && <div className="mt-3">{sizePicker}</div>}

      {/* zoom / crop scale */}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => onChange({ offsetX, offsetY, zoom: Math.max(1, Math.round((zoom - 0.1) * 100) / 100), flipH, flipV })}
          className="grid h-8 w-8 place-items-center rounded-full border border-edge bg-surface text-slate hover:text-charcoal"
        >
          &minus;
        </button>
        <input
          type="range"
          min={1}
          max={2.5}
          step={0.01}
          value={zoom}
          disabled={!ready}
          onChange={(e) => onChange({ offsetX, offsetY, zoom: parseFloat(e.target.value), flipH, flipV })}
          className="flex-1 accent-charcoal"
        />
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => onChange({ offsetX, offsetY, zoom: Math.min(2.5, Math.round((zoom + 0.1) * 100) / 100), flipH, flipV })}
          className="grid h-8 w-8 place-items-center rounded-full border border-edge bg-surface text-slate hover:text-charcoal"
        >
          +
        </button>
        <span className="w-20 text-right text-xs font-medium text-slate tabular-nums">
          Scale: {scalePercent(zoom)}%
        </span>
      </div>

      {/* flip / mirror */}
      <div className="mt-2 flex items-center gap-2">
        <span className="text-xs text-mist">Flip</span>
        <button
          type="button"
          disabled={!ready}
          aria-pressed={flipH}
          onClick={() => onChange({ offsetX, offsetY, zoom, flipH: !flipH, flipV })}
          className={`rounded-[10px] border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 ${
            flipH ? "border-charcoal bg-charcoal text-surface" : "border-edge text-slate hover:border-charcoal hover:text-charcoal"
          }`}
        >
          ⇄ Horizontal
        </button>
        <button
          type="button"
          disabled={!ready}
          aria-pressed={flipV}
          onClick={() => onChange({ offsetX, offsetY, zoom, flipH, flipV: !flipV })}
          className={`rounded-[10px] border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 ${
            flipV ? "border-charcoal bg-charcoal text-surface" : "border-edge text-slate hover:border-charcoal hover:text-charcoal"
          }`}
        >
          ⇅ Vertical
        </button>
        {(flipH || flipV) && (
          <button
            type="button"
            onClick={() => onChange({ offsetX, offsetY, zoom, flipH: false, flipV: false })}
            className="ml-auto text-xs font-semibold text-slate underline underline-offset-2 hover:text-charcoal"
          >
            Reset flip
          </button>
        )}
      </div>

      {ready && (
        <p className="mt-2 text-center text-xs text-slate">
          {fmtIn(artWidthIn)} wide &times; {fmtIn(artHeightIn)} tall, hung at gallery eye level on a{" "}
          {WALL_W_FT} ft &times; {WALL_H_FT} ft wall
        </p>
      )}
    </div>
  );
}
