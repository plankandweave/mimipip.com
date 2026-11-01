import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { assetFetch } from "@/lib/asset-fetch";
import { mediaBucket } from "@/lib/r2-media";
import { MEDIA_BASE } from "@/lib/media-url";
import { bumpCatalogueVersion } from "@/lib/catalogue-cache";
import { brandCatalogueSeeds } from "@/lib/catalogue-seeds-data";
import { unfinishedRangeSeeds, roomRepairSeeds } from "@/lib/unfinished-ranges-seeds";
import type { CatalogueSeed, SeedProduct } from "@/lib/catalogue-seeds-data";

/**
 * A collection that publishes itself on the first cron tick after it deploys.
 *
 * Collections used to go live by someone running a seed script on a laptop
 * that held both the Supabase service key and a wrangler login (see
 * scripts/seed-ahimsa.ts). That made "publish" depend on one machine. The
 * deployed site already holds both — the service-role key and the MEDIA_R2
 * binding — so a collection whose artwork ships in public/seed-media can be
 * published by the site itself.
 *
 * ONE-SHOT per design. The collection row is written LAST, and its existence
 * means "launched": after that, only a design that is not yet in the catalogue
 * at all is published, so a price, tag or picture someone later changes in the
 * database stays changed. A tick that fails half-way leaves no collection
 * row, and the next tick redoes the whole seed (every write is idempotent).
 *
 * The catalogue rules still hold, because the database enforces them: products
 * go in as drafts, the flat is flagged and verified, and only then is status
 * set to active — the trigger refuses the activation otherwise.
 */

type Outcome = { handle: string; status: "present" | "published" | "skipped"; detail?: string };

/** Copy one bundled original into the media bucket, unless it is there. */
async function ensureObject(seed: CatalogueSeed, src: string, key: string): Promise<boolean> {
  const bucket = await mediaBucket();
  if (!bucket) return false;
  if (await bucket.head(key)) return true;
  // assetFetch matches on the PATH — the host is never contacted.
  const res = await assetFetch(`https://zyvorah.com${seed.assetDir}/${src}`);
  if (!res.ok) throw new Error(`${seed.collection.handle}: bundled ${src} answered ${res.status}`);
  const body = await res.arrayBuffer();
  await bucket.put(key, body, {
    httpMetadata: {
      contentType: src.endsWith(".png") ? "image/png" : "image/jpeg",
      cacheControl: "public, max-age=31536000, immutable",
    },
  });
  return true;
}

