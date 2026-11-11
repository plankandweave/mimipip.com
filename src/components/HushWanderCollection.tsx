import Link from 'next/link';
import { collectionDesigns } from '@/brand/review/data';
import styles from './HushWanderCollection.module.css';

const moments: Record<string, string> = {
  'little-fox-orchard': 'A quiet place to curl up, with blossoms overhead and a fox family close together.',
  'duckling-pond': 'Four little ducks, one bright pond, and a gentle journey to follow with your eyes.',
  'bear-and-bee-meadow': 'A bear cub discovering that even the smallest meadow is full of life.',
  'gentle-whale-bay': 'An open blue sea and two whales drifting side by side.',
  'little-lamb-pasture': 'The hush of the countryside, with lambs resting in soft green fields.',
  'hedgehog-garden': 'A tiny woodland world of mushrooms, blossoms, and two curious hedgehogs.',
  'fawn-in-ferns': 'A leafy glade where a young fawn can pause beside its family.',
  'otter-riverbank': 'A parent and pup floating together through a pale blue river.',
  'turtle-garden': 'A flower-lined path for anyone who likes to take the long way home.',
  'koala-eucalyptus': 'A sleepy cuddle high in the eucalyptus branches.',
  'penguin-snowdrift': 'A winter landscape made warmer by being together.',
};

const colorSwatches: Record<string, string> = {
  peach: '#e9bda1', green: '#a4b79a', blue: '#9ebdcb', yellow: '#e8c975',
  pink: '#dfb3b1', cream: '#f1e5cc', brown: '#ad8b70', orange: '#d69c6d',
  grey: '#b8bab5', gray: '#b8bab5', white: '#f8f5ec', purple: '#baa9c3',
};

export function HushWanderCollection() {
  const designs = collectionDesigns('hush-and-wander');
  return <main className={styles.page}>
    <section className={styles.hero} aria-labelledby="hush-title">
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}>MimiPip nursery wallpaper collection</p>
        <h1 id="hush-title">Hush <em>&amp;</em> Wander</h1>
        <p className={styles.heroLine}>A room for the first thousand little moments.</p>
        <p className={styles.heroBody}>For the first night home. The book you read twice. The afternoons when they point to a little fox on the wall and you make up a name for it. These are the moments a room comes to hold.</p>
        <Link href="#the-designs" className={styles.primaryLink}>Find their little world</Link>
        <p className={styles.heroAside}>Eleven painted stories · made for your wall</p>
      </div>
      <figure className={styles.heroImage}>
        <img src="/collection-headers/hush-and-wander.webp" alt="A child reading in a warm nursery with Little Fox Orchard wallpaper" width={2172} height={724} fetchPriority="high" />
        <figcaption>Little Fox Orchard · one of eleven gentle worlds</figcaption>
      </figure>
    </section>

    <section className={styles.why} aria-labelledby="why-title">
      <div>
        <p className={styles.eyebrow}>The thought behind the collection</p>
        <h2 id="why-title">It is their room.<br/><em>And, for a while, yours too.</em></h2>
      </div>
      <div className={styles.whyText}>
        <p>You will spend hours here before they can remember it: settling them to sleep, folding tiny clothes, watching the morning light move across the wall. We wanted those hours to feel lovely for you as well.</p>
        <p>So Hush &amp; Wander is full of soft color, open skies, and little lives to discover together. The scenes are gentle enough to rest beside, with just enough detail for another story tomorrow.</p>
      </div>
    </section>

    <section id="the-designs" className={styles.designs} aria-labelledby="designs-title">
      <div className={styles.designsHead}>
        <div><p className={styles.eyebrow}>Find the one that feels like home</p><h2 id="designs-title">Eleven little worlds</h2></div>
        <p>From sunlit ponds to winter hills, each mural brings its own quiet story. Choose the scene you want to come home to.</p>
      </div>
      <div className={styles.grid}>
        {designs.map((design, index) => <article key={design.slug} className={styles.card}>
          <Link href={`/products/${design.slug}`} className={styles.roomLink} aria-label={`Explore ${design.name} wallpaper`}>
            <img src={design.image} alt={`${design.name} wallpaper in an illustrative baby nursery`} width={1536} height={1024} loading={index < 2 ? 'eager' : 'lazy'} />
            <span className={styles.roomLabel}>See this scene</span>
          </Link>
          <div className={styles.cardBody}>
            <div className={styles.cardTitle}><p>{String(index + 1).padStart(2, '0')} / 11</p><h3>{design.name}</h3></div>
            <p className={styles.moment}>{moments[design.slug.replace(/^hush-and-wander-/, '')] ?? design.description}</p>
            <div className={styles.cardFooter}>
              <div className={styles.colors} aria-label={`${design.name} color collections`}>{design.color.map(color => <Link key={color} href={`/browse/color?value=${encodeURIComponent(color)}`} aria-label={`Browse ${color} collection`} title={color} style={{ backgroundColor: colorSwatches[color.toLowerCase()] ?? '#d6c8b5' }} />)}</div>
              <Link className={styles.shopLink} href={`/products/${design.slug}`}>Explore &amp; shop</Link>
            </div>
          </div>
        </article>)}
      </div>
      <p className={styles.renderNote}>Room images show how each mural might feel at home. Furniture and accessories are for inspiration; the wallpaper is the product.</p>
    </section>

  </main>;
}
