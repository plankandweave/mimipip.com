"use client";

import { useCallback, useRef, useState } from "react";
import Image from "@/components/SiteImage";
import Link from "next/link";
import type { TaashCard } from "@/lib/taash-queries";
import { isLocal } from "./story";

/**
 * Whether the card at position `i` in a two-column grid leads on the close crop
 * rather than the room render.
 *
 * A zigzag, not a column: `i % 2` would make the left-hand column rooms and the
 * right-hand column crops all the way down, which is a rule the eye learns in
 * two rows and then stops reading. This alternates BOTH across a row and down
 * the page — room, crop / crop, room — so the material and the room keep
 * changing sides.
 */
const leadsOnCrop = (i: number) => (i + Math.floor(i / 2)) % 2 === 1;

type Plate = { src: string; alt: string };

/** Every picture a design owns, as the plate view deals them: the rooms first
 *  (hero leading — the order scenes already arrive in), then the close crop,
 *  then the flat artwork. De-duplicated, because a design without a crop leads
 *  its card on the room render that is already first in scenes. */
function platesFor(c: TaashCard): Plate[] {
  const seen = new Set<string>();
  const plates: Plate[] = [];
  const deal = (src: string | null, alt: string) => {
    if (src && !seen.has(src)) {
      seen.add(src);
      plates.push({ src, alt });
    }
  };
  for (const s of c.scenes) deal(s.url, s.alt);
  deal(c.crop, `${c.name} — the print, close`);
  deal(c.flat, `${c.name} — the artwork`);
  return plates;
}

/** One design. Two per row throughout, one ratio throughout, and no card box:
 *  the caption sits directly on the page the way a plate caption sits on the
 *  paper. Boxes made twenty-four designs read as a catalogue listing.
 *
 *  Clicking a card opens the plate view — the design dealt to the table at
 *  full size, with every rendition it owns and, once the design is published,
 *  the way into its product page. The card itself stays an anchor to the
 *  product page so crawlers (and a cmd-click) still reach it directly. */
