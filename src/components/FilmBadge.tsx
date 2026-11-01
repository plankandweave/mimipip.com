"use client";

import { useEffect, useRef, useState } from "react";
import { TaashFilm } from "@/components/TaashFilm";
import { filmAspect, shapeOf, type SiteFilm } from "@/lib/site-films";

// A film behind a card. The card keeps its photograph and gains "Watch the
// film · 0:59"; the tap that opens it is the gesture a browser wants before
// it allows sound, so the film opens PLAYING WITH SOUND — the voiceover is
// the point. On a desktop pointer, resting on the card plays the opening
// seconds silently in place of the photograph, as a preview.

const clock = (s: number) => `${Math.floor(Math.round(s) / 60)}:${String(Math.round(s) % 60).padStart(2, "0")}`;

export function FilmBadge({ film, label, className = "" }: { film: SiteFilm; label: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
        aria-haspopup="dialog"
        className={`inline-flex items-center gap-1.5 rounded-full bg-black/65 px-3 py-1.5 text-[0.7rem] font-semibold text-white shadow backdrop-blur transition hover:bg-black/80 ${className}`}
      >
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z" /></svg>
        Watch the film{film.durationS ? ` · ${clock(film.durationS)}` : ""}
      </button>
      {open && <FilmLightbox film={film} label={label} onClose={() => setOpen(false)} />}
    </>
  );
}

function FilmLightbox({ film, label, onClose }: { film: SiteFilm; label: string; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    box.current?.focus();
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = before; };
  }, [onClose]);
  const tall = shapeOf(film) === "tall";
  return (
    <div
      ref={box}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
      onClick={onClose}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/88 p-4 backdrop-blur-sm"
    >
      <button type="button" onClick={onClose} aria-label="Close the film" className="absolute right-4 top-4 rounded-full bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20">✕</button>
      <div onClick={(e) => e.stopPropagation()} className={tall ? "h-[86vh] max-h-[860px]" : "w-[92vw] max-w-5xl"}>
        <TaashFilm
          src={film.src}
          poster={film.poster}
          title={label}
          film={film}
          style={filmAspect(film)}
          className={`rounded-[18px] ${tall ? "h-full" : "w-full"}`}
        />
      </div>
    </div>
  );
}

/** Silent preview over a card's photograph while a desktop pointer rests on it. */
export function FilmHoverPreview({ film }: { film: SiteFilm }) {
  const [canHover, setCanHover] = useState(false);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const apply = () => setCanHover(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  if (!canHover) return null;
  return (
    <div className="absolute inset-0" onMouseEnter={() => setOn(true)} onMouseLeave={() => setOn(false)}>
      {on && (
        <video src={film.src} poster={film.poster ?? undefined} muted autoPlay loop playsInline preload="none" aria-hidden className="h-full w-full object-cover" />
      )}
    </div>
  );
}
