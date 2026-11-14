"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";

// Owner-approved order. Use existing catalogue photography only.
// Frame each installed product clearly at desktop, tablet and mobile widths.
const slides = [
  { title: "A room for every little story.", category: "Wallpaper worlds", description: "From their very first room to their next big adventure.", href: "/products/safari-celebration", cta: "Explore this wallpaper", color: "#edf3ed", images: [{ src: "/review/assets/wallpaper-safari-celebration.webp", alt: "Safari Celebration wallpaper covering a playroom wall", width: 1440, height: 960 }] },
  { title: "A little garden at their feet.", category: "Wall borders", description: "Sage Meadow adds a gentle finishing touch along the bottom of their wall.", href: "/collections/mimi-borders", cta: "Explore borders", color: "#f7eeeb", images: [{ src: "/review/assets/sage-meadow-front-v2.webp", alt: "Sage Meadow border installed along the bottom of a nursery wall", width: 1374, height: 1145 }] },
  { title: "Dream a little bigger.", category: "Wallpaper worlds", description: "Soft balloons and little stars for a room full of possibility.", href: "/products/balloon-dreams", cta: "Explore this wallpaper", color: "#eaf2f7", images: [{ src: "/review/assets/wallpaper-balloon-dreams.webp", alt: "Balloon Dreams wallpaper in a nursery", width: 1440, height: 960 }] },
  { title: "Hello, Bathroom Buddies.", category: "Bathroom Buddies", description: "Friendly little faces for their everyday routines.", href: "/collections/bathroom-buddies", cta: "Meet the buddies", color: "#f9eee4", images: [{ src: "/review/assets/bathroom-buddies-room-cover.webp", alt: "Existing Bear Bathroom Buddy design applied to a toilet lid", width: 1600, height: 900 }] },
];

export default function MimiHomeHero() {
  const [index, setIndex] = useState(0);
  const slide = slides[index];
  return (
    <section className="mimi-home-hero" aria-label="Featured MimiPip designs" aria-roledescription="carousel"
      style={{ "--mimi-hero-tint": slide.color } as CSSProperties}>
      <div className="mimi-hero-layout">
        <div className="mimi-hero-copy">
          <p className="mimi-eyebrow">Little spaces, big possibilities · 0–10</p>
          <p className="mimi-hero-category">{slide.category}</p>
          <h1>{slide.title}</h1>
          <p className="mimi-hero-description">{slide.description}</p>
          <Link className="mimi-hero-cta" href={slide.href}>{slide.cta}</Link>
        </div>
        <div className="mimi-hero-art" key={index}>
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
      </div>
    </section>
  );
}
