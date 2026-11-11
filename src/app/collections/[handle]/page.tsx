
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import { getNamedFaithCards, isNamedFaithCollection } from "@/lib/named-faith-collections";
import { ShoppingJourney } from "@/components/ShoppingJourney";
import { kidsCollectionOrder } from "@/lib/kids-collection-order";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "@/components/SiteImage";

// Collection listings had no time-based revalidation at all: they were rebuilt
// only when something happened to call revalidatePath, so a newly published or
// newly re-tagged design could sit outside its own collection indefinitely.
// The publish paths now revalidate explicitly; this is the backstop.
export const revalidate = 3600;
import {
  getCollectionByHandle,
  getCollectionsByKind,
  getFacetVocab,
  getCollectionFacetCounts,
  getCollectionFlagCounts,
  getCollectionPageHandles,
  getCollectionCards,
  getSubCollections,
  getTrendingCards,
  collectionScope,
  type Sort,
  type FacetOption,
} from "@/lib/queries";
import { CollectionBrowser, type FacetGroup } from "@/components/CollectionBrowser";
import { CollectionStories, type CollectionStoryBlock } from "@/components/CollectionStory";
import { TaashFilm } from "@/components/TaashFilm";
import { NAFAS_COLLECTION_HANDLE, NAFAS_PATH, NAFAS_DESCRIPTION } from "@/lib/nafas";
import { filmAspect, getSiteFilm, shapeOf, videoObjectJsonLd, type SiteFilm } from "@/lib/site-films";
import { getCollectionStories } from "@/lib/launch-queries";
import { sceneKeyForCollection } from "@/lib/rooms";
import { descriptorFor } from "@/lib/descriptor";
import { JsonLd } from "@/components/JsonLd";
import { BadgeIcon } from "@/components/BadgeIcon";
import { RoomGuide } from "@/components/RoomGuide";
import { ROOM_CONTENT } from "@/lib/room-content";
import { SITE_URL, collectionJsonLd } from "@/lib/seo";
import { categoryForCollection, getProductCategories, type ProductCategory } from "@/lib/product-category";
import {
  CATALOGUE_FLOOR_RATE,
  countryPhrase,
  deliveryPitch,
  HOME_MARKET,
  marketLanding,
  marketPriceLabel,
} from "@/lib/market-seo";
import { inMarket } from "@/components/MarketLanding";
import { CANVAS_FIXED_SIZE_STATEMENT } from "@/lib/product-facts";
import { canvasSizeLabel, getCanvasSizes } from "@/lib/canvas-size-pages";
import { heldOutOfRoom } from "@/lib/room-suitability";
import { TRENDING_HANDLES, TRENDING_MATERIAL_SLUG, trendingForCollection, type TrendingCard } from "@/lib/trending-pins";
import { TrendingPins } from "@/components/TrendingPins";

const PAGE_SIZE = 24;

// A collection page can be the listing for a non-wallpaper product FAMILY
// (Borders & Strips, Canvas Art — migrations 0048/0050), or for a
// sub-collection inside one. Neither is mural wallpaper, so the
// shared "designs · sized to your wall" copy has to say something true for them.
// Resolved from the collection's category_scope, never hardcoded per handle.

/** How a family's listing describes what it sells, in that family's own terms. */
function familySummary(c: ProductCategory): string {
  if (c.measurementType === "length") {
    return `sold by the linear metre, in ${c.minOrderQty} m sets of ${c.fixedLengthM ?? 1} m pieces`;
  }
  if (c.measurementType === "fixed") return "available in fixed finished sizes";
  return "sized to your wall";
}

/** The family's landing collection for wallpapers — historically titled "Wall
 *  Art", which is also what people call canvas pieces. Its listing is the
 *  WALLPAPER family, so it is titled as such and points canvas searchers on. */
const WALLPAPER_LANDING = "wall-art";
const CANVAS_LANDING = "canvas-art";

/**
 * The collection's name with its product noun, for the <title> and the <h1>.
 * Many rows are bare adjectives ("Modern", "Bold", "Games Room"), which says
 * nothing to a search engine about WHAT is modern. A title that already names
 * its product is left alone, so nothing reads "Kids' Wallpapers Wallpaper".
 */
