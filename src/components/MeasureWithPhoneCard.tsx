"use client";

/**
 * The "skip the tape measure" card on /how-to-measure — opens the WallMeasure
 * AR flow and shows the result. The measurement is also kept for the visit
 * (sessionStorage, written by WallMeasure) so product pages pre-fill it.
 */

import { useState } from "react";
import Link from "next/link";
import { WallMeasure } from "@/components/WallMeasure";

const ftIn = (mm: number) => {
  const totalIn = mm / 25.4;
  const f = Math.floor(totalIn / 12);
  const i = Math.round(totalIn - f * 12);
  return i === 12 ? `${f + 1} ft 0 in` : `${f} ft ${i} in`;
};

export function MeasureWithPhoneCard() {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ wMm: number; hMm: number } | null>(null);

  return (
    <div className="mt-8 rounded-[18px] border border-edge bg-wash p-6">
      <span className="caps text-slate">No tape measure?</span>
      <h2 className="mt-2 font-display text-lg font-semibold">Measure with your phone</h2>
      <p className="mt-1 text-sm text-slate">
        Point your camera at the wall and tap its corners — your phone reads the real
        size. Works on AR-ready Android phones; everyone else, the tape measure has you.
      </p>

      {result ? (
        <div className="mt-4 rounded-[14px] bg-sage/40 p-4 text-sm">
          <p className="font-semibold text-charcoal">
            Your wall: {ftIn(result.wMm)} × {ftIn(result.hMm)}
          </p>
          <p className="mt-1 text-slate">
            ({Math.round(result.wMm)} × {Math.round(result.hMm)} mm) — we&apos;ll pre-fill
            this on any design you open.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Link href="/collections/wall-art" className="btn h-11 px-5 text-[0.8rem]">
              Browse wallpaper
            </Link>
            <button onClick={() => setOpen(true)} className="btn btn-ghost h-11 px-5 text-[0.8rem]">
              Measure again
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} className="btn mt-4 h-12 px-6 text-[0.8rem]">
          Start camera measure
        </button>
      )}

      <WallMeasure
        open={open}
        onClose={() => setOpen(false)}
        onResult={(wMm, hMm) => setResult({ wMm, hMm })}
      />
    </div>
  );
}
