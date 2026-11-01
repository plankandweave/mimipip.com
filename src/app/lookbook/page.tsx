
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "@/components/SiteImage";
import { getCollectionByHandle, getProductsByTag, getStyleTagList } from "@/lib/queries";
import { sceneKeyForCollection, showsRoom } from "@/lib/rooms";
import type { ProductCardData } from "@/lib/types";

export const metadata: Metadata = editorialMetadata("/lookbook");

export const revalidate = 3600;

// Editorial order of rooms for the lookbook.
const ROOM_ORDER = [
  "living-room-wallpaper",
  "bedroom-wallpaper",
  "kids-wallpapers",
  "baby-nursery-wallpapers",
  "home-office-wallpaper",
  "foyer",
  "pooja-room-wallpaper",
];

const short = (title: string) => title.replace(/\s*wallpapers?$/i, "").replace(/['’]\s*$/, "").trim() || title;

  async function LookbookPage() {
  // Style tags (a "category" collection's rule_tag) — used to stop 3 near-
  // identical designs (e.g. a run of horse murals) from clustering in one
  // section. Fetched once and reused across every room.
  const styleTags = new Set(await getStyleTagList());
  const stylesOf = (p: ProductCardData) => (p.tags ?? []).filter((t) => styleTags.has(t));

  // A design headlines only ONE room in the whole lookbook — without this, the
  // same top-`aesthetic_rank` pieces (tagged across many rooms) win the "top 4"
  // slot in every section, and Bedroom ends up an exact repeat of Living Room.
  const usedHandles = new Set<string>();
  const sections: { handle: string; title: string; picks: ProductCardData[] }[] = [];

  // Sequential (not Promise.all) so usedHandles accumulates in editorial order.
  for (const handle of ROOM_ORDER) {
    const c = await getCollectionByHandle(handle);
    if (!c?.rule_tag) continue;
    const sceneKey = sceneKeyForCollection(c);
    // A bigger pool than we need, so there's headroom left after dedup.
    const pool = await getProductsByTag(c.rule_tag, 40, sceneKey);
    const withImg = pool.filter((p) => p.image);
    const scenes = withImg.filter((p) => showsRoom(p, sceneKey));
    const candidates = scenes.length >= 4 ? scenes : withImg;

    const picks: ProductCardData[] = [];
    const usedStylesHere = new Set<string>();

    // Pass 1: skip designs already used elsewhere, and skip a design whose
    // every style tag is already represented in this section (diversity).
    for (const p of candidates) {
      if (picks.length >= 4) break;
      if (usedHandles.has(p.handle)) continue;
      const styles = stylesOf(p);
      if (styles.length > 0 && styles.every((t) => usedStylesHere.has(t))) continue;
      picks.push(p);
      styles.forEach((t) => usedStylesHere.add(t));
    }
    // Pass 2: still short of 4 — relax the style-diversity rule, keep the
    // page-wide handle dedup (a thin room may not have 4 distinct styles).
    if (picks.length < 4) {
      for (const p of candidates) {
        if (picks.length >= 4) break;
        if (usedHandles.has(p.handle) || picks.some((x) => x.handle === p.handle)) continue;
        picks.push(p);
      }
    }

    if (picks.length < 2) continue;
    picks.forEach((p) => usedHandles.add(p.handle));
    sections.push({ handle, title: c.title, picks });
  }

  return (
    <div>
      <div className="mx-4 mt-4 rounded-[32px] bg-sky/30 lg:mx-6">
        <div className="container-x py-14 text-center">
          <span className="caps text-slate">Lookbook</span>
          <h1 className="mt-3 text-[clamp(2.2rem,4.5vw,3.4rem)] leading-tight">Seen in rooms</h1>
          <p className="mx-auto mt-4 max-w-xl text-slate">
            Room by room — our murals styled in true scale. Tap any design to see it on your own wall.
          </p>
        </div>
      </div>

      {sections.map((s) => (
        <section key={s.handle} className="container-x py-14">
          <div className="mb-6 flex items-end justify-between gap-4">
            <h2 className="text-2xl lg:text-3xl">{short(s.title)}</h2>
            <Link href={`/collections/${s.handle}`} className="btn btn-ghost text-sm">
              View all →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {s.picks.map((p, i) => (
              <Link
                key={p.handle}
                href={`/products/${p.handle}`}
                className={`group relative block overflow-hidden rounded-[22px] bg-wash ${
                  i === 0 ? "col-span-2 aspect-[4/3] lg:row-span-2 lg:aspect-auto" : "aspect-square"
                }`}
              >
                {p.image && (
                  <Image
                    src={p.image}
                    alt={p.imageAlt}
                    fill
                    sizes="(max-width:768px) 50vw, 25vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-charcoal/45 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <p className="absolute inset-x-0 bottom-0 p-4 font-display text-sm font-semibold text-surface opacity-0 transition-opacity group-hover:opacity-100">
                  {p.title}
                </p>
              </Link>
            ))}
          </div>
        </section>
      ))}

      <section className="container-x pb-20">
        <div className="pastel-section flex flex-col items-center gap-4 bg-peach/40 text-center">
          <h2 className="text-2xl lg:text-3xl">Find yours</h2>
          <p className="max-w-md text-slate">
            Upload a photo of your room and preview any design in true scale, or ask the Curator for the closest match.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/collections/wall-art" className="btn text-sm">Browse all wallpaper</Link>
            <Link href="/design-with" className="btn btn-ghost text-sm">Ask the Curator</Link>
          </div>
        </div>
      </section>
    </div>
  );
}

export default withBrandEditorial("/lookbook", LookbookPage);
