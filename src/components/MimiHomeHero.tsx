"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";

// Owner-approved order. Use existing catalogue photography only.
// Keep entire images visible: the installed product may be at either wall edge.
const slides = [
  { title: "A room for every little story.", category: "Wallpaper worlds", description: "From their very first room to their next big adventure.", href: "/products/safari-celebration", cta: "Explore this wallpaper", color: "#edf3ed", images: [{ src: "/review/assets/wallpaper-safari-celebration.webp", alt: "Safari Celebration wallpaper covering a playroom wall", width: 1440, height: 960 }] },
  { title: "Little details. Lovely together.", category: "Wallpaper & low borders", description: "Explore Balloon Dreams wallpaper and the Sage Meadow border at little-eye level.", href: "/collections/mimi-borders", cta: "Explore borders", color: "#f7eeeb", images: [{ src: "/review/assets/wallpaper-balloon-dreams.webp", alt: "Balloon Dreams wallpaper in a nursery", width: 1440, height: 960 }, { src: "/review/assets/sage-meadow-front-v2.webp", alt: "Sage Meadow border installed along the bottom of a nursery wall", width: 1374, height: 1145 }], secondary: { href: "/products/balloon-dreams", label: "Explore Balloon Dreams" } },
  { title: "A little sunshine up above.", category: "Ceiling borders", description: "Buttercup Morning brings a happy finishing touch to the top of their room.", href: "/collections/mimi-borders", cta: "Explore borders", color: "#fff4d9", images: [{ src: "/review/assets/buttercup-morning-front-v2.webp", alt: "Buttercup Morning border fully visible just below the ceiling", width: 1374, height: 1145 }] },
  { title: "Heads in the clouds.", category: "Ceiling borders", description: "Cloud Parade adds a cheerful sky along the ceiling line.", href: "/collections/mimi-borders", cta: "Explore borders", color: "#eaf2f7", images: [{ src: "/review/assets/cloud-parade-front-v2.webp", alt: "Cloud Parade sun and cloud border fully visible at the ceiling", width: 1374, height: 1145 }] },
  { title: "Ready, steady, little feet.", category: "Floor games", description: "Make space for a hop, a jump and a little everyday play.", href: "/products/hopscotch-pastel-play", cta: "Explore floor games", color: "#f0edf7", images: [{ src: "/review/assets/hopscotch-pastel-play-square-room.webp", alt: "The complete Pastel Play hopscotch floor game, from one to ten", width: 1254, height: 1254 }] },
  { title: "Hello, Bathroom Buddies.", category: "Bathroom Buddies", description: "Friendly little faces for their everyday routines.", href: "/collections/bathroom-buddies", cta: "Meet the buddies", color: "#f9eee4", images: [{ src: "/review/assets/bathroom-buddies-room-cover.webp", alt: "Existing Bear Bathroom Buddy design applied to a toilet lid", width: 1600, height: 900 }] },
];

export default function MimiHomeHero() {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setPlaying(!query.matches);
    const visibility = () => setHidden(document.hidden);
    sync(); visibility();
    query.addEventListener("change", sync);
    document.addEventListener("visibilitychange", visibility);
    return () => { query.removeEventListener("change", sync); document.removeEventListener("visibilitychange", visibility); };
  }, []);
  useEffect(() => {
    if (!playing || hovered || focused || hidden) return;
    const timer = window.setInterval(() => setIndex(i => (i + 1) % slides.length), 7000);
    return () => window.clearInterval(timer);
  }, [playing, hovered, focused, hidden]);
  const slide = slides[index];
  return (
    <section className="mimi-home-hero" aria-label="Six ways to make their space" aria-roledescription="carousel"
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)} onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false); }}
      style={{ "--mimi-hero-tint": slide.color } as CSSProperties}>
      <div className="mimi-hero-layout">
        <div className="mimi-hero-copy">
          <p className="mimi-eyebrow">Little spaces, big possibilities · 0–10</p>
          <p className="mimi-hero-category">{slide.category}</p>
          <h1>{slide.title}</h1>
          <p className="mimi-hero-description">{slide.description}</p>
          <Link className="mimi-hero-cta" href={slide.href}>{slide.cta}<span aria-hidden="true"> ↗</span></Link>
          {slide.secondary && <Link className="mimi-hero-secondary" href={slide.secondary.href}>{slide.secondary.label}</Link>}
        </div>
        <div className={"mimi-hero-art" + (slide.images.length > 1 ? " mimi-hero-pair" : "")} key={index}>
          {slide.images.map(img => (
            <img key={img.src} src={img.src} alt={img.alt} width={img.width} height={img.height}
              fetchPriority={index === 0 ? "high" : "auto"} className="mimi-hero-image" />
          ))}
        </div>
      </div>
      <div className="mimi-hero-controls">
        <div className="mimi-hero-dots">
          {slides.map((s, i) => <button key={s.title} type="button" aria-label={"Show slide " + (i + 1) + ": " + s.category}
            aria-current={i === index ? "true" : undefined} onClick={() => setIndex(i)}><span /></button>)}
        </div>
        <div className="mimi-hero-actions">
          <span className="mimi-hero-count">{String(index + 1).padStart(2, "0")} / 06</span>
          <button type="button" onClick={() => setIndex(i => (i + slides.length - 1) % slides.length)} aria-label="Previous slide">←</button>
          <button type="button" onClick={() => setPlaying(p => !p)} aria-label={playing ? "Pause slideshow" : "Play slideshow"}>{playing ? "Pause" : "Play"}</button>
          <button type="button" onClick={() => setIndex(i => (i + 1) % slides.length)} aria-label="Next slide">→</button>
        </div>
      </div>
    </section>
  );
}