function keywordTitle(title: string, handle: string, family: ProductCategory | null): string {
  if (handle === "the-lives-within" || handle === "bagh") return title;
  if (!family || family.measurementType === "area") {
    if (handle === WALLPAPER_LANDING) return "Wallpapers & Wall Murals";
    return /wallpaper|mural/i.test(title) ? title : `${title} Wallpaper`;
  }
  if (family.measurementType === "fixed") {
    if (handle === CANVAS_LANDING) return "Canvas Wall Art";
    return /canvas|art\b|painting/i.test(title) ? title : `${title} Canvas Art`;
  }
  return /border|strip/i.test(title) ? title : `${title} Borders`;
}

/** The <title> (before " | Zyvorah"), kept near 60 characters: the long form
 *  when it fits, a shorter one when it does not. */
function seoTitle(title: string, handle: string, family: ProductCategory | null): string {
  const fit = (...options: string[]) => options.find((o) => o.length <= 60) ?? options[options.length - 1];
  const named = keywordTitle(title, handle, family);
  if (family?.measurementType === "length") {
    return fit(`${named} — Sold Per Linear Metre`, `${named} — Per Metre`, named);
  }
  if (family?.measurementType === "fixed") {
    if (handle === CANVAS_LANDING) return "Canvas Wall Art & Paintings — Fixed Sizes";
    // "Abstract" → "Abstract Canvas Art & Paintings — Fixed Sizes": the noun
    // is already in `named`, so the tail must not say canvas a second time.
    return fit(`${named} & Paintings — Fixed Sizes`, `${named} — Fixed Sizes`, named);
  }
  if (handle === WALLPAPER_LANDING) return "Mural Wallpaper Designs";
  // "Modern" → "Modern Wallpaper & Murals"; a title that already says
  // wallpaper or mural keeps its own words.
  const noun = /wallpaper|mural/i.test(title) ? title : `${title} Wallpaper & Murals`;
  return fit(`${noun} — Mural Designs`, noun, named);
}

/** The collection's own sentence, for its meta description: the editorial
 *  `collections.description` when written, else the opening line of the room
 *  guide. Null means the page falls back to the family template. */
function editorialLine(description: string | null | undefined, handle: string): string | null {
  const own = description?.trim();
  if (own && own.length >= 30) return /[.!?]$/.test(own) ? own : `${own}.`;
  const intro = ROOM_CONTENT[handle]?.intro?.trim();
  if (!intro) return null;
  const first = intro.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? intro;
  return first.length >= 30 ? first : null;
}

