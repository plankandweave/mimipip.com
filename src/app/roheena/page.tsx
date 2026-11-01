
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import Link from "next/link";
import { getProductsByHandles } from "@/lib/queries";
import styles from "./roheena.module.css";
import NaturePalette from "./NaturePalette";
import JournalAtmosphere from "./JournalAtmosphere";

export const metadata: Metadata = editorialMetadata("/roheena");

// Collection choices supplied by Roheena, 23 October 2026. Individual designs
// illustrate those collections; they are not attributed personal endorsements.
const handles = ["ink-venice", "ink-delhi", "the-run-of-nine", "midnight-charge"];

  async function RoheenaPage() {
  const products = (await getProductsByHandles(handles)).filter(p => p.image && !p.imageIsFlat);
  const ink = products.filter(p => p.handle.startsWith("ink-"));
  const stallions = products.filter(p => !p.handle.startsWith("ink-"));
  const hero = ink[0] ?? products[0];
  return (
    <div className={styles.page} data-journal>
      <div className={styles.review}><span>Roheena’s journal · October 2026</span><JournalAtmosphere /></div>
      <header className={styles.masthead}>
        <p className={styles.eyebrow}>A personal journal by Roheena Nagpal</p>
        <h1>Through<br /><em>Roheena’s Eye</em></h1>
        <p className={styles.intro}>Designs I love. Things I’m exploring.</p>
        <nav aria-label="Roheena’s journal"><a href="#edit">The edit</a><a href="#notebook">The notebook</a><a href="#in-making">In the making</a></nav>
      </header>

      {hero && <figure className={styles.hero}>
        {/* Preserve the complete composition, including furniture and floor. */}
        <img src={hero.image!} alt={hero.imageAlt || `${hero.title} mural wallpaper in a room`} fetchPriority="high" />
        <figcaption><span>01 / A place to begin</span><Link href={`/products/${hero.handle}`}>{hero.title} · Explore the design ↗</Link></figcaption>
      </figure>}

      <section className={styles.letter} aria-label="A note from Roheena"><p className={styles.eyebrow}>My first edit</p><div><blockquote>I keep coming back to horses. And to places that stay with you.</blockquote><span className={styles.signature}>Roheena Nagpal / Founder, Zyvorah</span></div></section>

      <section id="edit" className={styles.section}>
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>01 / Roheena’s edit</p><h2>Two ways of seeing.</h2></div></div>
        <div className={styles.collections}>
          {[{title:"Ink", text:"The absence of colour. The perspective. Places that stay with you.", href:"/collections/ink", items:ink}, {title:"Stallion Spirit",text:"Horses in motion. I keep wanting to design more of them.",href:"/collections/stallion-spirit",items:stallions}].map(collection => <article key={collection.title}>
            <div className={styles.collectionTitle}><h3>{collection.title}</h3><Link href={collection.href}>Explore collection ↗</Link></div>
            <p>{collection.text}</p>
            <div className={styles.products}>{collection.items.map(product => <Link key={product.handle} href={`/products/${product.handle}`} className={styles.journalProduct}><img src={product.image!} alt={product.imageAlt || product.title} loading="lazy" /><span className={styles.designName}>{product.title}</span><span className={styles.designLink}>Explore this wallpaper ↗</span></Link>)}</div>
            {!collection.items.length && <Link href={collection.href}>Discover the designs in {collection.title} →</Link>}
          </article>)}
        </div>
      </section>

      <section id="notebook" className={`${styles.section} ${styles.notebook}`}>
        <div className={styles.notebookHeading}><p className={styles.eyebrow}>02 / A few pages from my notebook</p><h2>Things I keep coming back to.</h2></div>
        <div className={styles.openBook}>
          <article className={styles.paperPage}>
            <span className={styles.pencilDate}>October, 2026</span>
            <h3 className={styles.handTitle}>Black, white<br />&amp; sepia.</h3>
            <figure className={styles.pinnedPhoto}>
              {stallions[0]?.image && <img src={stallions[0].image} alt={stallions[0].imageAlt} loading="lazy" />}
              <figcaption>Horses in motion. I keep coming back to them.</figcaption>
            </figure>
            <figure className={styles.postcard}>
              {ink[0]?.image && <img src={ink[0].image} alt={ink[0].imageAlt} loading="lazy" />}
              <figcaption>Some places stay with you.</figcaption>
            </figure>
            
            <details className={styles.foldedNote}><summary>A little more about these two <span aria-hidden="true">+</span></summary><p>I’m drawn to horses, especially when they’re moving at speed. It’s something about how they make me feel. With Ink, I love the perspective of the places and the absence of colour. Looking at the two together, I notice the blacks, whites and sepias I keep returning to.</p><Link href="/collections/stallion-spirit">Stallion Spirit ↗</Link><Link href="/collections/ink">Ink ↗</Link></details>
            <span className={styles.folio}>01</span>
          </article>
          <article className={`${styles.paperPage} ${styles.timingPage}`}>
            <span className={styles.pencilDate}>Something I’m learning...</span>
            <h3 className={styles.handTitle}>It’s a question<br />of timing.</h3>
            <div className={styles.orbitSketch} aria-hidden="true"><svg viewBox="0 0 320 260" fill="none"><ellipse cx="160" cy="131" rx="102" ry="100" transform="rotate(-9 160 131)" /><ellipse cx="159" cy="130" rx="106" ry="98" transform="rotate(-5 159 130)" /><circle cx="160" cy="131" r="66" strokeDasharray="2 7" /><path d="M47 172 Q160 65 278 101 M90 34 Q220 133 206 233 M143 18 L145 36 M269 169 L283 175 M73 218 L84 204" /><circle cx="78" cy="72" r="5" /><circle cx="250" cy="175" r="4" /><path d="M157 117L161 128L173 130L162 134L159 146L155 135L144 131L155 128Z" /></svg><span>same time,<br />different lives</span></div>
            <p className={styles.timingNote}>We say “everything is about timing.”<br />I’m trying to understand what that means for one person’s life.</p>
            <div className={styles.looseSlip}><span>history → now → a life</span><p>How can the same time<br />be so different<br />for different people?</p></div>
            <details className={styles.foldedNote}><summary>Open this thought <span aria-hidden="true">+</span></summary><p>We talk about the time someone was born into, the age they grew up in, the generation they belong to. I’m interested in timing in history, in the present, and in a person’s life.</p><p>As I study astrology, I’m comparing birth charts with people’s lived experiences. This is the question I keep returning to. It is something I’m learning about, and trying to understand more deeply.</p></details>
            <span className={styles.folio}>02</span>
          </article>
        </div>
      </section>

      <section id="in-making" className={`${styles.section} ${styles.natureStudy}`}>
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>03 / Designing, trying, learning</p><h2>Nature, in colour.</h2></div><p>I find an image I love.<br />Then I pick the colours from it.</p></div>
        <NaturePalette />
      </section>

      <footer className={styles.closing}><h2>Something caught your eye?</h2><a href="mailto:hello@zyvorah.com?subject=A%20thought%20for%20Roheena%E2%80%99s%20journal">Write to the studio ↗</a></footer>
    </div>
  );
}

export default withBrandEditorial("/roheena", RoheenaPage);
