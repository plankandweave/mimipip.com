import Image from "@/components/SiteImage";

/**
 * BEHIND-THE-SCENES BLOCKS, above a collection's grid.
 *
 * Three kinds — a film, a still, a quote — and one rule that matters more than
 * the layout: a block with no file does not render. A slot exists so the page
 * can be PLANNED before it is shot, and a planned block that leaks into public
 * as an empty frame is worse than no block at all.
 *
 * On film:
 *  - An AMBIENT film is texture. Silent, looping, no controls, and it carries
 *    `muted` — a browser refuses to autoplay anything else, so an unmuted
 *    autoplay is not a bold choice, it is a still image with extra bytes.
 *  - A film meant to be WATCHED never autoplays. It waits, with controls and a
 *    poster, because a soundtrack nobody asked for is how a shop loses the
 *    person it just persuaded.
 *  - `preload="none"` on both: a film above the grid must not cost a customer
 *    megabytes before they have decided to look at it. The poster carries the
 *    page until they press play.
 */

export type CollectionStoryBlock = {
  id: string;
  kind: "video" | "image" | "quote";
  title: string | null;
  body: string | null;
  assetUrl: string | null;
  posterUrl: string | null;
  credit: string | null;
  ambient: boolean;
};

/** A block is ready when it has the file its kind needs. A quote needs words;
 *  everything else needs an asset. */
export function storyReady(b: CollectionStoryBlock): boolean {
  return b.kind === "quote" ? Boolean(b.body?.trim()) : Boolean(b.assetUrl);
}

export function CollectionStories({ blocks }: { blocks: CollectionStoryBlock[] }) {
  const ready = blocks.filter(storyReady);
  if (ready.length === 0) return null;

  return (
    <section className="container-x py-14" aria-label="Behind the collection">
      <div className="grid gap-10">
        {ready.map((b) => (
          <article key={b.id} className="grid gap-5 lg:grid-cols-[1fr_1.4fr] lg:items-center lg:gap-10">
            {b.kind === "quote" ? (
              <blockquote className="lg:col-span-2 mx-auto max-w-3xl text-center font-display text-[clamp(1.4rem,3vw,2.2rem)] leading-[1.25]">
                &ldquo;{b.body}&rdquo;
                {b.credit && <footer className="mt-4 caps text-[0.7rem] text-slate">{b.credit}</footer>}
              </blockquote>
            ) : (
              <>
                <div className="order-2 lg:order-1">
                  {b.title && <h2 className="font-display text-[1.5rem] leading-tight">{b.title}</h2>}
                  {b.body && <p className="mt-3 text-[0.98rem] leading-relaxed text-slate">{b.body}</p>}
                  {b.credit && <p className="mt-3 caps text-[0.66rem] text-mist">{b.credit}</p>}
                </div>
                <div className="order-1 overflow-hidden rounded-[22px] bg-wash lg:order-2">
                  {b.kind === "video" ? (
                    <video
                      src={b.assetUrl ?? undefined}
                      poster={b.posterUrl ?? undefined}
                      // Ambient: silent texture. Otherwise: waits to be asked.
                      autoPlay={b.ambient}
                      muted={b.ambient}
                      loop={b.ambient}
                      controls={!b.ambient}
                      playsInline
                      preload="none"
                      className="aspect-video w-full object-cover"
                    />
                  ) : (
                    <div className="relative aspect-[4/3] w-full">
                      <Image
                        src={b.assetUrl as string}
                        alt={b.title ?? ""}
                        fill
                        sizes="(max-width: 1024px) 100vw, 60vw"
                        className="object-cover"
                      />
                    </div>
                  )}
                </div>
              </>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
