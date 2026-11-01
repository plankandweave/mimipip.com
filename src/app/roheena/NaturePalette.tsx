"use client";

import { useEffect, useState, type CSSProperties } from "react";
import styles from "./nature-palette.module.css";

const colours = [
  { name: "Berry", hex: "#8D1008", x: 40, y: 88, note: "A small, deep accent.", light: false },
  { name: "Ember", hex: "#D96822", x: 64, y: 18, note: "A little warmth changes everything.", light: false },
  { name: "Branch", hex: "#A18775", x: 45, y: 23, note: "The quiet colour holding it together.", light: true },
  { name: "Coral", hex: "#E95745", x: 17, y: 33, note: "A bright interruption.", light: false },
  { name: "Sand", hex: "#CBB39D", x: 48, y: 65, note: "Something soft to return to.", light: true },
  { name: "Oat", hex: "#E5D8C4", x: 52, y: 31, note: "Space for the other colours to breathe.", light: true },
];

export default function NaturePalette() {
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [amount, setAmount] = useState(35);
  const colour = colours[active];
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setActive(value => (value + 1) % colours.length), 2600);
    return () => window.clearInterval(timer);
  }, [playing]);
  useEffect(() => {
    const stop = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener("visibilitychange", stop);
    return () => document.removeEventListener("visibilitychange", stop);
  }, []);
  function select(index: number) { setActive(index); setPlaying(false); }
  return <div className={styles.experience} style={{ "--selected": colour.hex, "--amount": `${amount}%` } as CSSProperties}>
    <div className={styles.topline}><span>A nature study / 01</span><button onClick={() => setPlaying(!playing)} aria-pressed={playing}>{playing ? "Ⅱ Pause the journey" : "▷ Follow the colours"}</button></div>
    <div className={styles.words}><p>Choose a colour. Adjust its balance.</p></div>
    <div className={styles.stage}>
      <div className={styles.photograph}>
        <img src="/roheena/palettes/birds-source.jpg" alt="Two birds among branches and vivid red berries, the nature photograph behind this colour study" loading="lazy" />
        {colours.map((item, index) => <button key={item.name} className={`${styles.pin} ${active === index ? styles.activePin : ""}`} style={{left:`${item.x}%`,top:`${item.y}%`,background:item.hex}} onClick={() => select(index)} aria-label={`Explore ${item.name}`} aria-pressed={active === index} />)}
        <span className={styles.photoLabel}>From my collection of nature references</span>
      </div>
      <div className={styles.palettePanel}>
        <div className={styles.colourName} aria-live={playing ? "off" : "polite"}><span>YOUR COLOUR COMPOSITION</span><h4>{colour.name} <span>{amount}%</span></h4><p>{amount < 25 ? "A small accent in the composition." : amount < 50 ? "A balance of colour and contrast." : "The dominant colour in the composition."}</p></div>
        <div className={styles.colourField} aria-label={`${colour.name} occupies ${amount}% of the palette`}>
          {colours.map((item,index) => <button key={item.name} onClick={() => select(index)} aria-label={`Select ${item.name} in composition`} style={{background:item.hex, flexBasis:`${index === active ? amount : (100-amount)/5}%`, color:item.light ? "#302a24" : "#fff8ed"}}><span>{item.name}</span><span>{index === active ? `${amount}%` : ""}</span></button>)}
        </div>
        <div className={styles.mix}><label htmlFor="colour-amount">How much {colour.name.toLowerCase()}? <output>{amount}%</output></label><input id="colour-amount" type="range" min="10" max="75" value={amount} onChange={event => { setPlaying(false); setAmount(Number(event.target.value)); }} aria-label="Explore the proportion of the selected colour" aria-valuetext={`${amount}% ${colour.name}`} /><div className={styles.rangeEnds}><span>A small accent</span><span>The dominant colour</span></div></div>
      </div>
    </div>
    <div className={styles.bottom}>
      <div className={styles.swatches} aria-label="Explore the palette">{colours.map((item,index) => <button key={item.name} onClick={() => select(index)} aria-pressed={active === index} aria-label={`${item.name}, ${item.hex}`} className={active === index ? styles.chosen : ""}><span style={{background:item.hex}} /><span>{item.name}</span></button>)}</div>

    </div>

  </div>;
}
