"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { SiteFilm } from "@/lib/site-films";

type Props = {
  src: string;
  /** Without one, the player shows the film's first frame. */
  poster?: string | null;
  title: string;
  className?: string;
  style?: React.CSSProperties;
  /** The Library film behind this player, when there is one. It brings the
   *  captions, the other-language cuts and the play counting. A hardcoded
   *  film (the TAASH files) passes none and plays exactly as before. */
  film?: SiteFilm | null;
};

// Events that count as a user gesture, which is what lets a browser play sound.
const GESTURES = ["pointerdown", "pointerup", "touchend", "keydown", "click"] as const;
const LANG_KEY = "zyv-film-lang";
const LANG_LABEL: Record<string, string> = { english: "English", hindi: "हिंदी", marathi: "मराठी" };
const LANG_CODE: Record<string, string> = { english: "en", hindi: "hi", marathi: "mr" };

type Step = "play" | "sound" | "half" | "complete";

/** The language the visitor reads: what they chose before, else their
 *  browser's. Read as an external store so the server render (no preference)
 *  and the first client render agree, and the choice applies straight after. */
function readPreferredLanguage(): string | null {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved) return saved;
  } catch { /* storage blocked */ }
  return /^hi\b/i.test(navigator.language) ? "hindi" : /^mr\b/i.test(navigator.language) ? "marathi" : null;
}
const noSubscription = () => () => {};

function showCaptions(video: HTMLVideoElement | null, visible: boolean) {
  const track = video?.textTracks?.[0];
  if (track) track.mode = visible ? "showing" : "hidden";
}

