"use client";

import { TextOverlayLayer } from "./TextOverlayEditor";
import type { TextOverlay } from "@/lib/text-overlay";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { coverLayout, scalePercent, tileSpan, type SeamlessSpec } from "@/lib/visualizer";
import { dragOffsetCm, isHeadboard } from "@/lib/openings";
import { CM_PER_FOOT } from "@/lib/pricing";
import { FIGURE_HEIGHT_FT, ScaleFigure, figureWidth } from "@/components/ScaleFigure";

// The sharp "wall frame" occupies this fraction of the viewport, centered —
// the rest of the viewport shows the same design blurred/dimmed, at true
// relative scale, so the customer can see how much of the mural is being
// cropped and how it looks zoomed/panned before committing.
const FRAME_SCALE = 0.68;

/**
 * Inline "Size & Design Visualiser" — the primary sales tool. Shows the FLAT
 * mural at true scale against the wall, with the exact wall-sized crop framed
 * sharp against a blurred/dimmed full view of the design (so the customer can
 * see what's being cropped out), a human-height silhouette for scale, and
 * drag-to-reposition + zoom-for-pattern-scale controls. Emits the same
 * normalised offsetX/offsetY/zoom crop model used by the room visualiser, the
 * order (crop_data) and the print pipeline — what's framed here is exactly
 * what prints.
 */
