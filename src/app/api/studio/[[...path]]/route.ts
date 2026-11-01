import { serviceAvailable, requireService } from "@/brand/services";
import { STYLE_RULES_PROMPT } from "@/lib/style-rules";
import { NextResponse, after } from "next/server";
import { revalidatePath } from "next/cache";
import { bumpCatalogueVersion } from "@/lib/catalogue-cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { staffKey } from "@/lib/staff-key";
import { CACHE_MUTABLE } from "@/lib/storage-body";
import { putProductImage } from "@/lib/product-images-store";
import { toMediaUrl } from "@/lib/media-url";
import { fetchMediaAware } from "@/lib/r2-media";
import { MOODS, getProductsByTags } from "@/lib/queries";
import {
  SCENARIOS, SCENARIO_BY_KEY, SCENE_ROOM_TAGS, DEFAULT_SCENES,
  type SceneFrame,
  MAX_AI_SCENES, MAX_PICKED_SCENES, normaliseSceneKeys, scenarioPrompt,
  isStylingKey, stylingFromTags, type StylingKey, stripPoojaForMotif, stripPoojaTags, allowsPoojaScene,
} from "@/lib/studio-scenes";
import { PROJECT_BY_KEY, resolveScenario, projectSceneKeys, type CommissionedProject } from "@/lib/studio-projects";
import { BORDER_CATEGORY, CANVAS_CATEGORY } from "@/lib/product-category";
import { EXPORT_FORMATS, type ExportFormatKey, type ExportRow, CANVAS_GST_PCT, CANVAS_HSN, SELF_ADHESIVE_GST_PCT, SELF_ADHESIVE_HSN, tubeWeightKg } from "@/lib/marketplace-export";
import { isAutographTier, AUTOGRAPH_TIER, setPriceRate, roundRetail, formatINR, fixedSizePrice, CM_PER_INCH } from "@/lib/pricing";
import { requestedFinish, newWallpaperRate, WALLPAPER_FINISHES, type WallpaperFinishSlug } from "@/lib/wallpaper-finish";
import { sendEmail } from "@/lib/email";
import { canvasSizeVariants } from "@/lib/variants";
import { canvasReadySizesFor, normaliseTiers } from "@/lib/canvas-sizes";
import { SITE_URL } from "@/lib/seo";
import { recordImageDimensions } from "@/lib/image-dimensions";
import { embedImageUrlRemote, occlusionRemote, imageMetaRemote, thumbnailBytesRemote } from "@/lib/media-client";
import { toVectorLiteral } from "@/lib/pgvector";
import { getTagCanon, canonicaliseTags, processRetagTick } from "@/lib/retag";
import { istDateKey } from "@/lib/ist";
import { roomRulesPrompt } from "@/lib/room-suitability";
import {
  SAMPLE_MEDIA_SLUGS, SAMPLE_WALL_FT, FT_TO_CM, printableCmFor,
  sampleSpecsFor, composeSampleSheet, engineFileUrl,
} from "@/lib/sample-sheet";
import { anthropicKeyFor } from "@/lib/ai-keys";

export const runtime = "nodejs";
// Scene generation (gpt-image-2) plus naming can run long; 60s was tripping the
// worker mid-tick and stalling the queue. Give each tick real headroom.
export const maxDuration = 300;

// Zyvorah Studio backend. Two front doors:
//
// A) Single design (browser-driven, immediate):
//   1) POST /api/studio/create  → name/describe/tag the flat (Claude vision),
//      pick the room-relevant scenarios, create the draft product.
//   2) POST /api/studio/scene   → generate ONE scenario image (gpt-image-2),
//      store it, attach it. Called once per scenario by the browser.
//   3) POST /api/studio/finalize → publish (or leave as draft).
//
// B) Overnight batch (server-driven, up to ~30-40 designs, survives the
//    browser closing): POST /api/studio/batch-enqueue queues N uploaded
//    flats; a self-chaining worker (studio_batch_claim → do ONE unit of work
//    → next/server `after()` fires the next tick) works through them one
//    scene at a time until the queue is empty. Claiming leases the item, so
//    overlapping chains take different work instead of both doing the same
//    item — that is how one 13-flat batch once became 26 products. GET
//    /api/studio/batch-status
//    lets the page show live progress, and POST /api/studio/batch-nudge is a
//    manual safety net in case the chain ever stalls.
//
// Everything is DB-gated by the admin key (studio_* SECURITY DEFINER RPCs).

/**
 * The price tier an upload asked for, narrowed to the two we accept.
 *
 * Anything unrecognised (or absent) falls back to "standard" rather than
 * erroring: a typo in a client payload must never be able to create a design at
 * the wrong price, and the safe direction is the ordinary catalogue. The
 * database narrows it a second time, so this is defence in depth, not the only
 * guard.
 */
function requestedTier(v: unknown): "standard" | "autograph" {
  return v === "autograph" || v === AUTOGRAPH_TIER ? "autograph" : "standard";
}

// The scenario catalogue (one per shoppable room/space collection, plus a few
// extra framings) lives in @/lib/studio-scenes so the Studio room picker and
// this worker can't drift apart.

/**
 * The service-role client, for the Studio's privileged catalogue writes.
 *
 * `supabase` is the ANON client: RLS lets it READ the catalogue and call the
 * key-gated studio_* RPCs, but a direct table write from it is silently
 * discarded. Configuring a canvas or a border is exactly that kind of write, so
 * it must go through here — and must fail loudly if the key is missing rather
 * than quietly producing a wallpaper.
 */
function requireAdminDb(): SupabaseClient {
  const db = supabaseAdmin();
  if (!db) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set — cannot configure the product");
  return db;
}

/** Run a write and surface its error. A discarded error is what let a canvas
 *  silently stay a wallpaper through two rounds of fixes. */
async function must<T extends { error: { message: string } | null }>(q: PromiseLike<T>, what: string): Promise<T> {
  const res = await q;
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res;
}

/** Same, for a read whose row the caller genuinely needs. */
async function one<T>(
  q: PromiseLike<{ data: T; error: { message: string } | null }>,
  what: string,
): Promise<NonNullable<T>> {
  const res = await q;
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  if (res.data == null) throw new Error(`${what}: not found`);
  return res.data as NonNullable<T>;
}

// Decides whether a room scene renders as a framed canvas print or a wallpaper
// mural — called WHILE the design is still a draft (scenes generate before
// publish). RLS shows the anon client only status = 'active' products, so
// reading this on `supabase` silently saw nothing for every draft and every
// canvas rendered as a mural until publish. Must read with the service role.
async function hasCanvasWallArtTag(handle: string): Promise<boolean> {
  const db = requireAdminDb();
  const { data } = await db
    .from("products")
    .select("product_tags!inner(tag)")
    .eq("handle", handle)
    .eq("product_tags.tag", "Canvas Wall Art")
    .limit(1);
  return (data?.length ?? 0) > 0;
}

// Same check, for Zyvorah's dedicated ceiling-wallpaper range — a design
// tagged this way gets EVERY room scene staged with the artwork on the
// ceiling instead of the wall, whichever room is picked.
async function hasCeilingTag(handle: string): Promise<boolean> {
  const db = requireAdminDb();
  const { data } = await db
    .from("products")
    .select("product_tags!inner(tag)")
    .eq("handle", handle)
    .eq("product_tags.tag", "Ceiling Wallpaper")
    .limit(1);
  return (data?.length ?? 0) > 0;
}

/**
 * Which styling register to render a design's rooms in.
 *
 * An explicit pick from the Studio always wins — someone looked at the artwork
 * and decided. With no pick, the design's OWN tags answer it: the vision pass
 * already judges a statement piece and writes `Mood: Dramatic` / `Bold` / `Dark`,
 * so a design uploaded long before this feature existed re-renders in the right
 * register without anyone re-tagging the catalogue.
 */
async function resolveStyling(handle: string, explicit: unknown): Promise<StylingKey> {
  if (isStylingKey(explicit)) return explicit;
  const { data } = await requireAdminDb()
    .from("products")
    .select("product_tags(tag)")
    .eq("handle", handle)
    .single();
  const tags = ((data?.product_tags as unknown as { tag: string }[]) ?? []).map((t) => t.tag);
  return stylingFromTags(tags);
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "design";
}

// The key check rides on studio_recent because that function already refuses an
// unknown key. It wants the REFUSAL, never the rows — so it asks for ONE design
// rather than a list. This runs on every authenticated Studio request, and the
// list call below now asks for the whole catalogue (0149); without this limit,
// the two uses would share a cost that only one of them needs.
async function requireKey(key: string | undefined): Promise<boolean> {
  if (!key) return false;
  const { data } = await supabase.rpc("studio_recent", { p_key: key, p_limit: 1 });
  return Array.isArray(data);
}

async function existingTitles(key: string): Promise<string[]> {
  const { data } = await supabase.rpc("studio_all_titles", { p_key: key });
  return Array.isArray(data) ? data : [];
}

// Canvas Wall Art is sold in a FIXED ladder of sizes, never cut to measure —
// and the ladder follows the ARTWORK's aspect ratio, because a canvas prints
// edge to edge and a size of a different shape would crop the piece. See
// src/lib/canvas-sizes.ts. The Studio picks tiers (small/medium/large), not
// absolute sizes: which tiers a design is offered in is the uploader's call —
// a busy composition may only read well large — but the SHAPE never is.

// Wall art sells in TWO media — the same artwork, two different goods, each
// with its own internal make rate. The customer only ever sees the finished
// per-size price, never these multiples.
//   canvas         — eco-cotton, shipped rolled, framed at home
//   self-adhesive  — peel & stick vinyl, no framing
const WALL_ART_MEDIA = {
  "canvas": { slug: "eco-cotton-canvas", rate: 400 },
  "self-adhesive": { slug: "self-adhesive-vinyl", rate: 200 },
} as const;
type WallArtMedia = keyof typeof WALL_ART_MEDIA;

// Limited-edition pieces carry a premium INTERNAL make-rate — the customer
// only ever sees the finished per-size price it produces, never this number.
const LIMITED_EDITION_RATE = 1000;

function normaliseMedia(input: unknown): WallArtMedia[] {
  const picked = (Array.isArray(input) ? input.map(String) : []).filter((m): m is WallArtMedia => m in WALL_ART_MEDIA);
  return picked.length ? [...new Set(picked)] : (Object.keys(WALL_ART_MEDIA) as WallArtMedia[]);
}

// After product creation, convert it to a wall-art product: fixed sizes only,
// sold in the picked media (both by default) at each medium's own rate, with
// every wallpaper stock switched off. Sets orientation + ready_sizes and tags
// it Canvas Wall Art (the storefront's wall-art signal).
async function configureAsCanvas(key: string, handle: string, flatUrl: string, sizeKeys: string[] | null = null, mediaKeys: WallArtMedia[] | null = null, autoSizes = false, rateOverride: number | null = null, setPrice: number | null = null) {
  void key;
  // `autoSizes` used to mean "pick the ladder's shape for me". The shape now
  // always follows the artwork, so it survives only as "offer every tier".
  void autoSizes;
  // These are privileged writes: `supabase` is the ANON client and RLS lets it
  // read the catalogue, not rewrite it. Going through it here silently did
  // nothing and left the design a per-sq-ft wallpaper.
  const db = requireAdminDb();

  // The flat's aspect ratio decides BOTH the orientation and the shape of every
  // size offered — a 3:5 painting is sold at 3:5, so nothing is ever cropped.
  let orientation: "vertical" | "horizontal" = "vertical";
  let ratio = 0.75; // unreadable image ⇒ assume portrait rectangle
  try {
    const meta = await imageMetaRemote({ url: flatUrl });
    ratio = (meta.width ?? 1) / (meta.height ?? 1);
    if (ratio > 1.05) orientation = "horizontal";
  } catch { /* default to portrait */ }

  const sizes = canvasReadySizesFor(ratio, normaliseTiers(sizeKeys));

  // A limited edition whose price was SET is stored as the rate that produces
  // exactly that price at its one finished size — see setPriceRate(). Nothing
  // downstream learns a new concept: the product page, the cart, the checkout
  // and the Merchant feed all keep pricing the piece the way they always have,
  // which is what stops two surfaces quoting two different numbers for it.
  let rateFromPrice: number | null = null;
  if (setPrice !== null) {
    // Guarded in the caller too; repeated here because this is the line that
    // would otherwise write a wrong price into the catalogue.
    if (sizes.length !== 1) throw new Error("a set price needs exactly one finished size");
    const [wIn, hIn] = sizes[0];
    rateFromPrice = setPriceRate(setPrice, wIn, hIn);
    if (rateFromPrice === null) {
      throw new Error(`${formatINR(setPrice)} can't be quoted exactly at ${wIn} × ${hIn} in — use a figure rounded to the nearest ₹1,000`);
    }
  }

  const prod = await one(db.from("products").select("id").eq("handle", handle).single(), "find product");

  // Fixed-size ladder + orientation, in the Canvas Art category — the category
  // is what every storefront surface reads to render this as a finished piece
  // rather than a mural wallpaper. The tag rides along because the
  // category rules and 0039's canvas material rules both key off it.
  await must(
    db.from("products").update({ orientation, ready_sizes: sizes, category: CANVAS_CATEGORY }).eq("id", prod.id),
    "set canvas category and sizes",
  );
  await must(
    db.from("product_tags").upsert({ product_id: prod.id, tag: "Canvas Wall Art" }, { onConflict: "product_id,tag" }),
    "tag as Canvas Wall Art",
  );

  // Swap materials: every wallpaper stock off, each picked medium on at its
  // own rate. product_materials keys on material_id (NOT a slug), so resolve.
  const media = normaliseMedia(mediaKeys);
  const slugs = media.map((m) => WALL_ART_MEDIA[m].slug);
  const { data: mediaRows } = await db.from("materials").select("id, slug").in("slug", slugs);
  if (!mediaRows?.length) throw new Error("wall-art media materials not found");
  const keepIds = mediaRows.map((r) => r.id);

  await must(
    db.from("product_materials").update({ available: false })
      .eq("product_id", prod.id).not("material_id", "in", `(${keepIds.join(",")})`),
    "disable the wallpaper materials",
  );

  for (const m of media) {
    const mat = mediaRows.find((r) => r.slug === WALL_ART_MEDIA[m].slug);
    if (!mat) throw new Error(`media material missing: ${WALL_ART_MEDIA[m].slug}`);
    // A limited-edition piece is priced off its own premium make-rate,
    // whichever medium it prints on — internal only, never displayed.
    const rate = rateFromPrice ?? rateOverride ?? WALL_ART_MEDIA[m].rate;
    const { data: existing } = await db.from("product_materials")
      .select("id").eq("product_id", prod.id).eq("material_id", mat.id).maybeSingle();
    if (existing) {
      await must(
        db.from("product_materials")
          .update({ available: true, price_per_sqft: rate }).eq("id", existing.id),
        `enable the ${m} medium`,
      );
    } else {
      await must(
        db.from("product_materials").insert({
          product_id: prod.id, material_id: mat.id,
          price_per_sqft: rate, available: true,
        }),
        `add the ${m} medium`,
      );
    }
  }
}

// The launch border spec: ₹300 per linear metre, 10 cm tall, supplied as 1 m
// pieces (five make a set). The desk can change any of these on the draft before
// publishing — a border cannot go active without them (migration 0050).
const BORDER_RATE_PER_METRE = 300;
const BORDER_HEIGHT_CM = 10;
const BORDER_SEGMENT_LENGTH_M = 1;
/** The tag the Borders & Strips category browses and enforces on. */
const BORDER_BROWSE_TAG = "Borders";

/** A collection name is free text typed (or picked) at upload — cap it the
 *  same way the DB does so the tag and the collection title can never diverge. */
const MAX_COLLECTION_NAME = 80;

/** At most one shelf per axis: a collection (an aesthetic), a series (a
 *  provenance or price band) and a set (panels cut for one physical thing).
 *  See migration 0145 for what the three kinds mean. */
const MAX_COLLECTIONS_PER_UPLOAD = 3;
const SHELF_KINDS = ["curated", "series", "set"] as const;
type ShelfKind = (typeof SHELF_KINDS)[number];
type Shelf = { name: string; kind: ShelfKind };

/**
 * The shelves an upload puts a design on. A design sits on up to three at once
 * — Autograph AND Maharaja's Court AND Phone Booth is one product, not three —
 * so the client sends a list, each entry carrying the kind of shelf it came
 * from. The kind matters only when the name is NEW: it decides which shelf the
 * collection is created on, and getting that wrong is how the junk drawer that
 * migration 0145 had to unpick formed in the first place.
 *
 * `collection` (singular, no kind) is still read and merged as an aesthetic:
 * an older client, and every row already sitting in the batch queue, keeps
 * working untouched.
 */
function parseShelf(encoded: string): { name: string; kind: string } {
  const at = encoded.lastIndexOf("::");
  if (at === -1) return { name: encoded, kind: "curated" };
  return { name: encoded.slice(0, at), kind: encoded.slice(at + 2) };
}

