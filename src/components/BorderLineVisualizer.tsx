"use client";

// "Draw a line on your wall" — the room visualiser for the LENGTH family.
//
// A mural needs four corners because the customer is mapping a whole wall
// plane. A border does not: it runs ALONG a line. So this asks for exactly
// two handles — where the run starts, where it ends — and lays the design's
// seamless repeat down that line in perspective.
//
// The band is a quad, not a rotated rectangle: its two ends get independent
// heights, which is what makes a run receding down a hallway read as real
// depth rather than a sticker. That quad goes through the same homography
// (quadTransform / quadMapper) the mural visualiser uses, so a border and a
// wallpaper photographed on the same wall agree about perspective.
//
// Nothing here touches what is ordered — a border has no crop and no custom
// size. This is purely "can I picture it?", plus a downloadable image, which
// is the thing people actually share.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sendTasteSignal } from "@/components/TasteSignal";
import { quadTransform, quadMapper, type Point } from "@/lib/homography";
import { drawTriangle, loadImage } from "@/lib/warp";
import { toMediaUrl, isMediaUrl, mediaRendition } from "@/lib/media-url";

/** Untransformed band length in px — the local box the repeat tiles across. */
const BAND_W = 1200;
const CM_PER_M = 100;

type Ends = [Point, Point]; // start, end — fractions of the photo box

const DEFAULT_ENDS: Ends = [
  { x: 0.1, y: 0.42 },
  { x: 0.9, y: 0.42 },
];

const SAMPLE_ENDS: Ends = [
  { x: 0.06, y: 0.3 },
  { x: 0.94, y: 0.3 },
];

function capture(e: React.PointerEvent) {
  try {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  } catch {
    /* pointer already gone — drag still works via element events */
  }
}

