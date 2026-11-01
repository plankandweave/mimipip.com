"use client";

// True-scale placement scene for the LENGTH family (Borders & Strips). The
// same constant room as the canvas scene — a 12 ft × 10 ft wall — but here the
// wall stays put and the BORDER moves: one tiled band, rendered at its real
// height from border_height_cm, slides between the four places a border
// actually lives. Ceiling line, chair rail, above the skirting — and the
// staircase, where the sofa gives way to a line-art flight and the band
// climbs parallel to the treads. Because the design is a seamless repeat,
// every placement is the same flat artwork tiled live; nothing here is a
// photograph and nothing touches what is ordered or printed.

import { useEffect, useRef, useState } from "react";
import { FIGURE_HEIGHT_FT, ScaleFigure } from "@/components/ScaleFigure";
import {
  SOFA_H_FT,
  SOFA_W_FT,
  SofaSvg,
  STAIR_ANGLE_DEG,
  STEP_COUNT,
  STEP_RISE_FT,
  STEP_TREAD_FT,
} from "@/components/SceneProps";
import { BorderLineVisualizer } from "@/components/BorderLineVisualizer";

const WALL_W_FT = 12;
const WALL_H_FT = 10;
const FLOOR_FT = 1.6;
const SKIRTING_FT = 0.38;
const CM_PER_FT = 30.48;

// The dado line — 3 ft (91 cm) up — is both the chair-rail height on a flat
// wall and the handrail-line offset a border keeps above stair nosings.
const DADO_FT = 3;

// The flight's pitch and step count live in SceneProps — the reach graphic
// measures a ten-step run from the same numbers this scene draws.
const STAIR_X0_FT = 2.4;

type PlacementKey = "ceiling" | "chair" | "skirting" | "stairs";

const PLACEMENTS: { key: PlacementKey; label: string; caption: string }[] = [
  { key: "ceiling", label: "Ceiling line", caption: "Run tight under the ceiling — crowns the whole room." },
  { key: "chair", label: "Chair rail", caption: "At dado height, 91 cm from the floor — the classic panelled look." },
  { key: "skirting", label: "Skirting", caption: "Just above the skirting board — quietly grounds the wall." },
  { key: "stairs", label: "Staircase", caption: "Climbing parallel to the treads, a handrail's height above them." },
];