export function DesignVisualizer({
  textOverlay, textOverlayUrl = "", companionUrl = "", onTextOverlayChange,
  imageUrl,
  imageAlt,
  wallWidthCm,
  seamless = null,
  wallHeightCm,
  offsetX,
  offsetY,
  zoom,
  flipH = false,
  flipV = false,
  doors = [],
  onDoorMove,
  divisions = [],
  textureUrl,
  isCanvas = false,
  showScaleFigure = true,
  heading = "1 · Size & design visualiser",
  guided = false,
  onChange,
  onImageMeta,
}: {
  textOverlay?: TextOverlay | null;
  textOverlayUrl?: string;
  companionUrl?: string;
  onTextOverlayChange?: (o: TextOverlay) => void;
  imageUrl: string;
  imageAlt: string;
  wallWidthCm: number;
  /** Seamless tile: repeats at a fixed physical size instead of one copy being
   *  fitted to the frame. Must match the room visualiser or the two previews
   *  of the same design would disagree. */
  seamless?: SeamlessSpec | null;
  wallHeightCm: number;
  offsetX: number;
  offsetY: number;
  zoom: number;
  flipH?: boolean;
  flipV?: boolean;
  /** wall-fixed planning overlays (positions in cm from the wall's left edge;
   *  sillCm lifts a window off the floor) */
  doors?: { widthCm: number; heightCm: number; offsetCm: number; sillCm?: number; kind?: "headboard" }[];
  /** A headboard on the preview can be dragged (or arrow-keyed) along the
   *  floor; this reports its new distance from the left, already clamped. */
  onDoorMove?: (index: number, offsetCm: number) => void;
  divisions?: number[];
  textureUrl?: string | null;
  /** Canvas art is a finished piece, not a wall covering — the copy says so. */
  isCanvas?: boolean;
  /** The 5.5 ft silhouette sells scale in a HOME. In-store branding (a rack
   *  band in a partner showroom) has no person standing against it — off. */
  showScaleFigure?: boolean;
  /** The component's own step heading. Null where the host already titles the
   *  block — the partner order form does, and its steps are numbered
   *  differently, so a hardcoded "1 ·" there is a duplicate AND wrong. */
  heading?: string | null;
  guided?: boolean;
  onChange: (next: { offsetX: number; offsetY: number; zoom: number; flipH: boolean; flipV: boolean }) => void;
  onImageMeta: (meta: { aspect: number; sourceW: number; sourceH: number }) => void;
}) {
  const [aspect, setAspect] = useState<number | null>(null);
  // Measured from the DOM as well as from onLoad. A cached image is already
  // decoded before React attaches the handler, so its load event has fired and
  // will never fire again — leaving `aspect` null forever. For a normal design
  // that degrades quietly to an object-cover fallback; for a seamless one it
  // means no tiling at all, i.e. silently the very single-scaled-copy bug this
  // feature exists to remove. Measure on mount and never rely on the event.
  const imgRef = useRef<HTMLImageElement | null>(null);
  const measuredFor = useRef<string | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 }); // outer viewport (blurred context)
  const roRef = useRef<ResizeObserver | null>(null);
  const panLast = useRef<{ x: number; y: number } | null>(null);
  const markDrag = useRef<{ index: number; x: number; startCm: number } | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);

  const ready = wallWidthCm > 0 && wallHeightCm > 0;
  const wallAspect = ready ? wallWidthCm / wallHeightCm : 1;
  // Mirror the design in place (kept centre-origin so the crop window is
  // preserved — the customer just sees the flipped artwork and can re-drag).
  const flipTransform = `scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`;
  const wallWidthFt = wallWidthCm / CM_PER_FOOT;
  const wallHeightFt = wallHeightCm / CM_PER_FOOT;

  // A CALLBACK ref, not an effect: this component renders two different shapes
  // (the framed view below, and the long-run strip view which returns early),
  // and an effect keyed on `ready` never re-ran when the shape changed — the
  // observer stayed attached to nothing, box stayed 0×0, and the frame drew at
  // zero width, i.e. a black box. Attaching here means the observer follows the
  // node whenever it mounts, whichever branch rendered it.
  const wrapRef = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    roRef.current = null;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect;
      setBox({ w: r.width, h: r.height });
    });
    ro.observe(el);
    roRef.current = ro;
  }, []);

  // The sharp frame — the actual wall-sized crop window, centered in the viewport.
  const frameScale = guided ? .92 : FRAME_SCALE;
  const frameW = Math.min(box.w * frameScale, box.h * frameScale * wallAspect);
  const frameH = frameW / wallAspect;
  const frameLeft = (box.w - frameW) / 2;
  const frameTop = (box.h - frameH) / 2;
  // Wall-fixed overlay scale: the frame IS the wall, so cm → px is frame/wall.
  const pxPerCmX = ready && wallWidthCm > 0 ? frameW / wallWidthCm : 0;
  const pxPerCmY = ready && wallHeightCm > 0 ? frameH / wallHeightCm : 0;

  const layout = useMemo(
    () => (aspect && frameW > 0 ? coverLayout(frameW, frameH, aspect, zoom) : null),
    [aspect, frameW, frameH, zoom],
  );
  const bgLayout = useMemo(
    () => (aspect && box.w > 0 ? coverLayout(box.w, box.h, aspect, zoom) : null),
    [aspect, box.w, box.h, zoom],
  );
  // One tile's footprint inside the frame. The frame IS the wall here, so the
  // repeat lands at true scale against the door and division overlays.
  const tile = useMemo(
    () =>
      seamless?.repeatWidthCm && aspect && frameW > 0
        ? tileSpan(frameW, wallWidthCm, aspect, seamless.repeatWidthCm)
        : null,
    [seamless?.repeatWidthCm, aspect, frameW, wallWidthCm],
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

  const silhouetteH = ready ? (FIGURE_HEIGHT_FT / wallHeightFt) * frameH : 0;
  // A band-sized run (rack strips, fascia panels — anything shorter than the
  // person) makes the figure absurd: a 5.5 ft outline towering over a 2.5 ft
  // strip reads as an error, not a scale cue. No figure below person height.
  const bandSized = ready && wallHeightFt < FIGURE_HEIGHT_FT;
  const fmtFt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

  // A long run — a 128 ft × 3.4 ft band is 37:1 — is unreadable in a
  // true-aspect box: it collapses to a couple of dozen pixels high. And there
  // is nothing to drag, because band artwork is composed to exactly this run,
  // so no crop is being chosen. Such a run keeps a FIXED, generous viewing
  // height whatever its proportions, and travels left-right instead. Ordinary
  // walls keep the framed view.
  const STRIP_ASPECT = 4;
  const STRIP_H = 440;
  const nudge = (dir: -1 | 1) => {
    const el = stripRef.current;
    if (!el) return;
    const from = el.scrollLeft;
    const to = Math.max(0, Math.min(el.scrollWidth - el.clientWidth, from + dir * el.clientWidth * 0.8));
    el.scrollTo({ left: to, behavior: "smooth" });
    // Smooth scrolling silently does nothing in some embedded/reduced-motion
    // contexts, which would read as a dead arrow. If nothing moved, snap.
    window.setTimeout(() => {
      if (stripRef.current && stripRef.current.scrollLeft === from && from !== to) {
        stripRef.current.scrollLeft = to;
      }
    }, 250);
  };
  if (!guided && !textOverlay && ready && wallAspect > STRIP_ASPECT) {
    return (
      <div>
        {heading !== null && <p className="caps mb-1 text-slate">{heading}</p>}
        <p className="mb-3 text-xs text-slate">
          A long run, shown at full height — travel along it with the arrows (or drag/scroll sideways).
          The design is fitted to the band&apos;s height and repeats along its length, exactly as it prints.
        </p>

        <div ref={stripRef}
          className="w-full overflow-x-auto overscroll-x-contain rounded-[16px] bg-charcoal">
          {/* Height is FIXED — the run gets longer, never shorter — and the
              width follows the wall's true proportions.
              The design TILES along the run rather than being stretched to fit
              it. Stretching (objectFit:fill) turned a 4:1 creative on a 16:1
              band into a smeared enlargement; the band actually prints as
              repeats, so `auto 100%` + repeat-x is both undistorted and what
              comes off the roll. A built band composite already matches the
              band's aspect, so it lands as exactly one repeat. */}
          <div
            className="relative"
            style={{
              height: STRIP_H,
              width: STRIP_H * wallAspect,
              backgroundImage: `url(${imageUrl})`,
              backgroundSize: "auto 100%",
              backgroundRepeat: "repeat-x",
              backgroundPosition: "left center",
              transform: flipTransform,
            }}
            role="img"
            aria-label={imageAlt}
          />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" aria-label="Travel left along the run" onClick={() => nudge(-1)}
            className="h-9 w-9 rounded-full border border-edge text-sm hover:border-slate">←</button>
          <button type="button" aria-label="Travel right along the run" onClick={() => nudge(1)}
            className="h-9 w-9 rounded-full border border-edge text-sm hover:border-slate">→</button>
          <span className="ml-2 text-xs text-slate">Flip</span>
          <button type="button" onClick={() => onChange({ offsetX, offsetY, zoom, flipH: !flipH, flipV })}
            className={`rounded-full border px-3 py-1 text-xs ${flipH ? "border-charcoal bg-charcoal text-white" : "border-edge"}`}>
            ⇄ Horizontal
          </button>
          <button type="button" onClick={() => onChange({ offsetX, offsetY, zoom, flipH, flipV: !flipV })}
            className={`rounded-full border px-3 py-1 text-xs ${flipV ? "border-charcoal bg-charcoal text-white" : "border-edge"}`}>
            ⇅ Vertical
          </button>
        </div>
        <p className="mt-2 text-center text-xs text-slate">
          {fmtFt(wallWidthFt)} ft wide × {fmtFt(wallHeightFt)} ft tall
        </p>
      </div>
    );
  }

  return (
    <div id="wall-preview" className="scroll-mt-36">
      {heading !== null && <p className="caps mb-1 text-slate">{heading}</p>}
      <p className="mb-3 text-xs text-slate">
        {isCanvas
          ? "See how the artwork sits in the finished canvas. Drag to reposition. Zoom to set the crop."
          : "See which part of the design fills your wall. Drag to reposition. Zoom to set pattern scale."}
      </p>

      <div
        ref={wrapRef}
        className="relative w-full select-none overflow-hidden rounded-[16px] bg-charcoal"
        style={{ aspectRatio: `${wallAspect}` }}
      >
        {/* blurred/dimmed full design — shows what's being cropped out */}
        {bgLayout && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            draggable={false}
            className="absolute max-w-none"
            style={{
              width: bgLayout.imgW,
              height: bgLayout.imgH,
              left: -offsetX * (bgLayout.imgW - box.w),
              top: -offsetY * (bgLayout.imgH - box.h),
              transform: flipTransform,
              filter: "blur(10px) brightness(0.5) saturate(0.85)",
            }}
          />
        )}

        {/* human-height silhouette, for a real sense of scale — a faint,
            correctly-proportioned outline, not a stretched fill. Its bottom
            edge is the sole of the foot, so it stands on the frame's floor. */}
        {showScaleFigure && !bandSized && ready && silhouetteH > 4 && (
          <div
            className="absolute flex flex-col items-center"
            style={{
              left: Math.max(8, frameLeft - figureWidth(silhouetteH) - 10),
              top: frameTop + frameH - silhouetteH,
            }}
          >
            <ScaleFigure height={silhouetteH} className="text-surface/70" />
            <span className="mt-1 whitespace-nowrap text-[0.65rem] font-medium text-surface/80">
              {FIGURE_HEIGHT_FT} ft
            </span>
          </div>
        )}

        {/* the sharp wall frame — exactly what prints */}
        <div
          className="absolute cursor-move overflow-hidden rounded-[6px] ring-2 ring-surface/90"
          style={{ left: frameLeft, top: frameTop, width: frameW, height: frameH, touchAction: "none" }}
          onPointerDown={(e) => {
            if (!ready) return;
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
            alt={tile ? "" : imageAlt}
            aria-hidden={tile ? true : undefined}
            draggable={false}
            onLoad={(e) => {
              const w = e.currentTarget.naturalWidth;
              const h = e.currentTarget.naturalHeight;
              const a = w / h;
              measuredFor.current = imageUrl;
              setAspect(a);
              onImageMeta({ aspect: a, sourceW: w, sourceH: h });
            }}
            className={tile ? "pointer-events-none absolute h-px w-px opacity-0" : "absolute max-w-none"}
            style={
              tile
                ? undefined
                : layout
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
          {/* Seamless: background-repeat IS the tiling. Flip is not applied —
              mirroring a tile breaks the seam it butts against. */}
          {tile && (
            <div
              role="img"
              aria-label={imageAlt}
              className="absolute inset-0"
              style={{
                backgroundImage: `url(${imageUrl})`,
                backgroundRepeat: "repeat",
                backgroundSize: `${tile.tileW}px ${tile.tileH}px`,
                backgroundPosition: `${-offsetX * tile.tileW}px ${-offsetY * tile.tileH}px`,
              }}
            />
          )}
          {textOverlay && textOverlayUrl && <TextOverlayLayer overlay={textOverlay} url={textOverlayUrl}
            wallWidthCm={wallWidthCm} wallHeightCm={wallHeightCm} onChange={onTextOverlayChange} />}
          {textOverlay?.companion && companionUrl && <TextOverlayLayer overlay={textOverlay.companion} url={companionUrl}
            wallWidthCm={wallWidthCm} wallHeightCm={wallHeightCm} onChange={o => onTextOverlayChange?.({ ...textOverlay, companion: o })} />}
          {/* material finish grain — overlaid on the mural so the chosen
              texture (a textured finish) is visible on the wall; clean finishes
              pass no textureUrl and this is skipped. */}
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
          {/* wall-fixed planning overlays — NOT panned or flipped: they mark
              real features of the wall, drawn over the design so the customer
              can drag focal art clear of them. The mural still prints full. */}
          {divisions.map((cm, i) => (
            <div
              key={`div-${i}`}
              className="pointer-events-none absolute bottom-0 top-0 w-0 border-l-2 border-dashed border-red-500/80"
              style={{ left: cm * pxPerCmX }}
            >
              <span className="absolute left-1 top-0.5 whitespace-nowrap text-[0.5rem] font-bold text-red-500">
                JOIN
              </span>
            </div>
          ))}
          {doors.map((d, i) => {
            const rect = { left: d.offsetCm * pxPerCmX, bottom: (d.sillCm ?? 0) * pxPerCmY, width: d.widthCm * pxPerCmX, height: d.heightCm * pxPerCmY };
            if (!isHeadboard(d) || !onDoorMove) {
              return (
                <div
                  key={`door-${i}`}
                  className="pointer-events-none absolute flex items-start justify-center border-2 border-charcoal/70 bg-surface/55 backdrop-blur-[1px]"
                  style={rect}
                >
                  <span className="mt-0.5 text-[0.5rem] font-bold text-charcoal/80">{isHeadboard(d) ? "HEADBOARD" : (d.sillCm ?? 0) > 0 ? "WINDOW" : "DOOR"} {i + 1}</span>
                </div>
              );
            }
            // A headboard slides along the floor: its own pointer capture so
            // dragging it never pans the artwork underneath, and arrow keys
            // (0.1 ft, 1 ft with Shift) for anyone not using a pointer.
            const moveTo = (cm: number) => onDoorMove(i, dragOffsetCm(cm, 0, 1, d.widthCm, wallWidthCm));
            return (
              <div
                key={`door-${i}`}
                role="slider"
                tabIndex={0}
                aria-label={`Headboard ${i + 1} distance from the left`}
                aria-valuemin={0}
                aria-valuemax={Math.round(Math.max(0, wallWidthCm - d.widthCm))}
                aria-valuenow={Math.round(d.offsetCm)}
                aria-valuetext={`${(d.offsetCm / CM_PER_FOOT).toFixed(1)} ft from the left`}
                data-headboard={i}
                className="absolute flex cursor-ew-resize select-none items-start justify-center border-2 border-charcoal/80 bg-surface/60 outline-none backdrop-blur-[1px] focus-visible:ring-2 focus-visible:ring-charcoal"
                style={{ ...rect, touchAction: "none" }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  markDrag.current = { index: i, x: e.clientX, startCm: d.offsetCm };
                  try {
                    e.currentTarget.setPointerCapture(e.pointerId);
                  } catch {}
                }}
                onPointerMove={(e) => {
                  const m = markDrag.current;
                  if (!m || m.index !== i) return;
                  e.stopPropagation();
                  onDoorMove(i, dragOffsetCm(m.startCm, e.clientX - m.x, pxPerCmX, d.widthCm, wallWidthCm));
                }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  markDrag.current = null;
                }}
                onPointerCancel={() => (markDrag.current = null)}
                onLostPointerCapture={() => (markDrag.current = null)}
                onKeyDown={(e) => {
                  const step = (e.shiftKey ? 1 : 0.1) * CM_PER_FOOT;
                  if (e.key === "ArrowLeft" || e.key === "ArrowDown") moveTo(d.offsetCm - step);
                  else if (e.key === "ArrowRight" || e.key === "ArrowUp") moveTo(d.offsetCm + step);
                  else if (e.key === "Home") moveTo(0);
                  else if (e.key === "End") moveTo(wallWidthCm);
                  else return;
                  e.preventDefault();
                }}
              >
                <span className="pointer-events-none mt-0.5 whitespace-nowrap text-[0.5rem] font-bold text-charcoal/80">↔ HEADBOARD</span>
              </div>
            );
          })}

          {ready && (
            <span className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-charcoal/70 px-3 py-1.5 text-[0.68rem] font-semibold text-surface">
              + Drag to reposition
            </span>
          )}
        </div>

        {!ready && (
          <div className="absolute inset-0 grid place-items-center px-4 text-center text-xs text-surface/80">
            Enter your wall dimensions below to frame your design.
          </div>
        )}
      </div>

      {/* zoom / pattern scale */}
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

      {/* flip / mirror — turn the design left↔right or top↔bottom so it faces
          the way the room wants (e.g. a scene should open toward the window). */}
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
        {(flipH || flipV || zoom !== 1 || offsetX !== 0.5 || offsetY !== 0.5) && (
          <button
            type="button"
            onClick={() => onChange({ offsetX: 0.5, offsetY: 0.5, zoom: 1, flipH: false, flipV: false })}
            className="ml-auto text-xs font-semibold text-slate underline underline-offset-2 hover:text-charcoal"
          >
            Reset composition
          </button>
        )}
      </div>

      {ready && (
        <div className="mt-2 text-center text-xs text-slate">
          <p>{fmtFt(wallWidthFt)} ft wide &times; {fmtFt(wallHeightFt)} ft tall — drag to reposition, zoom to set scale</p>
          <p className="mt-1">Only the artwork inside the wall frame is included. Dimmed artwork outside it is cropped away.</p>
        </div>
      )}
    </div>
  );
}
