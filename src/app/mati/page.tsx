
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import { BookColophon } from "./BookColophon";
import Image from "@/components/SiteImage";
import Link from "next/link";
import { getTaashCollection, taashGroup, type TaashCard } from "@/lib/taash-queries";
import { BookTilt } from "@/components/BookTilt";
import { DesignCard } from "./DesignCard";
import { TaashBookExperience } from "./TaashBookExperience";
import { isLocal } from "./story";
import { SITE_URL } from "@/lib/seo";
import {
  BOOK_COVER,
  MATI_MARK,
  ZYVORAH_MARK,
  houseMarksReady,
  BOOK_STORY,
  bookAssetReady,
  bookAssetSrc,
  type BookSlot,
} from "@/lib/taash-book";

// The collection is fixed and its copy comes from a printed book, so this page
// changes only when someone re-seeds. An hour is a backstop, not a refresh.
export const revalidate = 3600;

export const metadata: Metadata = editorialMetadata("/mati");

/** The six inks the book names on its palette page, with the hex actually
 *  measured off the design samplees. */
const INKS = [
  { dev: "काजल", name: "Kaajal", use: "Block ink", hex: "#1C1913" },
  { dev: "सिंदूर", name: "Sindoor", use: "The oxblood", hex: "#79231A" },
  { dev: "लाख", name: "Lakh", use: "Shadow red", hex: "#5E1A14" },
  { dev: "धूल", name: "Dhool", use: "Foxing, dust", hex: "#5A4C3A" },
  { dev: "गोंद", name: "Gond", use: "Gummed tape", hex: "#C7A57B" },
  { dev: "काग़ज़", name: "Kaagaz", use: "Card stock", hex: "#EBDCC2" },
];

/** A page of the book. The edition is still being revised, so a slot whose
 *  rendition has not been rebuilt yet shows a labelled frame — never a broken
 *  image, and never a stale picture pretending to be the current page. */
function BookImage({
  slot,
  width,
  height,
}: {
  slot: BookSlot;
  width: number;
  height: number;
}) {
  if (!bookAssetReady(slot)) {
    return (
      <figure className="book-slot">
        <span className="label">{slot.caption}</span>
        <span className="label">Awaiting the next export</span>
      </figure>
    );
  }
  return (
    <figure className="book-figure">
      <Image
        src={bookAssetSrc(slot)}
        alt={slot.caption}
        width={width}
        height={height}
        unoptimized
        sizes="(max-width: 900px) 100vw, 50vw"
      />
      <figcaption className="label">{slot.caption}</figcaption>
    </figure>
  );
}

/**
 * A ground, shown the size it deserves: a full-width band of the texture itself
 * between the design sections — not a small product card. The grounds are the
 * surfaces the game is played on, and at card size they read as blank tiles;
 * at a metre tall they read as material.
 */