export function BorderLineVisualizer({
  open,
  onClose,
  imageUrl,
  imageAlt,
  productTitle,
  productHandle,
  heightCm,
  metres,
}: {
  open: boolean;
  onClose: () => void;
  /** The clean flat repeat — the artwork that actually prints. */
  imageUrl: string;
  imageAlt: string;
  productTitle: string;
  productHandle: string;
  /** The border's real height, for the true-scale readout. */
  heightCm: number | null;
  /** Metres in the set being previewed, for the run-length readout. */
  metres: number;
}) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [ends, setEnds] = useState<Ends>(DEFAULT_ENDS);
  // Band thickness at each end, as a fraction of the photo's height. Two
  // values, not one: a run going away from the camera is thinner at the far
  // end, and that difference is the whole illusion.
  const [thickStart, setThickStart] = useState(0.055);
  const [thickEnd, setThickEnd] = useState(0.055);
  const [linked, setLinked] = useState(true);
  const [blend, setBlend] = useState(true);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [imgAspect, setImgAspect] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cameraFileRef = useRef<HTMLInputElement | null>(null);
  const objectUrl = useRef<string | null>(null);
  const dragEnd = useRef<number | null>(null);
  const signalSent = useRef(false);
  // The hidden measuring <img> below is frequently already cached (the same
  // design image usually just loaded elsewhere on the page), so its onLoad
  // has already fired and will never fire again — leaving imgAspect null and
  // the repeat-count readout permanently blank. Measure on mount too.
  const aspectImgRef = useRef<HTMLImageElement | null>(null);
  const aspectMeasuredFor = useRef<string | null>(null);

  // Placing a design on a real room photo is the strongest browse-stage
  // interest signal we have — recorded once per session, real photos only.
  useEffect(() => {
    if (!open) {
      signalSent.current = false;
      return;
    }
    if (!signalSent.current && photo && photo !== "sample") {
      signalSent.current = true;
      sendTasteSignal(productHandle, "visualize");
    }
  }, [open, photo, productHandle]);

  // The wrapper is sized by its content (the photo or the sample drawing), so
  // it measures 0 until that content lays out — and a ResizeObserver's first
  // callback can't be relied on for the initial value (some embedded browsers
  // never deliver it). Poll frames until the box is real, then let the
  // observer handle everything after.
  useEffect(() => {
    if (!open || !photo) return;
    const el = wrapRef.current;
    if (!el) return;
    let raf = 0;
    let tries = 0;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) {
        setBox({ w, h });
        return;
      }
      if (tries++ < 60) raf = requestAnimationFrame(measure);
    };
    measure();
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      if (width > 0 && height > 0) setBox({ w: width, h: height });
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [open, photo]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(
    () => () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );

  const pickFile = (f: File | undefined) => {
    if (!f || !f.type.startsWith("image/")) return;
    // No auth gate and no upload: unlike the mural visualiser, this never
    // sends the room photo anywhere — there's no wall segmentation to run, so
    // the photo stays in the browser and the tool stays frictionless.
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = URL.createObjectURL(f);
    setPhoto(objectUrl.current);
    setEnds(DEFAULT_ENDS);
  };

  // The band quad, in photo-box pixels. Each end contributes a segment
  // perpendicular to the run, at its own thickness; the four endpoints of
  // those two segments are the quad the repeat is warped into.
  const quad = useMemo(() => {
    if (box.w === 0) return null;
    const p0 = { x: ends[0].x * box.w, y: ends[0].y * box.h };
    const p1 = { x: ends[1].x * box.w, y: ends[1].y * box.h };
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) return null;
    // Unit normal to the run — the direction "down the face of the border".
    const nx = -dy / len;
    const ny = dx / len;
    const h0 = thickStart * box.h;
    const h1 = thickEnd * box.h;
    // The drawn line is the band's TOP edge, so the quad hangs below it — a
    // customer drawing along their ceiling line expects the border under it.
    return {
      tl: p0,
      tr: p1,
      br: { x: p1.x + nx * h1, y: p1.y + ny * h1 },
      bl: { x: p0.x + nx * h0, y: p0.y + ny * h0 },
      len,
      h0,
    };
  }, [ends, box, thickStart, thickEnd]);

  // Local band box: BAND_W long, with the height that keeps the START end's
  // aspect honest, so the repeat isn't stretched before the warp gets it.
  const bandH = quad && quad.len > 0 ? Math.max(1, (quad.h0 / quad.len) * BAND_W) : 1;

  const matrix = useMemo(
    () => (quad ? quadTransform(BAND_W, bandH, quad.tl, quad.tr, quad.br, quad.bl) : null),
    [quad, bandH],
  );

  // How many times the repeat tiles across the run — the same number the
  // rendered background-size produces, surfaced so the preview can be honest
  // about scale rather than just looking plausible.
  const tileW = imgAspect ? bandH * imgAspect : null;
  const repeats = tileW ? quad && BAND_W / tileW : null;

  useEffect(() => {
    if (aspectMeasuredFor.current === imageUrl) return;
    const el = aspectImgRef.current;
    if (!el?.complete || !el.naturalWidth || !el.naturalHeight) return;
    aspectMeasuredFor.current = imageUrl;
    setImgAspect(el.naturalWidth / el.naturalHeight);
  });

  const moveEnd = useCallback((i: number, e: PointerEvent | React.PointerEvent) => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = Math.min(0.99, Math.max(0.01, (e.clientX - r.left) / r.width));
    const y = Math.min(0.99, Math.max(0.01, (e.clientY - r.top) / r.height));
    setEnds((cur) => cur.map((p, j) => (j === i ? { x, y } : p)) as Ends);
  }, []);

  const setThickness = (which: "start" | "end", v: number) => {
    const clamped = Math.min(0.25, Math.max(0.01, v));
    if (linked) {
      setThickStart(clamped);
      setThickEnd(clamped);
    } else if (which === "start") setThickStart(clamped);
    else setThickEnd(clamped);
  };

  /** Rasterise photo + warped border to a JPEG the customer can keep/share. */
  const download = async () => {
    if (!photo || !quad) return;
    setDownloading(true);
    try {
      const bg = await loadImage(photo);
      const PW = 1600;
      const bgAspect = bg.naturalWidth / bg.naturalHeight || box.w / Math.max(box.h, 1) || 1.5;
      const PH = Math.round(PW / bgAspect);
      const canvas = document.createElement("canvas");
      canvas.width = PW;
      canvas.height = PH;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(bg, 0, 0, PW, PH);

      // Supabase's render CDN sends Access-Control-Allow-Origin: *, so the
      // canvas stays untainted and toDataURL works — same approach as the
      // mural visualiser's composite export.
      const mapped = toMediaUrl(imageUrl);
      const proxied = isMediaUrl(mapped)
        ? mediaRendition(mapped, 1920)
        : imageUrl.startsWith("http") && imageUrl.includes("/storage/v1/object/public/")
          ? `${imageUrl.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/")}${
              imageUrl.includes("?") ? "&" : "?"
            }width=1920&quality=80&resize=contain`
          : imageUrl;
      const strip = await loadImage(proxied, proxied.startsWith("http"));

      // Rebuild the quad at export resolution rather than scaling the on-screen
      // one, so the download matches the preview exactly at any window size.
      const s = (p: Point) => ({ x: (p.x / box.w) * PW, y: (p.y / box.h) * PH });
      const map = quadMapper(BAND_W, bandH, s(quad.tl), s(quad.tr), s(quad.br), s(quad.bl));
      if (!map) return;

      const bandCanvas = document.createElement("canvas");
      bandCanvas.width = PW;
      bandCanvas.height = PH;
      const bctx = bandCanvas.getContext("2d");
      if (!bctx) return;

      // Tile the repeat across the local band box, then warp that box.
      const tiled = document.createElement("canvas");
      tiled.width = BAND_W;
      tiled.height = Math.max(1, Math.round(bandH));
      const tctx = tiled.getContext("2d");
      if (!tctx) return;
      const tw = (strip.naturalWidth / strip.naturalHeight) * tiled.height;
      for (let x = 0; x < BAND_W; x += tw) tctx.drawImage(strip, x, 0, tw, tiled.height);

      const N = 40; // along the run only — the band is thin, so 1 row suffices
      for (let i = 0; i < N; i++) {
        const u0 = (i / N) * BAND_W;
        const u1 = ((i + 1) / N) * BAND_W;
        const s00 = { x: u0, y: 0 }, s10 = { x: u1, y: 0 };
        const s11 = { x: u1, y: tiled.height }, s01 = { x: u0, y: tiled.height };
        const d00 = map(u0, 0), d10 = map(u1, 0);
        const d11 = map(u1, bandH), d01 = map(u0, bandH);
        drawTriangle(bctx, tiled, s00, s10, s11, d00, d10, d11);
        drawTriangle(bctx, tiled, s00, s11, s01, d00, d11, d01);
      }

      ctx.globalCompositeOperation = blend ? "multiply" : "source-over";
      ctx.drawImage(bandCanvas, 0, 0);
      ctx.globalCompositeOperation = "source-over";

      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/jpeg", 0.9);
      a.download = `${productHandle}-on-my-wall.jpg`;
      a.click();
    } catch (e) {
      console.warn("border composite render failed:", e);
    } finally {
      setDownloading(false);
    }
  };

  if (!open) return null;

  const px = box.w > 0 ? (ends.map((p) => ({ x: p.x * box.w, y: p.y * box.h })) as Ends) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-charcoal/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] bg-cloud shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-edge px-6 py-4">
          <div>
            <h2 className="font-display text-lg font-bold">Draw it on your wall</h2>
            <p className="text-xs text-slate">
              {productTitle}
              {heightCm ? ` · ${heightCm} cm tall` : ""} · your photo stays on your device
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-10 w-10 place-items-center rounded-full text-slate transition-colors hover:bg-wash hover:text-charcoal"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {!photo ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <button
                onClick={() => cameraFileRef.current?.click()}
                className="flex aspect-[4/3] flex-col items-center justify-center gap-3 rounded-[22px] border-2 border-charcoal bg-surface text-center transition-colors hover:bg-wash"
              >
                <span className="grid h-14 w-14 place-items-center rounded-full bg-charcoal text-surface">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13.5" r="3.4" /></svg>
                </span>
                <span className="font-display text-base font-bold">Take a photo</span>
                <span className="max-w-[26ch] text-xs text-slate">Snap the wall, hallway or stairs.</span>
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                className="flex aspect-[4/3] flex-col items-center justify-center gap-3 rounded-[22px] border-2 border-dashed border-edge bg-surface text-center transition-colors hover:border-charcoal"
              >
                <span className="grid h-14 w-14 place-items-center rounded-full bg-lavender/60">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M12 16V5m0 0-4 4m4-4 4 4" /><path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" /></svg>
                </span>
                <span className="font-display text-base font-bold">Upload a photo</span>
                <span className="max-w-[26ch] text-xs text-slate">Any photo of the room you have.</span>
              </button>
              <button
                onClick={() => {
                  setPhoto("sample");
                  setEnds(SAMPLE_ENDS);
                }}
                className="flex aspect-[4/3] flex-col items-center justify-center gap-3 rounded-[22px] bg-sage/40 text-center transition-colors hover:bg-sage/60"
              >
                <span className="grid h-14 w-14 place-items-center rounded-full bg-surface/80">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M3 10.5 12 4l9 6.5" /><path d="M5 9.5V20h14V9.5" /></svg>
                </span>
                <span className="font-display text-base font-bold">Try a sample hallway</span>
                <span className="max-w-[26ch] text-xs text-slate">No photo handy? Use ours.</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <p className="text-center text-xs text-slate">
                Drag the two <span className="font-semibold text-charcoal">round handles</span> to where the border should
                start and end. The band hangs below the line — thin the far end to match the room&apos;s perspective.
              </p>

              <div ref={wrapRef} className="relative inline-block max-w-full select-none overflow-hidden rounded-[18px]">
                {photo === "sample" ? (
                  <SampleHallway />
                ) : (
                  // object-URL photo; next/image can't optimise blobs
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} alt="Your room" className="block max-h-[52vh] w-auto max-w-full" draggable={false} />
                )}

                {/* the border, warped into the band quad */}
                {matrix && (
                  <div
                    className="pointer-events-none absolute left-0 top-0"
                    style={{
                      width: BAND_W,
                      height: bandH,
                      transformOrigin: "0 0",
                      transform: matrix,
                      mixBlendMode: blend ? "multiply" : "normal",
                      backgroundImage: `url(${imageUrl})`,
                      backgroundRepeat: "repeat-x",
                      backgroundSize: "auto 100%",
                    }}
                  />
                )}

                {/* the run itself — a dashed guide between the handles */}
                {px && (
                  <svg className="pointer-events-none absolute inset-0 h-full w-full">
                    <line
                      x1={px[0].x}
                      y1={px[0].y}
                      x2={px[1].x}
                      y2={px[1].y}
                      stroke="rgba(255,255,255,0.85)"
                      strokeWidth="1.5"
                      strokeDasharray="6 5"
                    />
                  </svg>
                )}

                {px?.map((p, i) => (
                  <button
                    key={i}
                    aria-label={i === 0 ? "Border start" : "Border end"}
                    className="absolute z-10 h-7 w-7 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-charcoal bg-surface shadow-md active:cursor-grabbing"
                    style={{ left: p.x, top: p.y, touchAction: "none" }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      dragEnd.current = i;
                      capture(e);
                    }}
                    onPointerMove={(e) => {
                      if (dragEnd.current === i) moveEnd(i, e);
                    }}
                    onPointerUp={() => (dragEnd.current = null)}
                  />
                ))}

                {/* measure the repeat off the rendered artwork */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={aspectImgRef}
                  src={imageUrl}
                  alt=""
                  className="hidden"
                  onLoad={(e) => {
                    aspectMeasuredFor.current = imageUrl;
                    setImgAspect(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight);
                  }}
                />
              </div>

              <div className="flex w-full flex-wrap items-center justify-center gap-x-6 gap-y-3">
                <label className="flex items-center gap-3 text-xs font-medium text-slate">
                  {linked ? "Height" : "Near end"}
                  <input
                    type="range"
                    min={0.01}
                    max={0.25}
                    step={0.002}
                    value={thickStart}
                    onChange={(e) => setThickness("start", parseFloat(e.target.value))}
                    className="w-28 accent-charcoal"
                  />
                </label>
                {!linked && (
                  <label className="flex items-center gap-3 text-xs font-medium text-slate">
                    Far end
                    <input
                      type="range"
                      min={0.01}
                      max={0.25}
                      step={0.002}
                      value={thickEnd}
                      onChange={(e) => setThickness("end", parseFloat(e.target.value))}
                      className="w-28 accent-charcoal"
                    />
                  </label>
                )}
                <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate">
                  <input
                    type="checkbox"
                    checked={!linked}
                    onChange={(e) => {
                      const perspective = e.target.checked;
                      setLinked(!perspective);
                      if (!perspective) setThickEnd(thickStart);
                    }}
                    className="h-4 w-4 accent-charcoal"
                  />
                  Perspective (taper the far end)
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate">
                  <input
                    type="checkbox"
                    checked={blend}
                    onChange={(e) => setBlend(e.target.checked)}
                    className="h-4 w-4 accent-charcoal"
                  />
                  Blend with wall lighting
                </label>
                <button
                  onClick={() => setPhoto(null)}
                  className="text-xs font-semibold text-slate underline underline-offset-2 hover:text-charcoal"
                >
                  Change photo
                </button>
              </div>

              <p className="text-center text-xs text-mist">
                Previewing a {metres} m set{heightCm ? ` · ${heightCm} cm tall` : ""}
                {repeats ? ` · about ${Math.max(1, Math.round(repeats))} repeats along this run` : ""}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-edge px-6 py-4">
          <button onClick={onClose} className="btn btn-ghost h-11 px-6 text-[0.78rem]">
            Close
          </button>
          <button
            onClick={download}
            disabled={!photo || photo === "sample" || downloading}
            className="btn h-11 px-6 text-[0.78rem] disabled:opacity-50"
          >
            {downloading ? "Saving…" : "Save this image"}
          </button>
        </div>

        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
        <input
          ref={cameraFileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0])}
        />
      </div>
    </div>
  );
}

