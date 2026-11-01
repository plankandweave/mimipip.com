"use client";

import { useState } from "react";

/**
 * The three ways into Find My Wallpaper. Requiring a room photo up front
 * blocked anyone without one — planning an unbuilt space, describing an idea,
 * or just wanting guidance before choosing a photo. All three end up in the
 * same guided conversation.
 */
export function CuratorStart({
  onUpload,
  onDescribe,
  onGuide,
}: {
  onUpload: () => void;
  onDescribe: (text: string) => void;
  onGuide: () => void;
}) {
  const [describing, setDescribing] = useState(false);
  const [text, setText] = useState("");

  return (
    <div className="mx-auto max-w-2xl">
      <span className="caps text-slate">Find My Wallpaper</span>
      <h1 className="mt-3 text-[clamp(2rem,4vw,3rem)]">Tell us about your room, and receive a considered shortlist.</h1>
      <p className="mt-3 max-w-[56ch] text-slate">
        However you'd like to start — a photo, a description, or a few questions — we'll get to the same place:
        a handful of designs chosen for your room, priced for your exact wall.
      </p>

      {!describing ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <button onClick={onUpload} className="card flex flex-col items-start gap-2 rounded-[20px] border border-edge p-5 text-left transition hover:border-charcoal">
            <span className="font-display text-base font-bold text-charcoal">Upload my room</span>
            <span className="text-[0.82rem] text-slate">Have a photo of the wall? We'll read its light and colours.</span>
          </button>
          <button onClick={() => setDescribing(true)} className="card flex flex-col items-start gap-2 rounded-[20px] border border-edge p-5 text-left transition hover:border-charcoal">
            <span className="font-display text-base font-bold text-charcoal">Describe what I want</span>
            <span className="text-[0.82rem] text-slate">No photo yet — just tell us the idea in your own words.</span>
          </button>
          <button onClick={onGuide} className="card flex flex-col items-start gap-2 rounded-[20px] border border-edge p-5 text-left transition hover:border-charcoal">
            <span className="font-display text-base font-bold text-charcoal">Guide me with questions</span>
            <span className="text-[0.82rem] text-slate">Not sure where to start — we'll ask, one thing at a time.</span>
          </button>
        </div>
      ) : (
        <div className="mt-8">
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="e.g. A calm, earthy living room — I keep coming back to greens and terracotta, something botanical but not too busy…"
            className="w-full rounded-[16px] border border-edge bg-surface px-4 py-3 text-[0.95rem] outline-none focus:border-charcoal"
          />
          <div className="mt-4 flex gap-3">
            <button className="btn btn-ghost" onClick={() => setDescribing(false)}>Back</button>
            <button className="btn" disabled={!text.trim()} onClick={() => onDescribe(text.trim())}>
              Continue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
