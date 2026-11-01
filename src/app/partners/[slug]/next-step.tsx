"use client";

import type { NextStep } from "@/lib/portfolio";

// The one thing to do now.
//
// Nobody is being trained on this and nobody should have to explore it. So the
// dashboard opens with a sentence in the person's own vocabulary telling them
// what to do, naming their own building, and carrying the button that does it.
//
// Deliberately NOT a dismissible "getting started" card. Those are written once
// for an empty account and then congratulate you forever; this is computed from
// what the account actually contains, so it moves down the ladder as they work
// and disappears into "take it to whoever decides" at the end. There is nothing
// to dismiss because there is never a stale version of it on screen.
//
// When we are the ones holding things up it says so and shows no button — an
// instruction somebody cannot act on is worse than silence, because they go
// hunting for the control it implies.

export default function NextStepBanner({
  step, onGo,
}: {
  step: NextStep;
  onGo: (step: NextStep) => void;
}) {
  const waiting = Boolean(step.waitingOnUs);

  return (
    <section
      aria-label="What to do next"
      className={`mt-6 rounded-[18px] border p-5 ${
        waiting ? "border-edge bg-wash" : "border-charcoal bg-surface"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-[60ch]">
          <p className="text-[0.7rem] uppercase tracking-wide text-mist">
            {waiting ? "With us" : "Next"}
          </p>
          <p className="mt-1 font-display text-lg font-bold leading-tight">{step.title}</p>
          <p className="mt-1.5 text-sm text-slate">{step.body}</p>
        </div>
        {step.cta && (
          <button onClick={() => onGo(step)} className="btn h-11 shrink-0 px-5 text-[0.85rem]">
            {step.cta}
          </button>
        )}
      </div>
    </section>
  );
}
