"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DeskSlot } from "@/app/api/admin/marketing/plan/route";
import { awaitingReview, composableIdea, stateLabel, tileImage, shortDay, shortTitle } from "./desk-lib";
import { Btn, Pill } from "./ui";

// Play the Stories the way a follower will see them: one 9:16 frame at a
// time, the progress bars along the top, five seconds each, tap the sides to
// move. A Story that is not composed yet plays its catalogue stand-in with a
// "planned" mark so the sequence can still be judged as a sequence.

import { StoryLink } from "./StoryLink";

const SECONDS = 5;

export function StoryPlayer({
  stories,
  start,
  today,
  onClose,
  onOpen,
  onApprove,
  onCompose,
  composingId,
  busy,
}: {
  stories: DeskSlot[];
  start: number;
  today: string;
  onClose: () => void;
  onOpen: (s: DeskSlot) => void;
  onApprove: (s: DeskSlot) => void;
  onCompose: (s: DeskSlot) => void;
  composingId: string | null;
  busy: boolean;
}) {
  const [i, setI] = useState(start);
  const [t, setT] = useState(0);
  const [paused, setPaused] = useState(false);
  const [duration, setDuration] = useState(SECONDS);
  const videoRef = useRef<HTMLVideoElement>(null);
  const s = stories[i];
  const videoUrl = s?.post?.format === "story" && /\.mp4(?:\?|$)|\.mov(?:\?|$)/i.test(s.post.media_urls?.[0] ?? "")
    ? s.post.media_urls[0] : null;

  const go = useCallback(
    (d: number) => {
      setT(0);
      setI((k) => Math.min(stories.length - 1, Math.max(0, k + d)));
    },
    [stories.length],
  );

  useEffect(() => {
    if (paused || videoUrl) return;
    const id = setInterval(() => {
      setT((x) => {
        if (x + 0.1 >= SECONDS) {
          setI((k) => (k + 1 < stories.length ? k + 1 : k));
          return 0;
        }
        return x + 0.1;
      });
    }, 100);
    return () => clearInterval(id);
  }, [paused, stories.length, videoUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (paused) video.pause();
    else void video.play().catch(() => setPaused(true));
  }, [paused, videoUrl]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === " ") setPaused((p) => !p);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [go, onClose]);

  if (!s) return null;
  const img = tileImage(s);
  const st = stateLabel(s, today);

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(10,10,10,0.92)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 24, alignItems: "stretch", maxHeight: "92vh" }}>
        <div
          style={{ position: "relative", width: "min(46vh, 380px)", aspectRatio: "9/16", background: "#000", borderRadius: 18, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}
        >
          {videoUrl ? (
            <video key={videoUrl} ref={videoRef} src={videoUrl} poster={img.src ?? undefined} autoPlay muted playsInline controls
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || SECONDS)}
              onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
              onEnded={() => go(1)}
              style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : img.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img.src} alt={s.title ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover", opacity: img.composed ? 1 : 0.8 }} />
          ) : (
            <div style={{ color: "#888", padding: 20 }}>No image yet</div>
          )}
          {/* progress bars */}
          <div style={{ position: "absolute", top: 10, left: 10, right: 10, display: "flex", gap: 4 }}>
            {stories.map((_, k) => (
              <div key={k} style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.35)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", background: "#fff", width: k < i ? "100%" : k === i ? `${(t / (videoUrl ? duration : SECONDS)) * 100}%` : "0%" }} />
              </div>
            ))}
          </div>
          <div style={{ position: "absolute", top: 22, left: 12, color: "#fff", fontSize: 12, fontWeight: 600, textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}>
            zyvorah. · {shortDay(s.day_key)}
          </div>
          {!img.composed && (
            <div style={{ position: "absolute", bottom: 14, left: 12, right: 12, color: "#fff", fontSize: 12, textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}>
              Not composed yet — this is the catalogue picture. The Story frame puts the words in the upper third.
            </div>
          )}
          {/* tap zones */}
          <div onClick={() => go(-1)} style={{ position: "absolute", top: 60, bottom: 60, left: 0, width: "35%", cursor: "pointer" }} />
          <div onClick={() => go(1)} style={{ position: "absolute", top: 60, bottom: 60, right: 0, width: "35%", cursor: "pointer" }} />
        </div>

        <div style={{ width: 320, color: "#fff", display: "flex", flexDirection: "column", gap: 12, alignSelf: "center", maxHeight: "92vh", overflowY: "auto" }}>
          <div style={{ fontSize: 12, color: "#aaa" }}>
            Story {i + 1} of {stories.length}
          </div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{shortTitle(s)}</div>
          <div>
            <Pill label={st.label} colour={st.colour} bg={st.bg} />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
            {awaitingReview(s) && (
              <Btn kind="primary" disabled={busy} onClick={() => { setPaused(true); onApprove(s); }}>
                Approve creative
              </Btn>
            )}
            {composableIdea(s) && !s.post && (
              <Btn kind="primary" disabled={busy} onClick={() => { setPaused(true); onCompose(s); }}>
                {composingId === s.id ? "Composing…" : "Compose for review"}
              </Btn>
            )}
            <Btn kind="dark" onClick={() => onOpen(s)}>Open details</Btn>
            <Btn onClick={() => setPaused((p) => !p)}>{paused ? "Play" : "Pause"}</Btn>
            <Btn onClick={onClose}>Close</Btn>
          </div>
          <StoryLink slot={s} />
          {s.hook && <div style={{ fontSize: 14, lineHeight: 1.5 }}>{s.hook}</div>}
          {s.caption && <div style={{ fontSize: 13, color: "#ccc", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{s.caption}</div>}
          {s.visual_brief && <div style={{ fontSize: 12, color: "#999", lineHeight: 1.5 }}>Brief: {s.visual_brief}</div>}
          <div style={{ fontSize: 11, color: "#777" }}>← → to move · space to pause · esc to close</div>
        </div>
      </div>
    </div>
  );
}
