import { existsSync } from "node:fs";
import path from "node:path";
import { cache } from "react";
import { supabase } from "./supabase";
import { MEDIA_BASE, mediaKeyFromUrl } from "@/lib/media-url";
import { mediaBucket } from "@/lib/r2-media";
import {
  TAASH_DESIGNS,
  TAASH_PARTNER,
  TAASH_RATE,
  type TaashDesign,
  type TaashGroup,
} from "./taash";

/**
 * TAASH reads its own products rather than going through getCollectionCards():
 * the shopfront at /mati groups them by what they ARE — a repeat, a mural, a
 * ground — and that grouping lives in lib/taash, not in a tag.
 *
 * The page is driven by the BOOK and enriched by the database, not the other
 * way round. lib/taash carries every name, essay and grouping, transcribed from
 * the printed edition; the catalogue supplies the price, the room renders and
 * the link to buy. So /mati reads correctly before the collection is published
 * (when RLS hides the draft rows from the public key entirely — `products` has
 * a `status = 'active'` policy, and there is no anon path to a draft) and it
 * keeps reading correctly afterwards, when the same designs arrive with their
 * real imagery and rates.
 *
 * Anything not yet in the catalogue is marked isDraft and shown without a link.
 */

export type TaashCard = TaashDesign & {
  /** The room render a card leads with; grounds have none and lead on the flat. */
  hero: string | null;
  heroAlt: string;
  /** The clean pattern artwork. Every design has exactly one. */
  flat: string | null;
  /** A window cut into the pattern, for the collection page to alternate with
   *  the room renders. Null until the crops have been seeded — see cropSrc. */
  crop: string | null;
  ratePerSqFt: number | null;
  /** Every rendition, hero first — the plate view opens on these. */
  scenes: { url: string; alt: string }[];
  isDraft: boolean;
};

type Row = {
  handle: string;
  title: string;
  status: string;
  product_images: {
    url: string;
    alt: string | null;
    position: number | null;
    is_featured: boolean | null;
    is_flat: boolean | null;
  }[];
  product_materials: { price_per_sqft: number | null; available: boolean | null }[];
};

/**
 * Where a rendition lives when the catalogue cannot tell us — i.e. before the
 * collection is published and RLS is still hiding the draft rows.
 *
 * These MUST resolve to Supabase Storage in a deployed build. public/taash is
 * gitignored — the renditions are 87 MB and are not in the repo — so a local
 * path is correct only on a developer's machine and is a broken image
 * everywhere else. /mati is public from the moment it is merged, and on launch
 * day it is public for hours before the gate flips the products to active, so
 * the unpublished path is the one a real visitor sees first.
 *
 * The layout is exactly what scripts/seed-taash.ts --upload writes, so the two
 * cannot drift: taash/<handle>/flat.png and taash/<handle>/scene-01.jpg.
 */
// R2 migration: the taash objects live in zyvorah-media now, served by the
// /media route. (The seed script's layout under taash/<handle>/ is unchanged.)
const STORAGE_BASE = `${MEDIA_BASE}/product-images/taash`;

const fallbackFlat = (handle: string) => `${STORAGE_BASE}/${handle}/flat.png`;
const fallbackScene = (handle: string) => `${STORAGE_BASE}/${handle}/scene-01.jpg`;

/**
 * The close crops.
 *
 * scripts/seed-taash.ts writes <handle>/crop.jpg beside <handle>/flat.png, so a
 * crop is derived from the flat rather than stored: it is a page device, not a
 * catalogue photograph, and registering it in product_images would put a
 * close-up of the pattern into the middle of every product gallery.
 *
 * Deriving a URL is free; being WRONG about it is a broken image on the
 * collection page. So the whole set is gated on one probe of the first design's
 * crop, cached for the render pass and re-checked when ISR revalidates. Before
 * the seed has been re-run with --upload the page simply shows room renders
 * throughout, and the hour it is run the crops appear with no deploy.
 */
const cropSrc = (flat: string) =>
  flat.endsWith("/flat.png") ? flat.replace(/\/flat\.png$/, "/crop.jpg") : null;

const cropsPublished = cache(async (): Promise<boolean> => {
  const probe = `${STORAGE_BASE}/${TAASH_DESIGNS[0].handle}/crop.jpg`;
  // A relative STORAGE_BASE means the renditions are still sitting in /public
  // on a developer's machine — there is nothing to fetch, so look on disk.
  if (probe.startsWith("/")) {
    return existsSync(path.join(process.cwd(), "public", probe.slice(1)));
  }
  try {
    // The probe is our own zone now — on the Worker that must go through the
    // R2 binding (an own-zone fetch 522s, which would read as "no crops").
    const key = mediaKeyFromUrl(probe);
    if (key) {
      const bucket = await mediaBucket();
      if (bucket) return (await bucket.head(key)) !== null;
    }
    const res = await fetch(probe, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
});

/** The whole collection, in the book's order, with its imagery and its rate. */
export const getTaashCollection = cache(async (): Promise<TaashCard[]> => {
  const crops = await cropsPublished();
  const { data, error } = await supabase
    .from("products")
    .select(
      `handle, title, status,
       product_images ( url, alt, position, is_featured, is_flat ),
       product_materials ( price_per_sqft, available )`,
    )
    .eq("royalty_partner", TAASH_PARTNER);
  if (error) {
    console.error("[taash] collection query failed", error.message);
    return [];
  }

  const byHandle = new Map<string, Row>((data ?? []).map((r) => [r.handle, r as Row]));

  // Iterate the BOOK's order, not the database's — the plates are numbered, and
  // a grid that reshuffles them is a different collection from the one printed.
  return TAASH_DESIGNS.map((d) => {
    const row = byHandle.get(d.handle);

    // Not published yet: show the design from the book, with the renditions the
    // seed script wrote, and no link to a product page that does not exist.
    if (!row) {
      const hero = d.group === "ground" ? fallbackFlat(d.handle) : fallbackScene(d.handle);
      return {
        ...d,
        hero,
        heroAlt: `${d.name} — ${d.meaning}`,
        flat: fallbackFlat(d.handle),
        crop: crops ? cropSrc(fallbackFlat(d.handle)) : null,
        ratePerSqFt: TAASH_RATE[d.group],
        scenes: [],
        isDraft: true,
      };
    }

    const images = [...(row.product_images ?? [])].sort(
      (a, b) => (a.position ?? 0) - (b.position ?? 0),
    );
    const flat = images.find((i) => i.is_flat) ?? null;
    const scenes = images
      .filter((i) => !i.is_flat)
      .map((i) => ({ url: i.url, alt: i.alt ?? `${d.name} — ${d.meaning}` }));

    const rate =
      (row.product_materials ?? []).find((m) => m.available)?.price_per_sqft ??
      (row.product_materials ?? [])[0]?.price_per_sqft ??
      null;

    return {
      ...d,
      hero: scenes[0]?.url ?? flat?.url ?? null,
      heroAlt: scenes[0]?.alt ?? `${d.name} — ${d.meaning}`,
      flat: flat?.url ?? null,
      crop: crops && flat?.url ? cropSrc(flat.url) : null,
      ratePerSqFt: rate === null ? null : Number(rate),
      scenes,
      isDraft: row.status !== "active",
    };
  });
});

export function taashGroup(cards: TaashCard[], group: TaashGroup): TaashCard[] {
  return cards.filter((c) => c.group === group);
}
