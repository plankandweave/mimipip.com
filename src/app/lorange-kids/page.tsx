
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "@/components/SiteImage";
import { ProductCard } from "@/components/ProductCard";
import { SITE_URL } from "@/lib/seo";
import { getCollectionCards, getCollectionsByKind } from "@/lib/queries";
import { getLorangeHandles } from "@/lib/lorange-kids-queries";
import {
  LORANGE_BACK_LINE,
  LORANGE_DESCRIPTION,
  LORANGE_FAMILY_LINE,
  LORANGE_FORMATS,
  LORANGE_LOGO,
  LORANGE_NAME,
  LORANGE_PATH,
  ZYVORAH_KIDS_COLLECTIONS,
} from "@/lib/lorange-kids";
import { LorangeSignup } from "./LorangeSignup";

// What moves is which designs are live under the brand. Five minutes is plenty.
export const revalidate = 300;

export const metadata: Metadata = editorialMetadata("/lorange-kids");

/** A failed read shows the shop without that part, never an error page. */
async function settle<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}

  async function LorangeKidsPage() {
  const [handles, rooms] = await Promise.all([
    settle(getLorangeHandles(), [] as string[]),
    settle(getCollectionsByKind("room"), [] as { handle: string; title: string }[]),
  ]);
  // A copy: the card read is cached and shared, so it is never sorted in place.
  const products = handles.length ? [...await settle(getCollectionCards(handles), [])] : [];
  // Newest first, as the handles came; the card query does not keep order.
  const order = new Map(handles.map((h, i) => [h, i]));
  products.sort((a, b) => (order.get(a.handle) ?? 0) - (order.get(b.handle) ?? 0));
  const liveRooms = new Set(rooms.map((r) => r.handle));
  const zyvorahRooms = ZYVORAH_KIDS_COLLECTIONS.filter((c) => liveRooms.has(c.handle));

  return (
    <div className="pb-24">
      <div className="family-ribbon">
        <div className="container-x flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-2.5 text-[0.82rem]">
          <span className="caption">{LORANGE_FAMILY_LINE}</span>
          {/* Absolute: on lorangekids.com "/" is this shop. */}
          <a href="https://zyvorah.com/">← {LORANGE_BACK_LINE}</a>
        </div>
      </div>

      <header className="container-x pt-14 text-center sm:pt-20">
        <h1 className="sr-only">{LORANGE_NAME}</h1>
        <Image
          src={LORANGE_LOGO}
          alt={LORANGE_NAME}
          width={700}
          height={290}
          unoptimized
          priority
          className="mx-auto h-auto w-[min(420px,80vw)]"
        />
        <p className="caption mt-6 text-[color:var(--muted)]">Walls for nurseries &amp; children’s rooms</p>
        <div className="rule mx-auto mt-8 w-24" />
        <p className="serif mx-auto mt-8 max-w-2xl text-[clamp(1.35rem,2.6vw,1.8rem)] leading-snug">
          Rooms that grow with them — from the first nursery wall to the room they choose for themselves.
        </p>
      </header>

      {products.length > 0 ? (
        <section className="container-x mt-16" aria-labelledby="lorange-shop">
          <h2 id="lorange-shop" className="caption text-center text-[color:var(--rust-dark)]">The collection</h2>
          <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-12 lg:grid-cols-4">
            {products.map((p) => <ProductCard key={p.handle} product={p} />)}
          </div>
        </section>
      ) : (
        <section className="container-x mt-16 text-center" aria-labelledby="lorange-soon">
          <h2 id="lorange-soon" className="serif text-[clamp(1.6rem,3vw,2.2rem)]">The first collections are on their way</h2>
          <p className="mx-auto mt-3 max-w-xl text-[0.95rem] leading-relaxed text-[color:var(--muted)]">
            Leave your email and we’ll write to you once, when they arrive.
          </p>
          <LorangeSignup />
        </section>
      )}

      <section className="container-x mt-20" aria-labelledby="lorange-formats">
        <h2 id="lorange-formats" className="caption text-center text-[color:var(--rust-dark)]">Four ways onto the wall</h2>
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {LORANGE_FORMATS.map((f) => (
            <li key={f.name} className="border-t border-[color:var(--line)] pt-5">
              <h3 className="serif text-2xl">{f.name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[color:var(--muted)]">{f.line}</p>
            </li>
          ))}
        </ul>
      </section>

      {zyvorahRooms.length > 0 && (
        <section className="container-x mt-20" aria-labelledby="zyvorah-kids">
          <div className="rule w-full" />
          <h2 id="zyvorah-kids" className="serif mt-12 text-center text-[clamp(1.5rem,2.8vw,2rem)]">Children’s rooms from Zyvorah</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-[0.95rem] leading-relaxed text-[color:var(--muted)]">
            Zyvorah’s own wallpapers for little rooms, to shop today.
          </p>
          <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {zyvorahRooms.map((c) => (
              <li key={c.handle}>
                <Link href={`/collections/${c.handle}`} className="room-link">
                  <span className="serif text-xl">{c.label}</span>
                  <span className="mt-1 block text-xs text-[color:var(--muted)]">Shop at Zyvorah →</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default withBrandEditorial("/lorange-kids", LorangeKidsPage);