/** The size row is a courtesy; a failed read drops it, never the listing. */
async function canvasSizesForRow() {
  try {
    return (await getCanvasSizes()).map(({ slug, shortIn, longIn }) => ({ slug, shortIn, longIn }));
  } catch (err) {
    console.error("[collections] canvas size row read failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

type SP = { page?: string; sort?: string; tag?: string | string[]; signature?: string; new?: string; child?: string; market?: string };

const parsePage = (v?: string) => Math.max(1, parseInt(v ?? "1", 10) || 1);
// Newest first is the default on every collection, always. The catalogue grows
// weekly and a shopper returning to a collection must see what has arrived
// since their last visit at the top — "Curated" is the deliberate choice, not
// the resting state.
const parseSort = (v?: string): Sort => (v === "featured" ? "featured" : "newest");
const asArray = (v?: string | string[]) => (Array.isArray(v) ? v : v ? [v] : []);

// Which facet group to hide on which collection kind (redundant with the page
// itself — the base tag is excluded from options anyway).
const HIDE_GROUP_ON: Record<string, "colour" | "style" | "subject" | "room" | undefined> = {
  color: "colour",
  room: "room",
};

 async function buildPageMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<SP>;
}): Promise<Metadata> {
  const { handle } = await params;
  if (process.env.MIMIPIP_LOCAL_REVIEW === '1') { const {headFor} = await import('@/brand/seo/head'); const head = headFor('/collections/' + handle); return head ? {title:{absolute:head.title}, description:head.description, alternates:{canonical:head.canonical}} : {title:'Collection', robots:{index:false,follow:true}}; }
  const { page: pageRaw, market } = await searchParams;
  const page = parsePage(pageRaw);
  const { countryCode } = marketLanding(`/collections/${handle}`, market);
  const home = countryCode === HOME_MARKET;
  // India's listings quote GST; everywhere else the duties line applies and
  // GST does not, so the two tails are written out rather than patched.
  const taxTail = home ? "GST included and free India delivery." : deliveryPitch(countryCode);
  const c = await getCollectionByHandle(handle);
  if (!c) return { title: "Collection" };
  const suffix = page > 1 ? ` — Page ${page}` : "";
  // A border or canvas listing is not mural wallpaper — the generic
  // "sized to your wall size, from ₹200/sq ft" copy would be wrong.
  const family = await categoryForCollection(handle, c.category_scope);
  // Every title names the product (wallpaper / canvas art / borders): a bare
  // "Modern — Made-to-Measure" told a search engine nothing about what is
  // modern. See seoTitle.
  const title = `${seoTitle(c.title, handle, family)}${suffix} | Zyvorah`;
  const named = keywordTitle(c.title, handle, family).toLowerCase();
  // The collection's own sentence leads when it has one, so forty listings
  // stop sharing one template that Google rewrites; the family's facts follow.
  const lead = editorialLine(c.description, handle);
  const description =
    family?.measurementType === "length"
      ? `${lead ? `${lead} ` : `Shop ${named}, `}${lead ? "Priced" : "priced"} by the linear metre and supplied in ${family.fixedLengthM ?? 1} m pieces — order from ${family.minOrderQty} m. ${taxTail}`
      : family?.measurementType === "fixed"
        ? `${lead ? `${lead} Canvas art` : `Shop ${named}, available`} in fixed finished sizes from 2 ft × 2 ft to 4 ft × 6 ft. Not sized to your wall. ${taxTail}`
        : handle === WALLPAPER_LANDING
          ? `Shop wallpapers and wall murals sized to your wall size in your choice of finish. From ${marketPriceLabel(CATALOGUE_FLOOR_RATE, countryCode)}/sq ft. ${taxTail}`
          : lead
            ? `${lead} ${keywordTitle(c.title, handle, family)}, sized to your wall from ${marketPriceLabel(CATALOGUE_FLOOR_RATE, countryCode)}/sq ft. ${taxTail}`
            : `Explore ${named} designs for your space. Sized to your wall in your choice of finish. From ${marketPriceLabel(CATALOGUE_FLOOR_RATE, countryCode)}/sq ft. ${taxTail}`;
  // Self-referencing canonical per page (filters/sort are not canonical
  // variants), then per market on top of that — page 2 of the US listing is
  // its own URL and must not canonical to page 2 of India's.
  const paged = page > 1 ? `/collections/${handle}?page=${page}` : `/collections/${handle}`;
  const { alternates } = marketLanding(paged, market);
  const canonical = alternates.canonical;
  return {
    title: { absolute: home ? title : `${title.replace(" | Zyvorah", "")} — Delivered to ${countryPhrase(countryCode)} | Zyvorah` },
    description,
    alternates,
    openGraph: { type: "website", title, description, url: `${SITE_URL}${canonical}`, siteName: "Zyvorah" },
    twitter: { card: "summary_large_image", title, description },
  };
}

const KIND_LABEL: Record<string, string> = {
  category: "Category",
  room: "Shop by room",
  color: "Shop by colour",
  curated: "Curated collection",
  series: "Series",
  set: "Set",
  other: "Collection",
};

const KIND_BG: Record<string, string> = {
  category: "bg-lavender/40",
  room: "bg-sage/40",
  color: "bg-blush/40",
  curated: "bg-peach/40",
  series: "bg-blush/40",
  set: "bg-sage/40",
  other: "bg-sky/40",
};

export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<SP>;
}) {
  const { handle } = await params;
  if(process.env.MIMIPIP_LOCAL_REVIEW==='1'||handle==='happy-petals'){const {collectionDesigns}=await import('@/brand/review/data');if(collectionDesigns(handle).length){const {Browse}=await import('@/brand/review/pages');return <Browse axis="collection" value={handle}/>;}notFound();}
  if (handle === "ink") redirect("/collection/ink");
  if (handle === "new-york") redirect("/collection/new-york");
  const sp = await searchParams;
  const { landingCountryCode } = marketLanding(`/collections/${handle}`, sp.market);
  const page = parsePage(sp.page);
  const sort = parseSort(sp.sort);
  const selectedTags = asArray(sp.tag);
  const signature = sp.signature === "1";
  const newOnly = sp.new === "1";
  const childSafe = sp.child === "1";

  const collection = await getCollectionByHandle(handle);
  if (!collection) notFound();
  // A family's own landing collection always selects the whole family, whatever
  // its row happens to say. `wall-art` is where the wallpaper family browses —
  // and where both the homepage's "Shop Wallpapers" button and the newsletter's
  // main CTA point — but it was configured as a rule collection on the tag
  // "Wall Art", so it offered 14 of 681 designs and looked entirely intentional
  // doing it. Deriving the scope from the registry instead of the row means a
  // mis-set rule_tag can never quietly shrink a category's shopfront again.
  const landingCategory = (await getProductCategories()).find((c) => c.collectionHandle === handle);

  // What this listing selects: a whole product family, a tag over the whole
  // catalogue (wallpaper), or a tag WITHIN one family.
  const scope = landingCategory
    ? { tags: null, category: landingCategory.slug }
    : collectionScope(collection);
  // Suppressed as a facet only when it is genuinely what the listing selects —
  // on a landing page the row's tag is not the filter, so it stays offerable.
  const baseTag = landingCategory ? null : collection.rule_tag;

  // A border or canvas listing describes itself in its own family's terms.
  const family = await categoryForCollection(handle, collection.category_scope);

  // Inside a family, the browse bar is that family's sub-collections (Borders →
  // Decorative, Kids', …) — not every other kind = 'other' collection, which is
  // what the wallpaper sibling rule would return here.
  const siblingsFor = async () => {
    if (family) {
      const parent = collection.parent_handle ?? handle;
      return getSubCollections(parent, family.slug);
    }
    return getCollectionsByKind(collection.kind);
  };

  const commonShell = {
    collection, handle, selectedTags, signature, newOnly, childSafe, sort, family,
  };

  // Selecting a named faith collection is deliberate browsing, just like its
  // individual product URL. Keep these reads out of general discovery RPCs.
  if (isNamedFaithCollection(handle)) {
    const allCards = await getNamedFaithCards(handle);
    const matching = allCards.filter(p => (!signature || p.isSignature) && (!newOnly || p.isNew)
      && (!childSafe || p.tags?.includes("Child-Safe"))
      && selectedTags.every(tag => p.tags?.includes(tag)));
    if (sort === "newest") matching.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    const products = matching.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    if ((!matching.length && !selectedTags.length && !signature && !newOnly && !childSafe) || (page > 1 && !products.length)) notFound();
    return inMarket(landingCountryCode, renderShell({ ...commonShell, products, page, total: matching.length,
      roomKey: undefined, siblings: [{ handle, title: collection.title }], facetGroups: [],
      flagsAvailable: { signature: false, new: false, child: false }, stories: [], sizes: [], siteFilm: null, trending: [] }));
  }

  // An unscoped, untagged collection can never select a product, so it would
  // always render a blank grid. A visitor must never reach an empty listing —
  // it reads as a broken page and gets indexed as thin content.
  if (!scope.tags && !scope.category) notFound();

  // The room render every card shows — resolved once, the same way every
  // other room surface resolves it (src/lib/rooms.ts).
  const roomKey = sceneKeyForCollection(collection);

  // Child-safe is a derived tag; when toggled it joins the AND filter set.
  const queryTags = childSafe ? [...selectedTags, "Child-Safe"] : selectedTags;

  const [vocab, facetCounts, flagCounts, { handles, total }, siblings, siteFilm, trendingRaw] = await Promise.all([
    getFacetVocab(),
    getCollectionFacetCounts(scope),
    getCollectionFlagCounts(scope),
    getCollectionPageHandles(scope, {
      page, pageSize: PAGE_SIZE, sort, filterTags: queryTags, signature, newOnly,
      roomKey,
      renderedOnly: family?.measurementType !== "length",
    }),
    siblingsFor(),
    // The cleared Library film filed with this collection's link, if any
    // (src/lib/site-films.ts). Shown on the first page only, like the band.
    page === 1 ? getSiteFilm("collection", handle, "wide") : Promise.resolve(null),
    // The Trending pins (src/lib/trending-pins.ts), read with this page's
    // room so a room listing can show the pin in that room or not at all.
    page === 1 ? getTrendingCards([...TRENDING_HANDLES], TRENDING_MATERIAL_SLUG, roomKey) : Promise.resolve([] as TrendingCard[]),
  ]);

  // An empty collection is never viewable. `total` counts the listing BEFORE
  // paging, so this only fires when the collection genuinely has nothing to
  // show — and only when the visitor hasn't narrowed it themselves, so a facet
  // combination that matches nothing still renders (with its filters clearable)
  // instead of dead-ending on a 404.
  const narrowed = queryTags.length > 0 || signature || newOnly;
  if ((total === 0 && !narrowed) || (page > 1 && handles.length === 0)) notFound();

  // Wallpaper and canvas cards always show a room render. Border listings are
  // the different product shape: their cards tile the clean strip artwork
  // across a running horizontal band.
  const cardMode = family?.measurementType === "length" ? "flat" : roomKey ? "scene-preferred" : "scene";
  const rawProducts = await getCollectionCards(kidsCollectionOrder(handles, handle, page), roomKey, cardMode);
  // Pinned above the grid, whatever the sort or filter says, on the first
  // page of every listing the design belongs to — in this room's render on a
  // room page, else not here at all.
  const trending = trendingForCollection(trendingRaw, scope, { page, kind: collection.kind, roomKey });
  const colourSet = new Set(vocab.colour.map((o) => o.tag));
  const styleSet = new Set([...vocab.style, ...vocab.subject].map((o) => o.tag));
  // A Ganesha is never shown on a child's, bed-, dining- or kitchen-room page,
  // whatever tags it has picked up (src/lib/room-suitability.ts).
  const products = rawProducts
    .filter((p) => collection.kind !== "room" || !heldOutOfRoom(p.handle, roomKey))
    .map((p) => ({ ...p, subtitle: descriptorFor(p.tags ?? [], colourSet, styleSet) }));

  // Build visible facet groups: only options that occur in this collection, and
  // never the group matching the collection's own kind (or the base tag itself).
  const hidden = HIDE_GROUP_ON[collection.kind];
  // Every tag this listing is already filtered by — offering it as a facet
  // would be a no-op checkbox.
  const ownTags = new Set([...(scope.tags ?? []), ...(baseTag ? [baseTag] : [])]);
  const buildGroup = (key: FacetGroup["key"], label: string, opts: FacetOption[]): FacetGroup | null => {
    if (hidden === key) return null;
    const options = opts
      .filter((o) => !ownTags.has(o.tag) && facetCounts.has(o.tag))
      .map((o) => ({ ...o, count: facetCounts.get(o.tag) ?? 0 }));
    return options.length ? { key, label, options } : null;
  };
  const facetGroups = [
    buildGroup("colour", "Colour", vocab.colour),
    buildGroup("mood", "Mood", vocab.mood),
    buildGroup("subject", "Subject", vocab.subject),
    buildGroup("style", "Style", vocab.style),
    buildGroup("room", "Room", vocab.room),
  ].filter((g): g is FacetGroup => g !== null);

  return inMarket(
    landingCountryCode,
    renderShell({
      ...commonShell, roomKey, products, siblings, facetGroups, page, total, siteFilm, trending,
      stories: await getCollectionStories(handle),
      sizes: handle === CANVAS_LANDING && page === 1 ? await canvasSizesForRow() : [],
      flagsAvailable: { signature: flagCounts.signature > 0, new: flagCounts.new > 0, child: flagCounts.child > 0 },
    }),
  );
}