export function DesignCard({ c, i }: { c: TaashCard; i: number }) {
  // The crop is a real window cut into the artwork at 4x, not the room render
  // zoomed — so a page of them shows the material rather than more of the same
  // photographs. Where a design has no crop yet, its room render stands in.
  const crop = leadsOnCrop(i) ? c.crop : null;
  const src = crop ?? c.hero ?? c.flat;
  const alt = crop ? `${c.name} — the print, close` : c.heroAlt;

  const plates = platesFor(c);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [plate, setPlate] = useState(0);
  // The plates render only after the first open: two dozen cards each carrying
  // several full-size renditions would otherwise all load with the page.
  const [dealt, setDealt] = useState(false);

  const open = useCallback(() => {
    if (plates.length === 0) return;
    // Open on the picture the card led with, so the view continues the click
    // rather than starting somewhere else.
    const at = src ? plates.findIndex((p) => p.src === src) : -1;
    setPlate(at >= 0 ? at : 0);
    setDealt(true);
    dialogRef.current?.showModal();
  }, [plates, src]);

  const close = () => dialogRef.current?.close();

  const step = (by: number) =>
    setPlate((p) => (p + by + plates.length) % plates.length);

  const body = (
    <>
      <figure className="ratio-plate">
        {src ? (
          <Image
            src={src}
            alt={alt}
            width={1200}
            height={900}
            unoptimized={isLocal(src)}
            sizes="(max-width: 640px) 100vw, 50vw"
          />
        ) : null}
      </figure>
      <div className="card-body">
        <h3 className="dev card-dev" lang="hi">
          {c.devanagari}
        </h3>
        <p className="card-latin">{c.name}</p>
        <p className="card-line">{c.roomLine}</p>
      </div>
    </>
  );

  const current = plates[plate];

  // The plate view. A sibling of the card, never a child: nesting a dialog
  // (whose caption holds its own product link) inside the card's anchor would
  // be an <a> inside an <a>, and the card's click-intercept would swallow the
  // caption link's navigation along with its own.
  const plateView = (
    <dialog
      ref={dialogRef}
      className="plate-view"
      aria-label={`${c.name} — plates`}
      onClick={(e) => {
        // A click on the backdrop lands on the dialog element itself; a click
        // on anything inside it lands on a child.
        if (e.target === dialogRef.current) close();
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") step(1);
        if (e.key === "ArrowLeft") step(-1);
      }}
    >
      <figure className="plate-stage">
        {dealt && current ? (
          // The plate itself is the way into the shop once the design is
          // published — the caption's CTA remains, but the picture is what the
          // hand is already on. A draft's plate stays a picture: there is no
          // product page behind it yet.
          !c.isDraft ? (
            <Link
              href={`/products/${c.handle}`}
              className="plate-link"
              aria-label={`${c.name} — shop this design`}
            >
              <Image
                src={current.src}
                alt={current.alt}
                width={1600}
                height={1200}
                unoptimized={isLocal(current.src)}
                sizes="94vw"
              />
            </Link>
          ) : (
            <Image
              src={current.src}
              alt={current.alt}
              width={1600}
              height={1200}
              unoptimized={isLocal(current.src)}
              sizes="94vw"
            />
          )
        ) : null}
        {/* The arrows live inside the stage so their 50% is the swatch's own
            middle — against the dialog they hung below centre by half the
            caption's height. Siblings of the plate link, never children: a
            button inside the anchor would navigate instead of stepping. */}
        {plates.length > 1 ? (
          <>
            <button
              type="button"
              className="plate-arrow prev"
              aria-label="Previous plate"
              onClick={() => step(-1)}
            >
              ‹
            </button>
            <button
              type="button"
              className="plate-arrow next"
              aria-label="Next plate"
              onClick={() => step(1)}
            >
              ›
            </button>
          </>
        ) : null}
      </figure>
      {plates.length > 1 ? (
        <div className="plate-dots" role="tablist" aria-label="Plates">
          {plates.map((p, n) => (
            <button
              key={p.src}
              type="button"
              className={n === plate ? "on" : undefined}
              aria-label={p.alt}
              aria-current={n === plate}
              onClick={() => setPlate(n)}
            />
          ))}
        </div>
      ) : null}
      <div className="plate-caption">
        <h3 className="dev" lang="hi">
          {c.devanagari}
        </h3>
        <p className="plate-name">{c.name}</p>
        <p className="plate-line">{c.roomLine}</p>
        {/* The way into the shop, one deliberate step past looking. Absent on a
            draft — the product page does not exist yet, and the page carries no
            production-status marks. */}
        {!c.isDraft ? (
          <Link href={`/products/${c.handle}`} className="btn-taash plate-cta">
            View this wallpaper
          </Link>
        ) : null}
      </div>
      <button type="button" className="plate-close" aria-label="Close" onClick={close}>
        ✕
      </button>
    </dialog>
  );

  // Unpublished designs open the plate view but are not linked: the product
  // page does not exist yet, and a link into a 404 reads as a broken site
  // rather than a collection that has not launched. No visible mark either —
  // the page is a collection, not a production status board.
  return (
    <>
      {c.isDraft ? (
        <div
          className="card is-draft cursor-pointer"
          role="button"
          tabIndex={0}
          aria-label={c.name}
          onClick={open}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              open();
            }
          }}
        >
          {body}
        </div>
      ) : (
        <Link
          href={`/products/${c.handle}`}
          className="card"
          aria-label={c.name}
          onClick={(e) => {
            // A plain click deals the plate view; a modified click (new tab,
            // new window) keeps the anchor's own meaning.
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            if (plates.length === 0) return;
            e.preventDefault();
            open();
          }}
        >
          {body}
        </Link>
      )}
      {plateView}
    </>
  );
}