function collectionShelves(body: { collection?: unknown; collections?: unknown }): Shelf[] {
  const raw: unknown[] = [
    ...(Array.isArray(body.collections) ? body.collections : []),
    typeof body.collection === "string" ? { name: body.collection, kind: "curated" } : null,
  ];
  const out: Shelf[] = [];
  for (const v of raw) {
    // The batch queue stores each shelf as "Name::kind" in a text[] — a plain
    // name (a row queued before 0146) parses as an aesthetic, which is what it
    // was. "::" cannot occur in a collection title, so the split is safe.
    const entry = typeof v === "string" ? parseShelf(v) : v;
    if (!entry || typeof entry !== "object") continue;
    const { name: rawName, kind: rawKind } = entry as { name?: unknown; kind?: unknown };
    if (typeof rawName !== "string") continue;
    const name = rawName.trim().slice(0, MAX_COLLECTION_NAME);
    if (!name) continue;
    // Case-insensitive, because "ikat" and "Ikat" would otherwise be tagged
    // twice — joinCuratedCollection is idempotent, but the work is not free.
    if (out.some((n) => n.name.toLowerCase() === name.toLowerCase())) continue;
    const kind = SHELF_KINDS.includes(rawKind as ShelfKind) ? (rawKind as ShelfKind) : "curated";
    out.push({ name, kind });
  }
  return out.slice(0, MAX_COLLECTIONS_PER_UPLOAD);
}

/**
 * Put a design into a named curated collection, creating that collection the
 * first time the name is used.
 *
 * Idempotent in both halves: the first design under a name creates the
 * collection row, every later one hits the on-conflict no-op and is only
 * tagged. `rule_tag` == the collection's own name, which is how every curated
 * collection on the site (Katha, Stallion Spirit, Ikat Collection, …) is
 * joined — so there is nothing else to keep in step.
 */
async function joinCuratedCollection(productId: string, name: string, kind: ShelfKind = "curated") {
  const title = name.trim().slice(0, MAX_COLLECTION_NAME);
  if (!title) return;
  const db = requireAdminDb();
  const { data: maxPos } = await db.from("collections").select("position").order("position", { ascending: false }).limit(1).maybeSingle();
  // `kind` only bites on creation — ignoreDuplicates means an existing
  // collection keeps whatever shelf it is already on, so picking one from the
  // Series field can never quietly demote it to an aesthetic.
  await must(
    db.from("collections").upsert(
      { handle: slugify(title), title, kind, rule_tag: title, position: (maxPos?.position ?? 0) + 1 },
      { onConflict: "handle", ignoreDuplicates: true },
    ),
    "create/reuse the collection",
  );
  await must(
    db.from("product_tags").upsert({ product_id: productId, tag: title }, { onConflict: "product_id,tag" }),
    "tag into the collection",
  );
}

/**
 * Convert a freshly-created draft into a Border: sold by the linear metre, no
 * material to choose (so every wallpaper stock comes off), and carrying the
 * facts the category requires — height, supply format and piece length.
 */
async function configureAsBorder(handle: string) {
  // Privileged writes — see requireAdminDb.
  const db = requireAdminDb();
  const prod = await one(db.from("products").select("id").eq("handle", handle).single(), "find product");

  await must(
    db.from("products").update({
      category: BORDER_CATEGORY,
      price_per_metre: BORDER_RATE_PER_METRE,
      border_height_cm: BORDER_HEIGHT_CM,
      supply_format: "segmented",
      segment_length_m: BORDER_SEGMENT_LENGTH_M,
      // A border is not cut to a size ladder; the category rules reject one.
      ready_sizes: null,
    }).eq("id", prod.id),
    "set border category and pricing",
  );

  // The browse tag its category listing and rules key off.
  await must(
    db.from("product_tags").upsert({ product_id: prod.id, tag: BORDER_BROWSE_TAG }, { onConflict: "product_id,tag" }),
    "tag as Borders",
  );

  // No material choice at all — borders have no finish to pick, and the
  // category rules refuse to activate one that offers any.
  await must(
    db.from("product_materials").update({ available: false }).eq("product_id", prod.id),
    "disable materials",
  );
}

/**
 * Put a freshly-created standard wallpaper on the ONE finish its uploader chose.
 *
 * studio_create_or_get_product starts every standard design on Soft Matte;
 * this moves it to Linen Textured when that was the pick. The database allows
 * one of the two at a time (product_materials_one_finish), so the old finish
 * comes off BEFORE the new one goes on.
 */
async function applyFinish(handle: string, finish: WallpaperFinishSlug) {
  const db = requireAdminDb();
  const prod = await one(db.from("products").select("id, price_tier, is_signature").eq("handle", handle).single(), "find product for finish");
  if (prod.price_tier && prod.price_tier !== "standard") return;
  const [tagRows, collectionRows, priceRows] = await Promise.all([
    db.from("product_tags").select("tag").eq("product_id", prod.id),
    db.from("collections").select("rule_tag, rule_tags, is_signature, category_scope").eq("kind", "curated"),
    db.from("product_materials").select("price_per_sqft").eq("product_id", prod.id).eq("available", true),
  ]);
  for (const result of [tagRows, collectionRows, priceRows]) if (result.error) throw result.error;
  const rate = newWallpaperRate({
    tags: (tagRows.data ?? []).map((t) => t.tag),
    collections: (collectionRows.data ?? []).filter((c) => !c.category_scope || c.category_scope === "wallpaper").map((c) => ({ tags: c.rule_tags?.length ? c.rule_tags : [c.rule_tag].filter(Boolean), signature: !!c.is_signature })),
    signature: !!prod.is_signature,
    existingRate: Number(priceRows.data?.[0]?.price_per_sqft ?? 200),
  });
  const { data: mats, error: materialError } = await db.from("materials").select("id, slug").in("slug", WALLPAPER_FINISHES.map((f) => f.slug));
  if (materialError) throw materialError;
  const chosen = mats?.find((m) => m.slug === finish);
  if (!chosen) throw new Error(`finish material missing: ${finish}`);
  await must(
    db.from("product_materials").update({ available: false })
      .eq("product_id", prod.id).neq("material_id", chosen.id)
      .in("material_id", (mats ?? []).map((m) => m.id)),
    "take the default finish off",
  );
  await must(
    db.from("product_materials").upsert(
      { product_id: prod.id, material_id: chosen.id, price_per_sqft: rate, available: true },
      { onConflict: "product_id,material_id" },
    ),
    `put the design on ${finish}`,
  );
}

// ---- Claude vision: name, describe, tag AND room-map the flat artwork ----
//
// A failed naming pass is an ERROR, not a fallback. It used to return a
// placeholder ("New Mural", the family blurb, no tags, living/bedroom/closeup)
// and the upload carried on as if nothing had happened — which is how nine
// "New Mural II…VIII" drafts, each rendered into rooms nobody chose, landed in
// one sitting on 19 September 2026 without a word to the uploader. Now a
// transient failure is retried, and a persistent one throws NamingFailed with
// the reason, so the upload stops and says why instead of quietly inventing a
// design. The one fallback that remains is the deliberate no-key case (local
// dev without ANTHROPIC_API_KEY).
class NamingFailed extends Error {
  constructor(reason: string) {
    super(`Couldn't name and tag the design (${reason}). Nothing was created — try again, or give it a title and pick its rooms yourself.`);
    this.name = "NamingFailed";
  }
}
type ArtworkMeta = { title: string; description: string; tags: string[]; scenes: string[] };

async function describeArtwork(
  flatUrl: string,
  avoidTitles: string[],
  opts: { isCanvas?: boolean; isBorder?: boolean; context?: string; story?: string } = {},
): Promise<ArtworkMeta> {
  const key = anthropicKeyFor("catalogue");
  const familyDesc = opts.isBorder
    ? "<p>A printed decorative border for edging walls, ceilings and panelling — sold by the linear metre.</p>"
    : opts.isCanvas
      ? "<p>A premium canvas art print, shipped rolled and ready to frame.</p>"
      : "<p>A mural wallpaper design, prepared for your order.</p>";
  const fallback = {
    title: opts.isBorder ? "New Border" : opts.isCanvas ? "New Canvas" : "New Mural",
    description: familyDesc,
    // Canvas and Border keep their family tag because those ARE real
    // collection rule_tags — they decide which family listing the design
    // belongs to. Wallpaper gets nothing: "Murals" was never a collection, and
    // a wallpaper is already identified by its category. An untagged design is
    // caught by catalogue_gaps and re-tagged properly (migration 0130), which
    // is a better outcome than a tag that means nothing.
    tags: opts.isBorder ? [BORDER_BROWSE_TAG] : opts.isCanvas ? ["Canvas Wall Art"] : [],
    scenes: DEFAULT_SCENES,
  };
  if (!key) return fallback;
  // Through the R2 binding, never a plain fetch: a Studio upload lives at
  // zyvorah.com/media/…, which is our own zone and unfetchable from the
  // Worker. A plain fetch came back as a Cloudflare error page, the thumbnail
  // step choked on it, and the fallback shipped `text/html` bytes to Claude —
  // every batch upload on 21 September 2026 failed at naming with
  // "media_type: Input should be 'image/jpeg', 'image/png', …".
  const img = await fetchMediaAware(toMediaUrl(flatUrl));
  if (!img.ok) throw new Error(`flat unfetchable (${img.status}) for naming: ${flatUrl}`);
  const rawBuf = Buffer.from(await img.arrayBuffer());
  let b64: string;
  let mediaType = "image/jpeg";
  try {
    const ab = rawBuf.buffer.slice(rawBuf.byteOffset, rawBuf.byteOffset + rawBuf.byteLength) as ArrayBuffer;
    b64 = (await thumbnailBytesRemote(ab, { width: 768, quality: 82 })).toString("base64");
  } catch {
    b64 = rawBuf.toString("base64");
    const ct = img.headers.get("content-type")?.split(";")[0]?.trim();
    // Claude accepts exactly these four; anything else (octet-stream from an
    // R2 object stored without a type, "image/jpg") must not be forwarded.
    mediaType = ct && ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(ct) ? ct : "image/jpeg";
  }
  const scenarioList = SCENARIOS.map((s) => `${s.key} (${s.label})`).join(", ");
  const avoidList = avoidTitles.slice(-300).join(", ");

  const contextHint = opts.context
    ? `The uploader has described this image as: "${opts.context}". Use this to inform your naming, description, and tag choices — do not contradict it. `
    : "";

  // A design can arrive with the artist's own story. The product
  // page's description IS that story, retold faithfully — richer model, longer
  // output, and a hard grounding rule: no invented facts, ever.
  const storyBlock = opts.story
    ? `\n\nTHE PIECE'S STORY, in the artist's own words:\n"""\n${opts.story}\n"""\n\n` +
      "Write the \"description\" as this piece's story for its product page: 3-4 short HTML <p> paragraphs, warm, premium and personal. " +
      "Ground EVERY factual claim strictly in the story above and in what is actually visible in the image. " +
      "Keep the artist's specific details (places, names, memories, techniques, meanings) exactly as given — do NOT invent new facts, places, dates, people or techniques that are not in the story. " +
      "You may polish the language and structure, but the story must remain hers. " +
      "If the story names the piece, use that name as the title. "
    : "";

  const productType = opts.isBorder
    ? "This is artwork for a decorative WALLPAPER BORDER for a premium Indian brand (Zyvorah) — a narrow strip that edges a wall, ceiling or panelling, sold by the linear metre. It is NOT a wallpaper mural and NOT a canvas print. "
    : opts.isCanvas
      ? "This is artwork for a premium Indian canvas wall art brand (Zyvorah). It will be sold as a framed/stretched canvas print — NOT a wallpaper mural. "
      : "This is a wallpaper/mural pattern for a premium Indian wallpaper brand (Zyvorah). ";

  // The vocabulary is the live taxonomy, so a tag the model returns is a tag
  // some collection actually browses. Colour is listed separately and demanded
  // explicitly: it is the axis shoppers filter on hardest and the one the old
  // hand-written list omitted entirely.
  const canon = await getTagCanon();
  const familyTag = opts.isBorder ? BORDER_BROWSE_TAG : opts.isCanvas ? "Canvas Wall Art" : null;
  const styleVocab = [familyTag, ...canon.style].filter(Boolean).join(", ");
  const colourVocab = canon.colour.join(", ");

  const request = () => fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      // Story-driven limited pieces get the stronger writer; routine
      // naming/tagging stays on the cheap fast model.
      model: opts.story ? "claude-sonnet-5" : "claude-haiku-4-5-20251001",
      max_tokens: opts.story ? 1600 : 900,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: b64 } },
          {
            type: "text",
            text:
              productType + contextHint + storyBlock +
              "Return ONLY minified JSON: {" +
              "\"title\": string (a short, evocative boutique product name, 1-3 words, no quotes), " +
              (opts.story
                ? "\"description\": string (the piece's story as 3-4 short HTML <p> paragraphs, per the story instructions above), "
                : "\"description\": string (2-3 sentence HTML using <p> tags, warm and premium, describing the design and mood), ") +
              `\"tags\": string[] (up to 7 supported tags; fewer is fine, using ONLY these exact words where they genuinely fit: ${styleVocab}), ` +
              `\"colours\": string[] (1-3 of the design's DOMINANT colours, using ONLY these exact words: ${colourVocab}. This is required — every design has colours, so never return an empty list), ` +
              "\"moods\": string[] (1-2 moods that genuinely fit, using EXACTLY these words: Serene, Dramatic, Playful, Romantic, Earthy, Regal, Fresh. Definitions: Serene=calm/tranquil/restful; Dramatic=bold/high-contrast/statement; Playful=whimsical/joyful/fun; Romantic=soft/dreamy/tender; Earthy=natural/organic/grounded; Regal=opulent/heritage/majestic; Fresh=airy/bright/uplifting), " +
              "\"scenes\": string[] (choose ONLY the room scenarios that genuinely suit this design's subject/age-group/formality from this exact list of keys: " + scenarioList + ". " +
              "Be strict and realistic: a baby/nursery/cartoon-animal design should include nursery/playroom/bedroom and should NOT include office/dining/living unless it truly fits a grown-up space too; a formal/abstract/geometric design suited to adult spaces should NOT include nursery/playroom. " +
              "A spiritual/religious/devotional design (mandalas, yantras, deities, temple motifs, rangoli, sacred geometry) should include 'pooja' as its primary scene, alongside 'closeup' and at most one or two of living/bedroom/entryway if it would also genuinely suit those — it should NOT include nursery/playroom/office. " +
              "EXCEPTION: never pick 'pooja' for a design you are naming after an Indo-Islamic dynasty, court or monument (Mughal, Taj, Sultan, Nizam, minaret, arabesque and the like). A puja room is a Hindu shrine, and that name over a mandir reads wrong to the customer however beautiful the ornament is — symmetrical jewel-toned medallions are the usual trap, since they scan as sacred geometry. Give those 'closeup' plus the secular rooms that genuinely fit, or 'ceiling' if it is a ceiling design. " +
              "Only pick a commercial/hospitality space (hotellobby, cafe, retail, spa, library, hostel, mediaroom, corpoffice, reception, boardroom) if the design genuinely suits that kind of public interior. " +
              `Always include 'closeup'. Pick 3 keys ideally, ${MAX_AI_SCENES} at most — never more than ${MAX_AI_SCENES}.)` +
              "}\n\n" + STYLE_RULES_PROMPT + "\n\n" + roomRulesPrompt() + "\n\n" +
              (avoidList
                ? `IMPORTANT: These product names already exist in the catalogue — the title you choose must be genuinely different (not the same phrase, not a trivial variant): ${avoidList}.`
                : ""),
          },
        ],
      }],
    }),
  });

  // Overloads, rate limits (a batch names several designs at once) and
  // network blips are retried with a short backoff. Anything else — a bad
  // key, an exhausted balance, a rejected request — is reported at once with
  // the API's own message, since retrying would only repeat the answer.
  let res: Response | null = null;
  let lastReason = "no response";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 1500 * attempt));
    try {
      res = await request();
    } catch (e) {
      lastReason = `network: ${e instanceof Error ? e.message : String(e)}`;
      res = null;
      continue;
    }
    if (res.ok) break;
    const body = await res.text().catch(() => "");
    let apiMessage = "";
    try { apiMessage = String(JSON.parse(body)?.error?.message ?? ""); } catch { /* not JSON */ }
    lastReason = `Claude API ${res.status}${apiMessage ? `: ${apiMessage.slice(0, 160)}` : ""}`;
    console.error(`studio describeArtwork attempt ${attempt + 1} failed — ${lastReason}`);
    const transient = res.status === 429 || res.status >= 500;
    res = null;
    if (!transient) break;
  }
  if (!res) throw new NamingFailed(lastReason);
  const data = await res.json();
  const text: string = data?.content?.[0]?.text ?? "";
  try {
    const j = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    const scenes = Array.isArray(j.scenes)
      ? j.scenes.map(String).filter((k: string) => SCENARIO_BY_KEY.has(k))
      : [];
    // Snap onto the canon and drop anything invented — the tags field was the
    // only part of this response that used to be stored unvalidated, which is
    // how every drifted tag in the catalogue got there.
    const baseTags: string[] = canonicaliseTags(j.tags, canon).slice(0, 7);
    const colourTags: string[] = canonicaliseTags(j.colours, canon)
      .filter((t) => canon.colour.includes(t))
      .slice(0, 3);
    if (opts.isCanvas && !baseTags.includes("Canvas Wall Art")) baseTags.unshift("Canvas Wall Art");
    if (opts.isBorder && !baseTags.includes(BORDER_BROWSE_TAG)) baseTags.unshift(BORDER_BROWSE_TAG);
    const moods: string[] = Array.isArray(j.moods)
      ? j.moods.map(String).filter((m: string) => (MOODS as readonly string[]).includes(m)).slice(0, 2)
      : [];
    const title = String(j.title || fallback.title).slice(0, 60);
    const chosen = scenes.length >= 2
      ? Array.from(new Set<string>(scenes)).slice(0, MAX_AI_SCENES)
      : DEFAULT_SCENES;
    return {
      title,
      description: String(j.description || fallback.description),
      // The same bar as the scene below, applied to the tags: a barred design
      // must not come back "Spiritual" either, or it answers a devotional
      // search and makes the sale the render was stopped from making.
      tags: stripPoojaTags(
        Array.from(new Set([...baseTags, ...colourTags, ...moods.map((m) => `Mood: ${m}`)])),
        title,
      ),
      // Applied last, to the title the model just minted rather than to our
      // catalogue — so it holds for designs that do not exist yet, and survives
      // the renaming of the ones that do. The prompt line above asks; this
      // guarantees.
      scenes: stripPoojaForMotif(chosen, title),
    };
  } catch {
    console.error("studio describeArtwork: unreadable reply:", text.slice(0, 300));
    throw new NamingFailed("the reply could not be read");
  }
}