type ShellProps = {
  collection: { title: string; kind: string; is_signature?: boolean };
  handle: string;
  /** The room this page shows (sceneKeyForCollection), undefined off a room. */
  roomKey: string | undefined;
  products: Awaited<ReturnType<typeof getCollectionCards>>;
  siblings: { handle: string; title: string }[];
  facetGroups: FacetGroup[];
  selectedTags: string[];
  signature: boolean;
  newOnly: boolean;
  childSafe: boolean;
  sort: Sort;
  page: number;
  total: number;
  flagsAvailable: { signature: boolean; new: boolean; child: boolean };
  /** Set when this listing belongs to a non-wallpaper product family. */
  family: ProductCategory | null;
  /** Behind-the-scenes blocks above the grid. Slots (no file yet) are in this
   *  list too and are dropped at render. */
  stories: CollectionStoryBlock[];
  /** Canvas sizes with designs behind them — the canvas landing's size row. */
  sizes: { slug: string; shortIn: number; longIn: number }[];
  /** The cleared Library film filed with this collection's link, if any. */
  siteFilm: SiteFilm | null;
  /** The Trending pins that belong on this listing's first page. */
  trending: TrendingCard[];
};

function renderShell({
  collection, handle, roomKey, products, siblings, facetGroups, selectedTags,
  signature, newOnly, childSafe, sort, page, total, flagsAvailable, family,
  stories, sizes, siteFilm, trending,
}: ShellProps) {
  const bgClass = KIND_BG[collection.kind] ?? KIND_BG.other;
  const filmLd = siteFilm
    ? videoObjectJsonLd(siteFilm, { path: `/collections/${handle}`, name: `${collection.title} — the film`, description: `${collection.title} by Zyvorah, on the wall.` })
    : null;
  const structuredData = [...collectionJsonLd({
    handle,
    title: collection.title,
    kind: collection.kind,
    products: products.map((p) => ({ handle: p.handle, title: p.title, image: p.image })),
  }), ...(filmLd ? [filmLd] : [])];

  return (
    <div>
      <JsonLd data={structuredData} />
      <ShoppingJourney canvas={family?.measurementType === "fixed"} />
      {/* Compact on a phone (6 October 2026): at py-10 with a 2.2rem title the
          hero, the filter bar and the "Too many designs?" box filled the whole
          first screen, and the first design arrived a screen and a half down. */}
      {handle === "bagh" && page === 1 ? (
        <section className="mx-4 mt-3 overflow-hidden rounded-[24px] bg-[#382d25] text-[#f6eddc] lg:mx-6 lg:mt-4 lg:grid lg:grid-cols-[0.7fr_1.3fr]" aria-labelledby="bagh-title">
          <div className="m-3 flex flex-col justify-center border border-[#a68b64] px-6 py-5 text-center lg:m-6 lg:px-8 lg:py-8 lg:text-left">
            <p className="font-sans text-[0.65rem] uppercase tracking-[0.22em]">Zyvorah presents</p>
            <h1 id="bagh-title" className="mt-2 font-display text-5xl lg:text-7xl">Bagh</h1>
            <p className="mt-2 font-display text-lg">The garden, brought indoors.</p>
            <p className="mt-3 hidden text-sm leading-relaxed text-[#e6d8c1] lg:block">Flowering branches, quiet waters and ornamental borders. Indian-inspired wallpaper murals.</p>
          </div>
          <Image src="/101-designs/amaltas-room.webp" alt="Amaltas from Bagh in a sunlit breakfast room" width={1536} height={1024} priority sizes="(max-width: 1024px) 100vw, 65vw" className="h-auto w-full object-contain object-bottom" />
        </section>
      ) : (
      <div className={`${bgClass} mx-4 mt-3 rounded-[24px] lg:mx-6 lg:mt-4 lg:rounded-[32px]`}>
        <div className="container-x py-5 text-center lg:py-10">
          {collection.is_signature ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-charcoal px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-surface">
              <BadgeIcon badgeKey="signature" className="h-3.5 w-3.5" />
              Signature collection
            </span>
          ) : (
            <span className="caps text-slate">
              {family ? family.title : KIND_LABEL[collection.kind] ?? "Collection"}
            </span>
          )}
          <h1 className="mt-2 text-[clamp(1.6rem,4vw,3.2rem)] lg:mt-3">{keywordTitle(collection.title, handle, family)}</h1>
          <p className="mt-1.5 text-sm text-slate lg:mt-2">
            {`${total} ${total === 1 ? (family?.measurementType === "fixed" ? "artwork" : "design") : family?.measurementType === "fixed" ? "artworks" : "designs"} · ${
              family ? familySummary(family) : "sized to your wall"
            }`}
          </p>
          {handle === "the-lives-within" && (
            <Link href="/concepts/the-lives-within/shop" className="mt-4 inline-flex rounded-full bg-charcoal px-5 py-3 text-sm font-semibold text-surface">
              Choose a wall or the complete look →
            </Link>
          )}
          {/* The fixed-size family says so on its own listing — a shopper must
              not have to open a product to learn it is not sized to your wall. */}
          {family?.measurementType === "fixed" && (
            <p className="mx-auto mt-3 max-w-xl text-xs text-slate">{CANVAS_FIXED_SIZE_STATEMENT}</p>
          )}
          {/* "Wall art" is also what people call a canvas. This listing is the
              wallpaper family, so a canvas searcher is pointed on at once. */}
          {handle === WALLPAPER_LANDING && (
            <p className="mt-3 text-sm text-slate">
              Looking for framed-size canvas wall art?{" "}
              <Link href={`/collections/${CANVAS_LANDING}`} className="link-underline">
                See Canvas Art →
              </Link>
            </p>
          )}
          {(handle === CANVAS_LANDING || handle === "spiritual") && page === 1 && (
            <nav aria-label="Religion" className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <Link href="/wall-art/religion" className="inline-flex min-h-10 items-center rounded-full border border-edge bg-surface px-4 py-2 text-sm hover:bg-charcoal hover:text-surface">
                Religion · Shop by Religion →
              </Link>
            </nav>
          )}
          {/* Shop by size — the canvas family's own landing only, page 1. The
              sizes come from the catalogue (canvas-size-pages.ts). */}
          {sizes.length > 0 && page === 1 && (
            <nav aria-label="Shop canvas by size" className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <span className="caps text-slate">Shop by size</span>
              {sizes.map((s) => (
                <Link
                  key={s.slug}
                  href={`/wall-art/${s.slug}`}
                  className="rounded-full border border-edge bg-surface px-3 py-1 text-xs transition-colors hover:bg-charcoal hover:text-surface"
                >
                  {canvasSizeLabel(s)}
                </Link>
              ))}
            </nav>
          )}
        </div>
      </div>

      )}

      {handle === "ahimsa" && page === 1 && (
        <section className="mx-4 mt-5 overflow-hidden rounded-[24px] bg-[#2b2722] text-[#f6f0e7] lg:mx-6" aria-labelledby="ahimsa-story-heading">
          <div className="container-x grid gap-7 py-6 sm:py-7 lg:grid-cols-[minmax(240px,0.7fr)_minmax(0,1.65fr)] lg:items-center lg:gap-12 lg:py-8">
            <div className="max-w-sm">
              <p className="font-sans text-[0.66rem] font-semibold uppercase tracking-[0.2em] text-[#d8c5aa]">Introduced 2 October 2026 · Khadi · Weave</p>
              <h2 id="ahimsa-story-heading" className="mt-3 font-display text-[clamp(1.9rem,2.8vw,2.7rem)] font-semibold leading-[1.04]">Strength, softly woven.</h2>
              <p className="mt-3 font-sans text-sm leading-relaxed text-[#f6f0e7]">A wallpaper collection shaped by the warmth of khadi and the quiet rhythm of threads held together.</p>
              <p className="mt-3 font-sans text-sm leading-relaxed text-[#cfc4b6]">Eleven mural compositions balance colour, openness and gentle strength for contemporary walls.</p>
            </div>
            <TaashFilm
              src="https://media.zyvorah.com/ahimsa/collection-film/ahimsa-horizontal-hindi-v4.mp4"
              poster="https://media.zyvorah.com/ahimsa/collection-film/ahimsa-horizontal-poster-v4.jpg"
              title="AHIMSA — Strength, Softly Woven"
              style={{ aspectRatio: "16 / 9" }}
              className="w-full rounded-[16px] shadow-[0_18px_44px_rgba(0,0,0,0.26)]"
            />
          </div>
        </section>
      )}

      {handle === NAFAS_COLLECTION_HANDLE && page === 1 && (
        <section className="mx-4 mt-5 overflow-hidden rounded-[24px] bg-[#ffe3ef] text-[#3a2a24] lg:mx-6" aria-labelledby="nafas-story-heading">
          <div className="container-x flex flex-col gap-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:py-7">
            <div className="max-w-xl">
              <p className="font-sans text-[0.66rem] font-semibold uppercase tracking-[0.2em] text-[#c20f62]">Introduced 4 October 2026 · By Nafas, age seven</p>
              <h2 id="nafas-story-heading" className="mt-2 font-display text-[clamp(1.7rem,2.6vw,2.4rem)] font-semibold leading-[1.05]">Faces in colour, animals in pencil.</h2>
              <p className="mt-2 font-sans text-sm leading-relaxed text-[#6e5a50]">{NAFAS_DESCRIPTION}</p>
            </div>
            <Link href={NAFAS_PATH} className="shrink-0 self-start rounded-full bg-[#f2147a] px-5 py-3 font-sans text-sm font-semibold text-white transition hover:bg-[#d90f6b] sm:self-auto">
              Meet Nafas <span aria-hidden>→</span>
            </Link>
          </div>
        </section>
      )}

      {handle === "taash" && page === 1 && (
        <section className="mx-4 mt-7 overflow-hidden rounded-[28px] bg-[#2f211e] text-[#f7eee2] lg:mx-6" aria-labelledby="taash-film-heading">
          <div className="container-x grid items-center gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.15fr)] lg:gap-12 lg:py-12">
            <div className="max-w-md">
              <p className="text-xs uppercase tracking-[0.22em] text-[#dcb8a3]">Mati × Zyvorah · The film</p>
              <h2 id="taash-film-heading" className="mt-4 font-display text-[clamp(2.2rem,4vw,3.8rem)] leading-[1.03]">Every mark has a name.</h2>
              <p className="mt-5 font-serif text-lg leading-relaxed text-[#e0d0c0]">
                From an uncut sheet of playing cards to 21 wallpapers and three quiet grounds. Meet the complete TAASH collection.
              </p>
              <a href="/mati" className="mt-7 inline-block border-b border-[#dcb8a3] pb-1 text-sm text-[#f7eee2] transition hover:text-[#dcb8a3]">Explore the story and designs ↗</a>
            </div>
            <TaashFilm
              src={siteFilm?.src ?? "/films/taash/taash-collection.mp4"}
              poster={siteFilm ? siteFilm.poster : "/films/taash/taash-collection-poster.jpg"}
              title="TAASH, the complete collection film"
              film={siteFilm}
              className="aspect-video w-full rounded-[18px] shadow-[0_20px_50px_rgba(0,0,0,0.25)]"
            />
          </div>
        </section>
      )}

      {siteFilm && handle !== "taash" && shapeOf(siteFilm) === "wide" && (
        <section className="mx-4 mt-7 overflow-hidden rounded-[28px] bg-[#2f211e] text-[#f7eee2] lg:mx-6" aria-labelledby="collection-film-heading">
          <div className="container-x grid items-center gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.15fr)] lg:gap-12 lg:py-12">
            <div className="max-w-md">
              <p className="text-xs uppercase tracking-[0.22em] text-[#dcb8a3]">{collection.title} · The film</p>
              <h2 id="collection-film-heading" className="mt-4 font-display text-[clamp(1.8rem,3.2vw,3rem)] leading-[1.05]">{siteFilm.title}</h2>
              <p className="mt-5 text-sm text-[#e0d0c0]">The film starts silently. Choose “Hear the story” for the narrated version.</p>
            </div>
            <TaashFilm
              src={siteFilm.src}
              poster={siteFilm.poster}
              title={siteFilm.title}
              film={siteFilm}
              style={filmAspect(siteFilm)}
              className="w-full rounded-[18px] shadow-[0_20px_50px_rgba(0,0,0,0.25)]"
            />
          </div>
        </section>
      )}

      {/* Behind the collection — film, stills, a line worth quoting. Blocks
          with no file yet are slots and render nothing (CollectionStory.tsx). */}
      {handle !== "ahimsa" && <CollectionStories blocks={stories} />}

      {/* Room rule 1 on the LIVE page: on a room collection every card shows
          THIS room's render or the flat, never another room's. The first page
          of cards is stamped here for scripts/verify-index-pages.mjs.
          `contents` keeps the wrapper out of the layout. */}
      <div
        className="contents"
        data-flat-cards={products.filter((p) => p.imageIsFlat).map((p) => p.handle).join(",")}
        data-room-page={collection.kind === "room" ? roomKey ?? "" : undefined}
        data-cards={
          collection.kind === "room"
            ? products.map((p) => `${p.handle}:${p.imageIsFlat ? "flat" : p.imageScene ?? ""}`).join(",")
            : undefined
        }
      >
        <CollectionBrowser
          products={products}
          siblings={siblings}
          currentHandle={handle}
          kind={collection.kind}
          facetGroups={facetGroups}
          selectedTags={selectedTags}
          signature={signature}
          newOnly={newOnly}
          childSafe={childSafe}
          flagsAvailable={flagsAvailable}
          sort={sort}
          page={page}
          total={total}
          pageSize={PAGE_SIZE}
          family={family?.measurementType ?? null}
          pinnedRow={trending.length > 0 ? (
            <TrendingPins
              cards={trending}
              placement={handle}
              heading="Trending — configure now"
              kicker="Most added to carts this week"
            />
          ) : null}
        />
      </div>

      {/* Room-specific editorial guidance — on the canonical first page only. */}
      {collection.kind === "room" && page === 1 && ROOM_CONTENT[handle] && (
        <RoomGuide title={collection.title} content={ROOM_CONTENT[handle]} />
      )}
    </div>
  );
}

export const generateMetadata = withBrandMetadata(buildPageMetadata);
