import Link from 'next/link';
import { collectionDesigns } from '@/brand/review/data';
import { saleOf } from '@/brand/commerce/sale';
import { artFor } from '@/brand/commerce/order-payload';
import { HushWanderShop } from './HushWanderShop';
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

export function HushWanderCollection() {
  const designs = collectionDesigns('hush-and-wander');
  return <main className={styles.page}>
    <section className={styles.hero} aria-labelledby="hush-title">
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}>MimiPip nursery wallpaper collection</p>
        <h1 id="hush-title">Hush <em>&amp;</em> Wander</h1>
        <p className={styles.heroLine}>A room for the first thousand little moments.</p>
        <p className={styles.heroBody}>For the first night home. The book you read twice. The afternoons when they point to a little fox on the wall and you make up a name for it. These are the moments a room comes to hold.</p>
        <Link href="#the-designs" className={styles.primaryLink}>Shop the collection</Link>
        <p className={styles.heroAside}>Choose a design, select your size, and add it to your cart.</p>
      </div>
      <figure className={styles.heroImage}>
        <img src="/collection-headers/hush-and-wander.webp" alt="A child reading in a warm nursery with Little Fox Orchard wallpaper" width={2172} height={724} fetchPriority="high" />
        <figcaption>Little Fox Orchard · one of eleven gentle worlds</figcaption>
      </figure>
    </section>

    <section id="the-designs" className={styles.designs} aria-labelledby="designs-title">
      <div className={styles.designsHead}>
        <div><p className={styles.eyebrow}>Find the one that feels like home</p><h2 id="designs-title">Eleven little worlds</h2></div>
        <p>Choose your nursery design below. Select a ready size in India or enter your wall measurements, see the total, and add to cart.</p>
      </div>
      <HushWanderShop designs={designs.map(design => ({
        slug: design.slug, name: design.name, image: design.image, colors: design.color,
        description: moments[design.slug.replace(/^hush-and-wander-/, '')] ?? design.description,
        sale: saleOf(design.slug), art: artFor(design.slug)?.art ?? null,
      }))} />
      <p className={styles.renderNote}>Room images show how each mural might feel at home. Furniture and accessories are for inspiration; the wallpaper is the product.</p>
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

  </main>;
}
