"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "@/components/SiteImage";

/**
 * THE HOMEPAGE HERO SLIDER.
 *
 * Three images, crossfading, behind whatever copy the page puts in front of
 * them. It replaces a single still — so the rules it keeps are mostly about
 * NOT making the first thing a customer sees worse:
 *
 *  - The first slide is a normal priority image and paints exactly as the old
 *    still did. The others load lazily and fade in later. A slider that delays
 *    the first paint to preload three images has made the homepage slower to
 *    look at, which is the opposite of the point.
 *  - Motion is a courtesy, not a demand: it stops on hover, on focus, when the
 *    tab is hidden, and permanently for a reader who has asked their operating
 *    system for reduced motion. Those readers get the first slide, still, and
 *    working arrows — never a carousel that ignores them.
 *  - The copy in front does not move. Only the picture behind it changes, so
 *    nothing a customer is reading slides out from under them.
 */

export type HeroSlide = {
  image: string;
  alt: string;
  /** Server-rendered copy for this campaign; omitted slides keep the shared copy. */
  content?: React.ReactNode;
  label?: string;
  video?: {
    desktopSrc: string;
    mobileSrc: string;
    desktopPoster: string;
    mobilePoster: string;
    href: string;
    label?: string;
    background?: boolean;
  };
};

/** Six seconds. Long enough to look at a wall, short enough that a customer
 *  reading the copy sees a second image before they scroll past. */
const INTERVAL_MS = 6000;

function showCaptions(video: HTMLVideoElement, visible: boolean) {
  if (video.textTracks[0]) video.textTracks[0].mode = visible ? "showing" : "hidden";
}