export function BorderPlacementScene({
  imageUrl,
  imageAlt,
  heightCm,
  productTitle,
  productHandle,
  metres,
}: {
  /** The clean flat repeat — the same artwork that prints. */
  imageUrl: string;
  imageAlt: string;
  /** The border's real height; the band renders at exactly this scale. */
  heightCm: number;
  productTitle: string;
  productHandle: string;
  /** Metres in the set, for the photo tool's readout. */
  metres: number;
}) {
  const [placement, setPlacement] = useState<PlacementKey>("ceiling");
  const [lineOpen, setLineOpen] = useState(false);
  const [boxW, setBoxW] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    // Measure immediately rather than waiting on the observer's initial
    // delivery, which some embedded browsers throttle past first paint.
    setBoxW(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setBoxW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Scene geometry — everything is placed in feet, then mapped to px.
  const pxPerFt = boxW / WALL_W_FT;
  const floorY = WALL_H_FT * pxPerFt;
  const bandHFt = heightCm / CM_PER_FT;
  const bandH = bandHFt * pxPerFt;

  const stairRunPx = STEP_COUNT * STEP_TREAD_FT * pxPerFt;
  const stairRisePx = STEP_COUNT * STEP_RISE_FT * pxPerFt;
  const stairX0 = STAIR_X0_FT * pxPerFt;

  // The band's frame per placement. Flat placements hang it by its bottom
  // edge (a fitter's rule: measure up from the floor); the staircase centres
  // it on a line parallel to the nosings, DADO_FT vertically above them.
  const onStairs = placement === "stairs";
  let bandStyle: React.CSSProperties;
  if (onStairs) {
    const midX = stairX0 + stairRunPx / 2;
    const centerY = floorY - stairRisePx / 2 - (DADO_FT + bandHFt / 2) * pxPerFt;
    const bandW = boxW * 1.7; // long enough to bleed past both scene edges once rotated
    bandStyle = {
      left: midX - bandW / 2,
      top: centerY - bandH / 2,
      width: bandW,
      height: bandH,
      transform: `rotate(-${STAIR_ANGLE_DEG}deg)`,
    };
  } else {
    const bottomFt = placement === "ceiling" ? WALL_H_FT - 0.16 - bandHFt : placement === "chair" ? DADO_FT : SKIRTING_FT;
    bandStyle = {
      left: 0,
      top: floorY - (bottomFt + bandHFt) * pxPerFt,
      width: boxW,
      height: bandH,
      transform: "rotate(0deg)",
    };
  }

  // Stair silhouette: riser up, tread across, repeated; the closing edge and
  // Z give the flight its end face and floor line.
  let stairPath = `M ${stairX0} ${floorY}`;
  for (let i = 1; i <= STEP_COUNT; i++) {
    stairPath += ` V ${floorY - i * STEP_RISE_FT * pxPerFt} H ${stairX0 + i * STEP_TREAD_FT * pxPerFt}`;
  }
  stairPath += ` V ${floorY} Z`;

  const sofaW = SOFA_W_FT * pxPerFt;
  const sofaH = SOFA_H_FT * pxPerFt;
  const silhouetteH = FIGURE_HEIGHT_FT * pxPerFt;
  const active = PLACEMENTS.find((p) => p.key === placement)!;

  return (
    <div>
      <p className="caps mb-1 text-slate">See it placed · true scale</p>
      <p className="mb-3 text-xs text-slate">
        The same strip, four homes. Every placement is this design&apos;s real repeat at its real height.
      </p>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {PLACEMENTS.map((p) => {
          const on = p.key === placement;
          return (
            <button
              key={p.key}
              type="button"
              aria-pressed={on}
              onClick={() => setPlacement(p.key)}
              className={`rounded-[12px] border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                on ? "border-charcoal bg-charcoal text-surface" : "border-edge text-slate hover:border-charcoal hover:text-charcoal"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

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
            top: floorY - SKIRTING_FT * pxPerFt,
            height: SKIRTING_FT * pxPerFt,
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

        {boxW > 0 && (
          <>
            {/* dado panelling hint — only when the band sits at chair-rail height */}
            <div
              className="absolute inset-x-0 transition-opacity duration-500"
              style={{
                top: floorY - DADO_FT * pxPerFt,
                height: (DADO_FT - SKIRTING_FT) * pxPerFt,
                background: "rgba(255,252,244,0.3)",
                boxShadow: "inset 0 1px 0 rgba(74,68,60,0.08)",
                opacity: placement === "chair" ? 1 : 0,
              }}
            />

            {/* sofa + contact shadow — the room furniture, away for the staircase */}
            <div className="transition-opacity duration-500" style={{ opacity: onStairs ? 0 : 1 }}>
              <div
                className="absolute rounded-[50%]"
                style={{
                  left: (boxW - sofaW) / 2,
                  top: floorY - 4,
                  width: sofaW,
                  height: 0.5 * pxPerFt,
                  background: "radial-gradient(50% 50% at 50% 50%, rgba(60,52,42,0.28), rgba(60,52,42,0))",
                }}
              />
              <SofaSvg
                className="absolute"
                style={{ left: (boxW - sofaW) / 2, top: floorY - sofaH, width: sofaW, height: sofaH, color: "#4a443c", opacity: 0.5 }}
              />
            </div>

            {/* the staircase flight, in for the stairs placement */}
            <svg
              className="absolute inset-0 transition-opacity duration-500"
              width={boxW}
              height={floorY + FLOOR_FT * pxPerFt}
              viewBox={`0 0 ${boxW} ${floorY + FLOOR_FT * pxPerFt}`}
              style={{ color: "#4a443c", opacity: onStairs ? 0.45 : 0 }}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            >
              <path d={stairPath} />
            </svg>

            {/* 5.5 ft figure — the constant scale reference */}
            <div className="absolute flex flex-col items-center" style={{ left: 0.55 * pxPerFt, top: floorY - silhouetteH }}>
              <ScaleFigure height={silhouetteH} style={{ color: "#4a443c", opacity: 0.45 }} />
              <span className="mt-0.5 whitespace-nowrap text-[0.62rem] font-medium" style={{ color: "#4a443c", opacity: 0.75 }}>
                {FIGURE_HEIGHT_FT} ft
              </span>
            </div>

            {/* THE BORDER — the design's own repeat, tiled live at true height */}
            <div
              role="img"
              aria-label={imageAlt}
              className="absolute transition-all duration-500 ease-out"
              style={{
                ...bandStyle,
                backgroundImage: `url(${imageUrl})`,
                backgroundRepeat: "repeat-x",
                backgroundSize: "auto 100%",
                boxShadow: "0 3px 8px rgba(50,42,32,0.22)",
              }}
            />
          </>
        )}
      </div>

      <p className="mt-2 text-center text-xs text-slate">
        {active.caption} {heightCm} cm tall, on a {WALL_W_FT} ft wall.
      </p>

      {/* Our room is a stand-in; theirs is the one they're deciding about. */}
      <button
        type="button"
        onClick={() => setLineOpen(true)}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-[14px] border border-edge bg-surface py-3 text-[0.78rem] font-semibold text-charcoal transition-colors hover:border-charcoal"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
          <path d="M3 16.5 21 7.5" />
          <circle cx="4" cy="17" r="2" />
          <circle cx="20" cy="8" r="2" />
        </svg>
        Draw it on your own wall
      </button>

      <BorderLineVisualizer
        open={lineOpen}
        onClose={() => setLineOpen(false)}
        imageUrl={imageUrl}
        imageAlt={imageAlt}
        productTitle={productTitle}
        productHandle={productHandle}
        heightCm={heightCm}
        metres={metres}
      />
    </div>
  );
}
