"use client";

import { useEffect, useRef, useState } from "react";

const asset = (name: string) => `/api/presentations/iilm-greater-noida/${name}`;
export type Point = readonly [number, number];
export type Quad = readonly [Point, Point, Point, Point];

// Project one unaltered flat print into four measured points on the source photo.
function project(quad: Quad, width: number, height: number): string {
  const source = [[0, 0], [800, 0], [800, 2000], [0, 2000]];
  const rows: number[][] = [];
  source.forEach(([x, y], i) => {
    const X = quad[i][0] * width;
    const Y = quad[i][1] * height;
    rows.push([x, y, 1, 0, 0, 0, -X * x, -X * y, X]);
    rows.push([0, 0, 0, x, y, 1, -Y * x, -Y * y, Y]);
  });
  for (let column = 0; column < 8; column++) {
    let pivot = column;
    for (let row = column + 1; row < 8; row++) if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const divisor = rows[column][column];
    if (Math.abs(divisor) < 1e-10) return "none";
    for (let j = column; j < 9; j++) rows[column][j] /= divisor;
    for (let row = 0; row < 8; row++) {
      if (row === column) continue;
      const factor = rows[row][column];
      for (let j = column; j < 9; j++) rows[row][j] -= factor * rows[column][j];
    }
  }
  const [a, b, c, d, e, f, g, h] = rows.map((row) => row[8]);
  return `matrix3d(${[a, d, 0, g, b, e, 0, h, 0, 0, 1, 0, c, f, 0, 1].join(",")})`;
}

export function Reveal({ before, artwork, quad, alt }: { before: string; artwork: string; quad: Quad; alt: string }) {
  const frame = useRef<HTMLDivElement>(null);
  const [split, setSplit] = useState(50);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setSize({ width: node.clientWidth, height: node.clientHeight }));
    observer.observe(node);
    setSize({ width: node.clientWidth, height: node.clientHeight });
    return () => observer.disconnect();
  }, []);
  const move = (clientX: number) => {
    const rect = frame.current?.getBoundingClientRect();
    if (rect) setSplit(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)));
  };

  return <div ref={frame} className="iilm-reveal" role="slider" tabIndex={0}
    aria-label={`Compare existing photograph with ${alt}`} aria-valuemin={0} aria-valuemax={100}
    aria-valuenow={Math.round(split)} aria-valuetext={`${Math.round(split)} percent proposed artwork visible`}
    onKeyDown={(event) => {
      if (event.key === "ArrowRight") { setSplit((v) => Math.min(100, v + 5)); event.preventDefault(); }
      if (event.key === "ArrowLeft") { setSplit((v) => Math.max(0, v - 5)); event.preventDefault(); }
    }}
    onPointerDown={(event) => { setDragging(true); event.currentTarget.setPointerCapture(event.pointerId); move(event.clientX); }}
    onPointerMove={(event) => { if (event.pointerType === "mouse" || dragging) move(event.clientX); }}
    onPointerUp={(event) => { setDragging(false); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
    onPointerCancel={() => setDragging(false)}>
    {/* The campus photo exists only once. The reveal clips the proposed print, never a regenerated room. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img className="iilm-reveal-image" src={asset(before)} alt="Unaltered IILM campus photograph" draggable={false} />
    <div className="iilm-artwork-clip" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="iilm-artwork-mapped" src={asset(artwork)} alt="" draggable={false}
        style={{ transform: size.width ? project(quad, size.width, size.height) : "none", visibility: size.width ? "visible" : "hidden" }} />
    </div>
    <div className="iilm-reveal-divider" style={{ left: `${split}%` }} aria-hidden="true"><span>‹ ›</span></div>
    <span className="iilm-reveal-label iilm-reveal-label-left">Proposed</span>
    <span className="iilm-reveal-label iilm-reveal-label-right">Existing</span>
  </div>;
}