export default function HeroSlider({
  slides,
  children,
  label = "Featured designs",
  strapline,
}: {
  slides: HeroSlide[];
  children: React.ReactNode;
  label?: string;
  /** One short line saying what we actually sell — shown at the top of every
   *  slide, film included. The TAASH film takes over the whole overlay
   *  (`children` goes invisible while it plays, see `filmActive` below), which
   *  used to mean the shop window said nothing about wallpaper for a fortnight.
   *  This renders outside that invisible wrapper so it survives the film. */
  strapline?: React.ReactNode;
}) {
  // `prev` is the slide being covered. The next picture UNROLLS down over it (the
  // homepage's signature move), so it has to stay on screen underneath until
  // the wipe is done. Null until the first change: the first slide never
  // animates in, so the first paint is exactly the still it always was.
  const [{ index, prev }, setPos] = useState<{ index: number; prev: number | null }>({ index: 0, prev: null });
  const setIndex = useCallback(
    (next: (cur: number) => number) =>
      setPos((p) => {
        const n = next(p.index);
        return n === p.index ? p : { index: n, prev: p.index };
      }),
    [],
  );
  const [paused, setPaused] = useState(false);
  // Starts true so the very first render is motionless: a slider that advances
  // once before the reduced-motion query is read has already broken its promise
  // to the reader who asked for stillness.
  const [reduced, setReduced] = useState(true);
  const [videoReady, setVideoReady] = useState(false);
  const [videoPaused, setVideoPaused] = useState(true);
  const [videoMuted, setVideoMuted] = useState(true);
  const [captionsOn, setCaptionsOn] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [videoTime, setVideoTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(108);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const touchX = useRef<number | null>(null);
  const activeVideo = slides[index]?.video;
  const filmActive = Boolean(activeVideo && !videoError);
  const backgroundFilm = Boolean(activeVideo?.background);

  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(q.matches);
    sync();
    q.addEventListener("change", sync);
    return () => q.removeEventListener("change", sync);
  }, []);

  const go = useCallback(
    (n: number) => {
      setVideoError(false);
      setVideoReady(false);
      setIndex(() => (n + slides.length) % slides.length);
    },
    [slides.length, setIndex],
  );

  useEffect(() => {
    if (reduced || paused || filmActive || slides.length < 2) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % slides.length), INTERVAL_MS);
    return () => clearInterval(t);
  }, [reduced, paused, filmActive, slides.length, setIndex]);

  // The film waits for the page. It is preload="none", so nothing of it is
  // fetched until play() — and play() is held until the window has loaded
  // and the browser is idle, so the still poster, the trending designs and
  // the first rows paint before a multi-megabyte MP4 starts streaming. On a
  // connection that asks for less (Data Saver, 2G) the film never plays and
  // the poster stands in; the controls still offer it on a tap.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    if (!filmActive) return;
    video.currentTime = 0;
    video.muted = true;
    if (reduced || document.hidden) return;
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    // The film was paused just above, and its onPause keeps the controls'
    // state in step, so nothing else needs saying here.
    if (conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType ?? "")) return;
    let cancelled = false;
    let idle = 0;
    const start = () => {
      if (cancelled) return;
      const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
      const play = () => { if (!cancelled) video.play().catch(() => setVideoPaused(true)); };
      if (w.requestIdleCallback) idle = w.requestIdleCallback(play, { timeout: 2500 });
      else idle = window.setTimeout(play, 1200);
    };
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener("load", start);
      if (idle) { window.clearTimeout(idle); (window as Window & { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback?.(idle); }
    };
  }, [index, filmActive, reduced]);

  // A phone rotated after loading must switch to the composition made for its
  // new aspect ratio; <source media> alone only chooses on the first load.
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const onChange = () => {
      const video = videoRef.current;
      if (!video) return;
      setVideoReady(false);
      video.load();
      if (filmActive && !reduced && !document.hidden) {
        video.play().catch(() => setVideoPaused(true));
      }
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [filmActive, reduced]);

  // A slider advancing in a tab nobody is looking at burns a customer's data
  // and their battery to show them nothing.
  useEffect(() => {
    const onVis = () => {
      setPaused(document.hidden);
      const video = videoRef.current;
      if (!video || !filmActive) return;
      if (document.hidden) video.pause();
      else if (!reduced && !videoPaused) video.play().catch(() => setVideoPaused(true));
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [filmActive, reduced, videoPaused]);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => setVideoPaused(true));
    else video.pause();
  };

  const toggleSound = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setVideoMuted(video.muted);
  };

  const toggleCaptions = () => {
    const video = videoRef.current;
    if (!video) return;
    showCaptions(video, !captionsOn);
    setCaptionsOn(!captionsOn);
  };

  const clock = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

  if (slides.length === 0) return <>{children}</>;

  return (
    <div
      className="relative h-full w-full"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
        touchX.current = null;
      }}
      aria-roledescription="carousel"
      aria-label={label}
    >
      {/* Own stacking context: the unroll-over layers slides with z-index,
          and that must never lift a picture above the gradient and copy. */}
      <div className="absolute inset-0 isolate">
      {slides.map((s, i) => (
        <div
          key={s.image}
          // hero-slide / is-moving: the floor-anchored push-in (globals.css).
          // Switched on only after hydration (`reduced` starts true), so the
          // first paint is exactly the still image and LCP is untouched.
          // is-active / is-prev drive the unroll-over (globals.css); without
          // motion they fall back to the plain 1.2s crossfade.
          className={`hero-slide absolute inset-0 ${i === index ? "is-active" : ""} ${
            i === index && prev !== null ? "is-arriving" : ""
          } ${i === prev && i !== index ? "is-prev" : ""} ${!reduced && i === index && !s.video ? "is-moving" : ""}`}
          // Hidden slides are not announced: a screen reader should hear one
          // hero, not three descriptions of walls stacked on top of each other.
          aria-hidden={i !== index}
        >
          {s.video ? (
            <>
              <picture className="absolute inset-0">
                <source media="(max-width: 767px)" srcSet={s.video.mobilePoster} />
                {/* The image paints before the film and remains if video cannot play. */}
                <img src={s.video.desktopPoster} alt={i === index ? s.alt : ""} className="h-full w-full object-cover object-bottom" fetchPriority={i === 0 ? "high" : "auto"} />
              </picture>
              {i === index && <video
                ref={videoRef}
                className={`absolute inset-0 h-full w-full object-cover object-bottom transition-opacity duration-300 ${videoReady ? "opacity-100" : "opacity-0"}`}
                muted
                playsInline
                preload="none"
                aria-label={s.video.label ?? "Taash collection film by Mati and Zyvorah"}
                onLoadedData={() => { setVideoError(false); setVideoReady(true); }}
                onPlaying={() => { setVideoError(false); setVideoReady(true); }}
                onLoadedMetadata={(e) => setVideoDuration(e.currentTarget.duration)}
                onTimeUpdate={(e) => { setVideoReady(true); setVideoTime(e.currentTarget.currentTime); }}
                onPlay={() => setVideoPaused(false)}
                onPause={() => setVideoPaused(true)}
                onVolumeChange={(e) => setVideoMuted(e.currentTarget.muted)}
                onError={(e) => { if (e.currentTarget.error?.code === 3 || e.currentTarget.error?.code === 4) setVideoError(true); }}
                onEnded={() => go(i + 1)}
              >
                <source media="(max-width: 767px)" src={s.video.mobileSrc} type="video/mp4" />
                <source src={s.video.desktopSrc} type="video/mp4" />
                {!s.video.background && <track src="/films/taash-collection-captions-v3.vtt" kind="captions" srcLang="hi" label="Hindi narration" />}
              </video>}
            </>
          ) : (
            <Image
              src={s.image}
              alt={i === index ? s.alt : ""}
              fill
              priority={i === 0}
              loading={i === 0 ? undefined : "lazy"}
              sizes="100vw"
              // Keep the floor: crop the ceiling before the furniture.
              className="object-cover object-bottom"
            />
          )}
        </div>
      ))}
      </div>

      <div className={`pointer-events-none absolute inset-0 ${filmActive && !backgroundFilm ? "bg-gradient-to-t from-charcoal/35 via-transparent to-transparent" : "bg-gradient-to-t from-charcoal/60 via-charcoal/10 to-charcoal/20"}`} />

      {/* What we sell, said once, on top of every slide — including the film,
          where the copy below goes invisible. Sits at the TOP: the floor rule
          (AGENTS.md #8) keeps the bottom of the frame for the room, and the
          bottom is already the copy/CTA band on every non-film slide. */}
      {strapline && (
        <div className="pointer-events-none absolute inset-x-4 top-4 z-20 lg:inset-x-8 lg:top-6">
          <p className="inline-block max-w-[94%] rounded-full bg-charcoal/55 px-3 py-1.5 text-[0.68rem] font-medium leading-snug text-surface backdrop-blur-sm sm:text-[0.78rem]">
            {strapline}
          </p>
        </div>
      )}

      <div className={filmActive && !backgroundFilm ? "pointer-events-none invisible absolute inset-0" : "relative h-full"} aria-hidden={filmActive && !backgroundFilm}>
        {slides[index]?.content ?? children}
      </div>

      {filmActive && !backgroundFilm && slides[index].video && (
        <div className={`container-x absolute inset-x-0 z-10 text-surface ${strapline ? "top-14 lg:top-16" : "top-6 lg:top-8"}`} onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}>
          <div className="flex flex-wrap items-center gap-2.5 text-sm">
            <button type="button" onClick={togglePlayback} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-surface/30 bg-charcoal/65 backdrop-blur-md hover:bg-charcoal/85 focus-visible:outline-2 focus-visible:outline-surface" aria-label={videoPaused ? "Play Taash film" : "Pause Taash film"}>
              {videoPaused
                ? <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-current"><path d="M8 5v14l11-7z" /></svg>
                : <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-current"><path d="M6 5h4v14H6zm8 0h4v14h-4z" /></svg>}
            </button>
            <button type="button" onClick={toggleSound} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-surface/30 bg-charcoal/65 backdrop-blur-md hover:bg-charcoal/85 focus-visible:outline-2 focus-visible:outline-surface" aria-label={videoMuted ? "Turn on film sound" : "Mute film sound"}>
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[1.7]" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 9v6h4l5 4V5L8 9H4z" />
                {videoMuted ? <path d="m17 9 5 6m0-6-5 6" /> : <path d="M17 8a6 6 0 0 1 0 8m2-11a10 10 0 0 1 0 14" />}
              </svg>
            </button>
            <button type="button" onClick={toggleCaptions} aria-pressed={captionsOn} className={`inline-flex h-9 w-9 items-center justify-center rounded-full border text-[0.65rem] font-semibold tracking-wide backdrop-blur-md focus-visible:outline-2 focus-visible:outline-surface ${captionsOn ? "border-surface bg-surface text-charcoal" : "border-surface/30 bg-charcoal/65 hover:bg-charcoal/85"}`} aria-label={captionsOn ? "Turn off film captions" : "Turn on film captions"}>
              CC
            </button>
            <span className="hidden rounded-full bg-charcoal/40 px-2 py-1 text-xs tabular-nums sm:inline">{clock(videoTime)} / {clock(videoDuration)}</span>
            <a href={slides[index].video.href} className="ml-auto rounded-full bg-surface px-3 py-2 text-xs font-semibold text-charcoal hover:bg-surface/90 sm:px-5 sm:text-sm">
              See the collection
            </a>
          </div>
          <input
            type="range"
            min="0"
            max={videoDuration || 108}
            value={videoTime}
            step="0.1"
            onChange={(e) => { if (videoRef.current) videoRef.current.currentTime = Number(e.target.value); }}
            aria-label="Seek through Taash film"
            className="mt-3 h-1 w-full cursor-pointer accent-surface"
          />
        </div>
      )}

      {filmActive && backgroundFilm && (
        <button type="button" onClick={togglePlayback} className="absolute right-6 top-24 z-20 min-h-10 rounded-full bg-charcoal/65 px-4 text-xs text-white" aria-label={videoPaused ? "Play Ink room sequence" : "Pause Ink room sequence"}>{videoPaused ? "Play" : "Pause"}</button>
      )}

      {slides.length > 1 && (
        // Bottom-right, clear of the copy and the buttons on the left. Dots are
        // real buttons: a customer who wants the third wall can have it.
        <div className="absolute bottom-6 right-6 z-10 flex items-center gap-2 lg:bottom-8 lg:right-10">
          {slides.map((s, i) => (
            <button
              key={s.image}
              type="button"
              onClick={() => go(i)}
              aria-label={s.label ? `Show ${s.label}` : s.video ? "Show Taash film" : `Show design ${i + 1} of ${slides.length}`}
              aria-current={i === index}
              className={`h-2 rounded-full transition-all ${
                i === index ? "w-6 bg-surface" : "w-2 bg-surface/50 hover:bg-surface/80"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