// If the chosen title collides (case-insensitively) with an existing one,
// disambiguate deterministically rather than silently reusing a name.
function dedupeTitle(title: string, avoid: string[]): string {
  const taken = new Set(avoid.map((t) => t.trim().toLowerCase()));
  if (!taken.has(title.trim().toLowerCase())) return title;
  for (const suffix of ["II", "III", "IV", "V", "VI", "VII", "VIII"]) {
    const candidate = `${title} ${suffix}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${title} ${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

// ---- gpt-image-2: draft a MASTER artwork (the flat itself) ----
//
// Everything else in this file renders a flat somebody already made. This is
// the step before that: drafting the flat, for commissioned-project work where
// the artwork brief is written here (in prompts) rather than arriving as a
// file. It lives in this route on purpose — production is the one place the
// OpenAI key exists, and the studio key is already the credential for
// spending an image.
//
// Drafts land in `artwork-drafts/` in the product-images bucket and create NO
// product row — a draft becomes a design only when someone uploads it through
// the normal create flow. `sourceUrl` switches generation to an edit of an
// existing draft, which is how a chosen master gets its second tower
// colourway derived from the SAME composition instead of a fresh roll of the
// dice.
async function generateArtwork(
  prompt: string,
  size: "1024x1536" | "1536x1024" | "1024x1024",
  sourceUrl?: string,
): Promise<Buffer> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");
  let res: Response;
  if (sourceUrl) {
    // Same binding-aware read as generateScene — sourceUrl may be R2-migrated.
    const srcBuf = Buffer.from(await (await fetchMediaAware(toMediaUrl(sourceUrl))).arrayBuffer());
    const form = new FormData();
    form.append("model", "gpt-image-2");
    form.append("size", size);
    // Masters are the thing we print — never the scenes' speed/cost setting.
    form.append("quality", "high");
    form.append("image", new Blob([new Uint8Array(srcBuf)], { type: "image/png" }), "master.png");
    form.append("prompt", prompt);
    res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form,
    });
  } else {
    res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-image-2", prompt, size, quality: "high", n: 1 }),
    });
  }
  const j = await res.json();
  if (!res.ok) throw new Error(`openai ${res.status}: ${JSON.stringify(j).slice(0, 200)}`);
  const b64 = j?.data?.[0]?.b64_json;
  if (!b64) throw new Error("no image returned");
  return Buffer.from(b64, "base64");
}

// ---- gpt-image-2 edit: render the flat into a room scenario ----
async function generateScene(
  flatUrl: string,
  prompt: string,
  styleUrl?: string,
  /** The frame the scenario is shot in. Landscape suits a room seen across its
   *  width; a phone booth is a tall box entered head-on and a landscape frame
   *  crops away the thing being sold. See Scenario.frame. */
  frame: SceneFrame = "landscape",
): Promise<Buffer> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");
  // Stored flat URLs keep the Supabase spelling; the bytes live in R2 now,
  // and our own zone is unfetchable from the Worker — read via the binding.
  const rawBuf = Buffer.from(await (await fetchMediaAware(toMediaUrl(flatUrl))).arrayBuffer());
  // `Buffer` not `Buffer<ArrayBuffer>`: sharp 0.34's toBuffer() is typed with
  // ArrayBufferLike, so inferring the narrower type from rawBuf breaks the build.
  let flatBuf: Buffer = rawBuf;
  try {
    const ab = rawBuf.buffer.slice(rawBuf.byteOffset, rawBuf.byteOffset + rawBuf.byteLength) as ArrayBuffer;
    flatBuf = await thumbnailBytesRemote(ab, { width: 768, quality: 82 });
  } catch {
    /* fall back to full-size reference if the media worker is unavailable */
  }
  const form = new FormData();
  form.append("model", "gpt-image-2");
  form.append("size", frame === "portrait" ? "1024x1536" : "1536x1024");
  form.append("quality", "low");
  // When a style reference is provided, both images go under `image[]` — the
  // edits API takes multiple images as an ARRAY field, and rejects a repeated
  // plain `image` with "Duplicate parameter". This path had never actually
  // run before the Shorelight anchor armed it (the UI's inspiration upload
  // was the only caller and is rarely used), which is how the bug survived:
  // the single-image branch below is the one every catalogue render takes,
  // and it keeps the proven plain `image` field untouched.
  if (styleUrl) {
    let styleBuf: Buffer = Buffer.from(await (await fetchMediaAware(toMediaUrl(styleUrl))).arrayBuffer());
    try {
      const sab = styleBuf.buffer.slice(styleBuf.byteOffset, styleBuf.byteOffset + styleBuf.byteLength) as ArrayBuffer;
      styleBuf = await thumbnailBytesRemote(sab, { width: 512, quality: 75 });
    } catch { /* use raw */ }
    form.append("image[]", new Blob([new Uint8Array(flatBuf)], { type: "image/jpeg" }), "flat.jpg");
    form.append("image[]", new Blob([new Uint8Array(styleBuf)], { type: "image/jpeg" }), "style.jpg");
    form.append("prompt", prompt + " Match the overall styling, mood, colour temperature and interior design aesthetic of the second reference image.");
  } else {
    form.append("image", new Blob([new Uint8Array(flatBuf)], { type: "image/jpeg" }), "flat.jpg");
    form.append("prompt", prompt);
  }
  const res = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(180_000),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`openai ${res.status}: ${JSON.stringify(j).slice(0, 200)}`);
  const b64 = j?.data?.[0]?.b64_json;
  if (!b64) throw new Error("no image returned");
  return Buffer.from(b64, "base64");
}

// How much of a scene's focal band may be covered by furniture before we treat
// the design's subject as occluded and refuse to keep the scene. Env-tunable.
const OCCLUSION_THRESHOLD = Number(process.env.SCENE_OCCLUSION_THRESHOLD ?? 0.08);

// Focal-occlusion score for a generated scene, degrading to 0 (allow) if the
// segmentation model can't run (it lives in the media container now — an
// unreachable container counts) — the guard must never block the pipeline.
async function safeOcclusion(png: Buffer): Promise<{ score: number; occluder: string | null }> {
  try {
    const ab = png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer;
    const r = await occlusionRemote(ab);
    return { score: r.score, occluder: r.occluder };
  } catch (e) {
    console.error("[scene-guard] occlusion check failed (allowing scene):", e);
    return { score: 0, occluder: null };
  }
}

type SceneResult = { url: string | null; skipped: boolean; score?: number; occluder?: string | null; reason?: "focal_occlusion" | "room_excluded" };

async function uploadAndAttachScene(
  key: string, handle: string, title: string, flatUrl: string, sceneKey: string, position: number, featured: boolean,
  canvasWallArt = false, styleUrl?: string, styling: StylingKey = "calm", ceiling = false,
  project?: CommissionedProject,
): Promise<SceneResult> {
  const sc = resolveScenario(sceneKey, project);
  if (!sc) throw new Error(`unknown scene ${sceneKey}`);

  // A design decided unfit for this room (room_exclusions — a queen's
  // portrait behind a mandir, a bison over a crib) is never rendered into it.
  // The database would drop the row anyway (migration 20260926140000); asking
  // first is what stops us paying for a render nobody will ever see. Every
  // render path — the queue, the drawer, the room fill — comes through here.
  const { data: excluded } = await supabase.rpc("room_excluded", { p_handle: handle, p_scene_key: sc.key });
  if (excluded === true) {
    console.warn(`[room-suitability] skipped ${handle}/${sc.key}: excluded from this room`);
    return { url: null, skipped: true, reason: "room_excluded" };
  }

  // A commissioned project pins the building two ways at once: its shell
  // directive rides every prompt, and its approved anchor render becomes the
  // style reference whenever the caller didn't hand one in. A per-upload
  // inspiration image still wins — someone chose it for this design.
  const directive = project?.shellDirective;
  const style = styleUrl ?? project?.styleAnchorUrl;

  let png = await generateScene(flatUrl, scenarioPrompt(sc.room, { canvasWallArt, ceiling, styling, directive }), style, sc.frame);
  let occ = await safeOcclusion(png);
  if (occ.score >= OCCLUSION_THRESHOLD) {
    png = await generateScene(flatUrl, scenarioPrompt(sc.room, { clearFocus: true, canvasWallArt, ceiling, styling, directive }), style, sc.frame);
    occ = await safeOcclusion(png);
  }
  if (occ.score >= OCCLUSION_THRESHOLD) {
    const { error: flagErr } = await supabase.rpc("flag_scene_review", {
      p_key: key, p_handle: handle, p_scene_key: sc.key,
      p_reason: "focal_occlusion", p_score: Number(occ.score.toFixed(3)), p_occluder: occ.occluder,
    });
    if (flagErr) console.error("flag_scene_review failed:", flagErr.message);
    console.warn(`[scene-guard] skipped ${handle}/${sc.key}: focal occlusion ${occ.score.toFixed(2)} (${occ.occluder ?? "furniture"})`);
    return { url: null, skipped: true, score: occ.score, occluder: occ.occluder };
  }

  const safeName = (title || handle).replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const safeRoom = sc.label.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const objectKey = `${handle}/Zyvorah-${safeName}-${safeRoom}.png`;
  // R2 via the Worker's binding — this route has already proved the studio
  // key, which is exactly who should be writing. CACHE_MUTABLE because this
  // fixed key is upserted with new bytes on a re-render.
  const { publicUrl: url } = await putProductImage(objectKey, png, { contentType: "image/png", cacheControl: CACHE_MUTABLE });
  const { error } = await supabase.rpc("studio_add_scene", {
    p_key: key, p_handle: handle, p_url: url,
    p_position: position, p_featured: featured, p_alt: `${title || handle} — ${sc.label}`,
    p_scene_key: sc.key, p_room_tags: SCENE_ROOM_TAGS[sc.key] ?? sc.roomTags ?? null,
  });
  if (error) throw new Error(error.message);
  // Record the true size while the bytes are still in hand — no second fetch.
  await recordImageDimensions(requireAdminDb(), url, png);
  return { url, skipped: false };
}

// ---- one unit of work for a batch-queue item; self-contained + resumable ----
/**
 * ONE missing room render, for a room on the `room_render_fill` work list.
 *
 * The gap it closes: a design is merchandised into a room by its TAG, and a
 * room collection card shows that design's render OF THAT ROOM, falling back
 * to the bare flat when there isn't one (toCard in src/lib/queries.ts). Two
 * things write that tag — rendering a scene (studio_add_scene applies the
 * room's tags) and the retag repair pass (which writes tags directly and never
 * goes near the renderer). The second one is how 58 of the 119 designs in the
 * Pooja Room collection came to be sold to a devotional shopper as flat
 * pattern squares, and why /collections/pooja-room-wallpaper read as a page of
 * swatches below the fold on 26 September 2026.
 *
 * It runs HERE, on the server, rather than from a script, because the Studio
 * API is authorised by a staff Google sign-in (staffKey → currentStaff): a
 * laptop cannot drive it headlessly any more, whatever key it holds. The
 * studio-drain cron already holds the server's own key for exactly this kind
 * of work.
 *
 * Every render goes through uploadAndAttachScene — the same gpt-image-2 call,
 * occlusion guard and `studio_add_scene` write the Studio drawer uses. This
 * adds no second pipeline and no second way to tag a design.
 */
/**
 * ONE named scene for ONE named design — the one-off the other two mechanisms
 * cannot do. `studio_queue` is for a new upload and skips an existing flat as
 * a duplicate before it renders anything; `room_render_fill` walks a whole
 * room collection and cannot be pointed at a single design. Asking for a
 * single render is a row in `scene_render_once` (see that migration), never a
 * deploy, because every row is a gpt-image-2 call and therefore a spend.
 *
 * It goes through the same uploadAndAttachScene as everything else, so the
 * render is attached to the design exactly as a Studio-drawer render would be
 * — which is what lets the founder use it in a post AND on the product page.
 * featured stays false and the position goes after everything already
 * attached: a one-off adds a room, it does not re-front the design.
 */
export async function processSceneOnceTick(key: string): Promise<{ progressed: boolean; handle?: string }> {
  if (!serviceAvailable("ai")) requireService("ai");
  const db = supabaseAdmin();
  if (!db) return { progressed: false };
  const { data: rows } = await db
    .from("scene_render_once")
    .select("id, handle, scene_key")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1);
  const req = ((rows ?? []) as { id: string; handle: string; scene_key: string }[])[0];
  if (!req) return { progressed: false };

  // Claim before doing anything expensive: two ticks must not render the same
  // request twice and pay twice.
  const { data: claimed } = await db
    .from("scene_render_once")
    .update({ status: "running", claimed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", req.id)
    .eq("status", "queued")
    .select("id");
  if (!claimed?.length) return { progressed: false };

  const fail = async (why: string) => {
    await db.from("scene_render_once")
      .update({ status: "error", error: why.slice(0, 500), updated_at: new Date().toISOString() })
      .eq("id", req.id);
  };

  try {
    const sc = SCENARIO_BY_KEY.get(req.scene_key);
    if (!sc) { await fail(`no scenario named "${req.scene_key}"`); return { progressed: true }; }

    const { data: prod } = await db
      .from("products")
      .select("id, handle, title, product_images(url, is_flat, position)")
      .eq("handle", req.handle)
      .maybeSingle();
    if (!prod) { await fail(`no design with handle "${req.handle}"`); return { progressed: true }; }

    const imgs = ((prod as { product_images?: { url: string; is_flat: boolean; position: number }[] }).product_images ?? []);
    const flat = imgs.find((i) => i.is_flat)?.url;
    if (!flat) { await fail(`${req.handle} has no flat to render from`); return { progressed: true }; }
    const nextPosition = Math.max(0, ...imgs.map((i) => i.position ?? 0)) + 1;

    const isCanvas = await hasCanvasWallArtTag(req.handle);
    const isCeiling = !isCanvas && (await hasCeilingTag(req.handle));
    const styling = await resolveStyling(req.handle, undefined);
    const rendered = await uploadAndAttachScene(
      key, req.handle, (prod as { title: string }).title, flat, req.scene_key, nextPosition, false,
      isCanvas, undefined, styling, isCeiling,
    );
    // DID IT ACTUALLY ATTACH? uploadAndAttachScene renders, then lets the
    // occlusion guard refuse a frame whose focal point is covered — it does
    // not throw when it refuses, it writes a scene_review_flags row and drops
    // the image. Recording that as "done" is how the Diwali render looked
    // successful while nothing existed (26 Sep 2026): the request must carry
    // the refusal, or nobody learns the prompt needs changing.
    const { data: after } = await db
      .from("product_images")
      .select("url")
      .eq("product_id", (prod as { id: string }).id)
      .eq("scene_key", req.scene_key)
      .eq("url", rendered.url ?? "")
      .limit(1);
    if (!after?.length) {
      const { data: flag } = await db
        .from("scene_review_flags")
        .select("reason, score, occluder")
        .eq("product_handle", req.handle)
        .eq("scene_key", req.scene_key)
        .order("created_at", { ascending: false })
        .limit(1);
      const f = (flag ?? [])[0] as { reason?: string; score?: string; occluder?: string } | undefined;
      await fail(
        f
          ? `rendered but refused: ${f.reason}${f.occluder ? ` (${f.occluder})` : ""}${f.score ? ` at ${f.score}` : ""}`
          : "rendered but nothing was attached",
      );
      return { progressed: true, handle: req.handle };
    }

    await db.from("scene_render_once")
      .update({ status: "done", error: null, updated_at: new Date().toISOString() })
      .eq("id", req.id);
    revalidateCatalogue(req.handle);
    return { progressed: true, handle: req.handle };
  } catch (e) {
    await fail((e as Error).message ?? String(e));
    return { progressed: true, handle: req.handle };
  }
}

export async function processRoomFillTick(key: string): Promise<{ progressed: boolean; handle?: string }> {
  if (!serviceAvailable("ai")) requireService("ai");
  const db = supabaseAdmin();
  if (!db) return { progressed: false };
  const { data: rooms } = await db
    .from("room_render_fill").select("scene_key").eq("enabled", true);
  for (const { scene_key: sceneKey } of ((rooms ?? []) as { scene_key: string }[])) {
    const roomTag = SCENE_ROOM_TAGS[sceneKey]?.[0];
    if (!roomTag || !SCENARIO_BY_KEY.has(sceneKey)) continue;
    const { data, error } = await supabase.rpc("room_fill_next", {
      p_key: key, p_scene_key: sceneKey, p_room_tag: roomTag,
    });
    const next = ((data ?? []) as { handle: string; title: string; flat_url: string; next_position: number; tags: string[] }[])[0];
    if (error || !next) continue; // this room is done (or unreadable) — try the next
    // THE GUARD THAT MUST NOT BE SKIPPED. The scene PICKER is where a motif
    // barred from a shrine is normally dropped (stripPoojaForMotif); naming
    // the scene directly walks around it, so it is applied here. A barred
    // design is written to the refusal ledger rather than merely skipped —
    // otherwise the picker returns the same design on every tick forever, and
    // the flag is also the record that its Pooja Room tag is wrong.
    if (sceneKey === "pooja" && !allowsPoojaScene(next.title, next.tags)) {
      await supabase.rpc("flag_scene_review", {
        p_key: key, p_handle: next.handle, p_scene_key: sceneKey,
        p_reason: "barred_motif", p_score: null, p_occluder: null,
      });
      return { progressed: true, handle: next.handle };
    }
    const isCanvas = await hasCanvasWallArtTag(next.handle);
    const isCeiling = !isCanvas && (await hasCeilingTag(next.handle));
    const styling = await resolveStyling(next.handle, undefined);
    // featured: false, and a position AFTER everything already attached. This
    // design is already live with a card image somebody chose; the fill adds
    // the room it was missing, it does not re-front the design.
    await uploadAndAttachScene(
      key, next.handle, next.title, next.flat_url, sceneKey, next.next_position, false,
      isCanvas, undefined, styling, isCeiling,
    );
    // Attaching a scene changes what this design's card shows on every listing
    // that reads product_images — without this the render sits correct in the
    // database and invisible until the 1h ISR window happens to expire.
    revalidateCatalogue(next.handle);
    return { progressed: true, handle: next.handle };
  }
  return { progressed: false };
}

export async function processQueueTick(
  key: string,
  opts: {
    /** Skip (and release) a claimed scene-render step instead of running it.
     *  For the post-response drain: Cloudflare cancels `after()`/waitUntil
     *  work 30s after the response, and a room render takes longer than
     *  that. Running one there claimed the row, was killed mid-render with
     *  no error written, and left the row leased for 15 minutes — the Studio
     *  page re-nudges every 20s, so a whole batch was leased-and-killed
     *  within two minutes and the cron then had nothing it could claim
     *  (21 September 2026: six designs at 0/N rooms, no error, for hours).
     *  Renders belong to the studio-drain cron, which runs inside a real
     *  request with a 180s budget. */
    skipScenes?: boolean;
  } = {},
): Promise<{ progressed: boolean; itemId?: string }> {
  if (!serviceAvailable("ai")) requireService("ai");
  const { data: item, error: claimErr } = await supabase.rpc("studio_batch_claim", { p_key: key });
  if (claimErr || !item?.id) return { progressed: false };

  const row = item as {
    id: string; flat_url: string; status: string; handle: string | null; title: string | null;
    scene_keys: string[] | null; scene_index: number; auto_publish?: boolean; styling?: string | null; price_tier?: string | null; finish?: string | null;
    is_seamless?: boolean; repeat_width_cm?: number | null; is_ceiling?: boolean; context?: string | null;
    collection?: string | null; collections?: string[] | null;
  };

  if (opts.skipScenes && row.status === "scenes") {
    // Release the lease untouched (every field null → coalesce keeps it; only
    // claimed_at clears) so the cron can pick it up on its next run.
    await supabase.rpc("studio_batch_update", { p_key: key, p_id: row.id });
    return { progressed: false };
  }

  try {
    if (row.status === "queued") {
      // Dedup, cheap path: skip if a product with this flat already exists, so
      // a re-queued design doesn't burn a naming call. Reads with the service
      // role — a duplicate whose original is still a draft is invisible to the
      // anon client's RLS-filtered view and would create a second one.
      //
      // This read can't be the guarantee: it is a check-then-insert, and two
      // ticks racing the same flat both pass it. studio_create_or_get_product
      // below is what actually makes duplication impossible.
      const { data: existing } = await requireAdminDb()
        .from("product_images")
        .select("product_id, products!inner(handle, status)")
        .eq("url", row.flat_url)
        .eq("is_flat", true)
        .limit(1)
        .single();
      if (existing?.products) {
        await supabase.rpc("studio_batch_update", {
          p_key: key, p_id: row.id, p_status: "done",
          p_handle: (existing.products as unknown as { handle: string }).handle,
          p_title: "duplicate — skipped",
        });
        return { progressed: true, itemId: row.id };
      }

      const avoid = await existingTitles(key);
      // A naming/tagging hint given at enqueue time ("these are all
      // patchwork") applies to every design in the batch, same as a
      // single-design upload's own context field.
      const meta = await describeArtwork(row.flat_url, avoid, { context: row.context || undefined });
      const title = dedupeTitle(meta.title, avoid);
      const madeRes = await supabase.rpc("studio_create_or_get_product", {
        p_key: key, p_handle: slugify(title), p_title: title,
        p_description: meta.description, p_flat_url: row.flat_url, p_tags: meta.tags,
        // The whole batch was queued at one tier — studio_batch_claim returns
        // the queue row, so the choice made at upload rides along to here.
        p_price_tier: row.price_tier ?? "standard",
      });
      if (madeRes.error) throw new Error(madeRes.error.message);
      const made = madeRes.data as { handle: string; created: boolean };
      const finalHandle = made.handle;
      // The flat is the print master and the zoom's ceiling — measure it even
      // on the duplicate path, where an older row may predate this capture.
      await recordImageDimensions(requireAdminDb(), row.flat_url);

      // Another tick got to this flat first, so this item is a duplicate the
      // dedup read above was too early to see. The design it already made is
      // the one that keeps going; drop this copy instead of rendering its
      // rooms a second time.
      if (!made.created) {
        await supabase.rpc("studio_batch_update", {
          p_key: key, p_id: row.id, p_status: "done",
          p_handle: finalHandle, p_title: "duplicate — skipped",
        });
        return { progressed: true, itemId: row.id };
      }

      // The ONE finish the batch was queued on. Read fresh rather than off the
      // claimed row: batch-enqueue stamps it just after the queue rows exist.
      if (!isAutographTier(row.price_tier)) {
        const { data: q } = await requireAdminDb().from("studio_queue").select("finish").eq("id", row.id).single();
        await applyFinish(finalHandle, requestedFinish(q?.finish));
      }

      // The whole batch was queued as a seamless tile at one repeat size —
      // stamp it onto the design the moment it exists, same as the
      // single-design flow does inline at create time.
      if (row.is_seamless && row.repeat_width_cm != null) {
        const { error: seamErr } = await supabase.rpc("studio_set_seamless", {
          p_key: key, p_handle: finalHandle, p_seamless: true, p_repeat_width_cm: row.repeat_width_cm,
        });
        if (seamErr) console.error(`batch seamless failed for ${finalHandle}:`, seamErr.message);
      }

      // The whole batch was queued as ceiling wallpaper — tag it the same way
      // the single-design flow does at create time (see `create` below), so
      // the scenes tick's hasCeilingTag() lookup sees it from the first room.
      if (row.is_ceiling) {
        const db = requireAdminDb();
        const prod = await one(db.from("products").select("id").eq("handle", finalHandle).single(), "find product for ceiling tag");
        await must(
          db.from("product_tags").upsert({ product_id: prod.id, tag: "Ceiling Wallpaper" }, { onConflict: "product_id,tag" }),
          "tag as Ceiling Wallpaper",
        );
      }

      // The whole batch was queued onto the same shelves — same mechanism as
      // the single-design flow, so a run of Ikat designs lands together whether
      // it went up one at a time or overnight. `collection` is read alongside
      // `collections` so rows queued before 0146 still land.
      const queued = collectionShelves({ collection: row.collection, collections: row.collections });
      if (queued.length) {
        const prod = await one(
          requireAdminDb().from("products").select("id").eq("handle", finalHandle).single(),
          "find product for collection",
        );
        for (const sh of queued) await joinCuratedCollection(prod.id, sh.name, sh.kind);
      }

      try {
        const vec = await embedImageUrlRemote(row.flat_url);
        await supabase.rpc("studio_set_embedding", { p_key: key, p_handle: finalHandle, p_embedding: toVectorLiteral(vec) });
      } catch (e) {
        console.error("batch embed failed:", e);
      }

      // A scene set chosen by hand at enqueue time wins over Claude's pick.
      const scenes = row.scene_keys?.length ? row.scene_keys : meta.scenes;
      await supabase.rpc("studio_batch_update", {
        p_key: key, p_id: row.id, p_status: "scenes", p_handle: finalHandle, p_title: title,
        p_description: meta.description, p_tags: meta.tags, p_scene_keys: scenes, p_scene_index: 0,
      });
      return { progressed: true, itemId: row.id };
    }

    if (row.status === "scenes") {
      const scenes = row.scene_keys ?? DEFAULT_SCENES;
      const idx = row.scene_index;
      if (idx >= scenes.length) {
        await supabase.rpc("studio_batch_update", { p_key: key, p_id: row.id, p_status: "done" });
        // Finish-rooms designs auto-publish once their rooms are in. The DB
        // trigger still enforces the clean-flat rule, so an unverified/furnished
        // flat just stays a draft (logged) instead of going live. The scene
        // guard adds a second hold: if any scene was skipped for burying the
        // focal subject, keep the design a draft for human review rather than
        // publishing it with a missing/weak scene set.
        if (row.auto_publish && row.handle) {
          const { data: needsReview } = await supabase.rpc("scene_has_open_review", { p_key: key, p_handle: row.handle });
          if (needsReview) {
            console.warn(`[scene-guard] holding auto-publish for ${row.handle}: open scene-review flag`);
          } else {
            const { error: pubErr } = await supabase.rpc("studio_publish", { p_key: key, p_handle: row.handle });
            if (pubErr) console.error(`auto-publish failed for ${row.handle}:`, pubErr.message);
          }
        }
        // Unconditional, not just on the auto-publish branch above: a batch
        // queued for an EXISTING, already-active design (re-shooting a room,
        // adding a workspace scene to something already live) changes what its
        // cards show on every listing that reads product_images — that is true
        // whether or not this item ever publishes anything. Gating this behind
        // `auto_publish` is what let a finished batch of office scene renders
        // sit correct in the database and stale on the site for up to an hour.
        if (row.handle) revalidateCatalogue(row.handle);
        return { progressed: true, itemId: row.id };
      }
      const isCanvas = await hasCanvasWallArtTag(row.handle!);
      const isCeiling = !isCanvas && (await hasCeilingTag(row.handle!));
      // The register is stored on the queue row, so a 7-room batch renders all
      // 7 in ONE look — resolving it per scene would let a mid-batch retag
      // split a design's gallery between two aesthetics.
      const styling = await resolveStyling(row.handle!, row.styling);
      await uploadAndAttachScene(key, row.handle!, row.title ?? row.handle!, row.flat_url, scenes[idx], idx, idx === 0, isCanvas, undefined, styling, isCeiling);
      await supabase.rpc("studio_batch_update", { p_key: key, p_id: row.id, p_status: "scenes", p_scene_index: idx + 1 });
      return { progressed: true, itemId: row.id };
    }

    return { progressed: false };
  } catch (e) {
    await supabase.rpc("studio_batch_update", {
      p_key: key, p_id: row.id, p_status: "failed", p_error: e instanceof Error ? e.message : "unknown error",
    });
    return { progressed: true, itemId: row.id }; // keep the chain going past a bad item
  }
}

/**
 * Drop the cached listings after the catalogue changes. The homepage, /new and
 * every collection are cached for an hour, so without this a deleted design
 * lingers on the shop for up to that long — a card a customer can still see and
 * click, landing them on a 404. Publishing and renaming have the same problem in
 * reverse: the design is live but nothing lists it yet.
 */
function revalidateCatalogue(handle?: string) {
  // The query-layer cache (lib/catalogue-cache.ts) feeds every one of the
  // pages below; dropping the pages without it would re-render them stale.
  // Fire-and-forget like the calls under it — a failed bump is logged there.
  void bumpCatalogueVersion();
  revalidatePath("/");
  revalidatePath("/new");
  revalidatePath("/collections/[handle]", "page");
  revalidatePath("/products/[handle]", "page");
  if (handle) revalidatePath(`/products/${handle}`);
  // /office reads scene_key images straight off product_images for its tile
  // photographs (getWorkspaceTiles) and its per-space grids
  // (getWorkspaceEdit), same as /collections and /products do — it was left
  // off this list, so a batch of office scene renders sat correct in the
  // database and invisible on the site until its 1h ISR window happened to
  // expire, or some UNRELATED Studio action incidentally revalidated the same
  // path. Same shape as the cron bug this whole section already fixed once.
  revalidatePath("/office");
  revalidatePath("/office/[space]", "page");
  // ...and /hospitality, which reads scene_key images the same way (its space
  // grids HARD-filter on having the render, so a hospitality scene that is not
  // revalidated is not merely unstyled there — the design is absent from the
  // page entirely). This was the office bug above, one section over: it was
  // missed because /hospitality had no renders being shot at it until the
  // dining split, and then thirty arrived at once.
  revalidatePath("/hospitality");
  revalidatePath("/hospitality/[space]", "page");
  revalidatePath("/rooms");
}

// The tick chains drain IN-PROCESS: each helper calls the worker function
// directly and loops, rather than the route fetching its own /api URL. The site
// is a Cloudflare Worker and a Worker fetching its own zone is fragile (see the
// site-batch approve route, PR #356) — and this is already exactly how the
// studio-drain cron drains these same queues (processQueueTick /
// processRetagTick). Each unit is claimed under a lease and the queues are
// resumable, so a loop that stops on its budget costs nothing but the wait: the
// studio-drain cron finishes the upload and retag queues within ~5 minutes, and
// mint-nudge resumes the mint queue. A step is still "do ONE expensive unit"
// (an Opus naming + image generation, a scene render, or one OS SKU mint); the
// loop just does the next one instead of a fresh Worker invocation doing it.
// The whole loop runs in the caller's after() (post-response). On Cloudflare
// that is waitUntil, which is cancelled 30s after the response — so the
// upload drain below only does the fast step (naming, ~10s) and leaves scene
// renders to the studio-drain cron; see processQueueTick's skipScenes.
const DRAIN_BUDGET_MS = 240_000;

async function drainQueue(step: () => Promise<boolean>, label: string) {
  const deadline = Date.now() + DRAIN_BUDGET_MS;
  try {
    while (Date.now() < deadline) {
      if (!(await step())) break;
    }
  } catch (e) {
    console.error(`${label} chain failed:`, e);
  }
}

/** Drain the upload/scene queue, one unit at a time, until it is empty or the
 *  budget is spent (the studio-drain cron finishes any remainder). */
async function fireNextTick(key: string) {
  await drainQueue(async () => (await processQueueTick(key, { skipScenes: true })).progressed, "batch");
}

/** Same for the re-tag queue, so the classification guarantee repairs a backlog
 *  without anyone holding a request open. A repair changes which collections a
 *  design belongs to, so revalidate its pages as each one lands. */
async function fireNextRetagTick(key: string) {
  await drainQueue(async () => {
    const r = await processRetagTick(key);
    if (r.progressed && r.handle) revalidateCatalogue(r.handle);
    return r.progressed;
  }, "retag");
}

/** Same for the SKU mint queue: one SKU per step, draining the ladder. */
async function fireNextMintTick(key: string) {
  await drainQueue(async () => (await processMintTick(key)).progressed, "mint");
}

/** Mint ONE queued SKU into the OS, leased so a crashed step frees the row for
 *  the next. Returns the exact response body/status the mint-tick endpoint
 *  serves, plus `progressed` (a row was claimed and settled — done, skipped or
 *  failed — so there may be another) for the drain loop. Extracted from the
 *  mint-tick handler so the loop and the endpoint run identical logic. */
async function processMintTick(
  key: string,
): Promise<{ progressed: boolean; body: Record<string, unknown>; status: number }> {
  const osBase = process.env.OS_API_BASE || "https://os.magnitudegroup.in";
  const osToken = process.env.ZYVORAH_SKU_IMPORT_TOKEN;
  if (!osToken) return { progressed: false, body: { error: "ZYVORAH_SKU_IMPORT_TOKEN is not configured" }, status: 500 };

  const { data: claimed, error: claimErr } = await supabase.rpc("mint_claim", { p_key: key });
  if (claimErr) return { progressed: false, body: { error: claimErr.message }, status: 400 };
  const row = claimed as { id: string; zyv_code: string; handle: string; width_in: number; height_in: number } | null;
  if (!row?.id) return { progressed: false, body: { ok: true, idle: true }, status: 200 };

  const finish = (status: string, result: string | null, err: string | null) =>
    supabase.rpc("mint_update", { p_key: key, p_id: row.id, p_status: status, p_result: result, p_error: err });

  try {
    const db = requireAdminDb();
    const { data: prod } = await db
      .from("products")
      .select("handle, title, ready_sizes, product_materials(price_per_sqft, available, materials(slug, name)), product_images(url, is_flat)")
      .eq("handle", row.handle).eq("category", "canvas").single();

    // The FLAT is what prints — a styled room shot would bake someone else's
    // sofa into a retail SKU. Same rule as every other print surface.
    const flat = ((prod?.product_images as unknown as { url: string; is_flat: boolean }[]) ?? []).find((i) => i.is_flat)?.url;
    const mats = (prod?.product_materials as unknown as { price_per_sqft: number; available: boolean; materials: { slug: string; name: string } }[]) ?? [];
    const mediumMat = mats.find((m) => m.available && m.materials?.slug === WALL_ART_MEDIA["self-adhesive"].slug);
    if (!prod || !flat || !mediumMat) {
      await finish("failed", null, "design, flat image or self-adhesive medium missing");
      return { progressed: true, body: { ok: false, sku: row.zyv_code }, status: 200 };
    }

    // The ladder can change between queueing and minting — that is the whole
    // reason this queue exists. Minting a size the site no longer sells would
    // freeze a master for something nobody can buy, and locked is forever.
    const stillSold = ((prod.ready_sizes as [number, number][] | null) ?? [])
      .some(([w, h]) => w === row.width_in && h === row.height_in);
    if (!stillSold) {
      await finish("skipped", null, `${row.width_in}×${row.height_in} is no longer in this design's ladder`);
      return { progressed: true, body: { ok: true, skipped: row.zyv_code }, status: 200 };
    }

    const [variant] = canvasSizeVariants(SITE_URL, prod.handle, [[row.width_in, row.height_in]], {
      slug: WALL_ART_MEDIA["self-adhesive"].slug, name: mediumMat.materials.name, pricePerSqFt: Number(mediumMat.price_per_sqft),
    });

    const r = await fetch(`${osBase}/api/zyvorah/skus/import-locked`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-zyvorah-sku-token": osToken },
      body: JSON.stringify({
        zyvCode: variant.sku,
        name: `${prod.title} — ${variant.sizeText}`,
        designName: prod.title,
        artworkUrl: flat,
        // INCHES, width first. The OS mints its own code from the digits in
        // this label, so inches keep ZYS-SA-24X40 honest where decimal feet
        // ("2.5 x 4.2 ft") would read as 25X42.
        sizeLabel: `${row.width_in} x ${row.height_in} in`,
        widthMm: Math.round(row.width_in * 25.4),
        heightMm: Math.round(row.height_in * 25.4),
        priceInr: variant.price,
      }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      await finish("failed", null, String(j?.error ?? `OS refused (${r.status})`));
      return { progressed: true, body: { ok: false, sku: row.zyv_code }, status: 200 };
    }
    await finish("done", j?.alreadyLocked ? "already" : "minted", null);
    return { progressed: true, body: { ok: true, sku: row.zyv_code }, status: 200 };
  } catch (e) {
    await finish("failed", null, `OS unreachable: ${e instanceof Error ? e.message : String(e)}`);
    return { progressed: true, body: { ok: false, sku: row.zyv_code }, status: 200 };
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  if (!serviceAvailable("ai")) requireService("ai");
 try {
  const { path = [] } = await params;
  const body = await req.json().catch(() => null);
  // Authorised by the staff Google sign-in; the database key comes from the
  // server. Everything below this line — including the batch worker's own
  // self-chaining ticks — reads `body.key` for its p_key argument, so the
  // session's key is put where those forty-odd call sites already look rather
  // than rewriting each one. Nothing the caller sent as `key` survives.
  const key = await staffKey(req);
  if (!(await requireKey(key))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Unparseable body used to fall out of the `!body?.key` check as a 401. It is
  // not an authorisation failure, and everything below dereferences body.
  if (!body) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  body.key = key;

  // Record true pixel sizes for images written by a path that can't do it
  // itself. The admin design uploader creates its rows straight from the
  // browser via admin_create_design, where the anon key can't write back to
  // product_images — so it posts its URLs here once the design is saved.
  // Idempotent and safe to re-send; matching is by URL.
  // Compose — and, with release:true, print — a sheet of A4 sample cards.
  //
  // One call per medium: a sheet is a single roll of a single material, so
  // sampling one design on four media is four sheets, not one. The desk sends
  // the same payload twice, once to look at and once to print, because the
  // engine's output volume is swept hourly and a preview held from an hour ago
  // could name a file that no longer exists.
  if (path[0] === "sample-sheet") {
    const picks = (Array.isArray(body.picks) ? body.picks : [])
      .map((p: { handle?: unknown; title?: unknown }) => ({
        handle: String(p?.handle ?? ""), title: String(p?.title ?? ""),
      }))
      .filter((p: { handle: string }) => p.handle)
      .slice(0, 24);
    if (!picks.length) return NextResponse.json({ error: "pick at least one design" }, { status: 400 });

    const mediaSlug = String(body.mediaSlug || "");
    if (!(SAMPLE_MEDIA_SLUGS as readonly string[]).includes(mediaSlug)) {
      return NextResponse.json({ error: `the engine cannot label ${mediaSlug || "that medium"} on a card` }, { status: 400 });
    }
    const db = requireAdminDb();
    const { data: mat } = await db.from("materials").select("name, roll_width_mm").eq("slug", mediaSlug).maybeSingle();
    const material = mat as { name: string; roll_width_mm: number | null } | null;

    // The desk may override the width; otherwise the material's own record.
    const printableCm = Number(body.printableCm) > 0
      ? Number(body.printableCm)
      : printableCmFor(material?.roll_width_mm);

    const wallW = Number(body.wallWidthFt) > 0 ? Number(body.wallWidthFt) : SAMPLE_WALL_FT.w;
    const wallH = Number(body.wallHeightFt) > 0 ? Number(body.wallHeightFt) : SAMPLE_WALL_FT.h;
    const release = body.release === true;
    const ref = String(body.ref || "").trim() || `SAMPLES-${istDateKey()}`;

    // The web flat, as the fallback for a design with no master yet. Looked up
    // here rather than taken from the browser: this URL is what the machine
    // prints from, so it comes from the catalogue, not from a payload.
    const handles = picks.map((p: { handle: string }) => p.handle);
    const { data: flatRows } = await db
      .from("products")
      .select("handle, product_images(url, is_flat)")
      .in("handle", handles);
    const flats = new Map(((flatRows as unknown as {
      handle: string; product_images: { url: string; is_flat: boolean }[] | null;
    }[]) ?? []).map((r) => [r.handle, r.product_images?.find((i) => i.is_flat)?.url ?? null]));

    // Masters build on demand and a cold one runs a Real-ESRGAN cascade, so
    // resolve them together rather than serially down a list of designs.
    const specs = (await Promise.all(picks.map((p: { handle: string; title: string }) =>
      sampleSpecsFor(p, {
        mediaLabel: material?.name ?? mediaSlug,
        muralWidthCm: wallW * FT_TO_CM,
        muralHeightCm: wallH * FT_TO_CM,
        sampleRef: ref,
        flatUrl: flats.get(p.handle) ?? null,
      }),
    ))).flat();

    try {
      const sheet = await composeSampleSheet({
        ref,
        samples: specs,
        printableCm,
        mediaSlug,
        mediaName: material?.name ?? mediaSlug,
        fillWidth: !(Number(body.copies) > 0),
        copies: Number(body.copies) > 0 ? Number(body.copies) : undefined,
        rows: Number(body.rows) > 0 ? Number(body.rows) : 1,
        release,
      });
      return NextResponse.json({
        ...sheet,
        previewUrl: engineFileUrl(sheet.preview),
        mediaName: material?.name ?? mediaSlug,
      });
    } catch (e) {
      // The engine refuses for reasons a person can act on — a width it cannot
      // fit an A4 into, a sheet longer than the RIP will cut. Say which.
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "the print engine refused the sheet" },
        { status: 400 },
      );
    }
  }

  if (path[0] === "record-dimensions") {
    const urls = (Array.isArray(body.urls) ? body.urls.map(String) : []).filter(Boolean).slice(0, 20);
    if (!urls.length) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    const db = requireAdminDb();
    const results = await Promise.all(urls.map((u: string) => recordImageDimensions(db, u)));
    return NextResponse.json({
      ok: true,
      recorded: results.filter(Boolean).length,
      unmeasured: results.filter((r) => !r).length,
    });
  }

  // 1) create the draft product from the uploaded flat (single-design path).
  //
  // `sceneKeys` lets the uploader override which rooms get rendered:
  //   - omitted        → Claude picks the room-appropriate set (as before)
  //   - ["living", …]  → render exactly these (up to MAX_PICKED_SCENES)
  //   - []             → render nothing (for a design whose room shots are
  //                      being uploaded by hand)
  if (path[0] === "create") {
    const flatUrl = String(body.flatUrl || "");
    if (!flatUrl) return NextResponse.json({ error: "flatUrl required" }, { status: 400 });

    // Dedup: if a product with this exact flat image already exists, return it
    // instead of creating a duplicate. Same RLS gap as the batch dedup above —
    // read with the service role so a still-draft original is found too.
    const { data: existing } = await requireAdminDb()
      .from("product_images")
      .select("product_id, products!inner(handle, title, description, status)")
      .eq("url", flatUrl)
      .eq("is_flat", true)
      .limit(1)
      .single();
    if (existing?.products) {
      const ex = existing.products as unknown as { handle: string; title: string; description: string; status: string };
      return NextResponse.json({
        handle: ex.handle, title: ex.title, description: ex.description,
        duplicate: true, tags: [],
        scenarios: [],
      });
    }

    // The project only widens which scene keys are valid here — create names
    // and tags; the shell and anchor apply at render time, where each /scene
    // call carries the project again.
    const project = PROJECT_BY_KEY.get(String(body.project || ""));
    const picked = Array.isArray(body.sceneKeys) ? normaliseSceneKeys(body.sceneKeys, MAX_PICKED_SCENES, projectSceneKeys(project)) : null;
    // The three product families are mutually exclusive — a design is a
    // wallpaper, a canvas or a border, never two of them.
    const isBorder = Boolean(body.isBorder);
    const isCanvas = !isBorder && Boolean(body.isCanvas);
    // Ceiling wallpaper is a WALLPAPER, not a fourth family — same materials,
    // same made-to-measure sizing — just staged on the ceiling in every scene
    // instead of the wall. Mutually exclusive with canvas/border like the rest.
    const isCeiling = !isBorder && !isCanvas && Boolean(body.isCeiling);
    const context = typeof body.context === "string" ? body.context.trim().slice(0, 200) : "";
    // Limited-edition wall art: a small fixed edition (e.g. 5) and the
    // artist's own story, which becomes the product page's description.
    const editionLimitRaw = Number(body.editionLimit);
    const editionLimit =
      isCanvas && Number.isInteger(editionLimitRaw) && editionLimitRaw >= 1 && editionLimitRaw <= 500
        ? editionLimitRaw
        : null;
    // The story is NOT limited to limited editions. Any design can arrive with
    // a real one behind it — where a motif came from, what a colourway means,
    // what went into drawing it — and when it does, that story is the product
    // page. Gating this on canvas silently threw the writing away for every
    // wallpaper and border, which is most of what the Studio uploads.
    // The price of a limited edition is SET, not computed. A made-to-measure
    // wallpaper is priced by the wall and an open-edition canvas by its make
    // rate, but a numbered piece is worth what it is worth — so the Studio
    // asks for the figure and the store quotes exactly that. Absent, the piece
    // falls back to the flat limited-edition make rate as before.
    const editionPriceRaw = Number(body.editionPrice);
    const editionPrice =
      editionLimit && Number.isFinite(editionPriceRaw) && editionPriceRaw > 0
        ? Math.round(editionPriceRaw)
        : null;
    // A set price is refused BEFORE anything is created, so a rejected upload
    // leaves no half-configured product behind.
    if (editionPrice !== null) {
      // One price means one size. Offered at three sizes, "₹31,000" answers
      // none of them.
      const tiers = normaliseTiers(body.canvasSizes);
      if (tiers?.length !== 1) {
        return NextResponse.json(
          { error: "A priced limited edition is sold at ONE size — pick a single size before setting its price." },
          { status: 400 },
        );
      }
      // Autograph pins its own rate in the database (trg_product_materials_autograph_guard),
      // so a set price here would be overwritten on write and the piece would
      // quietly sell at the Autograph rate instead.
      if (isAutographTier(requestedTier(body.priceTier))) {
        return NextResponse.json(
          { error: "Autograph pieces are priced by the Autograph rate — a limited-edition price can't be set on top of it." },
          { status: 400 },
        );
      }
      // Fixed-size prices land on clean figures (nearest ₹1,000 at ₹5,000 and
      // above). Quoting ₹31,500 as ₹32,000 would show a price nobody set.
      if (roundRetail(editionPrice) !== editionPrice) {
        return NextResponse.json(
          { error: `${formatINR(editionPrice)} isn't a price this store can quote — use ${formatINR(roundRetail(editionPrice))} or another figure rounded to the nearest ₹1,000.` },
          { status: 400 },
        );
      }
    }
    const story = typeof body.story === "string" ? body.story.trim().slice(0, 6000) : "";
    // Named limited-edition series, e.g. "The Forgotten Civilizations
    // Collection" — self-service: typing a new name here creates its own
    // shoppable curated collection (same mechanism as Katha, Stallion Spirit
    // etc.), so future pieces in the same series just reuse the same name.
    const series = editionLimit && typeof body.series === "string" ? body.series.trim().slice(0, 80) : "";
    // The collection this design joins — picked from the existing ones or
    // typed fresh in the Studio. Unlike `series` this is open to every family,
    // because a wallpaper run ("the Ikat collection") wants exactly the same
    // grouping a limited-edition series does.
    const shelves = collectionShelves(body);
    // An explicit name from the uploader is the name — the AI is a fallback
    // for when nobody supplied one, never an override of a given title.
    const givenTitle = typeof body.title === "string" ? body.title.trim().slice(0, 60) : "";
    const avoid = await existingTitles(body.key);
    let meta: ArtworkMeta;
    try {
      meta = await describeArtwork(flatUrl, avoid, {
        isCanvas, isBorder,
        context: context || undefined,
        story: story || undefined,
      });
    } catch (e) {
      if (!(e instanceof NamingFailed)) throw e;
      // The uploader who typed a title AND ticked rooms has supplied the two
      // things the vision pass was for; their upload goes ahead untagged
      // (catalogue_gaps will re-tag it) rather than waiting on Claude. Anyone
      // else is told, before anything exists, instead of getting "New Mural"
      // in rooms nobody chose.
      if (!givenTitle || !picked?.length) {
        return NextResponse.json({ error: e.message }, { status: 502 });
      }
      meta = {
        title: givenTitle,
        description: isBorder
          ? "<p>A printed decorative border for edging walls, ceilings and panelling — sold by the linear metre.</p>"
          : isCanvas
            ? "<p>A premium canvas art print, shipped rolled and ready to frame.</p>"
            : "<p>A mural wallpaper design, prepared for your order.</p>",
        tags: isBorder ? [BORDER_BROWSE_TAG] : isCanvas ? ["Canvas Wall Art"] : [],
        scenes: picked,
      };
    }
    const title = givenTitle || dedupeTitle(meta.title, avoid);
    const made = await supabase
      .rpc("studio_create_or_get_product", {
        p_key: body.key, p_handle: slugify(title), p_title: title,
        p_description: meta.description, p_flat_url: flatUrl, p_tags: meta.tags,
        p_price_tier: requestedTier(body.priceTier),
      });
    if (made.error) return NextResponse.json({ error: made.error.message }, { status: 400 });
    const { handle: finalHandle, created: isNew } = made.data as { handle: string; created: boolean };
    await recordImageDimensions(requireAdminDb(), flatUrl);

    // The design was created between the dedup read above and here — a second
    // uploader, or a double-submit. Report it as the duplicate it is instead of
    // configuring someone else's design as a canvas or a border.
    if (!isNew) {
      const { data: raced } = await requireAdminDb()
        .from("products").select("handle, title, description").eq("handle", finalHandle).single();
      return NextResponse.json({
        handle: finalHandle, title: raced?.title ?? title,
        description: raced?.description ?? meta.description,
        duplicate: true, tags: [], scenarios: [],
      });
    }

    // Which size TIERS this canvas is offered in — the uploader's pick, or all
    // three when they didn't narrow it. The shape of each tier follows the
    // artwork, so this can't put a cropping size on the page.
    const canvasSizes = Array.isArray(body.canvasSizes) ? (body.canvasSizes as unknown[]).map(String) : null;
    // ONE finish per wallpaper (src/lib/wallpaper-finish.ts). A canvas or a
    // border swaps its materials out below, and Autograph is linen already.
    if (!isCanvas && !isBorder && !isAutographTier(requestedTier(body.priceTier))) {
      await applyFinish(finalHandle, requestedFinish(body.finish));
    }
    if (isCanvas) await configureAsCanvas(body.key, finalHandle, flatUrl, canvasSizes, normaliseMedia(body.canvasMedia), Boolean(body.autoSizes), editionLimit ? LIMITED_EDITION_RATE : null, editionPrice);
    if (isBorder) await configureAsBorder(finalHandle);

    // Ceiling wallpaper: tag it into the catalogue-wide Ceiling Wallpaper
    // collection. Set BEFORE scene generation starts below, so the fresh
    // hasCeilingTag() lookup each scene call makes sees it from the first one.
    if (isCeiling) {
      const db = requireAdminDb();
      const prod = await one(db.from("products").select("id").eq("handle", finalHandle).single(), "find product for ceiling tag");
      await must(
        db.from("product_tags").upsert({ product_id: prod.id, tag: "Ceiling Wallpaper" }, { onConflict: "product_id,tag" }),
        "tag as Ceiling Wallpaper",
      );
    }

    // Limited edition: record the edition size, raise the Limited badge, and
    // tag it into the Limited Edition collection. is_limited is the source of
    // truth — the tag exists only because collections select on tags — so the
    // two are written together here and kept in step by a trigger for every
    // other writer (see migration 0144).
    if (editionLimit) {
      const db = requireAdminDb();
      const prod = await one(db.from("products").select("id").eq("handle", finalHandle).single(), "find product for edition");
      await must(
        db.from("products").update({ edition_limit: editionLimit, is_limited: true }).eq("id", prod.id),
        "set edition limit",
      );
      await must(
        db.from("product_tags").upsert({ product_id: prod.id, tag: "Limited Edition" }, { onConflict: "product_id,tag" }),
        "tag as Limited Edition",
      );

      // A named series IS a curated collection — same mechanism the generic
      // collection field below uses, kept here so an older client still
      // sending `series` keeps working.
      if (series) await joinCuratedCollection(prod.id, series);
    }

    // The shelves chosen at upload — every family, standard or Autograph. Up to
    // three: an aesthetic, a series and a set, which are independent of one
    // another (see collectionNames).
    if (shelves.length) {
      const prod = await one(
        requireAdminDb().from("products").select("id").eq("handle", finalHandle).single(),
        "find product for collection",
      );
      for (const sh of shelves) await joinCuratedCollection(prod.id, sh.name, sh.kind);
    }

    // Seamless tile: the artwork REPEATS at a fixed physical size instead of
    // being stretched to the wall. Wallpaper only — a canvas is a finished
    // piece and a border already repeats along its length by construction.
    const repeatCm = Number(body.repeatWidthCm);
    if (!isCanvas && !isBorder && body.seamless && Number.isFinite(repeatCm)) {
      const { error: seamErr } = await supabase.rpc("studio_set_seamless", {
        p_key: body.key, p_handle: finalHandle, p_seamless: true, p_repeat_width_cm: repeatCm,
      });
      // A bad repeat must not silently produce a design that prints at the
      // wrong scale — surface it instead of leaving a half-set tile behind.
      if (seamErr) return NextResponse.json({ error: `seamless: ${seamErr.message}` }, { status: 400 });
    }

    try {
      const vec = await embedImageUrlRemote(flatUrl);
      await supabase.rpc("studio_set_embedding", { p_key: body.key, p_handle: finalHandle, p_embedding: toVectorLiteral(vec) });
    } catch (e) {
      console.error("studio embed failed:", e);
    }

    const scenes = picked ?? meta.scenes;
    // The register this design's rooms will be rendered in. A hand pick wins;
    // next, a Limited Edition piece defaults to the gallery register — it's
    // sold as a collectible, not decor, and the "Limited Edition" tag isn't
    // written to meta.tags until just above, so it can't come through
    // stylingFromTags() yet; otherwise it comes from the tags the vision pass
    // just wrote, so a statement piece is framed like one without anyone
    // having to say so.
    const styling: StylingKey = isStylingKey(body.styling)
      ? body.styling
      : editionLimit
        ? "gallery"
        : stylingFromTags(meta.tags);
    // The design now carries its tags, so every listing that should include it
    // has to be rebuilt. Create never did this, which is why a design could be
    // perfectly tagged and still absent from its collections.
    revalidateCatalogue(finalHandle);
    return NextResponse.json({
      handle: finalHandle, title, description: meta.description, tags: meta.tags,
      isCanvas, isBorder, styling,
      scenarios: scenes.map((k) => ({ key: k, label: resolveScenario(k, project)?.label ?? k })),
    });
  }

  // 1b) attach already-uploaded pictures of your own (room shots, styled
  // photos) to a design, in the order given. The flat is never touched — it
  // was set when the product was created — so the one-flat catalogue rule and
  // the visualizer's clean-artwork guarantee both still hold.
  if (path[0] === "attach") {
    const handle = String(body.handle || "");
    const urls = (Array.isArray(body.urls) ? body.urls.map(String) : []).filter(Boolean).slice(0, 10);
    if (!handle || !urls.length) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    const offset = Number.isFinite(Number(body.startPosition)) ? Number(body.startPosition) : 0;
    const title = String(body.title || handle);
    for (let i = 0; i < urls.length; i++) {
      const { error } = await supabase.rpc("studio_add_scene", {
        p_key: body.key, p_handle: handle, p_url: urls[i],
        p_position: offset + i, p_featured: offset + i === 0,
        p_alt: `${title} — room ${offset + i + 1}`,
        p_scene_key: null, p_room_tags: null,
      });
      if (error) return NextResponse.json({ error: error.message, attached: i }, { status: 400 });
      // Hand-attached room shots arrive as URLs, so these are measured over the
      // wire (header bytes only).
      await recordImageDimensions(requireAdminDb(), urls[i]);
    }
    return NextResponse.json({ ok: true, attached: urls.length });
  }

  // 1c) draft a master artwork — the flat itself, no product row. See
  // generateArtwork for why this exists and where drafts land.
  if (path[0] === "artwork") {
    if (!(await requireKey(String(body.key || "")))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const prompt = String(body.prompt || "").trim().slice(0, 4000);
    const name = String(body.name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
    const sourceUrl = typeof body.sourceUrl === "string" && body.sourceUrl ? body.sourceUrl : undefined;
    const size = body.size === "1536x1024" || body.size === "1024x1024" ? body.size : "1024x1536";
    if (!prompt || !name) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    try {
      const png = await generateArtwork(prompt, size, sourceUrl);
      const objectKey = `artwork-drafts/${name}.png`;
      // R2 via the binding, same as the scene upload above.
      const { publicUrl: url } = await putProductImage(objectKey, png, { contentType: "image/png", cacheControl: CACHE_MUTABLE });
      return NextResponse.json({ ok: true, url, objectKey });
    } catch (e) {
      return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "gen_failed" }, { status: 502 });
    }
  }

  // 2) generate + attach ONE scenario image (single-design path)
  if (path[0] === "scene") {
    const flatUrl = String(body.flatUrl || "");
    const handle = String(body.handle || "");
    const sceneKey = String(body.sceneKey || "");
    const index = Number(body.index);
    const styleUrl = typeof body.styleUrl === "string" && body.styleUrl ? body.styleUrl : undefined;
    const project = PROJECT_BY_KEY.get(String(body.project || ""));
    if (!flatUrl || !handle || !resolveScenario(sceneKey, project)) {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }
    try {
      const isCanvas = await hasCanvasWallArtTag(handle);
      const isCeiling = !isCanvas && (await hasCeilingTag(handle));
      const styling = await resolveStyling(handle, body.styling);
      const res = await uploadAndAttachScene(body.key, handle, body.title ?? handle, flatUrl, sceneKey, index, index === 0, isCanvas, styleUrl, styling, isCeiling, project);
      const sc = resolveScenario(sceneKey, project)!;
      if (res.skipped) {
        return NextResponse.json({ ok: false, index, key: sc.key, label: sc.label, skipped: true, reason: res.reason ?? "focal_occlusion", score: res.score, occluder: res.occluder });
      }
      // Attaching a scene changes what this design's card shows on every
      // listing that reads product_images, exactly as it does on the queue's
      // path (see the note at the revalidateCatalogue call in the scenes
      // branch of processQueueTick). This endpoint is the OTHER way a scene
      // gets attached — the one used to add a room to a design that is already
      // live — and it was the only such path that never revalidated, so those
      // renders sat correct in the database and invisible on the site until
      // the ISR window happened to expire.
      revalidateCatalogue(handle);
      return NextResponse.json({ ok: true, index, key: sc.key, label: sc.label, url: res.url });
    } catch (e) {
      return NextResponse.json({ ok: false, index, error: e instanceof Error ? e.message : "gen_failed" }, { status: 502 });
    }
  }

  // toggle a product live/draft from the Recent Designs list
  if (path[0] === "status") {
    const status = String(body.status || "");
    if (status !== "active" && status !== "draft") return NextResponse.json({ error: "bad_status" }, { status: 400 });
    const { data, error } = await supabase.rpc("studio_set_status", {
      p_key: body.key, p_handle: String(body.handle), p_status: status,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    revalidateCatalogue(String(body.handle));
    return NextResponse.json({ ok: true, status: data });
  }

  // rename a design (so there's no need to re-upload just to change the name)
  if (path[0] === "rename") {
    const title = String(body.title || "").trim();
    if (!title) return NextResponse.json({ error: "title_required" }, { status: 400 });
    const { data, error } = await supabase.rpc("studio_rename", {
      p_key: body.key, p_handle: String(body.handle), p_title: title,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    revalidateCatalogue(String(body.handle));
    return NextResponse.json({ ok: true, title: data });
  }

  // Re-price a limited edition that already exists.
  //
  // The price of a piece is a decision that gets revisited — a piece is worth
  // more once the edition is half sold, or the first figure was simply wrong —
  // and without this, changing it means an SQL statement. Same rules as
  // setting it at upload: one size, a clean figure, and never on Autograph.
  if (path[0] === "reprice") {
    if (!(await requireKey(String(body.key || "")))) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const handle = String(body.handle || "").trim();
    const price = Math.round(Number(body.price));
    if (!handle) return NextResponse.json({ error: "handle_required" }, { status: 400 });
    if (!Number.isFinite(price) || price <= 0) {
      return NextResponse.json({ error: "A price in rupees is required." }, { status: 400 });
    }
    const db = requireAdminDb();
    const { data: prod, error: readErr } = await db
      .from("products")
      .select("id, title, is_limited, price_tier, ready_sizes")
      .eq("handle", handle)
      .single();
    if (readErr || !prod) return NextResponse.json({ error: "design not found" }, { status: 404 });
    if (!prod.is_limited) {
      return NextResponse.json(
        { error: "Only a limited edition carries a set price — everything else is priced by its make rate." },
        { status: 400 },
      );
    }
    if (isAutographTier(String(prod.price_tier ?? ""))) {
      return NextResponse.json(
        { error: "Autograph pieces are priced by the Autograph rate — a set price can't be put on top of it." },
        { status: 400 },
      );
    }
    const sizes = (prod.ready_sizes ?? []) as [number, number][];
    if (sizes.length !== 1) {
      return NextResponse.json(
        { error: `"${prod.title}" is sold at ${sizes.length} sizes — a single price can only describe one.` },
        { status: 400 },
      );
    }
    const [wIn, hIn] = sizes[0];
    const rate = setPriceRate(price, wIn, hIn);
    if (rate === null) {
      return NextResponse.json(
        { error: `${formatINR(price)} can't be quoted exactly at ${wIn} × ${hIn} in — try ${formatINR(roundRetail(price))}.` },
        { status: 400 },
      );
    }
    // Every medium the piece is sold in carries the same figure: it is one
    // price for one piece, whichever stock it prints on.
    const { error: writeErr } = await db
      .from("product_materials")
      .update({ price_per_sqft: rate })
      .eq("product_id", prod.id)
      .eq("available", true);
    if (writeErr) return NextResponse.json({ error: writeErr.message }, { status: 400 });
    revalidateCatalogue(handle);
    return NextResponse.json({ ok: true, price, rate });
  }

  // Schedule a launch from a set of designs (src/lib/launch.ts).
  //
  // Creates the collection if it does not exist, tags the chosen designs into
  // it, and writes ONE row on the launch calendar. It deliberately does not
  // touch product status: scheduling a launch must never be the thing that
  // accidentally publishes it. The designs stay drafts until the date arrives.
  if (path[0] === "launch") {
    if (!(await requireKey(String(body.key || "")))) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const title = String(body.title || "").trim();
    const handles: string[] = Array.isArray(body.handles) ? body.handles.map(String) : [];
    const launchDate = String(body.launchDate || "");
    if (!title) return NextResponse.json({ error: "title_required" }, { status: 400 });
    if (handles.length === 0) return NextResponse.json({ error: "no_designs_picked" }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(launchDate)) {
      return NextResponse.json({ error: "launch_date_must_be_yyyy_mm_dd" }, { status: 400 });
    }

    const admin = supabaseAdmin();
    if (!admin) return NextResponse.json({ error: "service_role_not_configured" }, { status: 500 });

    // The handle and tag are derived from the name, so "Taash" gives handle
    // 'taash' and tag 'TAASH' — the convention the rest of the catalogue uses.
    const handle = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const tag = handle.toUpperCase().replace(/-/g, " ");

    // position 99 keeps a scheduled collection OUT of the nav. A collection
    // visible in the menu a week before it exists is the leak this prevents.
    const { error: cErr } = await admin.from("collections").upsert(
      { handle, title, kind: "curated", rule_tag: tag, position: 99 },
      { onConflict: "handle" },
    );
    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 400 });

    const { data: prods, error: pErr } = await admin
      .from("products").select("id,handle").in("handle", handles);
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 });
    if (prods && prods.length > 0) {
      const { error: tErr } = await admin.from("product_tags").upsert(
        prods.map((p: { id: string }) => ({ product_id: p.id, tag })),
        { onConflict: "product_id,tag" },
      );
      if (tErr) return NextResponse.json({ error: tErr.message }, { status: 400 });
    }

    // Midnight IST. A launch date without a timezone lands at whatever midnight
    // the server happens to believe in, which is how a collection goes live at
    // half past five in the morning.
    const launchAt = `${launchDate}T00:00:00+05:30`;
    // The first three ticked designs, in the order they were ticked, become
    // the slider's three panes.
    const heroHandles = handles.slice(0, 3);
    const { error: lErr } = await admin.from("collection_launches").upsert(
      {
        collection_handle: handle,
        launch_at: launchAt,
        teaser_days: Math.max(0, Math.min(90, Number(body.teaserDays ?? 7))),
        window_days: Math.max(1, Math.min(90, Number(body.windowDays ?? 14))),
        hero_handles: heroHandles,
      },
      { onConflict: "collection_handle" },
    );
    if (lErr) return NextResponse.json({ error: lErr.message }, { status: 400 });

    // The teaser day, on the Indian calendar. Slicing this in UTC read a day
    // early: launchAt is IST midnight, i.e. 18:30 UTC the day before, so the
    // ISO string was already reporting yesterday before the subtraction.
    const teaserDate = istDateKey(
      new Date(new Date(launchAt).getTime() - Number(body.teaserDays ?? 7) * 86_400_000),
    );

    return NextResponse.json({
      ok: true, handle, tag, title, launchDate, teaserDate,
      designs: prods?.length ?? 0, heroHandles,
    });
  }

  // Mark an EXISTING catalogue design as a seamless tile (or clear it). Upload
  // sets this at create time; this is the after-the-fact route, without which
  // the hundreds of designs already in the catalogue could never be tiles.
  // Wallpaper only — a canvas is a fixed-size print and a border repeats along
  // its own length, so a wall repeat means nothing for either.
  if (path[0] === "seamless") {
    // Checked up front, not just by the RPC: the family probe below reads with
    // the SERVICE ROLE, so without this an unauthenticated caller could use it
    // to ask what any handle is.
    if (!(await requireKey(String(body.key || "")))) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const handle = String(body.handle || "").trim();
    if (!handle) return NextResponse.json({ error: "handle_required" }, { status: 400 });
    const seamless = Boolean(body.seamless);
    const repeatCm = Number(body.repeatWidthCm);
    // Checked before the RPC so the operator gets the real reason rather than a
    // raw constraint violation; the DB check is still the backstop.
    if (seamless && (!Number.isFinite(repeatCm) || repeatCm < 5 || repeatCm > 300)) {
      return NextResponse.json({ error: "Repeat width must be between 5 and 300 cm." }, { status: 400 });
    }
    if (seamless) {
      if (await hasCanvasWallArtTag(handle)) {
        return NextResponse.json({ error: "A canvas is a fixed-size print — it has no wall repeat." }, { status: 400 });
      }
      const db = requireAdminDb();
      const { data: bord } = await db
        .from("products").select("product_tags!inner(tag)")
        .eq("handle", handle).eq("product_tags.tag", BORDER_BROWSE_TAG).limit(1);
      if ((bord?.length ?? 0) > 0) {
        return NextResponse.json({ error: "A border already repeats along its own length." }, { status: 400 });
      }
    }
    const { error } = await supabase.rpc("studio_set_seamless", {
      p_key: body.key, p_handle: handle,
      p_seamless: seamless,
      // Clearing must send null, not a stale number — the RPC nulls it anyway,
      // but sending the pair honestly keeps the two sides in step.
      p_repeat_width_cm: seamless ? repeatCm : null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    revalidateCatalogue(handle);
    return NextResponse.json({ ok: true, isSeamless: seamless, repeatWidthCm: seamless ? repeatCm : null });
  }

  // re-cue an incomplete draft: clear any partial scenes and queue a fresh room
  // set, then kick the worker. Gated to drafts only by the RPC.
  if (path[0] === "finish") {
    const picked = normaliseSceneKeys(body.sceneKeys);
    const sceneKeys = picked.length ? picked : ["living", "bedroom", "entryway", "dining", "closeup"];
    const { data, error } = await supabase.rpc("studio_finish_enqueue", {
      p_key: body.key, p_handle: String(body.handle), p_scene_keys: sceneKeys,
      // null = leave it to the design's own tags, which is what re-cueing did
      // before the register existed.
      p_styling: isStylingKey(body.styling) ? body.styling : null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    after(() => fireNextTick(body.key));
    return NextResponse.json({ ok: true, queued: data, scenes: sceneKeys.length });
  }

  // delete a draft outright (bad name, dud design). Gated to drafts only by
  // the RPC, so this can never remove a live product. Irreversible.
  if (path[0] === "delete") {
    const { data, error } = await supabase.rpc("studio_delete", {
      p_key: body.key, p_handle: String(body.handle),
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    revalidateCatalogue(String(body.handle));
    return NextResponse.json({ ok: true, deleted: data });
  }

  // Delete ONE room scene from a design while reviewing it. The flat pattern
  // image is protected — the catalogue rule needs exactly one, and the
  // visualiser/print pipeline read it — so a flat can never be removed here.
  if (path[0] === "delete-scene") {
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    // Deleting an image is a privileged write — the anon client's delete is
    // silently discarded by RLS, which would report success and remove nothing.
    const db = requireAdminDb();
    const { data: img } = await db
      .from("product_images").select("id, is_flat").eq("id", id).single();
    if (!img) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (img.is_flat) return NextResponse.json({ error: "cannot_delete_flat" }, { status: 400 });
    const { error, count } = await db
      .from("product_images").delete({ count: "exact" }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!count) return NextResponse.json({ error: "nothing_deleted" }, { status: 400 });
    revalidateCatalogue();
    return NextResponse.json({ ok: true });
  }

  // The FBA desk's export: curated handles + size picks + quantities in, the
  // marketplace's own filled template out. Every SKU and price is recomputed
  // here from the catalogue via the same variant math the storefront uses —
  // the client's numbers are never trusted, so a sheet cannot drift from the
  // site. MRP stays GST-inclusive; the format pairs it with the GST-rate
  // column, which is the tax split these templates carry.
  // MINT & LOCK — take the desk's picks to locked Standard SKUs in the OS.
  //
  // fba-confirm refuses any line whose SKU isn't already locked, and a size
  // that has never been sold has no SKU at all: the OS resolves the website's
  // code verbatim out of zyvorah_skus.notes. This is the step that puts it
  // there — the OS pulls the flat into the engine, mints the draft, renders the
  // master ONCE and freezes the spec.
  //
  // Locking is a one-way door (the spec is immutable afterwards) but it is
  // safely repeatable: the OS is idempotent on the website's code, so an
  // already-locked SKU comes back untouched and is never re-rendered.
  //
  // A master costs 20-30s of engine time and a function has 300, so this only
  // ENQUEUES the picks and hands off to a self-chaining worker (mint-tick) that
  // does ONE SKU per tick. A ladder of any length drains on its own and the desk
  // watches it through mint-status. Doing the whole run inline is what stopped
  // half way through, twice.
  if (path[0] === "fba-mint") {
    const picks = Array.isArray(body.picks) ? (body.picks as { handle: string; sizes: { w: number; h: number }[] }[]) : [];
    if (!picks.length) return NextResponse.json({ error: "nothing_selected" }, { status: 400 });

    // The SKU CODE is minted here, from the same variant math the storefront
    // and the export sheet use — the queue must never invent one. Everything
    // else (name, price, artwork, millimetres) is recomputed at tick time, so a
    // long-running queue can't hand the OS a figure the site has since changed.
    const db = requireAdminDb();
    const items: { zyvCode: string; handle: string; w: number; h: number }[] = [];

    for (const pick of picks.slice(0, 60)) {
      const { data: prod } = await db
        .from("products")
        .select("handle, ready_sizes, product_materials(price_per_sqft, available, materials(slug, name))")
        .eq("handle", String(pick.handle)).eq("category", "canvas").single();
      if (!prod) continue;

      const mats = (prod.product_materials as unknown as { price_per_sqft: number; available: boolean; materials: { slug: string; name: string } }[]) ?? [];
      const mediumMat = mats.find((m) => m.available && m.materials?.slug === WALL_ART_MEDIA["self-adhesive"].slug);
      if (!mediumMat) continue;

      const catalogue = new Set(((prod.ready_sizes as [number, number][] | null) ?? []).map(([w, h]) => `${w}x${h}`));
      const chosen = (pick.sizes ?? []).filter((sz) => catalogue.has(`${sz.w}x${sz.h}`));
      if (!chosen.length) continue;

      const variants = canvasSizeVariants(SITE_URL, prod.handle, chosen.map((sz) => [sz.w, sz.h] as [number, number]), {
        slug: WALL_ART_MEDIA["self-adhesive"].slug, name: mediumMat.materials.name, pricePerSqFt: Number(mediumMat.price_per_sqft),
      });
      variants.forEach((v, i) => items.push({ zyvCode: v.sku, handle: prod.handle, w: chosen[i].w, h: chosen[i].h }));
    }
    if (!items.length) return NextResponse.json({ error: "no_mintable_sizes" }, { status: 400 });

    const { data, error } = await supabase.rpc("mint_enqueue", { p_key: body.key, p_items: items });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    after(() => fireNextMintTick(body.key));
    return NextResponse.json({ ok: true, ...((data as Record<string, unknown>) ?? {}) });
  }

  // ONE SKU per tick, then drain the rest in-process. Self-contained and
  // resumable: the row is leased while it runs and the lease is released on
  // every exit path, so the next step moves on instead of retrying the same
  // item forever. The mint logic lives in processMintTick so this endpoint and
  // the drain loop run identical code.
  if (path[0] === "mint-tick") {
    const result = await processMintTick(body.key);
    // Drain the ladder after responding — one settled SKU means there may be
    // another. `once` = do a single unit and stop (health check / manual step).
    if (result.progressed && !body.once) after(() => fireNextMintTick(body.key));
    return NextResponse.json(result.body, { status: result.status });
  }

  // Manual restart, the same safety net as batch-nudge: if a drain ever dies
  // with work still queued (a deploy mid-tick), this starts it again.
  if (path[0] === "mint-nudge") {
    after(() => fireNextMintTick(body.key));
    return NextResponse.json({ ok: true });
  }

  // CONFIRM THE ORDER — the press that runs production.
  //
  // Sends the desk's curated lines to the OS, which (all SKUs locked) opens a
  // production batch per line, queues each on the print engine against its
  // frozen master, and books the order as an FBA shipment in "producing". When
  // the floor confirms the last printed batch the stock issues studio→FBA by
  // itself. Everything the OS refuses — an unlocked SKU, an engine that will
  // not take a job — comes back here as a named problem, never a silent pass.
  if (path[0] === "fba-confirm") {
    const osBase = process.env.OS_API_BASE || "https://os.magnitudegroup.in";
    const osToken = process.env.ZYVORAH_SKU_IMPORT_TOKEN;
    if (!osToken) return NextResponse.json({ error: "ZYVORAH_SKU_IMPORT_TOKEN is not configured" }, { status: 500 });

    const picks = Array.isArray(body.picks) ? (body.picks as { handle: string; sizes: { w: number; h: number; qty?: number | null }[] }[]) : [];
    if (!picks.length) return NextResponse.json({ error: "nothing_selected" }, { status: 400 });

    // Rebuild the SKU codes server-side from the catalogue — same variant math
    // as the sheet, so the codes the OS receives are the codes Amazon sees.
    const db = requireAdminDb();
    const lines: { zyvCode: string; qty: number }[] = [];
    for (const pick of picks.slice(0, 60)) {
      const { data: prod } = await db
        .from("products")
        .select("handle, ready_sizes, product_materials(price_per_sqft, available, materials(slug, name))")
        .eq("handle", String(pick.handle)).eq("category", "canvas").single();
      if (!prod) continue;
      const mats = (prod.product_materials as unknown as { price_per_sqft: number; available: boolean; materials: { slug: string; name: string } }[]) ?? [];
      const mediumMat = mats.find((m) => m.available && m.materials?.slug === WALL_ART_MEDIA["self-adhesive"].slug);
      if (!mediumMat) continue;
      const catalogue = new Set(((prod.ready_sizes as [number, number][] | null) ?? []).map(([w, h]) => `${w}x${h}`));
      const chosen = (pick.sizes ?? []).filter((sz) => catalogue.has(`${sz.w}x${sz.h}`) && Number(sz.qty) > 0);
      if (!chosen.length) continue;
      const variants = canvasSizeVariants(SITE_URL, prod.handle, chosen.map((sz) => [sz.w, sz.h] as [number, number]), {
        slug: WALL_ART_MEDIA["self-adhesive"].slug, name: mediumMat.materials.name, pricePerSqFt: Number(mediumMat.price_per_sqft),
      });
      variants.forEach((v, i) => lines.push({ zyvCode: v.sku, qty: Number(chosen[i].qty) }));
    }
    if (!lines.length) return NextResponse.json({ error: "no_lines_with_quantities" }, { status: 400 });

    try {
      const r = await fetch(`${osBase}/api/zyvorah/fba/auto-shipment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-zyvorah-sku-token": osToken },
        body: JSON.stringify({ lines, notes: String(body.notes || "").slice(0, 500) || undefined }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) return NextResponse.json({ error: j?.error ?? `OS refused (${r.status})`, ...(j ?? {}) }, { status: r.status });
      return NextResponse.json(j);
    } catch (e) {
      return NextResponse.json({ error: `OS unreachable: ${e instanceof Error ? e.message : String(e)}` }, { status: 502 });
    }
  }

  if (path[0] === "fba-export") {
    const formatKey = String(body.format || "amazon-fba") as ExportFormatKey;
    const format = EXPORT_FORMATS[formatKey];
    if (!format) return NextResponse.json({ error: "unknown_format" }, { status: 400 });
    const picks = Array.isArray(body.picks) ? (body.picks as { handle: string; sizes: { w: number; h: number; qty?: number | null }[] }[]) : [];
    if (!picks.length) return NextResponse.json({ error: "nothing_selected" }, { status: 400 });

    // Which MEDIUM this shipment carries — one per sheet, chosen at the desk.
    // Amazon takes the self-adhesive line, so that is the default; the SKU
    // suffix, price and tax classification all follow it.
    // Pepperfry lists ONLY the self-adhesive line — the medium is forced, not
    // chosen, so a canvas Pepperfry sheet cannot exist even by accident.
    const media = (formatKey === "pepperfry"
      ? "self-adhesive"
      : String(body.media || "self-adhesive") in WALL_ART_MEDIA
        ? String(body.media || "self-adhesive")
        : "self-adhesive") as WallArtMedia;
    const mediaSlug = WALL_ART_MEDIA[media].slug;
    const hsnCode = media === "canvas" ? CANVAS_HSN : SELF_ADHESIVE_HSN;
    const gstRatePct = media === "canvas" ? CANVAS_GST_PCT : SELF_ADHESIVE_GST_PCT;

    const db = requireAdminDb();
    const rows: ExportRow[] = [];
    // Designs the desk picked that may not leave zyvorah.com — reported back so
    // the operator sees WHY a pick vanished from the sheet instead of silently
    // shipping a short export.
    const excludedAutograph: string[] = [];
    for (const pick of picks.slice(0, 200)) {
      const { data: prod } = await db
        .from("products")
        .select("id, handle, title, description, price_tier, ready_sizes, product_materials(price_per_sqft, available, materials(slug, name)), product_tags(tag)")
        .eq("handle", String(pick.handle)).eq("category", "canvas").single();
      if (!prod) continue;
      // Autograph is exclusive to zyvorah.com. Dropped here rather than left to
      // the database trigger, because an export sheet is uploaded by hand — by
      // the time the trigger fires on the listing row, the SKU may already have
      // been created on the marketplace, which mints an ASIN we cannot undo.
      if (isAutographTier((prod as { price_tier?: string | null }).price_tier)) {
        excludedAutograph.push(prod.handle);
        continue;
      }
      const mats = (prod.product_materials as unknown as { price_per_sqft: number; available: boolean; materials: { slug: string; name: string } }[]) ?? [];
      const mediumMat = mats.find((m) => m.available && m.materials?.slug === mediaSlug);
      const catalogue = new Set(((prod.ready_sizes as [number, number][] | null) ?? []).map(([w, h]) => `${w}x${h}`));
      // Only sizes the design actually sells in — a stray pick is dropped, not
      // invented — and only designs that offer the chosen medium.
      const chosen = (pick.sizes ?? []).filter((s) => catalogue.has(`${s.w}x${s.h}`));
      if (!chosen.length || !mediumMat) continue;
      const variants = canvasSizeVariants(SITE_URL, prod.handle, chosen.map((s) => [s.w, s.h] as [number, number]), {
        slug: mediaSlug, name: mediumMat.materials.name, pricePerSqFt: Number(mediumMat.price_per_sqft),
      });
      // Pepperfry's name format wants one style word; take it from the tags.
      const STYLE_WORDS = ["Spiritual", "Abstract", "Botanical", "Floral", "Geometric", "Vintage", "Tropical", "Contemporary", "Modern", "Portrait", "Landscape", "Animals"];
      const tags = ((prod.product_tags as unknown as { tag: string }[]) ?? []).map((t) => t.tag);
      const styleWord = STYLE_WORDS.find((w) => tags.includes(w)) ?? "Decorative";
      const description = String(prod.description ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 900);
      variants.forEach((v, i) => {
        const { w, h, qty } = chosen[i];
        rows.push({
          sku: v.sku, title: prod.title, sizeLabel: v.sizeText,
          widthIn: w, heightIn: h, description: description || undefined, styleWord,
          mrpInclGst: v.price, gstRatePct, hsnCode,
          boxWeightKg: tubeWeightKg(w, h, media),
          quantity: Number.isFinite(Number(qty)) && Number(qty) > 0 ? Number(qty) : null,
        });
      });
    }
    if (!rows.length) {
      return NextResponse.json(
        excludedAutograph.length
          ? { error: "autograph_is_website_exclusive", excludedAutograph }
          : { error: "no_matching_canvas_sizes" },
        { status: 400 },
      );
    }

    const pickupAddress = String(body.pickupAddress || "").trim();
    const file = await format.build(rows, pickupAddress);
    const stamp = istDateKey();
    const filename = `${format.filePrefix}-${stamp}.xlsx`;

    // The shipment email: the sheet itself plus its money summary, sent the
    // moment the desk exports — one press creates the sheet AND notifies the
    // channel. Recipients are env-overridable so a change needs no deploy.
    // Rows without a quantity are listed but excluded from the total.
    // The shipment email belongs to the Amazon FBA flow alone — a Pepperfry
    // LISTING sheet has no business landing in Amazon's inbound mailbox.
    let emailStatus = "skipped";
    if (formatKey === "amazon-fba" && body.email !== false) {
      const total = rows.reduce((n, r) => n + (r.quantity ? r.quantity * r.mrpInclGst : 0), 0);
      const units = rows.reduce((n, r) => n + (r.quantity ?? 0), 0);
      const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
      const tr = rows.map((r) => `<tr><td style="padding:4px 10px;border:1px solid #ddd">${r.sku}</td><td style="padding:4px 10px;border:1px solid #ddd">${r.title}</td><td style="padding:4px 10px;border:1px solid #ddd">${r.sizeLabel}</td><td style="padding:4px 10px;border:1px solid #ddd;text-align:right">${r.quantity ?? "—"}</td><td style="padding:4px 10px;border:1px solid #ddd;text-align:right">${inr(r.mrpInclGst)}</td><td style="padding:4px 10px;border:1px solid #ddd;text-align:right">${r.quantity ? inr(r.quantity * r.mrpInclGst) : "—"}</td></tr>`).join("");
      const ok = await sendEmail({
        from: "Zyvorah Sales <sales@mail.zyvorah.com>",
        to: process.env.FBA_SHIPMENT_TO || "imshanm@amazon.com",
        cc: (process.env.FBA_SHIPMENT_CC || "savita.m@magnitudegroup.in,roheena@magnitudegroup.in").split(",").map((a) => a.trim()).filter(Boolean),
        subject: `Zyvorah FBA shipment — ${rows.length} SKUs, ${units} units — total ${inr(total)} (MRP incl. GST) — ${stamp}`,
        html: `<p>New FBA shipment created from the Zyvorah export desk.</p>
<table style="border-collapse:collapse;font:13px sans-serif"><tr><th style="padding:4px 10px;border:1px solid #ddd;text-align:left">SKU</th><th style="padding:4px 10px;border:1px solid #ddd;text-align:left">Design</th><th style="padding:4px 10px;border:1px solid #ddd;text-align:left">Size</th><th style="padding:4px 10px;border:1px solid #ddd">Qty</th><th style="padding:4px 10px;border:1px solid #ddd">MRP</th><th style="padding:4px 10px;border:1px solid #ddd">Line total</th></tr>${tr}</table>
<p><strong>Total sale value: ${inr(total)}</strong> (MRP, GST-inclusive · ${media === "canvas" ? `canvas · HSN ${CANVAS_HSN} @ ${CANVAS_GST_PCT}%` : `self-adhesive · HSN ${SELF_ADHESIVE_HSN} @ ${SELF_ADHESIVE_GST_PCT}%`})</p>
${pickupAddress ? `<p>Pickup address: ${pickupAddress}</p>` : ""}
<p>The filled FBA sheet is attached.</p>`,
        attachments: [{ filename, content: file.toString("base64") }],
      });
      emailStatus = ok ? "sent" : "failed";
    }

    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Shipment-Email": emailStatus,
        // So the desk can see that a pick was dropped on purpose, not lost.
        "X-Excluded-Autograph": excludedAutograph.join(",") || "none",
      },
    });
  }

  // 3) publish or leave as draft
  if (path[0] === "finalize") {
    if (body.publish) {
      const { error } = await supabase.rpc("studio_publish", { p_key: body.key, p_handle: String(body.handle) });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }
    revalidateCatalogue(String(body.handle));
    return NextResponse.json({ ok: true, published: Boolean(body.publish) });
  }

  // ---- overnight batch queue ----

  // Queue up to ~30-40 already-uploaded flats. Kicks the self-chaining worker.
  // An optional `sceneKeys` pick applies to every design in the batch; without
  // one, each design gets the rooms Claude judges right for it.
  if (path[0] === "batch-enqueue") {
    const flatUrls = Array.isArray(body.flatUrls) ? body.flatUrls.map(String) : [];
    if (!flatUrls.length) return NextResponse.json({ error: "no uploads" }, { status: 400 });
    const picked = normaliseSceneKeys(body.sceneKeys);
    const repeatCm = Number(body.repeatWidthCm);
    const seamless = Boolean(body.seamless) && Number.isFinite(repeatCm) && repeatCm >= 5 && repeatCm <= 300;
    const context = typeof body.context === "string" ? body.context.trim().slice(0, 200) : "";
    const { data, error } = await supabase.rpc("studio_batch_enqueue", {
      p_key: body.key, p_flat_urls: flatUrls, p_scene_keys: picked.length ? picked : null,
      // null = not chosen by hand, so each design falls back to its own tags.
      p_styling: isStylingKey(body.styling) ? body.styling : null,
      p_price_tier: requestedTier(body.priceTier),
      p_seamless: seamless,
      p_repeat_width_cm: seamless ? repeatCm : null,
      p_is_ceiling: Boolean(body.isCeiling),
      p_context: context || null,
      p_collection: null,
      // The queue stores "Name::kind" per shelf — one text[] column rather than
      // a second table for something that is three strings.
      p_collections: collectionShelves(body).map((sh) => `${sh.name}::${sh.kind}`),
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    // The ONE finish every design in the batch is sold on, stamped on its queue
    // rows; the tick applies it when it creates each design.
    const finish = requestedFinish(body.finish);
    const ids = ((data as { ids?: string[] | null })?.ids ?? []).filter(Boolean);
    if (ids.length && finish !== "smooth-matt") {
      await must(requireAdminDb().from("studio_queue").update({ finish }).in("id", ids), "stamp the batch finish");
    }
    after(() => fireNextTick(body.key));
    return NextResponse.json({ ok: true, ...data, finish });
  }

  // The worker: does ONE unit of work (name+create ONE design, or generate ONE
  // scene), then — regardless of outcome — drains the rest of the queue in-process
  // via after() so it keeps going without any client involvement.
  if (path[0] === "batch-tick") {
    const result = await processQueueTick(body.key);
    // `once` = do a single unit of work and stop (health check / manual step);
    // otherwise drain the queue.
    if (result.progressed && !body.once) {
      after(() => fireNextTick(body.key));
    }
    return NextResponse.json({ ok: true, ...result });
  }

  // ---- the classification guarantee ----

  // Sweep: queue every active design the catalogue reports as incomplete. Safe
  // to call at any time — it only adds designs genuinely missing an axis that
  // have not already failed three times.
  if (path[0] === "retag-sweep") {
    if (!(await requireKey(String(body.key || "")))) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const { data, error } = await supabase.rpc("retag_enqueue_missing", { p_limit: Number(body.limit) || 1000 });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    after(() => fireNextRetagTick(String(body.key)));
    return NextResponse.json({ ok: true, queued: data });
  }

  // One repair, then drain the rest in-process — the same shape as batch-tick,
  // so a backlog clears on its own.
  if (path[0] === "retag-tick") {
    if (!(await requireKey(String(body.key || "")))) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const result = await processRetagTick(String(body.key));
    if (result.progressed && !body.once) {
      after(() => fireNextRetagTick(String(body.key)));
    }
    // A repair changes which collections a design belongs to, so the pages
    // listing it must be rebuilt. Skipping this step is exactly what kept
    // correctly-tagged designs invisible.
    if (result.progressed && result.handle) revalidateCatalogue(result.handle);
    return NextResponse.json({ ok: true, ...result });
  }

  // Manual safety net: if the chain ever stalls (e.g. a deploy interrupted a
  // tick), calling this resumes it. Harmless / idempotent if already running.
  if (path[0] === "batch-nudge") {
    after(() => fireNextTick(body.key));
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "not_found" }, { status: 404 });
 } catch (e) {
  console.error("studio route error:", e);
  return NextResponse.json({ error: e instanceof Error ? e.message : "server_error" }, { status: 500 });
 }
}

export async function GET(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  if (!serviceAvailable("ai")) requireService("ai");
  const { path = [] } = await params;
  const url = new URL(req.url);

  // The room picker's options, built from the live site taxonomy: every "Shop
  // by Room" collection a customer can click through to, in the site's own
  // order, followed by the extra framings that have no collection. Adding a
  // room collection makes it tickable here as soon as it has a scenario.
  if (path[0] === "scenes") {
    const key = await staffKey(req);
    if (!(await requireKey(key))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { data } = await supabase
      .from("collections")
      .select("handle, title, position")
      .eq("kind", "room")
      .not("rule_tag", "is", null)
      .order("position", { ascending: true, nullsFirst: false });
    const order = new Map(((data as { handle: string; position: number | null }[]) ?? []).map((c, i) => [c.handle, c.position ?? 1000 + i]));
    const titles = new Map(((data as { handle: string; title: string }[]) ?? []).map((c) => [c.handle, c.title]));

    const rooms = SCENARIOS
      .filter((s) => s.collection && order.has(s.collection))
      .map((s) => ({
        key: s.key, label: s.label, collection: s.collection!,
        collectionTitle: titles.get(s.collection!) ?? s.label,
        category: s.spaceCategory ?? "Residential",
      }))
      .sort((a, b) => (order.get(a.collection)! - order.get(b.collection)!));
    const extras = SCENARIOS
      .filter((s) => !s.collection || !order.has(s.collection))
      .map((s) => ({ key: s.key, label: s.label }));

    // Commissioned projects ride along so the picker can offer their spaces
    // and the form can say what turning one on does. `anchored` tells the UI
    // whether renders will carry the approved style anchor yet, or are still
    // shooting the anchor candidates themselves.
    const projects = Array.from(PROJECT_BY_KEY.values()).map((p) => ({
      key: p.key, label: p.label, note: p.note, anchored: Boolean(p.styleAnchorUrl),
      scenes: p.scenes.map((sc) => ({ key: sc.key, label: sc.label })),
    }));

    return NextResponse.json({ rooms, extras, projects, maxPicked: MAX_PICKED_SCENES });
  }

  // Every collection a design can be dropped into — with a thumbnail, so the
  // Studio's collection field shows what a name MEANS rather than asking the
  // uploader to remember. Typing a fresh name is still how a collection gets
  // created; being able to see the existing ones is what stops a design landing
  // in a near-duplicate ("Ikat" vs "Ikat Collection") or in the wrong set.
  //
  // Three kinds, deliberately all offered (see migration 0145): an aesthetic
  // (curated), a provenance or price band (series), and panels cut for one
  // physical thing (set). A design can legitimately join one of each, and the
  // uploader has to be able to see which shelf a name sits on to pick right.
  if (path[0] === "collections") {
    const key = await staffKey(req);
    if (!(await requireKey(key))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const db = requireAdminDb();
    const { data } = await db
      .from("collections")
      .select("title, kind, rule_tag")
      .in("kind", ["curated", "series", "set"])
      .not("rule_tag", "is", null);
    const rows = (data ?? []) as { title: string; kind: string; rule_tag: string }[];
    // How many designs each one holds — a count is what tells the uploader
    // whether they are joining an established collection or a stub — and one
    // design from it, which is what tells them what it looks like.
    const tags = rows.map((r) => r.rule_tag);
    const { data: tagRows } = await db.from("product_tags").select("tag").in("tag", tags);
    const counts = new Map<string, number>();
    for (const t of ((tagRows ?? []) as { tag: string }[])) counts.set(t.tag, (counts.get(t.tag) ?? 0) + 1);
    // Public card query: active, imaged, aesthetic_rank order — so the
    // thumbnail is the same design the collection leads with on the site.
    const byTag = await getProductsByTags(tags);
    const items = rows
      .map((r) => ({
        name: r.rule_tag,
        title: r.title,
        kind: r.kind,
        count: counts.get(r.rule_tag) ?? 0,
        thumb: (byTag[r.rule_tag] ?? []).find((p) => p.image)?.image ?? null,
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    return NextResponse.json({ items });
  }

  if (path[0] === "recent") {
    const key = await staffKey(req);
    // 0 = every design, no cap. The list is how an uploader reaches a design to
    // re-stage it, and the ones needing another room are the OLD ones — a cap
    // here hid exactly the designs the drawer exists to fix. The client filters
    // this list by name, so it has to hold everything to be able to find
    // anything.
    //
    // MIGRATION 0149 MUST BE APPLIED BEFORE THIS DEPLOYS. p_limit does not
    // exist on the old one-argument function, and PostgREST resolves overloads
    // by argument NAME: against an un-migrated database this call does not fall
    // back to the default, it fails to resolve at all — and since requireKey
    // rides on the same function, every Studio request would 401. The reverse
    // order is safe: 0149 keeps 40 as its default, so applying it early changes
    // nothing for the code already running.
    const { data, error } = await supabase.rpc("studio_recent", { p_key: key, p_limit: 0 });
    if (error) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const items = (data ?? []) as Array<{ handle: string; title: string; status: string }>;
    // The seamless flag and the design's family are enriched HERE rather than
    // inside studio_recent, so marking existing designs needs no migration on a
    // live DB. The family matters because a repeat is a wallpaper idea: a canvas
    // is a fixed-size print and a border already repeats along its own length,
    // so neither is offered the toggle.
    const handles = items.map((i) => i.handle).filter(Boolean);
    if (handles.length) {
      const db = requireAdminDb();
      const { data: extra } = await db
        .from("products")
        .select("handle, is_seamless, repeat_width_cm, is_limited, ready_sizes, product_tags ( tag ), product_materials ( price_per_sqft, available )")
        .in("handle", handles);
      const byHandle = new Map(
        ((extra ?? []) as Array<{
          handle: string; is_seamless: boolean | null; repeat_width_cm: number | string | null;
          is_limited: boolean | null; ready_sizes: [number, number][] | null;
          product_tags: Array<{ tag: string }>;
          product_materials: Array<{ price_per_sqft: number | string | null; available: boolean | null }> | null;
        }>)
          .map((r) => [r.handle, r]),
      );
      // A concept-page design that is drawn only once it is bought
      // (concept_shop_designs.requires_preparation) has NO product images by
      // design: its room picture is a reference render on the concept page,
      // never a print source (migration 20260912064231). Ninety-odd of these
      // sat in this list badged ACTIVE with "No images." behind them, looking
      // exactly like a broken upload. The Studio is told what they are.
      const { data: concepts } = await db
        .from("concept_shop_designs")
        .select("concept_slug, reference_url, space, products!inner(handle)")
        .eq("requires_preparation", true)
        .in("products.handle", handles);
      const conceptByHandle = new Map(
        ((concepts ?? []) as unknown as Array<{
          concept_slug: string; reference_url: string; space: string; products: { handle: string } | { handle: string }[];
        }>).map((c) => {
          const p = Array.isArray(c.products) ? c.products[0] : c.products;
          return [p?.handle, { slug: c.concept_slug, referenceUrl: c.reference_url, space: c.space }] as const;
        }),
      );
      return NextResponse.json({
        items: items.map((i) => {
          const r = byHandle.get(i.handle);
          const tags = (r?.product_tags ?? []).map((t) => t.tag);
          const family = tags.includes("Canvas Wall Art") ? "canvas" : tags.includes(BORDER_BROWSE_TAG) ? "border" : "wallpaper";
          const repeat = r?.repeat_width_cm == null ? null : Number(r.repeat_width_cm);
          // A limited edition's price is quoted the same way the storefront
          // quotes it — through fixedSizePrice() — so the Studio can never
          // show a different number from the product page.
          const oneSize = (r?.ready_sizes ?? []).length === 1 ? r!.ready_sizes![0] : null;
          const rate = Number(r?.product_materials?.find((m) => m.available)?.price_per_sqft ?? 0);
          return {
            ...i,
            family,
            isSeamless: r?.is_seamless === true,
            repeatWidthCm: r?.is_seamless === true ? repeat : null,
            isLimited: r?.is_limited === true,
            concept: conceptByHandle.get(i.handle) ?? null,
            price:
              r?.is_limited === true && oneSize && rate > 0
                ? fixedSizePrice(oneSize[0] * CM_PER_INCH, oneSize[1] * CM_PER_INCH, rate)
                : null,
          };
        }),
      });
    }
    return NextResponse.json({ items });
  }

  // One design's images, for the "open & review" panel — the flat first, then
  // room scenes by position, so a reviewer can eyeball each and delete the ones
  // they don't want (the flat is flagged and can't be removed).
  // The FBA desk's catalogue: every canvas design with its size ladder, per-size
  // site prices and flat thumbnail, for hand-curating a marketplace shipment.
  // Reads with the service role so drafts are visible too (badged in the UI —
  // the desk may prepare a sheet before a design goes live).
  if (path[0] === "fba-items") {
    const key = await staffKey(req);
    if (!(await requireKey(key))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const db = requireAdminDb();
    const { data } = await db
      .from("products")
      .select("handle, title, status, ready_sizes, product_materials(price_per_sqft, available, materials(slug)), product_images(url, is_flat)")
      .eq("category", "canvas")
      .order("created_at", { ascending: false });
    const items = ((data as unknown as {
      handle: string; title: string; status: string; ready_sizes: [number, number][] | null;
      product_materials: { price_per_sqft: number; available: boolean; materials: { slug: string } }[] | null;
      product_images: { url: string; is_flat: boolean }[] | null;
    }[]) ?? []).map((p) => {
      // A design carries a price per MEDIA it is sold in — the desk shows the
      // chosen medium's numbers and greys out designs that don't offer it.
      const rateFor = (slug: string) =>
        Number(p.product_materials?.find((m) => m.available && m.materials?.slug === slug)?.price_per_sqft ?? 0);
      const rates: Record<WallArtMedia, number> = {
        "canvas": rateFor(WALL_ART_MEDIA["canvas"].slug),
        "self-adhesive": rateFor(WALL_ART_MEDIA["self-adhesive"].slug),
      };
      return {
        handle: p.handle, title: p.title, status: p.status,
        flat: p.product_images?.find((i) => i.is_flat)?.url ?? null,
        media: (Object.keys(rates) as WallArtMedia[]).filter((m) => rates[m] > 0),
        sizes: (p.ready_sizes ?? []).map(([w, h]) => ({
          w, h,
          label: `${w % 12 === 0 ? w / 12 : (w / 12).toFixed(1)} × ${h % 12 === 0 ? h / 12 : (h / 12).toFixed(1)} ft`,
          prices: Object.fromEntries(
            (Object.keys(rates) as WallArtMedia[]).map((m) => [m, Math.round((w / 12) * (h / 12) * rates[m])]),
          ) as Record<WallArtMedia, number>,
        })),
      };
    }).filter((p) => p.sizes.length > 0 && p.media.length > 0);
    return NextResponse.json({ items });
  }

  // The sample desk's catalogue: every design that could be sampled, with its
  // flat thumbnail, plus the media the print engine can actually NAME on a card.
  // Service role for the same reason as the FBA desk — a sample often goes out
  // while the design is still a draft.
  if (path[0] === "samples-items") {
    const key = await staffKey(req);
    if (!(await requireKey(key))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const db = requireAdminDb();
    const [{ data: prods }, { data: mats }] = await Promise.all([
      db.from("products")
        .select("handle, title, status, category, product_images(url, is_flat)")
        .order("created_at", { ascending: false })
        .limit(400),
      db.from("materials").select("slug, name, roll_width_mm"),
    ]);
    const items = ((prods as unknown as {
      handle: string; title: string; status: string; category: string | null;
      product_images: { url: string; is_flat: boolean }[] | null;
    }[]) ?? []).map((p) => ({
      handle: p.handle, title: p.title, status: p.status, category: p.category,
      flat: p.product_images?.find((i) => i.is_flat)?.url ?? null,
    // A design with no flat has no artwork to sample.
    })).filter((p) => p.flat);

    const bySlug = new Map(((mats as { slug: string; name: string; roll_width_mm: number | null }[]) ?? [])
      .map((m) => [m.slug, m]));
    const media = SAMPLE_MEDIA_SLUGS.map((slug) => {
      const m = bySlug.get(slug);
      return {
        slug,
        name: m?.name ?? slug,
        rollWidthMm: m?.roll_width_mm ?? null,
        printableCm: printableCmFor(m?.roll_width_mm),
      };
    }).filter((m) => bySlug.has(m.slug));

    return NextResponse.json({ items, media, wall: SAMPLE_WALL_FT });
  }

  if (path[0] === "images") {
    const key = await staffKey(req);
    if (!(await requireKey(key))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const handle = url.searchParams.get("handle") ?? "";
    // The reviewer's whole job is drafts, and RLS only shows the anon client
    // the ACTIVE catalogue — read this with the service role or a draft's
    // images come back empty.
    const db = requireAdminDb();
    const { data: prod } = await db
      .from("products").select("id, title").eq("handle", handle).single();
    if (!prod) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const { data } = await db
      .from("product_images")
      .select("id, url, alt, position, is_flat, is_featured, scene_key")
      .eq("product_id", prod.id)
      .order("is_flat", { ascending: true })
      .order("position", { ascending: true });
    return NextResponse.json({ title: prod.title, images: data ?? [] });
  }
  if (path[0] === "batch-status") {
    const key = await staffKey(req);
    const { data, error } = await supabase.rpc("studio_batch_status", { p_key: key });
    if (error) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.json({ items: data ?? [] });
  }

  // Live progress of the SKU mint queue — counts, the last dozen rows and any
  // failures with the OS's own reason, so a refusal is read rather than guessed.
  if (path[0] === "mint-status") {
    const key = await staffKey(req);
    const { data, error } = await supabase.rpc("mint_status", { p_key: key });
    if (error) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.json(data ?? { counts: {}, recent: [], failed: [] });
  }
  // every draft (not just the recent 40), with flat thumbnail + completeness
  // signal — backs the /studio/drafts review screen.
  if (path[0] === "drafts") {
    const key = await staffKey(req);
    const { data, error } = await supabase.rpc("studio_drafts", { p_key: key });
    if (error) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.json({ items: data ?? [] });
  }
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}