/** One beacon per step per film per page view; the server names the event. */
export function sendFilmEvent(filmId: string, step: Step | "cta") {
  try {
    fetch("/api/films/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filmId, step, path: window.location.pathname }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* telemetry never breaks the player */
  }
}

/**
 * The film plays WITH sound, starting when it scrolls into view (Roheena,
 * 28 September 2026: "keep the volume auto on"). Browsers refuse audible
 * autoplay until the visitor has interacted with the page, so when that
 * happens the film plays muted and its sound comes on at the visitor's first
 * click, tap or keypress anywhere on the page. A gesture on the video itself
 * is left to its own controls, so the visitor's own mute/pause wins.
 *
 * While the sound is off, a Library film shows its captions: most phones play
 * muted, and the narration is the best part, so the words reach the visitor
 * even when the sound does not. When the film exists in more than one
 * language, a toggle offers each, and the visitor's browser language leads.
 */
export function TaashFilm({ src, poster, title, className = "", style, film }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [soundOn, setSoundOn] = useState(false);
  const cuts = film ? [film, ...(film.versions ?? [])] : [];
  // A cut the visitor picked wins; otherwise the one in their language leads.
  const [pickedId, setPickedId] = useState<string | null>(null);
  const preferred = useSyncExternalStore(noSubscription, readPreferredLanguage, () => null);
  const cut = cuts.find((c) => c.id === pickedId) ?? cuts.find((c) => c.language === preferred) ?? film ?? null;
  const sent = useRef<Set<string>>(new Set());

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let stopListening = () => {};
    const mark = (step: Step) => {
      if (!cut) return;
      const key = `${cut.id}:${step}`;
      if (sent.current.has(key)) return;
      sent.current.add(key);
      sendFilmEvent(cut.id, step);
    };
    const onPlay = () => mark("play");
    const onTime = () => { if (video.duration && video.currentTime / video.duration >= 0.5) mark("half"); };
    const onEnded = () => mark("complete");
    const onVolume = () => { if (!video.muted && !video.paused) mark("sound"); };
    video.addEventListener("play", onPlay);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("ended", onEnded);
    video.addEventListener("volumechange", onVolume);

    async function playWithSound(v: HTMLVideoElement) {
      v.muted = false;
      v.volume = 1;
      try {
        await v.play();
        setSoundOn(true);
        mark("sound");
        return;
      } catch {
        // No gesture yet: fall through to muted playback.
      }
      v.muted = true;
      v.play().catch(() => {});
      const unmute = (event: Event) => {
        // On a phone the finger that starts a SCROLL fires pointerdown too, but
        // the browser doesn't count it as a tap. Unmuting then gets the film
        // paused and the sound never comes, so wait for a gesture that counts.
        // Checked first: a scroll that starts on the film itself is not the
        // visitor reaching for the player's controls either.
        if (navigator.userActivation && !navigator.userActivation.isActive) return;
        if (event.target instanceof Node && frame.current?.contains(event.target)) {
          stopListening();
          return;
        }
        v.muted = false;
        v.volume = 1;
        v.play().then(stopListening, () => {
          // Refused anyway (a browser without userActivation): keep it playing
          // silently and try again on the next gesture.
          v.muted = true;
          v.play().catch(() => {});
        });
      };
      GESTURES.forEach((g) => window.addEventListener(g, unmute, { capture: true }));
      stopListening = () =>
        GESTURES.forEach((g) => window.removeEventListener(g, unmute, { capture: true }));
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        void playWithSound(video);
      },
      { threshold: 0.5 },
    );
    observer.observe(video);
    return () => {
      observer.disconnect();
      stopListening();
      video.removeEventListener("play", onPlay);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("volumechange", onVolume);
    };
    // A new cut is a new <video> (keyed below), so the effect re-runs with it.
  }, [cut?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Captions while the sound is off; out of the way once it is on.
  useEffect(() => {
    showCaptions(ref.current, !soundOn);
  }, [soundOn, cut?.id]);

  async function hearFromStart() {
    const video = ref.current;
    if (!video) return;
    video.currentTime = 0;
    video.muted = false;
    video.volume = 1;
    setSoundOn(true);
    try {
      await video.play();
    } catch {
      // Native controls remain available if the browser declines playback.
    }
  }

  function choose(id: string, language: string | null) {
    try { if (language) localStorage.setItem(LANG_KEY, language); } catch { /* not remembered */ }
    setSoundOn(false);
    setPickedId(id);
  }

  const playSrc = cut?.src ?? src;
  // A poster the page chose for its film wins over the Library's frame; a
  // different-language cut shows its own.
  const playPoster = cut && cut.id !== film?.id ? (cut.poster ?? poster) : (poster ?? cut?.poster);
  return (
    <div ref={frame} style={style} className={`relative overflow-hidden bg-[#221b17] ${className}`}>
      <video
        key={playSrc}
        ref={ref}
        src={playSrc}
        poster={playPoster ?? undefined}
        aria-label={title}
        playsInline
        controls
        preload="metadata"
        onVolumeChange={(event) => setSoundOn(!event.currentTarget.muted)}
        className="h-full w-full object-contain"
      >
        {cut?.captions && (
          <track
            src={cut.captions}
            kind="captions"
            srcLang={LANG_CODE[cut.language ?? ""] ?? "en"}
            label={`${LANG_LABEL[cut.language ?? ""] ?? "English"} narration`}
            default
          />
        )}
        Your browser does not support this video. <a href={playSrc}>Watch the film</a>.
      </video>
      {!soundOn && (
        <button
          type="button"
          onClick={hearFromStart}
          className="absolute bottom-14 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#f8f4ed]/95 px-5 py-3 text-xs font-medium tracking-[0.08em] text-[#2a211c] shadow-lg transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Hear the story from the beginning ↗
        </button>
      )}
      {cuts.length > 1 && (
        <div role="group" aria-label="Narration language" className="absolute right-3 top-3 flex overflow-hidden rounded-full bg-black/55 text-[0.68rem] font-semibold text-white backdrop-blur">
          {cuts.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={c.id === cut?.id}
              onClick={() => choose(c.id, c.language)}
              className={`px-3 py-1.5 ${c.id === cut?.id ? "bg-white text-[#2a211c]" : "hover:bg-white/15"}`}
            >
              {LANG_LABEL[c.language ?? ""] ?? c.language}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
