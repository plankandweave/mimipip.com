"use client";

import { useEffect, useRef } from "react";

export function NafasLivingRoomFilm() {
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const pauseForGuide = () => video.current?.pause();
    document.addEventListener("nafas-guide-play", pauseForGuide);
    return () => document.removeEventListener("nafas-guide-play", pauseForGuide);
  }, []);

  return (
    <video
      ref={video}
      controls
      playsInline
      preload="none"
      poster="/nafas/living-room/poster-cutout-v2.webp"
      aria-label="Nafas describes her painting as it appears in a living room"
      className="aspect-video w-full rounded-[18px] bg-[#f3efe8] object-cover"
      onPlay={() => document.dispatchEvent(new Event("nafas-film-play"))}
      onPause={() => document.dispatchEvent(new Event("nafas-film-stop"))}
      onEnded={() => document.dispatchEvent(new Event("nafas-film-stop"))}
    >
      <source src="/nafas/living-room/nafas-living-room-stable.mp4" type="video/mp4" />
      Your browser does not support video playback.
    </video>
  );
}
