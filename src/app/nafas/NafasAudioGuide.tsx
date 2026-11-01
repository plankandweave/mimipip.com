"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { GUIDE_DWELL_MS, NAFAS_GUIDE, canFollowArtwork, visibleArtworkScore } from "@/lib/nafas-guide";

const GuideContext = createContext<(id: string) => void>(() => {});
export function NafasListenButton({ id, children }: { id: string; children?: ReactNode }) {
  const play = useContext(GuideContext);
  return <button type="button" className="nafas-listen" onClick={() => play(id)} aria-label={`Listen to Nafas: ${NAFAS_GUIDE[id]?.title}`}><span aria-hidden>▶</span> {children ?? "Hear Nafas talk about this one"}</button>;
}
export function GuideArtwork({ id, children, className = "" }: { id: string; children: ReactNode; className?: string }) {
  const play = useContext(GuideContext);
  if (!NAFAS_GUIDE[id]) return <div className={`relative ${className}`}>{children}</div>;
  return <div data-nafas-track={id} className={`nafas-audio-art ${className}`} onClick={event => {
    if (!(event.target as HTMLElement).closest("a,button,input,summary,select,textarea")) play(id);
  }}>{children}<div className="nafas-art-invite"><NafasListenButton id={id} /></div></div>;
}

export function NafasAudioGuide({ children }: { children: ReactNode }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [track, setTrack] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "playing" | "paused" | "ended" | "error">("idle");
  const [automatic, setAutomatic] = useState(true);
  const [filmPlaying, setFilmPlaying] = useState(false);
  const [candidate, setCandidate] = useState<string | null>(null);
  const heard = useRef(new Set<string>());
  const request = useRef(0);
  const play = useCallback((id: string) => {
    const element = audio.current;
    if (!element || !NAFAS_GUIDE[id]) return;
    document.dispatchEvent(new Event("nafas-guide-play"));
    const token = ++request.current;
    element.pause();
    element.src = NAFAS_GUIDE[id].src;
    setTrack(id);
    setStatus("loading");
    heard.current.add(id);
    void element.play().catch(() => { if (token === request.current) setStatus("error"); });
  }, []);
  const stop = useCallback(() => {
    request.current++;
    audio.current?.pause();
    audio.current?.removeAttribute("src");
    audio.current?.load();
    setTrack(null);
    setStatus("idle");
  }, []);
  useEffect(() => {
    const filmStart = () => { stop(); setFilmPlaying(true); };
    const filmStop = () => setFilmPlaying(false);
    document.addEventListener("nafas-film-play", filmStart);
    document.addEventListener("nafas-film-stop", filmStop);
    return () => {
      document.removeEventListener("nafas-film-play", filmStart);
      document.removeEventListener("nafas-film-stop", filmStop);
    };
  }, [stop]);
  useEffect(() => {
    let frame = 0;
    let pointer: { x: number; y: number } | null = null;
    const measure = () => {
      frame = 0;
      const under = pointer ? document.elementFromPoint(pointer.x, pointer.y)?.closest<HTMLElement>("[data-nafas-track]") : null;
      let chosen: HTMLElement | null = null;
      let best = -Infinity;
      for (const item of document.querySelectorAll<HTMLElement>("[data-nafas-track]")) {
        const rect = item.getBoundingClientRect();
        const score = visibleArtworkScore(rect.top, rect.bottom, window.innerHeight);
        if (score > best) { chosen = item; best = score; }
      }
      if (under) chosen = under;
      setCandidate(chosen?.dataset.nafasTrack ?? null);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const move = (event: PointerEvent) => { pointer = event.pointerType === "mouse" ? { x: event.clientX, y: event.clientY } : null; schedule(); };
    const visibility = () => { if (document.hidden && audio.current && !audio.current.paused) { audio.current.pause(); setStatus("paused"); } };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("visibilitychange", visibility);
    schedule();
    const element = audio.current;
    return () => {
      cancelAnimationFrame(frame);
      // Invalidate every outstanding play promise, including ones started after mount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      request.current++;
      element?.pause();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("pointermove", move);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    if (filmPlaying || !canFollowArtwork(!!track, automatic, status === "paused" || status === "error", status === "playing" || status === "loading", candidate, heard.current)) return;
    const timer = window.setTimeout(() => { if (candidate && !document.hidden) play(candidate); }, GUIDE_DWELL_MS);
    return () => clearTimeout(timer);
  }, [track, automatic, status, candidate, filmPlaying, play]);
  const resume = () => {
    if (status === "error" || status === "ended") { if (track) play(track); return; }
    const token = ++request.current;
    setStatus("loading");
    void audio.current?.play().catch(() => { if (token === request.current) setStatus("error"); });
  };
  return <GuideContext.Provider value={play}>
    {children}
    <audio ref={audio} preload="none" onPlaying={() => setStatus("playing")} onEnded={() => setStatus("ended")} onError={() => { if (audio.current?.getAttribute("src")) setStatus("error"); }} />
    {track && <aside className="nafas-player" aria-label="Nafas audio guide">
      <div className="nafas-player-top"><div><span className="nafas-player-status" role="status">{status === "playing" ? "Nafas is speaking" : status === "loading" ? "Getting ready…" : status === "error" ? "Audio couldn't load. Tap retry." : status === "paused" ? "Guide paused" : "Ready for the next picture"}</span><strong>{NAFAS_GUIDE[track].title}</strong></div>
        <button type="button" onClick={() => { if (status === "playing" || status === "loading") { request.current++; audio.current?.pause(); setStatus("paused"); } else resume(); }}>{status === "playing" || status === "loading" ? "Pause" : status === "error" ? "Retry" : status === "ended" ? "Replay" : "Resume"}</button>
        <button type="button" onClick={stop} aria-label="Stop Nafas audio guide">Stop</button>
      </div>
      <div className="nafas-player-options"><label><input type="checkbox" checked={automatic} onChange={event => setAutomatic(event.target.checked)} /> Follow as I scroll</label><details><summary>Read along</summary><p>{NAFAS_GUIDE[track].text}</p><small>Scripted audio, created with Nafas’s saved voice.</small></details></div>
    </aside>}
  </GuideContext.Provider>;
}