function must<T>(r: { data: T; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
}

export async function publishSeed(svc: SupabaseClient, seed: CatalogueSeed): Promise<Outcome> {
  const handle = seed.collection.handle;
  if (seed.imagesOnly) return { handle, status: "present" };
  const existing = must(
    await svc.from("collections").select("handle, description, image_url, hero_product_handle").eq("handle", handle).maybeSingle(),
    `${handle} lookup`,
  );

  // A live collection can still GROW: designs added to the seed after it went
  // live are published on their own, and only those — a design already in the
  // catalogue is never touched again, whatever has been edited on it since.
  let todo = seed.products;
  if (existing) {
    const have = must(
      // A DRAFT is a publish that died half-way (the seed activates last), so
      // it is redone; a design taken down by hand is 'archived' and stays down.
      await svc.from("products").select("handle").in("handle", seed.products.map((p) => p.handle)).neq("status", "draft"),
      `${handle} product lookup`,
    ) as { handle: string }[];
    const known = new Set(have.map((r) => r.handle));
    todo = seed.products.filter((p) => !known.has(p.handle));
    if (!todo.length) return { handle, status: "present" };
  }

  // Media first: a product must never point at an object that is not there.
  for (const p of todo) {
    for (const img of p.images) {
      if (!(await ensureObject(seed, `${p.handle}/${img.file}`, `${seed.mediaPrefix}/${p.handle}/${img.file}`))) {
        return { handle, status: "skipped", detail: "no media bucket on this runtime" };
      }
    }
  }

  const material = must(
    await svc.from("materials").select("id").eq("slug", seed.materialSlug).eq("active", true).single(),
    `${handle} material ${seed.materialSlug}`,
  ) as { id: string };

  for (const p of todo) {
    const row = must(
      await svc
        .from("products")
        .upsert(
          {
            handle: p.handle,
            title: p.title,
            description: p.description,
            category: p.category ?? "wallpaper",
            ...(p.border ? {
              border_height_cm: p.border.heightCm,
              price_per_metre: p.border.pricePerMetre,
              supply_format: "segmented",
              segment_length_m: p.border.segmentLengthM,
              is_seamless: false,
            } : {}),
            status: "draft",
            vendor: "Zyvorah",
            flat_verified: true,
            is_new: true,
            new_until: new Date(Date.now() + 45 * 86_400_000).toISOString(),
          },
          { onConflict: "handle" },
        )
        .select("id")
        .single(),
      `${p.handle} upsert`,
    ) as { id: string };
    const id = row.id;

    must(await svc.from("product_images").delete().eq("product_id", id), `${p.handle} clear images`);
    must(
      await svc.from("product_images").insert(
        p.images.map((img) => ({
          product_id: id,
          url: `${MEDIA_BASE}/${seed.mediaPrefix}/${p.handle}/${img.file}`,
          alt: img.alt,
          position: img.position,
          is_flat: img.isFlat,
          is_featured: img.isFeatured,
          scene_key: img.sceneKey,
          width: img.width,
          height: img.height,
        })),
      ),
      `${p.handle} images`,
    );

    must(await svc.from("product_tags").delete().eq("product_id", id), `${p.handle} clear tags`);
    must(
      await svc.from("product_tags").insert(p.tags.map((tag) => ({ product_id: id, tag }))),
      `${p.handle} tags`,
    );

    if (p.category !== "border") must(
      await svc.from("product_materials").upsert(
        { product_id: id, material_id: material.id, price_per_sqft: seed.ratePerSqFt, available: true },
        { onConflict: "product_id,material_id" },
      ),
      `${p.handle} material`,
    );

    must(await svc.from("products").update({ status: "active" }).eq("id", id), `${p.handle} activate`);
  }

  // Last: this row is the "published" marker.
  if (!existing) must(await svc.from("collections").insert(seed.collection), `${handle} collection`);
  else {
    // Finish a reserved, empty collection without replacing an editor's copy
    // or an existing front. Products and image objects already exist here.
    const missing: Record<string, string> = {};
    if (!existing.description) missing.description = seed.collection.description;
    if (!existing.image_url) missing.image_url = seed.collection.image_url;
    if (!existing.hero_product_handle) missing.hero_product_handle = seed.collection.hero_product_handle;
    if (Object.keys(missing).length) must(await svc.from("collections").update(missing).eq("handle", handle), `${handle} reserved collection`);
  }
  await bumpCatalogueVersion();
  return { handle, status: "published" };
}

/**
 * Point a seed's products at its royalty partner, every tick, until they all
 * are. Separate from publishSeed (which stops at the collection row) so a
 * royalty agreed AFTER a collection went live still lands, and cheap once done:
 * one read of the seed's unlinked products. Only fills a NULL — a partner
 * someone later sets by hand is never overwritten.
 */
export async function ensureRoyalty(svc: SupabaseClient, seed: CatalogueSeed): Promise<string | null> {
  const r = seed.royalty;
  if (!r) return null;
  const handles = seed.products.map((p) => p.handle);
  const unlinked = must(
    await svc.from("products").select("id").in("handle", handles).is("royalty_partner", null),
    `${seed.collection.handle} royalty check`,
  ) as { id: string }[];
  if (!unlinked.length) return null;

  // Reuse the partner if she already has a row (slug, name or legal name).
  const pat = `%${r.match}%`;
  const found = must(
    await svc
      .from("royalty_partners")
      .select("slug")
      .or(`slug.ilike.${pat},name.ilike.${pat},legal_name.ilike.${pat}`),
    `${seed.collection.handle} royalty partner lookup`,
  ) as { slug: string }[];
  if (found.length > 1) {
    throw new Error(`${seed.collection.handle}: ${found.length} royalty partners match "${r.match}" (${found.map((f) => f.slug).join(", ")}) — link by hand`);
  }
  let slug = found[0]?.slug;
  if (!slug) {
    // tds_rate stays NULL: the accountant's decision (migration 0139).
    must(
      await svc.from("royalty_partners").insert({ slug: r.slug, name: r.name, legal_name: r.legalName, rate: r.rate }),
      `${seed.collection.handle} royalty partner create`,
    );
    slug = r.slug;
  }
  must(
    await svc.from("products").update({ royalty_partner: slug }).in("id", unlinked.map((u) => u.id)).is("royalty_partner", null),
    `${seed.collection.handle} royalty link`,
  );
  return slug;
}

/**
 * Room pictures added to a design AFTER it went live. publishSeed never
 * touches a live design, so a new render would otherwise never reach it.
 * Strictly additive: an image is inserted only when its URL is not already on
 * the product, nothing is deleted or reordered, and it is never featured, so
 * whatever leads the design's cards today keeps leading. Cheap once done: one
 * read of the seed's image URLs per tick.
 */
export async function ensureImages(svc: SupabaseClient, seed: CatalogueSeed): Promise<number> {
  const urlOf = (p: SeedProduct, file: string) => `${MEDIA_BASE}/${seed.mediaPrefix}/${p.handle}/${file}`;
  const rows = must(
    await svc
      .from("products")
      .select("id, handle, status, product_images ( url ), product_tags ( tag )")
      .in("handle", seed.products.map((p) => p.handle))
      .eq("status", "active"),
    `${seed.collection.handle} image check`,
  ) as { id: string; handle: string; product_images: { url: string }[]; product_tags: { tag: string }[] }[];
  let added = 0;
  for (const row of rows) {
    const p = seed.products.find((x) => x.handle === row.handle);
    if (!p) continue;
    const have = new Set(row.product_images.map((i) => i.url));
    const missing = p.images.filter((img) => !img.isFlat && !have.has(urlOf(p, img.file)));
    const roomTags = seed.imagesOnly ? p.tags.filter(tag => !row.product_tags.some(t => t.tag === tag)) : [];
    const addRoomTags = async () => {
      if (!roomTags.length) return;
      must(await svc.from("product_tags").upsert(
        roomTags.map(tag => ({ product_id: row.id, tag })),
        { onConflict: "product_id,tag" },
      ), `${p.handle} reviewed room tags`);
      await bumpCatalogueVersion();
    };
    if (!missing.length) { await addRoomTags(); continue; }
    for (const img of missing) {
      if (!(await ensureObject(seed, `${p.handle}/${img.file}`, `${seed.mediaPrefix}/${p.handle}/${img.file}`))) return added;
    }
    must(
      await svc.from("product_images").insert(
        missing.map((img) => ({
          product_id: row.id,
          url: urlOf(p, img.file),
          alt: img.alt,
          position: img.position,
          is_flat: false,
          is_featured: false,
          scene_key: img.sceneKey,
          width: img.width,
          height: img.height,
        })),
      ),
      `${p.handle} added images`,
    );
    added += missing.length;
    if (seed.imagesOnly) {
      // A reviewed room render is now attached: its selected room tag may
      // become discoverable. Never add these tags before the image exists.
      await addRoomTags();
    }
  }
  if (added) await bumpCatalogueVersion();
  return added;
}

/** Every collection waiting to publish itself. Add a seed here to ship one. */
export const CATALOGUE_SEEDS: CatalogueSeed[] = [...brandCatalogueSeeds, ...unfinishedRangeSeeds, ...roomRepairSeeds];

/** Publish whatever is not yet live. Never throws — one bad seed must not stop
 *  the cron that hosts this. */
export async function ensureCatalogueSeeds(svc: SupabaseClient): Promise<Outcome[]> {
  const out: Outcome[] = [];
  for (const seed of CATALOGUE_SEEDS) {
    try {
      const outcome = await publishSeed(svc, seed);
      // Royalty only once the products exist (present or just published).
      if (outcome.status !== "skipped") {
        await ensureRoyalty(svc, seed);
        await ensureImages(svc, seed);
      }
      out.push(outcome);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      console.error(`[catalogue-seeds] ${seed.collection.handle} failed:`, detail);
      out.push({ handle: seed.collection.handle, status: "skipped", detail });
    }
  }
  return out;
}
