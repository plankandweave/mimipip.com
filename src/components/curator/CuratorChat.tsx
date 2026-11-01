"use client";

import { useEffect, useRef, useState } from "react";
import type { ZAnalysis, ZTurn } from "./types";

function SeenCard({ analysis }: { analysis: ZAnalysis }) {
  const chips = (analysis.palette ?? []).slice(0, 5);
  const meta = [analysis.roomType, ...(analysis.moodWords ?? []).slice(0, 3)].filter(Boolean).join(" · ");
  return (
    <div className="card rounded-[20px] border border-edge p-6">
      <span className="caps text-slate">What the curator sees</span>
      {analysis.summary && <p className="mt-3 leading-relaxed text-charcoal">{analysis.summary}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-4">
        {chips.length > 0 && (
          <div className="flex gap-1.5">
            {chips.map((c, i) => (
              <span key={i} className="h-6 w-6 rounded-full border border-black/5" style={{ background: c }} title={c} />
            ))}
          </div>
        )}
        {meta && <span className="text-xs text-mist">{meta}</span>}
      </div>
    </div>
  );
}

export function CuratorChat({
  analysis,
  transcript,
  busy,
  onSend,
}: {
  analysis: ZAnalysis | null;
  transcript: ZTurn[];
  busy: boolean;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [transcript, busy]);

  const send = () => {
    const t = text.trim();
    if (!t || busy) return;
    setText("");
    onSend(t);
  };

  return (
    <div className="mx-auto max-w-2xl">
      {analysis && <SeenCard analysis={analysis} />}
      <div className="mt-8 flex flex-col gap-6">
        {transcript.map((turn, i) => (
          <div key={i} className={`flex flex-col gap-1.5 ${turn.role === "client" ? "items-end self-end" : "items-start self-start"} max-w-[90%]`}>
            <span className="caps text-[0.62rem] text-mist">{turn.role === "curator" ? "Curator" : "You"}</span>
            {turn.role === "client" ? (
              <p className="rounded-[18px] rounded-br-md bg-charcoal px-4 py-2.5 text-[0.95rem] text-white">{turn.text}</p>
            ) : (
              <p className="text-[1.05rem] leading-relaxed text-charcoal">{turn.text}</p>
            )}
          </div>
        ))}
        {busy && (
          <div className="flex flex-col items-start gap-1.5 self-start">
            <span className="caps text-[0.62rem] text-mist">Curator</span>
            <span className="flex gap-1.5 py-2">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate" style={{ animationDelay: `${i * 0.2}s` }} />
              ))}
            </span>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="mt-6 flex items-end gap-3 border-t border-edge pt-5">
        <textarea
          className="min-h-[52px] flex-1 resize-none rounded-2xl border border-edge bg-surface px-4 py-3 text-[0.95rem] text-charcoal outline-none focus:border-charcoal"
          rows={2}
          placeholder="Type your answer…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
          }}
          disabled={busy}
        />
        <button className="btn shrink-0 rounded-2xl" onClick={send} disabled={busy || !text.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}
