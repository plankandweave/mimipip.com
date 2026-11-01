"use client";

// "How far does that go?" — the question a metre figure never answers.
//
// A shopper choosing borders knows how many sets they can afford long before
// they know how many they NEED, because "5 metres" is an abstraction and "the
// wall behind my bed" is not. This turns the number back into rooms: a row per
// real run, each drawn to one shared scale, with the chosen length filling it.
//
// Every reference is derived here from its own real dimensions rather than
// asserted, so the numbers can be checked — and the staircase run comes from
// the same pitch the placement scene draws, so the two can't disagree.

import { STAIR_RUN_FT } from "@/components/SceneProps";

const M_PER_FT = 0.3048;
const ft = (feet: number) => feet * M_PER_FT;

/** A standard door: 2.1 m tall, 0.9 m wide — up one side, across, down the other. */
const DOORWAY_M = 2.1 + 0.9 + 2.1;
/** Perimeter of a w × h ft room, in metres. */
const perimeter = (wFt: number, hFt: number) => 2 * (ft(wFt) + ft(hFt));

type Reference = { label: string; metres: number };

// Ordered short → long: the reader scans down until a row stops being covered,
// and that row is the answer to "how many sets do I need?".
const REFERENCES: Reference[] = [
  { label: "A 10-step staircase run", metres: ft(STAIR_RUN_FT) },
  { label: "One bedroom wall (12 ft)", metres: ft(12) },
  { label: "Around a doorway (7 ft door)", metres: DOORWAY_M },
  { label: "A small bathroom, all round", metres: perimeter(6, 8) },
  { label: "A bedroom, all round (10 × 12 ft)", metres: perimeter(10, 12) },
];

const LONGEST = Math.max(...REFERENCES.map((r) => r.metres));

const fmt = (m: number) => (m < 10 ? m.toFixed(1) : Math.round(m).toString());

export function BorderReach({ metres, setMetres }: { metres: number; setMetres: number }) {
  return (
    <div className="mt-6 rounded-[14px] border border-edge bg-surface p-4">
      <p className="caps text-slate">What {metres} m covers</p>

      <div className="mt-3 space-y-2.5">
        {REFERENCES.map((r) => {
          const covered = metres >= r.metres;
          // One scale across every row, so the rows are comparable to each
          // other and not just to themselves.
          const trackPct = (r.metres / LONGEST) * 100;
          const fillPct = Math.min(1, metres / r.metres) * 100;
          const setsNeeded = Math.ceil(r.metres / setMetres);
          return (
            <div key={r.label}>
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className={covered ? "font-medium text-charcoal" : "text-slate"}>
                  {covered && (
                    <svg
                      viewBox="0 0 24 24"
                      className="mr-1 inline-block h-3 w-3 align-[-0.1em]"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                  {r.label}
                </span>
                <span className="shrink-0 tabular-nums text-mist">{fmt(r.metres)} m</span>
              </div>
              {/* Meter: the track is the run's real length, the fill is how far
                  this order reaches along it. Track and fill are steps of one
                  neutral ramp — the state is carried by the check and the
                  words beside it, never by colour alone. */}
              <div className="mt-1 h-1.5 rounded-full" style={{ width: `${trackPct}%` }}>
                <div className="relative h-full w-full overflow-hidden rounded-full bg-edge">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-charcoal transition-all duration-300 ease-out"
                    style={{ width: `${fillPct}%` }}
                  />
                </div>
              </div>
              {!covered && (
                <p className="mt-1 text-[0.68rem] text-mist">
                  Needs {setsNeeded} sets ({setsNeeded * setMetres} m)
                </p>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[0.68rem] text-mist">
        Runs are measured along the border&apos;s own path. Allow a little extra for
        joins and corners.
      </p>
    </div>
  );
}
