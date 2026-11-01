"use client";
import { useEffect, useRef, useState } from "react";
import styles from "./roheena.module.css";

/** Optional, locally synthesized paper rustle; no autoplay or external audio. */
export default function JournalAtmosphere() {
  const [enabled, setEnabled] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const rustle = (event: Event) => {
      if (!(event.target instanceof HTMLDetailsElement) || !event.target.closest('[data-journal]')) return;
      const context = audio.current;
      if (!context || context.state !== "running") return;
      const duration = .32;
      const buffer = context.createBuffer(1, context.sampleRate * duration, context.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / samples.length) ** 2;
      const source = context.createBufferSource(); source.buffer = buffer;
      const filter = context.createBiquadFilter(); filter.type = "bandpass"; filter.frequency.value = 1800; filter.Q.value = .6;
      const gain = context.createGain(); gain.gain.value = .045;
      source.connect(filter).connect(gain).connect(context.destination); source.start();
      source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    };
    document.addEventListener("toggle", rustle, true);
    return () => document.removeEventListener("toggle", rustle, true);
  }, [enabled]);
  useEffect(() => () => { void audio.current?.close(); }, []);
  async function toggle() {
    if (enabled) { setEnabled(false); return; }
    try { audio.current ??= new AudioContext(); await audio.current.resume(); setEnabled(true); } catch { setEnabled(false); }
  }
  return <button type="button" className={styles.soundToggle} onClick={toggle} aria-pressed={enabled} title="A soft paper sound when you open or close a notebook entry">Paper sounds · {enabled ? "on" : "off"}</button>;
}