function GroundBand({ card, first = false }: { card?: TaashCard; first?: boolean }) {
  if (!card?.flat) return null;
  const inner = (
    <>
      <div className="ground-art" style={{ backgroundImage: `url(${card.flat})` }} aria-hidden />
      <div className="ground-caption">
        {first ? (
          <p className="label" lang="hi">
            ज़मीन{" "}
            <span className="gloss-inline">
              — <i>zameen</i>, the ground. Not backgrounds: the surfaces that give TAASH
              its depth.
            </span>
          </p>
        ) : null}
        <h3 className="dev" lang="hi">
          {card.devanagari}
        </h3>
        <p className="card-line">{card.roomLine}</p>
      </div>
    </>
  );
  return card.isDraft ? (
    <section className="ground-band">{inner}</section>
  ) : (
    <Link href={`/products/${card.handle}`} className="ground-band" aria-label={card.name}>
      {inner}
    </Link>
  );
}

  async function MatiPage() {
  const cards = await getTaashCollection();
  const repeats = taashGroup(cards, "repeat");
  const murals = taashGroup(cards, "mural");
  const grounds = taashGroup(cards, "ground");

  // The masthead restates the jacket: the Bisaat — Gehra field with a card-stock
  // panel on it. If that plate is ever missing, fall back to whatever leads.
  const cover = cards.find((c) => c.handle === "taash-bisaat-gehra") ?? cards[0];
  const marks = houseMarksReady();
  // /collections/taash 404s while every design is a draft (the collection page
  // refuses to render empty, correctly). Until the gate opens on launch day,
  // THIS page is the collection — so the closing button walks the reader back
  // up to the designs instead of into a dead end. The hour the launch
  // publishes, the same button starts pointing at the collection.
  const collectionLive = cards.some((c) => !c.isDraft);

  return (
    <main>
      {/* --- masthead --- */}
      <header className="masthead">
        {/* Tiled, not stretched. The jacket prints Bisaat — Gehra as a FIELD of
            chequered card faces; a single tile blown up to fill the width shows
            one enormous heart instead, which is a different design. */}
        {cover?.flat ? (
          <div
            className="masthead-art"
            aria-hidden
            style={{ backgroundImage: `url(${cover.flat})` }}
          />
        ) : null}
        <div className="masthead-scrim" />
        <div className="plate">
          <div className="dev">ताश</div>
          <h1>TAASH</h1>
          <hr />
          {/* Both houses at one size — as two marks once Mati's wordmark is in
              the repository, and until then as two names in one face. Never one
              of each: a logotype beside a typeset name reads as a brand and a
              caption rather than as a collaboration. */}
          <p className="houses">
            {marks ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={MATI_MARK} alt="Mati" className="house-mark mati" />
                <span className="cross">×</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ZYVORAH_MARK} alt="Zyvorah" className="house-mark" />
              </>
            ) : (
              <>
                <span>Mati</span>
                <span className="cross">×</span>
                <span>Zyvorah</span>
              </>
            )}
          </p>
          <p className="campaign-line">Two houses. One deck.</p>
          <div className="masthead-actions">
            <a href="#patte" className="btn-taash">Explore wallpapers</a>
            <a href="#book" className="btn-quiet">Preview &amp; pre-order the book</a>
          </div>
        </div>
      </header>
      <nav className="collection-nav wrap" aria-label="Explore TAASH">
        <a href="#patte">The murals</a>
        <a href="#bisaat">The repeats</a>
        <a href="#book">The book · pre-order</a>
      </nav>

      {/* --- the collection in plain language --- */}
      <section className="narrow">
        <p className="label section-label">Mati × Zyvorah</p>
        <p className="lede">One old sheet of cards became a collection for walls.</p>
        <p className="prose">
          TAASH began with a hand-printed sheet of playing cards found folded inside a
          tin. It had never been cut into a deck. The red and black inks had shifted,
          and its pencil lines, folds and stains were still visible.
        </p>
        <p className="prose">
          We kept those marks and used them to create 21 wallpapers: 14 patterns that
          repeat at a fixed scale and 7 murals made as one complete wall. Three pale,
          textured grounds complete the collection.
        </p>
      </section>

      {/* --- hero pair: one room, one touch --- */}
      {/* One powerful room beside one close, tactile crop of the same print —
          the whole proposition in a single row: this is a room, and this is
          what the wall feels like from a foot away. */}
      {cover ? (
        <section className="wrap hero-pair">
          <figure>
            {cover.hero ? (
              <Image
                src={cover.hero}
                alt="Bisaat — Gehra, in a room"
                width={1536}
                height={1152}
                priority
                unoptimized={isLocal(cover.hero)}
                sizes="(max-width: 900px) 100vw, 60vw"
              />
            ) : null}
          </figure>
          <figure>
            {(cover.crop ?? cover.flat) ? (
              <Image
                src={(cover.crop ?? cover.flat)!}
                alt="Bisaat — Gehra — the print, close"
                width={1600}
                height={1200}
                priority
                unoptimized={isLocal((cover.crop ?? cover.flat)!)}
                sizes="(max-width: 900px) 100vw, 40vw"
              />
            ) : null}
          </figure>
        </section>
      ) : null}

      {/* --- the centred passage --- */}
      <section className="passage">
        <h2>The original marks are the design.</h2>
        <p>
          One spade is darker than the next. A heart sits slightly away from the colour
          below it. A pencil circle crosses the paper. These are not effects added
          later; they are details from the old printed sheet.
        </p>
        <p>Up close, you see the hand. From across the room, you see the whole wall.</p>
      </section>

      <section className="narrow">
        <p className="prose">
          Start with the kind of room you want. Choose a bold mural for one clear focal
          wall, a repeating pattern for rhythm across a larger space, or a pale ground
          when you want texture without a strong motif.
        </p>
        <p className="prose">
          Every wallpaper is made to order. Repeats keep the same approved print scale.
          Murals are adjusted to your wall so the complete composition fits the room.
        </p>
      </section>

      {/* --- पत्ते: the cards, played whole --- */}
      <section className="wrap" id="patte">
        <h2 className="group-dev" lang="hi">पत्ते</h2>
        <p className="group-gloss">
          <i>Patte</i> means the cards. These seven murals are complete compositions,
          not repeating tiles. We adjust their scale and placement for your wall.
        </p>
        <div className="grid">
          {murals.map((c, i) => (
            <DesignCard key={c.handle} c={c} i={i} />
          ))}
        </div>
      </section>

      {/* --- ground interlude: चूना --- */}
      <GroundBand card={grounds.find((g) => g.handle === "taash-chuna")} first />

      {/* --- बिसात: the repeats --- */}
      <section className="wrap" id="bisaat">
        <h2 className="group-dev" lang="hi">बिसात</h2>
        <p className="group-gloss">
          <i>Bisaat</i> means the board. These 14 patterns repeat across the wall at
          their original approved scale. The room changes, but the size of the print
          does not.
        </p>
        <div className="grid">
          {repeats.map((c, i) => (
            <DesignCard key={c.handle} c={c} i={i} />
          ))}
        </div>
      </section>

      {/* --- ground interlude: छींट --- */}
      <GroundBand card={grounds.find((g) => g.handle === "taash-chheent")} />

      <section className="narrow">
        <h2 className="section-head">What you approve is what we print.</h2>
        <p className="prose">
          For a repeat, we keep the original scale and calculate the material needed to
          match the pattern correctly at every join. For a mural, we prepare the whole
          design for the exact width and height of your wall.
        </p>
        <p className="prose">
          Before production, you approve a design sample for colour, scale and
          texture. Screen colour is useful for choosing, but the sample is the final
          reference.
        </p>
      </section>

      {/* --- ground interlude: रेशा --- */}
      <GroundBand card={grounds.find((g) => g.handle === "taash-resha")} />

      {/* --- the six inks --- */}
      <section className="wrap">
        <p className="label section-label">Palette</p>
        <h2 className="section-head">Six colours from the original sheet.</h2>
        <div className="inks">
          {INKS.map((i) => (
            <div key={i.name}>
              <span className="ink-chip" style={{ background: i.hex }} />
              <div className="ink-name">
                <div className="dev" style={{ fontSize: "0.95rem" }}>
                  {i.dev}
                </div>
                <div style={{ fontSize: "0.95rem" }}>{i.name}</div>
                <div className="label" style={{ marginTop: "0.2rem" }}>
                  {i.use}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* --- the book --- */}
      <section className="book" id="book" aria-labelledby="taash-book-heading">
        <div className="wrap book-layout">
          <div>
            <BookTilt>
              <BookImage slot={BOOK_COVER} width={1400} height={1633} />
            </BookTilt>
          </div>
          <div>
            <p className="label">First edition · now open for pre-order</p>
            <h2 className="section-head" id="taash-book-heading">TAASH — The Book</h2>
            <p className="prose prose-left">
              The complete collection in one large-format book. Look through all 132
              pages here, then pre-order a printed copy for your home, library or
              studio.
            </p>
            <div className="book-story">
              {BOOK_STORY.map((b) => (
                <div key={b.head}>
                  <h3>{b.head}</h3>
                  <p>{b.body}</p>
                </div>
              ))}
            </div>
            {/* The measurements, at the foot, the way a book states itself on
                its own last page. People who collect books read colophons; a
                spec table is a docket for the bindery. */}
            <BookColophon />
            <TaashBookExperience />
          </div>
        </div>
      </section>

      {/* --- closing --- */}
      <section className="narrow closing">
        <h2 className="section-head">Choose TAASH for your room.</h2>
        <p className="prose">
          Choose a mural when you want one complete image to lead the room. Choose a
          repeat when you want the pattern to continue across a wider wall. Choose a
          ground when you want a quiet surface with texture and depth.
        </p>
        {/* The one piece of specification worth keeping on a collection page:
            what everything prints on, and what the price on each design does and
            does not include. */}
        <p className="fine">
          The collection uses lined and linen-matte textures, as shown on each product.
          Prices include GST. Installation is quoted separately. Always approve the
          design sample before the final wallpaper order.
        </p>
        <p className="actions">
          {collectionLive ? (
            <Link href="/collections/taash" className="btn-taash">
              Explore the collection
            </Link>
          ) : (
            <a href="#patte" className="btn-taash">
              Explore the collection
            </a>
          )}
          <Link href="/contact" className="btn-quiet">
            Speak to Zyvorah
          </Link>
        </p>
      </section>
    </main>
  );
}

export default withBrandEditorial("/mati", MatiPage);
