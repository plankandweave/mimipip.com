"use client";

import { useEffect, useRef, useState } from "react";
import { firstLanguage } from "@/lib/sonar-rules";
import type { TimbreLanguage } from "@/lib/timbre-rules";

// The player: one big button, the languages the wall speaks as pills, the
// words beneath. Phones will not play sound without a tap, so the first
// tap is the play button, never an autoplay that silently fails.

type Lang = { code: TimbreLanguage; name: string; native: string; text: string | null; audio: string | null };

export default function SonarPlayer({ title, place, campus, kind, languages, phoneLanguage }: {
  title: string; place: string | null; campus: string | null; kind: "wall" | "demo"; languages: Lang[]; phoneLanguage: string | null;
}) {
  const [lang, setLang] = useState<TimbreLanguage>(() => firstLanguage(languages.map((l) => l.code), null, phoneLanguage));
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const current = languages.find((l) => l.code === lang) ?? languages[0];

  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    a.pause();
    a.load();
    setPlaying(false);
    setEnded(false);
  }, [lang]);

  function toggle() {
    const a = audio.current;
    if (!a) return;
    if (a.paused) { void a.play().then(() => setPlaying(true)).catch(() => setPlaying(false)); }
    else { a.pause(); setPlaying(false); }
  }

  return (
    <div>
      <p className="caps text-[0.68rem] tracking-[0.18em] text-mist">{kind === "demo" ? "Zyvorah" : campus ?? "Zyvorah"}</p>
      <h1 className="mt-2 font-display text-2xl font-bold leading-tight">{title}</h1>
      {place && <p className="mt-1 text-sm text-slate">{place}</p>}

      {current?.audio ? (
        <>
          <audio ref={audio} src={current.audio} preload="auto" onEnded={() => { setPlaying(false); setEnded(true); }} onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} />
          <button type="button" onClick={toggle} aria-label={playing ? "Pause" : "Listen"}
            className="mt-8 flex h-24 w-24 items-center justify-center rounded-full bg-charcoal text-surface shadow-sm">
            {playing ? (
              <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            ) : (
              <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5.5v13l11-6.5z" /></svg>
            )}
          </button>
          <p className="mt-3 text-sm text-slate">{playing ? "Listening…" : ended ? "Listen again, or in another language." : "Tap to hear this wall."}</p>
        </>
      ) : (
        <p className="mt-8 text-sm text-slate">This wall has not learnt its words yet.</p>
      )}

      {languages.length > 1 && (
        <div className="mt-6 flex flex-wrap gap-2">
          {languages.map((l) => (
            <button key={l.code} type="button" onClick={() => setLang(l.code)}
              className={l.code === lang ? "rounded-full bg-charcoal px-4 py-2 text-xs text-surface" : "rounded-full border border-edge px-4 py-2 text-xs text-charcoal"}>
              {l.native}
            </button>
          ))}
        </div>
      )}

      {current?.text && <p className="mt-6 text-base leading-relaxed text-charcoal">{current.text}</p>}
      <p className="mt-10 text-xs text-mist">A wall by Zyvorah. Every wall on this campus can speak; scan the next one.</p>
    </div>
  );
}
