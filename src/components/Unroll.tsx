"use client";

import { useEffect, useRef, useState } from "react";

// The homepage's signature entrance: pictures arrive the way the product does,
// a panel unrolled down a wall from the ceiling. Wrap a section in <Unroll>
// and every `.unroll-target` inside it (and every card picture, `.zoomer`)
// unrolls top → bottom the first time the section enters the viewport, cards
// staggered left to right, while the picture inside settles like paper
// smoothing onto the wall. `variant="settle"` is the quieter version for the
// ordinary product rows: no unroll, just the settle — the unroll stays special
// to the places that earn it. Only clip-path, transform and opacity move;
// everything is still for a reader who asked for reduced motion (globals.css).
export function Unroll({
  children,
  className = "",
  variant = "unroll",
}: {
  children: React.ReactNode;
  className?: string;
  variant?: "unroll" | "settle";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`${variant} ${className}`} data-unrolled={shown ? "" : undefined}>
      {children}
    </div>
  );
}

// Width and height dimension lines drawn over a room picture — "made to your
// wall" said without a word. Labels name the customer's wall, never a number:
// a figure here would be a size and a price the configurator then contradicts.
// Sits inside an <Unroll>, and draws once the picture has finished unrolling.
export function MeasureLines() {
  return (
    <div className="measure-lines pointer-events-none absolute inset-0" aria-hidden="true">
      {/* Drawn in the band's own 4:3 units (it is always aspect-[4/3]), so
          strokes stay even without vector-effect — which would measure the
          dash in screen pixels and chop the line into dashes. */}
      <svg viewBox="0 0 400 300" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {/* Width, across the top: end stops, then tape ticks every tenth (a
            longer one at the middle), drawn with the line. */}
        <path d="M32 30 H368" pathLength={1} className="measure-stroke" />
        <path d="M32 18 V42 M368 18 V42" pathLength={1} className="measure-stroke" />
        <path d={WIDTH_TICKS} pathLength={1} className="measure-stroke measure-ticks" />
        {/* Height, down the right edge — floor to ceiling. */}
        <path d="M368 48 V270" pathLength={1} className="measure-stroke measure-late" />
        <path d="M356 48 H380 M356 270 H380" pathLength={1} className="measure-stroke measure-late" />
        <path d={HEIGHT_TICKS} pathLength={1} className="measure-stroke measure-ticks measure-late" />
      </svg>
      {/* The tape "clicks" home: a dot pops where each line finishes. HTML, not
          SVG, so it stays round in a stretched viewBox. */}
      <span className="measure-dot absolute left-[92%] top-[10%]" />
      <span className="measure-dot measure-late absolute left-[92%] top-[90%]" />
      <span className="measure-label absolute left-1/2 top-[10%] -translate-x-1/2 -translate-y-1/2">Your width</span>
      <span className="measure-label measure-late absolute right-[8%] top-[53%] translate-x-1/2 -translate-y-1/2 rotate-90">Your height</span>
    </div>
  );
}

// Tape ticks every 10% of each line, the middle one longer. Built once.
const tick = (i: number) => (i === 5 ? 7 : 3.5);
const WIDTH_TICKS = Array.from({ length: 9 }, (_, k) => k + 1)
  .map((i) => `M${32 + 33.6 * i} ${30 - tick(i)} V${30 + tick(i)}`)
  .join(" ");
const HEIGHT_TICKS = Array.from({ length: 9 }, (_, k) => k + 1)
  .map((i) => `M${368 - tick(i)} ${48 + 22.2 * i} H${368 + tick(i)}`)
  .join(" ");