/** Flat illustrated hallway — a long wall with a stair run, the two places a
 *  border most often goes, for previews without a photo. */
function SampleHallway() {
  return (
    <svg viewBox="0 0 1600 900" width={1600} height={900} className="block h-auto max-h-[52vh] w-auto max-w-full">
      <rect width="1600" height="900" fill="#EFEAE3" />
      {/* receding side wall + floor */}
      <path d="M0 0h520v900H0z" fill="#E7E1D8" />
      <path d="M520 0h1080v760H520z" fill="#EFEAE3" />
      <path d="M0 900h1600V760H520L0 900z" fill="#DDD2C4" />
      <path d="M520 745h1080v18H520z" fill="#F5F1EA" />
      {/* stair flight, right */}
      <path
        d="M1120 760V700h70v-60h70v-60h70v-60h70v-60h70v-60h70"
        fill="none"
        stroke="#C9BFB0"
        strokeWidth="10"
        strokeLinejoin="round"
      />
      {/* doorway on the long wall */}
      <rect x="700" y="300" width="180" height="460" rx="6" fill="#E2DACE" />
      <rect x="700" y="300" width="180" height="14" rx="4" fill="#D6CCBD" />
      {/* console table + plant */}
      <rect x="270" y="600" width="180" height="12" rx="4" fill="#C9BFB0" />
      <rect x="288" y="612" width="12" height="120" fill="#C9BFB0" />
      <rect x="420" y="612" width="12" height="120" fill="#C9BFB0" />
      <ellipse cx="360" cy="556" rx="46" ry="52" fill="#B7CFB2" />
      <path d="M338 600h44l8 -44h-60z" fill="#D9C8B4" />
    </svg>
  );
}
