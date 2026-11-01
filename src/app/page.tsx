import { InRealHomesSection } from "@/components/InRealHomesSection";

import { SpaceTile } from "@/components/SectionTiles";
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import { brand } from "@/brand/current";
import { homeCampaign, campaignInputs } from "@/brand/editorial";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "@/components/SiteImage";
import { getProductsByHandles, getProductsByTag, getProductsByTags, getShowcasePool, getSignatureRow, getSignatureCollections, getJustIn, getJustInCanvas, getFacetVocab, getMaterialOffers, getCuratedCollections, getPopularCards, getTrendingCards } from "@/lib/queries";
import { createVarietyTracker } from "@/lib/homepage-variety";
import { TRENDING_HANDLES, TRENDING_MATERIAL_SLUG, trendingForHomepage } from "@/lib/trending-pins";
import { TrendingPins } from "@/components/TrendingPins";
import type { MaterialOffer } from "@/lib/queries";
import { getProductCategory, CANVAS_CATEGORY } from "@/lib/product-category";
import { arrangeByAffinity } from "@/lib/aesthetics";

// Without this, the whole page is static — generated once at build time and
// frozen until the next deploy. New designs publish between deploys, so this
// keeps "Just in" (and the daily showcase reshuffle) actually current.
export const revalidate = 3600;

/**
 * The shopfront reads differently to a shopper abroad: the title must not
 * promise India to someone in Denver, and the description quotes the rate this
 * URL's market actually charges. `?market=US` is that country's version of the
 * page (see src/lib/market-seo.ts); the clean URL is India's and x-default.
 */
 async function inheritedGenerateMetadata({
  searchParams,
}: {
  searchParams?: Promise<{ market?: string }>;
}): Promise<Metadata> {
  const { countryCode, alternates } = marketLanding("/", (await searchParams)?.market);
  const home = countryCode === HOME_MARKET;
  const title = home
    ? "Zyvorah | Designer Wallpapers for Homes & Workspaces"
    : `Zyvorah | Wallpaper & Murals Delivered to ${countryPhrase(countryCode)}`;
  const description = home
    ? "Discover designer wallpapers and bespoke wall murals for homes, offices and corporate spaces. Explore designs, preview your walls and create a space with character."
    : `Explore Zyvorah mural wallpaper designs and canvas art from ${marketPriceLabel(CATALOGUE_FLOOR_RATE, countryCode)}/sq ft. ${deliveryPitch(countryCode)}`;
  return {
    title: { absolute: title },
    description,
    openGraph: {
      type: "website",
      siteName: "Zyvorah",
      locale: home ? "en_IN" : `en_${countryCode}`,
      url: alternates.canonical,
      title,
      description,
    },
    twitter: { card: "summary_large_image", title, description },
    alternates,
  };
}

// The face a serif-titled launch (see LaunchCopy.serifHeroTitle) writes its
// name in — the same Cormorant as the /mati title plate. next/font can only
// load at module scope, so the homepage carries this one weight even on days
// no launch uses it; one latin-subset woff2 is the price of the hero matching
// the shopfront it links to.
const launchSerif = {className:"font-display"};
import { ProductCard } from "@/components/ProductCard";
import { ForYouRow } from "@/components/ForYouRow";
import { Reveal } from "@/components/Reveal";
import { Unroll, MeasureLines } from "@/components/Unroll";
import { BadgeIcon } from "@/components/BadgeIcon";
import { FounderNote } from "@/components/FounderNote";
import { sceneKeyForRoom, showsRoom } from "@/lib/rooms";
import { logicalDayKey, logicalDayIndex, seededShuffle, TILE_PALETTE } from "@/lib/dailyRotation";
import { buildHeroCandidates, heroCandidatesForDay, roomSettingOf } from "@/lib/heroRotation";
import { homecomingOfferActive } from "@/lib/homecoming-offer";
import { BAND_FRAME_ASPECT, heroSafe } from "@/lib/image-orientation";
import { pickHeroSlides } from "@/lib/heroSlides";
import HeroSlider from "@/components/HeroSlider";
import { LaunchTeaser } from "@/components/LaunchTeaser";
import { getLaunches, getLaunchCollection, getTeaserImages } from "@/lib/launch-queries";
import { resolveHomepageLaunch, sliderHandles, teaserKicker } from "@/lib/launch";
import { launchCopyFor } from "@/lib/launch-copy";
import { catalogue as reviewCatalogue, axes as reviewAxes, label as reviewLabel, card as reviewCard } from "@/brand/review/data";
import { istMidnight } from "@/lib/ist";
import { MarketMoney, MarketPricingNote } from "@/components/MarketMoney";
import { inMarket } from "@/components/MarketLanding";
import {
  CATALOGUE_FLOOR_RATE,
  countryPhrase,
  deliveryPitch,
  HOME_MARKET,
  marketLanding,
  marketPriceLabel,
} from "@/lib/market-seo";
import type { ShowcaseEntry, ProductCardData } from "@/lib/types";

// How each live material is described. WHICH materials appear, and at what
// price, comes from the catalogue (getMaterialOffers) — a finish that goes
// live, changes rate or turns coming_soon must never need a code edit to be
// told honestly here. Anything without an entry below is skipped rather than
// shown bare. No photography exists yet for a macro/installed shot of any
// finish, so this table stands on facts (price, finish, installation, best
// use) rather than a placeholder image.
//
// Wall Art media (canvas, self-adhesive) are sold at FIXED sizes and their
// per-sq-ft rate is internal — those cards show a finished "from" price and
// must never display the multiple. See MaterialOffer.
const MATERIAL_COPY: Record<string, {
  finish: string;
  installType: string;
  bestUse: string;
  sample?: boolean;
  /** Fallback for a restricted finish with nowhere to send anyone yet — a
   *  plain statement, never a link to an empty listing. */
  availableOn?: string;
}> = {
  "smooth-matt": {
    finish: "Smooth, sheen-free matte — soft to the touch, no visible grain",
    installType: "Paste-the-wall: roll paste on the wall, press the paper on. No soaking.",
    bestUse: "Long-term residential interiors",
    sample: true,
  },
  "self-adhesive-vinyl": {
    finish: "Smooth matte, peel-and-stick — removable, leaves no residue",
    installType: "Peel and stick, by hand",
    bestUse: "Rentals and quick makeovers",
  },
  "eco-cotton-canvas": {
    finish: "Premium eco-cotton canvas — fine-art surface, unframed",
    installType: "Ships rolled — frame or stretch locally",
    bestUse: "Gallery-style pieces in fixed sizes",
  },
  "linen-touch": {
    finish: "A linen feel — texture felt more than seen",
    installType: "Paste-the-wall: roll paste on the wall, press the paper on. No soaking.",
    bestUse: "Elevated residential and commercial interiors",
    availableOn: "Available on selected designs, including Ikat and Calm",
  },
};

// The Signature spotlight is ONE line — four cards, the desktop grid's full
// width. It is a spotlight, not a grid: widening it past a single line is what
// turned it into a second best-sellers block before.
const SIGNATURE_ROW_SIZE = 4;

// ...and the grid takes as many columns as there are cards, so the row is
// always full — four finishes must not render 3 + 1 orphan.
const MATERIAL_GRID_COLS: Record<number, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  // Four only from xl: at lg (1024px) each card was ~200px, its spec values
  // broke one word per line and the CTA labels overflowed their pills.
  // Below xl the sm 2-column grid gives a full 2 × 2.
  4: "xl:grid-cols-4",
  5: "lg:grid-cols-3",
};

// A finish card's CTA. Four cards a row leave ~200px for the pill, so a label
// like "Order a design sample — ₹200" wraps — and `.btn`'s fixed height then
// spilled the second and third lines out over its border. The pill grows with
// its label instead, never shorter than a normal button.
const CARD_CTA = "btn btn-ghost h-auto min-h-[3.2rem] w-full justify-center px-5 py-2.5 text-center text-sm leading-snug";

// The little pill on each "Find your look" tile — always a way to browse,
// never a raw count. Art collections read "Shop by art", colours "Shop by
// colour", and everything else "Shop by style".
function kickerFor(entry: ShowcaseEntry): string {
  const kind = entry.kind as string;
  if (kind === "room") return "Shop by room";
  if (kind === "curated") return "Shop by collection";
  if (kind === "color") return "Shop by colour";
  if (/\b(art|acrylic|canvas|watercolou?r|masterpiece|madhubani|katha)\b/i.test(entry.handle)) return "Shop by art";
  return "Shop by style";
}

/** How many walls the hero shows. Three: see src/lib/heroSlides.ts for what
 *  that costs the no-repeat cycle, and why it was worth it. */
const HERO_SLIDES = 3;

  async function Home({
  searchParams,
}: {
  searchParams?: Promise<{ launch_preview?: string; market?: string }>;
}) {
  // The whole homepage reshuffles automatically at 5 AM IST every day — no
  // cron job or stored state (nothing to fail silently or go stale): the
  // day's picks are a pure function of today's date, so every request already
  // reflects it, and it flips for every visitor the instant 5 AM IST arrives.
  if(process.env.MIMIPIP_LOCAL_REVIEW==='1'){
    const rows=[['Colour & Create','colour-create'],['Borders','mimi-borders'],['Wallpaper worlds','wallpaper-worlds'],['Happy Lines','happy-lines'],['Little Steps, Big Adventures','little-steps-big-adventures']];
    return <div><nav aria-label="Browse designs" className="container-x hidden md:flex flex-wrap justify-center gap-5 py-3">{reviewAxes.map(a=><Link key={a} href={'/browse/'+a}>Shop by {reviewLabel(a)}</Link>)}</nav>
    <section className="relative mx-4 mt-4 overflow-hidden rounded-[32px] lg:mx-6"><div className="relative h-[80vh] min-h-[540px] w-full lg:aspect-video lg:h-auto lg:max-h-[80vh] lg:min-h-0"><HeroSlider label="Featured rooms" slides={['cloud-parade-front-v2','sage-meadow-front-v2','buttercup-morning-front-v2','little-rooftops-front-v2'].map((s,i)=>({image:'/review/assets/'+s+'.webp',content:<div className="absolute inset-x-0 bottom-16 px-8 text-white lg:px-16"><p className="caps">Little spaces, big possibilities</p><h1 className="max-w-3xl text-4xl lg:text-6xl">{['A room for every little story.','Little beginnings. Lovely little worlds.','A color they can call their own.','Room for growing imaginations.'][i]}</h1><Link href={['/browse/collection','/browse/space?value=nursery','/browse/color','/browse/space?value=shared'][i]}>{['Explore the collections','Explore nursery ideas','Shop by Color','Explore shared rooms'][i]} →</Link></div>,alt:['Cloud Parade bedroom' ,'Sage Meadow nursery','Buttercup Morning bedroom','Little Rooftops shared room'][i]}))}><div className="container-x py-12 text-white"><p className="caps">Little spaces, big possibilities</p><h1 className="text-4xl lg:text-6xl">A room for every little story.</h1><Link href="/browse/collection">Explore the collections →</Link></div></HeroSlider></div></section>
    {rows.map(([title,key])=><Unroll key={key} variant="settle"><section className="container-x py-10"><div className="mb-6 flex items-end justify-between"><h2 className="mt-2 text-3xl lg:text-4xl">{title}</h2><Link href={'/browse/collection?value='+key}>See all →</Link></div><div className="grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-4">{reviewCatalogue.filter(p=>p.collection.includes(key)).slice(0,4).map(p=><ProductCard key={p.id} product={reviewCard(p)}/>)}</div></section></Unroll>)}
    <InRealHomesSection />
    <Reveal><section className="container-x py-20"><h2 className="text-3xl lg:text-4xl">Find your look</h2><div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-3">{reviewAxes.map((a,i)=><SpaceTile key={a} href={'/browse/'+a} tile={{slug:a,label:'Shop by '+reviewLabel(a),tease:['Meet the design families.','Start with a favorite shade.','Follow an animal, a story or a theme.','Inspiration for every child.','From newborn nurseries to school-age rooms.','Choose the corner you are decorating.'][i],image:'/review/assets/'+['sage-meadow-front-v2', 'discovery-color-v2', 'discovery-concept-v2', 'discovery-gender-closeup-v3', 'discovery-age-v3', 'sand-and-seed-front-v3'][i]+'.webp',portrait:true}}/>)}</div></section></Reveal>
    <Reveal><section className="container-x pb-16"><h2 className="text-3xl">Materials and ordering</h2><p>Regional prices and ordering details are being prepared.</p></section></Reveal>
    <Reveal><section className="container-x pb-6"><h2 className="text-2xl">Designs for shared places</h2><Link href="/commercial">Commercial projects</Link> · <Link href="/trade">Trade and partners</Link></section></Reveal></div>
  }
  const pool = await getShowcasePool();
  // Studio "Signature" spotlight — an editorial pick (the hero collections and
  // their marquee designs), NOT a bestseller/sales claim. Exactly ONE line,
  // drawn wholly from ONE signature collection (Stallion Spirit / Katha
  // today), rotating daily — see getSignatureRow for the rules. Never widen
  // this past SIGNATURE_ROW_SIZE and never mix collections into the line.
  const canvasCategory = await getProductCategory(CANVAS_CATEGORY);
  // Category rows overfetch (render 4) so the variety dedup below can filter
  // without ever leaving a row short — a limit of exactly 4 would mean any
  // exclusion visibly punches a hole in the row.
  const [signatureRow, signatureCollections, justInRaw, newWallArtRaw, canvasRaw, facetVocab, materialOffers, curatedCollections, popular, trendingRaw] = await Promise.all([
    getSignatureRow(SIGNATURE_ROW_SIZE, new Date(), true),
    getSignatureCollections(),
    getJustIn(12),
    getJustInCanvas(12),
    getProductsByTag(canvasCategory.browseTag, 12),
    getFacetVocab(),
    getMaterialOffers(),
    getCuratedCollections(),
    // Overfetched: the variety rule drops designs already fronted elsewhere on
    // the page, and this row should still fill afterwards.
    // Fails soft to an empty row: the fill below swaps in the leftover designs
    // when behaviour data is thin, and a thin row beats an error page. The
    // reader keeps a day-old copy for the usual case; this is the first-ever
    // miss, or two failures in a row.
    getPopularCards(24).catch((err: unknown) => {
      console.error("[home] popular row unavailable:", err instanceof Error ? err.message : err);
      return { cards: [], fromSales: false };
    }),
    // The two pinned designs (src/lib/trending-pins.ts), with their Soft
    // Matte rate. Fails soft to [] — the row is a promotion, not the page.
    getTrendingCards([...TRENDING_HANDLES], TRENDING_MATERIAL_SLUG),
  ]);
  // Only materials we have copy for — a new finish appears here the moment it
  // gets an entry in MATERIAL_COPY, and never renders half-described.

  const materials = materialOffers
    .map((offer) => {
      const copy = MATERIAL_COPY[offer.slug];
      // A card that fronts a range quotes the range: its rate, its button.
      return { offer, copy };
    })
    .filter((m): m is { offer: MaterialOffer; copy: (typeof MATERIAL_COPY)[string] } => !!m.copy);
  const signatureProducts = signatureRow?.products ?? [];
  // THE homepage variety rule (see AGENTS.md, enforced by homepage-variety.ts):
  // one tracker governs every product row — no design twice, no perceived
  // collection fronted twice. The Signature spotlight claims FIRST: its
  // collection and its four designs are exclusive to it, which is what keeps
  // the Signature collection (the horses today) out of the hero, the tiles
  // and Best sellers alike.
  const variety = createVarietyTracker([...curatedCollections, { handle: 'bagh', tags: ['Bagh'] }]);
  if (signatureRow) variety.claimCollection(signatureRow.collection.handle, signatureRow.collection.tags);
  signatureProducts.forEach(variety.claimDesign);
  // The Trending pins claim next (src/lib/trending-pins.ts): after Signature,
  // whose designs stay exclusive to the spotlight, and before the hero, which
  // asks the tracker before it leads with a design — so a pinned design can
  // appear in its pinned row and nowhere else. Renders only (rule 9), and
  // only artwork the 4:3 pin frame can hold (rule 7).
  const trending = trendingForHomepage(trendingRaw, variety);

  const dayKey = logicalDayKey();
  const dayIndex = logicalDayIndex();
  const shuffled = seededShuffle(pool, dayKey);

  // THE picture rule (AGENTS.md, homepage rule 9): the shop window shows a
  // wallpaper on a wall, never the bare swatch. A design that has no render
  // is not shown here at all — the row fills from the next design that has
  // one — rather than shown flat. Enforced at the one place every row draws
  // from, so a seeding that arrives with flats only (14 September 2026: 24 new
  // designs, twelve swatches across "Just in") drops out instead of leaking.
  const rendered = (arr: ProductCardData[]) => arr.filter((p) => p.image && !p.imageIsFlat);
  // A ROOM entry shows a render OF THAT ROOM or nothing. There is no fallback
  // to "any render": that fallback is what put a toddler's playroom under
  // "Shop by room · Powder Bathroom" (30 September 2026) — the collection had
  // no scene key, so every render qualified. A room with no render of itself
  // returns [] here and drops out of the tiles and the hero; another entry
  // takes its place.
  const roomKeyOf = (entry: ShowcaseEntry) =>
    entry.kind === "room" ? sceneKeyForRoom(entry.handle, entry.rule_tag) : undefined;
  const sceneStrict = (list: ProductCardData[], entry: ShowcaseEntry) => {
    const withRender = rendered(list);
    if (entry.kind !== "room") return withRender;
    const roomKey = roomKeyOf(entry);
    return withRender.filter((p) => showsRoom(p, roomKey));
  };

  // ---------- the hero (homepage rules 5 and 6, see src/lib/heroRotation.ts)
  // The hero image never repeats, and never lands in yesterday's room. Both
  // come out of a CYCLE over every eligible DESIGN — each one leads exactly
  // once before any leads twice — not a daily reshuffle, which repeated inside
  // a fortnight. Still a pure function of the day: no cron, no "already shown"
  // table to drift or fail silently.
  //
  // Signature collections are excluded from the hero outright: they belong to
  // the Signature spotlight (rule 2), and leaving them out is also what keeps
  // the rotation independent of which collection is spotlighted today — so any
  // day's hero is reproducible, which is what the yesterday check below needs.
  const signatureHandles = new Set(signatureCollections.map((c) => c.handle));
  const heroPool = pool.filter((e) => !signatureHandles.has(e.handle));
  const heroLists = await getProductsByTags(
    heroPool.map((e) => e.rule_tag),
    (tag) => {
      const entry = heroPool.find((e) => e.rule_tag === tag);
      return entry ? roomKeyOf(entry) : undefined;
    },
  );
  const heroCandidates = buildHeroCandidates(heroPool, (e) => sceneStrict(heroLists[e.rule_tag] ?? [], e));

  // Yesterday's room, recomputed from the same pure function rather than
  // stored. Claims (which designs other rows took) are deliberately ignored:
  // they varied yesterday and cannot be reconstructed, and the ROOM barely
  // moves with them — near enough to keep two bedrooms apart.
  const yesterdayRoom = heroCandidatesForDay(heroCandidates, dayIndex - 1)[0]?.room ?? null;

  // Today's candidates in cycle order: the first whose collection isn't
  // already fronted, whose design isn't already on the page, and which doesn't
  // repeat yesterday's room. The room check is what covers the seam between
  // one cycle and the next, where two independent shuffles meet.
  const todays = heroCandidatesForDay(heroCandidates, dayIndex);
  const heroSlidePicks = pickHeroSlides(todays, {
    count: HERO_SLIDES,
    yesterdayRoom,
    collectionUsed: (h) => variety.collectionUsed(h),
    designUsed: (h) => variety.designUsed(h),
    claim: (d) => variety.claimDesign(d),
  });
  const heroPick = heroSlidePicks[0]?.candidate ?? null;
  const heroEntry = heroPick?.entry ?? null;
  const hero = heroSlidePicks[0]?.design ?? null;

  // ---------- the launch calendar (src/lib/launch.ts)
  // A live launch takes the hero for its fortnight; a teasing one gets the
  // band under it. `?launch_preview=` moves the clock forward so the 24th can
  // be looked at on the 17th. That parameter cannot leak the collection: it
  // only changes how the homepage is composed, and the products themselves
  // stay drafts in the database until the gate publishes them.
  // A preview day is an Indian calendar day: `new Date("2026-09-24")` is
  // midnight UTC, which is 05:30 IST, so previewing "the 24th" used to start
  // five and a half hours into it.
  const sp = await searchParams;
  // A market landing URL pins the whole shopfront to that country, server-side,
  // so its prices are right in the HTML itself rather than corrected after
  // hydration. The clean URL stays on ordinary edge detection.
  const { landingCountryCode } = marketLanding("/", sp?.market);
  const previewDay = sp?.launch_preview;
  const now = typeof previewDay === "string" && /^\d{4}-\d{2}-\d{2}$/.test(previewDay)
    ? istMidnight(previewDay)
    : previewDay
      ? new Date(previewDay as string)
      : new Date();
  const launches = await getLaunches();
  const { live: scheduledLaunch, teaser: teasingLaunch } = resolveHomepageLaunch(
    launches,
    isNaN(now.getTime()) ? new Date() : now,
  );

  // An editorial return for the already-public TAASH collection. This does
  // not change launch dates, publish products, or retrigger launch emails.
  // Scheduled launches retain priority; the daily rotation resumes afterward.
  const campaignNow = isNaN(now.getTime()) ? new Date() : now;
  const taashCampaign = campaignNow >= istMidnight("2026-09-24")
    && campaignNow < istMidnight("2026-10-23");
  const liveLaunch = scheduledLaunch ?? (taashCampaign
    ? launches.find((launch) => launch.collectionHandle === "taash"
      && !launch.cancelledAt && launch.launchAt <= campaignNow)
    : undefined);

  // A live launch replaces the rotation's three walls with its own. It claims
  // its designs through the same tracker, so rule 1 still holds and a launch
  // design cannot also turn up in Just In further down the page.
  let launchHero: { title: string; handle: string; blurb: string | null } | null = null;
  let launchSlides: ProductCardData[] = [];
  if (liveLaunch) {
    const coll = await getLaunchCollection(liveLaunch.collectionHandle);
    if (coll) {
      const designs = await getProductsByTag(coll.ruleTag, 48);
      // Rule 7 gates a launch's slides exactly as it gates the rotation's —
      // this list once let a tall render through and the shop window led with
      // a ceiling. A hand-picked hero that cannot survive the hero frame gives
      // up its slot to the next eligible design rather than showing a slice.
      const heroEligible = designs.filter((d) => d.image && !d.imageIsFlat && heroSafe(d));
      const eligibleHandles = new Set(heroEligible.map((d) => d.handle));
      const wanted = sliderHandles(
        liveLaunch.heroHandles.filter((h) => eligibleHandles.has(h)),
        heroEligible.map((d) => d.handle),
        HERO_SLIDES,
      );
      launchSlides = wanted
        .map((h) => designs.find((d) => d.handle === h))
        .filter((d): d is ProductCardData => Boolean(d?.image))
        .map((d) => variety.claimDesign(d));
      // Only front the launch when it actually has walls to show. A launch
      // that would render an empty hero silently hands the day back to the
      // rotation rather than breaking the shop window.
      if (launchSlides.length > 0) {
        launchHero = { title: coll.title, handle: coll.handle, blurb: coll.description };
        variety.claimCollection(coll.handle, [coll.ruleTag]);
      }
    }
  }

  // One editorial carousel, using the existing hero frame and movement.
  // The founder-selected collections share one carousel. Preview dates keep
  // the calendar's original behaviour. Every visible design joins the same tracker.
  const campaignActive = !previewDay && homeCampaign.enabled;
  const campaignCards = campaignActive ? await getProductsByHandles(homeCampaign.handles) : [];
  const campaignCopy = homeCampaign.copy;
  const inputs = campaignInputs(homeCampaign);
  const campaignByHandle = new Map(campaignCards.map(card => [card.handle, card]));
  for (const card of inputs.cards) campaignByHandle.set(card.handle, card);
  const campaignOrder = inputs.order;
  const campaignDesigns = campaignActive ? campaignOrder.map(handle => campaignByHandle.get(handle)).filter((card): card is ProductCardData => !!card?.image && !card.imageIsFlat && heroSafe(card)) : [];
  // Never silently publish a partial campaign lineup.
  const mixedCampaign = campaignOrder.length > 0 && campaignDesigns.length === campaignOrder.length;
  const campaignCollections = ["ink", "taash", "bagh", "nafas-face-parade", "angan-by-the-sea"];
  if (mixedCampaign) {
    launchHero = { title: "TAASH", handle: "taash", blurb: null };
    campaignDesigns.forEach(variety.claimDesign);
    for (const handle of campaignCollections) variety.claimCollection(handle, curatedCollections.find(c => c.handle === handle)?.tags ?? [handle]);
  }

  // The teaser's images. Details of a collection that is not buyable yet, so
  // they are read from the collection directly and never claimed against the
  // variety tracker — nothing here is a product the customer can act on.
  let teaser: { title: string; blurb: string | null; images: { image: string; alt: string }[] } | null = null;
  if (teasingLaunch) {
    const coll = await getLaunchCollection(teasingLaunch.collectionHandle);
    if (coll) {
      // Drafts, read directly: the collection being teased is by definition
      // not published yet, so the catalogue query returns nothing for it.
      const pics = await getTeaserImages(coll.ruleTag, 3);
      const images = pics.map((p) => ({ image: p.image, alt: p.title }));
      if (images.length > 0) teaser = { title: coll.title, blurb: coll.description, images };
    }
  }
  const heroList = rendered(heroEntry ? heroLists[heroEntry.rule_tag] ?? [] : []);
  if (heroEntry) variety.claimCollection(heroEntry.handle, [heroEntry.rule_tag]);
  // The four "Find your look" tiles must each carry a DIFFERENT kicker — never
  // "Shop by room" twice — and, like every row, a collection not fronted
  // anywhere else on the page. Pick greedily from the day's shuffle.
  //
  // A tile is only taken once it has a picture that says what the tile says:
  // for a room, a design rendered IN that room (sceneStrict). A room with no
  // such render is passed over for the next entry rather than fronted by a
  // different room — the tile's words and its picture must agree.
  const tileEntries: ShowcaseEntry[] = [];
  const tileLists: ProductCardData[][] = [];
  const tileImgs: ProductCardData[] = [];
  const usedKickers = new Set<string>();
  for (const e of shuffled) {
    if (variety.collectionUsed(e.handle)) continue;
    const k = kickerFor(e);
    if (usedKickers.has(k)) continue;
    const list = sceneStrict(await getProductsByTag(e.rule_tag, 12, roomKeyOf(e)), e);
    // Claims its design as it goes (hero first, then tiles in order), so a
    // later tile can never be left with only designs an earlier one took.
    const pick = variety.pickDesign(list);
    if (!pick) continue;
    usedKickers.add(k);
    variety.claimCollection(e.handle, [e.rule_tag]);
    tileEntries.push(e);
    tileLists.push(list);
    tileImgs.push(pick);
    if (tileEntries.length === 4) break;
  }

  const allLists = [heroList, ...tileLists];

  // Design-level dedup (no design twice, anywhere) runs through the tracker —
  // by product handle, not image URL: the same design can appear as a room
  // render in one spot and its flat pattern in another, and both must count
  // as "already shown". Claim order = priority order (tiles still claim ahead
  // of the category rows even though they now render at row 5).
  // The "sized to your wall" band gets its OWN unique design (it used to echo a
  // tile) — and, like the hero, only artwork its landscape 4:3 window can hold
  // without cropping the composition away (rule 7).
  const bandPick = variety.pickDesignForFrame(BAND_FRAME_ASPECT, ...allLists);
  // This row is now what the shop is actually responding to — orders, then
  // cart/visualise/save, then views (popular_designs, migration 0131). It used
  // to be the LEFTOVERS of the rows above, which meant it could only ever show
  // designs from the four or five collections fronted that day: a design
  // outside them could never reach it however well it sold.
  //
  // It still obeys the variety rule (no design twice, no curated collection
  // fronted twice), and falls back to the old leftover fill if behaviour data
  // is too thin to fill a row — an empty row is worse than a repeated design.
  const popularFiltered = variety.fillRow(rendered(popular.cards), 8, { hardCurated: true });
  const grid = arrangeByAffinity(
    popularFiltered.length >= 4
      ? popularFiltered
      : variety.fillRow(allLists.flat(), 8, { hardCurated: true }),
    facetVocab,
  );
  // Say only what the data supports: "Best sellers" needs orders behind it,
  // and with a handful of orders so far this row is usually interest, not sales.
  const gridIsSales = popularFiltered.length >= 4 && popular.fromSales;
  // The category rows join the same dedup (they bypassed it entirely before).
  // Overfetched above so filtering never leaves them short; arranged AFTER
  // filtering — arrangeByAffinity's clustering depends on final membership.
  const justIn = arrangeByAffinity(variety.fillRow(rendered(justInRaw), 4), facetVocab);
  const newWallArt = arrangeByAffinity(variety.fillRow(rendered(newWallArtRaw), 4), facetVocab);
  const canvasProducts = arrangeByAffinity(variety.fillRow(rendered(canvasRaw), 4), facetVocab);

  // What each row actually shows, stamped on the row for
  // scripts/verify-homepage.mjs, which reads the LIVE page after every deploy
  // and every morning and fails on any homepage rule broken there: a design
  // twice, a swatch, a short row, a collection fronted twice.
  const rowAttrs = (row: string, cards: (ProductCardData | null | undefined)[], collections: string[] = []) => {
    const shown = cards.filter((c): c is ProductCardData => !!c?.image);
    return {
      "data-home-row": row,
      "data-designs": shown.map((c) => c.handle).join(","),
      "data-flat": shown.filter((c) => c.imageIsFlat).map((c) => c.handle).join(","),
      "data-collections": collections.join(","),
    };
  };
  const heroDesigns = (mixedCampaign ? campaignDesigns : launchHero ? launchSlides : heroSlidePicks.map((s) => s.design)).filter((d) => d.image);

  const page = (
    <div>
      {/* Chips on a phone (7 October 2026): as 16px-tall underlined text these
          were the smallest tap targets on the homepage. From sm up they stay
          the quiet text row they were. */}
      {/* md and up only (7 October 2026): on a phone "Price my wall" and
          "Samples" now lead the browse rail in the header, so this second row
          of chips only pushed the hero further down the first screen. */}
      <nav aria-label="Start choosing wallpaper" className="container-x hidden flex-wrap items-center justify-center gap-x-5 py-3 text-sm font-semibold text-charcoal md:flex">
        <span className="w-full text-center text-slate sm:w-auto">First wall?</span>
        {[
          { label: "Find my wallpaper", href: "/design-with" },
          { label: "Price my wall", href: "/wall-price" },
          { label: "Order a sample", href: "/samples" },
          { label: "Which format?", href: "/wallpaper-buying-guide#formats" },
        ].map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="inline-flex min-h-10 items-center rounded-full border border-edge bg-surface px-3.5 sm:min-h-0 sm:border-0 sm:bg-transparent sm:px-0 sm:underline sm:underline-offset-4"
          >
            {l.label}
          </Link>
        ))}
      </nav>
      {/* ---------- hero ---------- */}
      <section className="relative mx-4 mt-4 overflow-hidden rounded-[32px] lg:mx-6">
        <div
          {...rowAttrs("hero", heroDesigns, mixedCampaign ? campaignCollections : launchHero ? [launchHero.handle] : heroEntry ? [heroEntry.handle] : [])}
          // From lg up the frame is never narrower than 16:9 (it is exactly 16:9
          // until 80vh caps it, after which it only gets wider). The TAASH film
          // has its title burned into the left of the picture, and `object-cover`
          // keeps the whole picture only when the frame is at least as wide as
          // the film — at the old 80vh-tall frame (~1.5:1 on a laptop) the title
          // read "AASH" / "i × Zyvorah". Wider-than-16:9 only trims the ceiling,
          // which the floor rule (#8) already allows. Below lg the 9:16 film is
          // used and a taller frame crops only top and bottom.
          className="relative h-[80vh] min-h-[540px] w-full lg:aspect-video lg:h-auto lg:max-h-[80vh] lg:min-h-0"
        >
          {/* Bias the crop to the top: the hero's text + dark gradient sit at
              the BOTTOM, so the top is the display area — keep the mural's
              subject (e.g. the horses' heads) in frame rather than cropping it.
              Three walls now rather than one; the copy in front does not move
              when the picture behind it changes. */}
          <HeroSlider
            label={mixedCampaign ? "Featured wallpaper collections" : launchHero ? `${launchHero.title} — the collection` : "Featured designs"}
            slides={heroDesigns
              .filter((d) => d.image)
              .map((d) => ({
                image: d.image as string,
                alt: d.imageAlt,
                label: mixedCampaign ? campaignCopy[d.handle]?.kicker : undefined,
                ...(mixedCampaign && campaignCopy[d.handle] ? { content: (
                  <div className="container-x relative flex h-full flex-col items-start justify-end pb-14">
                    <span className="rounded-full bg-surface/20 px-4 py-1.5 text-[0.72rem] font-semibold tracking-wide text-surface backdrop-blur-sm">{campaignCopy[d.handle].kicker}</span>
                    <h1 className="hero-title mt-5 max-w-2xl font-display text-[clamp(2.4rem,6vw,4.4rem)] leading-[1.04] text-surface">{campaignCopy[d.handle].title}</h1>
                    <p className="mt-4 max-w-md text-[1.05rem] text-surface/85">{d.handle === "bagh-kamal-bagh"
                      ? <MarketPricingNote india="Free Express Delivery" international="We deliver worldwide" />
                      : campaignCopy[d.handle].description}</p>
                    <div className="mt-8 flex gap-3"><Link href={campaignCopy[d.handle].href} className="btn border-surface bg-surface text-charcoal hover:bg-surface/90">{campaignCopy[d.handle].cta}</Link></div>
                  </div>
                ) } : {}),
                ...(mixedCampaign && d.handle === "ink-venice" ? { video: {
                  desktopSrc: "/media/marketing-media/ink/Ink-header-horizontal.mp4",
                  mobileSrc: "/media/marketing-media/ink/Ink-header-vertical.mp4",
                  desktopPoster: "/media/marketing-media/ink/Ink-header-horizontal.jpg",
                  mobilePoster: "/media/marketing-media/ink/Ink-header-vertical.jpg",
                  href: "/collection/ink", label: "Ink Collection: Venice in three rooms", background: true,
                } } : {}),
                ...((mixedCampaign || launchHero?.handle === "taash") && d.handle === "taash-bisaat-gehra"
                  ? { video: {
                      desktopSrc: "/films/taash-collection-16x9-header-v4.mp4",
                      mobileSrc: "/films/taash-collection-9x16-header-v4.mp4",
                      desktopPoster: "/films/taash-collection-16x9-poster-v4.jpg",
                      mobilePoster: "/films/taash-collection-9x16-poster-v4.jpg",
                      href: launchCopyFor("taash").shopfrontPath ?? "/collections/taash",
                    } }
                  : {}),
              }))}
          >
            <div className="container-x relative flex h-full flex-col items-start justify-end pb-14">
              {launchHero ? (
                // A launch says what it is and where to go. It does not also
                // try to sell the four discovery journeys — for a fortnight,
                // the shop window is about one thing.
                <>
                  <span className="rounded-full bg-surface/20 px-4 py-1.5 text-[0.72rem] font-semibold tracking-wide text-surface backdrop-blur-sm">
                    {launchHero.handle === "taash" ? "Featured collaboration" : "New collection"}
                  </span>
                  <h1
                    className={
                      launchCopyFor(launchHero.handle).serifHeroTitle
                        ? `hero-title mt-5 max-w-2xl ${launchSerif.className} text-[clamp(2.4rem,6vw,4.4rem)] leading-[1.1] tracking-[0.3em] text-surface`
                        : "hero-title mt-5 max-w-2xl font-display text-[clamp(2.4rem,6vw,4.4rem)] leading-[1.04] text-surface"
                    }
                  >
                    {launchHero.title}
                  </h1>
                  {launchCopyFor(launchHero.handle).heroCredit && (
                    // Two houses made this one, so the hero names them under
                    // the wordmark, in the order the printed book does — and
                    // Mati's half is a door to Mati.
                    <p className="mt-3 text-[0.85rem] tracking-[0.18em] text-surface/80">
                      <a
                        href={launchCopyFor(launchHero.handle).heroCredit!.partnerHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline decoration-surface/40 underline-offset-4 hover:decoration-surface"
                      >
                        {launchCopyFor(launchHero.handle).heroCredit!.partner}
                      </a>
                      {" \u00d7 "}
                      {launchCopyFor(launchHero.handle).heroCredit!.house}
                    </p>
                  )}
                  {(launchHero.blurb || launchHero.handle === "taash") && (
                    <p className="mt-4 max-w-md text-[1.05rem] text-surface/85">
                      {launchHero.handle === "taash"
                        ? "Two houses. One deck. Playing cards become pattern, texture and rooms with a character of their own."
                        : launchHero.blurb}
                    </p>
                  )}
                  <div className="mt-8 flex gap-3">
                    {/* ONE button. "Find My Wallpaper" used to sit beside it,
                        but its label promises a browse and delivers the
                        curator — a surprise on the most valuable pixels of the
                        page — and a second button splits the one click the
                        launch exists to earn (Roheena, 7 September). The
                        journeys still live in the nav and further down the
                        page; they just don't photobomb the launch.

                        A launch with a shopfront of its own (TAASH → /mati)
                        sends people there, not to the bare collection grid —
                        the same rule the launch mail already follows. */}
                    <Link
                      href={launchCopyFor(launchHero.handle).shopfrontPath ?? `/collections/${launchHero.handle}`}
                      className="btn border-surface bg-surface text-charcoal hover:bg-surface/90"
                    >
                      See the collection
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <span className="rounded-full bg-surface/20 px-4 py-1.5 text-[0.72rem] font-semibold tracking-wide text-surface backdrop-blur-sm">
                    Original mural wallpaper designs
                  </span>
                  <h1 className="hero-title mt-5 max-w-2xl text-[clamp(2.4rem,6vw,4.4rem)] leading-[1.04] text-surface">
                    Walls worth telling stories about.
                  </h1>
                  <p className="mt-4 max-w-md text-[1.05rem] text-surface/85">
                    Hand-designed wallpaper and murals, cut to your exact wall size in the
                    material you choose.
                  </p>
                  <div className="mt-8 flex gap-3">
                    <Link href="/design-with" className="btn border-surface bg-surface text-charcoal hover:bg-surface/90">
                      Find My Wallpaper
                    </Link>
                    <Link href="/collections/wall-art" className="btn border-surface/40 bg-transparent text-surface hover:bg-surface hover:text-charcoal">
                      Shop Wallpapers
                    </Link>
                  </div>
                  <Link href="/print-your-own" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-surface/85 underline-offset-4 hover:underline">
                    Have your own image? Bring it to your wall. <span aria-hidden>&rarr;</span>
                  </Link>
                </>
              )}
            </div>
          </HeroSlider>
        </div>
      </section>

      {/* ---------- trending pins (src/lib/trending-pins.ts) ----------
           The two designs with repeat cart activity this week, pinned to the
           top slot under the hero with a one-tap "Configure now". A product
           row like any other: it claimed its designs through the variety
           tracker above and is stamped for scripts/verify-homepage.mjs, which
           also checks each pin carries its one-tap link on the live page. */}
      {trending.length > 0 && (
        <Reveal>
          <section className="container-x pt-10">
            <TrendingPins cards={trending} placement="home" attrs={rowAttrs("trending", trending)} />
          </section>
        </Reveal>
      )}

      {/* ---------- free on-wall preview (the reason to choose us over a ₹99 roll:
           you can see the design on your ACTUAL wall, free, before you spend.
           The digital preview is free; only the PHYSICAL design sample is paid —
           this band exists so the free thing is the loud thing. No product row,
           so the homepage variety tracker is not involved. No shopper-visible
           rupee figure, so the market-copy guard passes. ---------- */}
      <Reveal>
      <section className="container-x pt-10">
        <div className="pastel-section grid items-center gap-8 bg-sky/40 text-center md:grid-cols-2 md:text-left">
          <div className="mx-auto max-w-xl md:mx-0">
            <span className="caps text-slate">Try it before you buy</span>
            <h2 className="mt-3 font-display text-[clamp(1.7rem,3.5vw,2.4rem)] leading-tight text-charcoal">
              Not sure how it will look on your wall?
            </h2>
            <p className="mt-3 text-[1.02rem] leading-relaxed text-charcoal/80">
              Upload a photo of your room and preview your favourite wallpaper.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3 md:justify-end">
            <Link href="/see-it-in-my-room" className="btn border-charcoal bg-charcoal text-surface hover:bg-charcoal/90">
              Try it on my wall &rarr;
            </Link>
            <Link href="/samples" className="btn border-charcoal/30 bg-transparent text-charcoal hover:bg-charcoal hover:text-surface">
              Order a design sample
            </Link>
          </div>
        </div>
      </section>
      </Reveal>

      {/* ---------- a collection arriving (src/lib/launch.ts) ---------- */}
      {teaser && teasingLaunch && (
        <Reveal>
          <LaunchTeaser
            launch={teasingLaunch}
            now={isNaN(now.getTime()) ? new Date() : now}
            title={teaser.title}
            kicker={teaserKicker(teasingLaunch)}
            blurb={teaser.blurb ?? "A new collection, landing soon."}
            images={teaser.images}
          />
        </Reveal>
      )}

      {/* ---------- the four discovery journeys — more important than style browsing ---------- */}
      <Reveal>
      <section className="container-x py-16">
        {/* H3 (30 Sep 2026 walkthrough): "See It in My Room" used to sit here
            AND in the "Try it before you buy" band above, both pointing at
            /see-it-in-my-room — two doors to one destination. Removed here;
            the band above is the one door and stays first-time-buyer facing. */}
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { title: "Find My Wallpaper", desc: "Tell us about your room and receive a considered shortlist.", href: "/design-with", bg: "bg-lavender/40" },
            { title: "Match a Photo", desc: "Photograph something you love and find wallpapers that relate to it.", href: "/match-a-photo", bg: "bg-blush/40" },
            { title: "Your Own Image", desc: "Bring your own artwork and we cut it to your exact wall size.", href: "/print-your-own", bg: "bg-peach/40" },
          ].map((j) => (
            <Link key={j.href} href={j.href} className={`${j.bg} flex flex-col justify-between rounded-[22px] p-6 transition-transform hover:-translate-y-0.5`}>
              <div>
                <p className="font-display text-[1.1rem] font-bold text-charcoal">{j.title}</p>
                <p className="mt-2 text-sm text-slate">{j.desc}</p>
              </div>
              <span className="mt-6 text-sm font-semibold text-charcoal">Start &rarr;</span>
            </Link>
          ))}
        </div>
      </section>
      </Reveal>

      {/* ---------- just in (new arrivals, last 30 days) ---------- */}
      {justIn.length > 0 && (
        <Unroll variant="settle">
        <section className="container-x pb-4">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="caps flex items-center gap-1.5 text-mist"><BadgeIcon badgeKey="new" className="h-3.5 w-3.5" /> Fresh off the studio</p>
              <h2 className="mt-2 text-3xl lg:text-4xl">Just in</h2>
              <p className="mt-2 max-w-md text-sm text-slate">
                The newest designs to join the collection.
              </p>
            </div>
            <Link href="/new" className="btn btn-ghost text-sm">View all</Link>
          </div>
          <div {...rowAttrs("just-in", justIn)} className="grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-4">
            {justIn.map((p) => (
              <ProductCard key={p.handle} product={p} />
            ))}
          </div>
        </section>
        </Unroll>
      )}

      {/* ---------- new wall art (canvas, last 30 days) — its own row, never folded into "Just in" above ---------- */}
      {newWallArt.length > 0 && (
        <Unroll variant="settle">
        <section className="container-x pb-4">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="caps flex items-center gap-1.5 text-mist"><BadgeIcon badgeKey="new" className="h-3.5 w-3.5" /> Fresh off the studio</p>
              <h2 className="mt-2 text-3xl lg:text-4xl">New wall art</h2>
              <p className="mt-2 max-w-md text-sm text-slate">
                The newest canvas pieces to join the collection.
              </p>
            </div>
            <Link href={`/collections/${canvasCategory.collectionHandle}`} className="btn btn-ghost text-sm">View all</Link>
          </div>
          <div {...rowAttrs("new-wall-art", newWallArt)} className="grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-4">
            {newWallArt.map((p) => (
              <ProductCard key={p.handle} product={p} />
            ))}
          </div>
        </section>
        </Unroll>
      )}

      {/* ---------- shop by (row 5: after the new-arrival rows, before the spotlight) ---------- */}
      <Reveal>
      <section className="container-x py-20">
        <div className="mb-10 text-center">
          <p className="caps text-mist">Browse by style</p>
          <h2 className="mt-2 text-3xl lg:text-4xl">Find your look</h2>
        </div>
        <div {...rowAttrs("tiles", tileImgs, tileEntries.map((e) => e.handle))} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {tileEntries.map((entry, i) => (
            <Link
              key={entry.handle}
              href={`/collections/${entry.handle}`}
              // Read by scripts/verify-room-pictures.mjs against the LIVE page
              // (AGENTS.md room rule 4): the room this tile names and the room
              // its picture shows. They must match on every deploy and every day.
              {...(entry.kind === "room"
                ? { "data-room": roomKeyOf(entry) ?? "", "data-scene": tileImgs[i]?.imageScene ?? "" }
                : {})}
              className="group relative block aspect-[3/4] overflow-hidden rounded-[22px]"
            >
              {tileImgs[i]?.image && (
                <Image src={tileImgs[i]!.image!} alt="" fill sizes="25vw" className="object-cover transition-transform duration-700 group-hover:scale-105" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-charcoal/50 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5">
                <span className={`inline-block rounded-full ${TILE_PALETTE[i % TILE_PALETTE.length]} px-3 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-charcoal/80`}>
                  {kickerFor(entry)}
                </span>
                <p className="mt-2 font-display text-xl font-bold text-surface">{entry.title}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
      </Reveal>

      {/* ---------- signature spotlight ---------- */}
      {signatureRow && signatureProducts.length > 0 && (
        <Unroll>
        <section className="container-x pb-4">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="caps flex items-center gap-1.5 text-mist"><BadgeIcon badgeKey="signature" className="h-3.5 w-3.5" /> From our studio</p>
              <h2 className="mt-2 text-3xl lg:text-4xl">Signature pieces</h2>
              <p className="mt-2 max-w-md text-sm text-slate">
                Today from <span className="text-charcoal">{signatureRow.collection.title}</span>{" "}
                — one of the collections we&apos;re proudest of, hand-picked by our studio.
              </p>
            </div>
            {/* Every signature collection stays one tap away, with today's
                spotlight marked — the row itself is only ever one of them. */}
            {signatureCollections.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {signatureCollections.map((c) => (
                  <Link
                    key={c.handle}
                    href={`/collections/${c.handle}`}
                    className={`rounded-full border border-charcoal px-4 py-1.5 text-[0.72rem] font-semibold transition-colors ${
                      c.handle === signatureRow.collection.handle
                        ? "bg-charcoal text-surface"
                        : "text-charcoal hover:bg-charcoal hover:text-surface"
                    }`}
                  >
                    {c.title}
                  </Link>
                ))}
              </div>
            )}
          </div>
          {/* One line: grid-cols-4 × SIGNATURE_ROW_SIZE cards. */}
          <div
            {...rowAttrs("signature", signatureProducts, [signatureRow.collection.handle])}
            className="grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-4"
          >
            {arrangeByAffinity(signatureProducts, facetVocab).map((p) => (
              <ProductCard key={p.handle} product={p} />
            ))}
          </div>
        </section>
        </Unroll>
      )}

      {/* ---------- wall art (canvas) ---------- */}
      {canvasProducts.length > 0 && (
        <Unroll variant="settle">
        <section className="container-x pb-4">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="caps text-mist">Canvas & self-adhesive art</p>
              <h2 className="mt-2 text-3xl lg:text-4xl">Wall Art</h2>
              <p className="mt-2 max-w-md text-sm text-slate">
                Our designs on fine-art canvas — ships rolled, ready to frame or stretch — or as
                peel-and-stick self-adhesive wall art.
              </p>
            </div>
            <Link href={`/collections/${canvasCategory.collectionHandle}`} className="btn btn-ghost text-sm">View all</Link>
          </div>
          <div {...rowAttrs("canvas", canvasProducts)} className="grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-4">
            {canvasProducts.map((p) => (
              <ProductCard key={p.handle} product={p} />
            ))}
          </div>
        </section>
        </Unroll>
      )}

      {/* ---------- sized to your wall band ---------- */}
      <Unroll>
      <section className="container-x">
        <div className="pastel-section grid items-center gap-10 bg-lavender/50 md:grid-cols-2">
          <div>
            <span className="caps text-slate">The Zyvorah way</span>
            <h2 className="mt-3 text-3xl lg:text-4xl">Any size. Your wall. Made to fit it.</h2>
            <p className="mt-4 max-w-md text-slate">
              Tell us your wall&apos;s width and height and we price it by the square
              foot. The design is sized to your wall; the smallest order is 20 sq ft
              (at least 4 ft wide). Each design has its own smooth matte surface
              or linen feel.
            </p>
            {/* H2 (30 Sep 2026 walkthrough): the per-sq-ft rate looks random
                design to design unless it's said in words. Real tier names
                only — see src/lib/pricing.ts: Autograph is a named, priced
                tier; "New season / collaborations" covers Saanjha (TAASH) and
                Atelier, which set their own rate rather than inheriting one. */}
            <p className="mt-3 max-w-md text-sm text-slate">
              Prices vary by design, not by size: mural wallpaper starts
              from <MarketMoney inr={CATALOGUE_FLOOR_RATE} />/sq ft; our Autograph
              designs have a linen feel and are exclusive to {brand.name}, with the price
              shown on each design; and new-season collaborations
              like TAASH carry the collaborating artist&apos;s own rate.
            </p>
            <div className="mt-8 flex flex-wrap gap-5">
              {[
                ["01", "Pick a design"],
                ["02", "Enter your wall size"],
                ["03", "We make & ship"],
              ].map(([n, l]) => (
                <div key={n} className="rounded-[18px] bg-surface/70 px-5 py-4">
                  <p className="font-display text-2xl font-extrabold text-charcoal">{n}</p>
                  <p className="mt-1 text-sm text-slate">{l}</p>
                </div>
              ))}
            </div>
            <Link
              href="/print-your-own"
              className="mt-7 inline-flex items-center gap-1.5 text-sm font-semibold text-charcoal underline-offset-4 hover:underline"
            >
              Have your own artwork? Start here <span aria-hidden>&rarr;</span>
            </Link>
          </div>
          <div {...rowAttrs("band", [bandPick])} className="unroll-target relative aspect-[4/3] overflow-hidden rounded-[22px]">
            {bandPick?.image && (
              <>
                <Image src={bandPick.image} alt="" fill sizes="50vw" className="object-cover" />
                <MeasureLines />
              </>
            )}
          </div>
        </div>
      </section>
      </Unroll>

      {/* ---------- surface and feel ---------- */}
      <Reveal>
      <section className="container-x pt-16 pb-6">
        <div className="mb-8 max-w-2xl">
          <p className="caps text-mist">Surface and feel</p>
          <h2 className="mt-2 text-3xl lg:text-4xl">Feel the difference in every design.</h2>
          <p className="mt-2 text-sm text-slate">
            Every wallpaper design has its own surface and its own price. Explore
            the feel here, then see the exact rate on the design page.
          </p>
        </div>
        {/* One card per live finish, on a grid that fits however many there
            are — never a lone card orphaned on a second row. */}
        <div className={`grid gap-6 sm:grid-cols-2 ${MATERIAL_GRID_COLS[materials.length] ?? "lg:grid-cols-3"}`}>
          {materials.map(({ offer, copy }) => (
            /* Cards stretch to the tallest in the row and the CTA is pushed to
               the foot (mt-auto), so every button sits on one line however
               long the copy above it runs. */
            <div key={offer.slug} className="flex h-full flex-col rounded-[22px] border border-edge bg-surface p-6">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-display text-lg font-bold">{offer.slug === "linen-touch" ? "Linen feel" : offer.slug === "smooth-matt" ? "Smooth matte" : offer.name}</h3>
                {/* Wallpaper is priced by design, not by surface. Wall Art
                    quotes the finished price of its smallest size. */}
                <span className="whitespace-nowrap text-sm font-semibold text-charcoal">
                  {offer.family === "wallpaper"
                    ? <>Priced by design</>
                    : <>from <MarketMoney inr={offer.fromPrice ?? 0} /></>}
                </span>
              </div>
              <p className="caps mt-1 text-[0.65rem] text-mist">{offer.family === "wallpaper" ? "Wallpaper · assigned by design" : "Wall Art"}</p>
              {/* A fixed label column with left-aligned values: the three rows
                  line up as a table down every card, instead of each value
                  ragging off its own right edge. */}
              <dl className="mt-4 grid grid-cols-[5.5rem_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-slate">Feel</dt><dd className="text-charcoal">{copy.finish}</dd>
                <dt className="text-slate">Installation</dt><dd className="text-charcoal">{copy.installType}</dd>
                <dt className="text-slate">Best use</dt><dd className="text-charcoal">{copy.bestUse}</dd>
              </dl>
              {/* Only offer a sample of what /samples can actually make and
                  ship today — a CTA for a finish the sample flow doesn't
                  carry takes money for something we can't fulfil. A restricted
                  finish gets no button at all: it isn't chosen design by
                  design, so a "browse" CTA would land the reader in a
                  configurator that then refuses it. */}
              <div className="mt-auto pt-5">
                {offer.restricted ? (
                  /* Borrows .btn's own height and radius so this note occupies
                     exactly the footprint a button would — the row of card
                     feet stays level whichever variant renders. */
                  <p className="flex min-h-[3.2rem] items-center justify-center rounded-[var(--radius-btn)] border-2 border-dashed border-edge px-4 text-center text-[0.82rem] font-semibold leading-tight text-slate">
                    {copy.availableOn ?? "Available on selected designs"}
                  </p>
                ) : copy.sample ? (
                  <Link href="/samples" className={CARD_CTA}>
                    <MarketPricingNote india="Order a design sample — ₹200" international="Samples ship within India only" />
                  </Link>
                ) : offer.family === "wall-art" ? (
                  <Link href={`/collections/${canvasCategory.collectionHandle}`} className={CARD_CTA}>
                    Browse Wall Art
                  </Link>
                ) : (
                  /* A wallpaper finish never falls through to Wall Art. */
                  <Link href="/collections" className={CARD_CTA}>
                    Browse wallpapers
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
      </Reveal>

      {/* ---------- durability & everyday use ---------- */}
      <Reveal>
      <section className="container-x pb-6">
        <div className="pastel-section grid gap-8 bg-sage/30 md:grid-cols-2">
          <div>
            <span className="caps text-slate">Everyday use</span>
            <h2 className="mt-3 text-2xl font-semibold lg:text-3xl">Designed for walls that are lived around.</h2>
            <p className="mt-3 max-w-md text-sm text-slate">
              Nothing extraordinary — just what to expect day to day, and how to look after it.
            </p>
          </div>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-semibold text-charcoal">Cleaning</dt>
              <dd className="mt-1 text-slate">Wipe gently with a barely-damp cloth. Avoid harsh cleaners and scrubbing.</dd>
            </div>
            <div>
              <dt className="font-semibold text-charcoal">Residential use</dt>
              <dd className="mt-1 text-slate">Used every day across bedrooms, living rooms, dining rooms and hallways.</dd>
            </div>
            <div>
              <dt className="font-semibold text-charcoal">Commercial use</dt>
              <dd className="mt-1 text-slate">Choose a design to suit the space; each has its own assigned surface.</dd>
            </div>
            <div>
              <dt className="font-semibold text-charcoal">Kids &amp; nursery rooms</dt>
              <dd className="mt-1 text-slate">Explore designs made for gentle, lived-in spaces.</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="font-semibold text-charcoal">Moisture</dt>
              <dd className="mt-1 text-slate">Not intended for areas with direct water exposure, such as inside a shower.</dd>
            </div>
          </dl>
        </div>
      </section>
      </Reveal>

      {/* ---------- what the shop is responding to ---------- */}
      <Reveal>
      <section className="container-x pt-8 pb-20">
        <div className="mb-10 flex items-end justify-between">
          <div>
            <p className="caps text-mist">Loved right now</p>
            {/* Titled from what the row is actually made of: only orders earn
                "Best sellers". Anything else says what it really is. */}
            <h2 className="mt-2 text-3xl">{gridIsSales ? "Best sellers" : "Most loved this month"}</h2>
          </div>
          <Link href="/collections/wall-art" className="btn btn-ghost text-sm">View all</Link>
        </div>
        <div {...rowAttrs("best-sellers", grid)} className="grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-4">
          {grid.map((p) => (
            <ProductCard key={p.handle} product={p} />
          ))}
        </div>
      </section>
      </Reveal>

      {/* ---------- picked for you — appears only once the visitor's taste is known ---------- */}
      <Reveal>
      <ForYouRow exclude={grid.map((p) => p.handle)} />
      </Reveal>

      {/* ---------- usp strip ---------- */}
      <Reveal>
      <section className="container-x pb-10">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { title: "See it on your wall — free", desc: "Preview any design on your own room photo, no charge", bg: "bg-sky/50", href: "/see-it-in-my-room" },
            { title: "Free shipping in India", desc: "On every order", bg: "bg-peach/50", href: "/shipping-policy" },
            { title: "Order a design sample", desc: "Feel the material before you commit", bg: "bg-blush/50", href: "/samples" },
          ].map((u) => (
            <Link
              key={u.title}
              href={u.href}
              className={`${u.bg} block rounded-[22px] p-7 text-center transition-transform hover:-translate-y-0.5 hover:shadow-md`}
            >
              <p className="font-display text-[1.05rem] font-bold">{u.title}</p>
              <p className="mt-1 text-sm text-slate">{u.desc}</p>
            </Link>
          ))}
        </div>
      </section>
      </Reveal>

      {/* ---------- about zyvorah ---------- */}
      <Reveal>
      <section className="container-x pb-16">
        <div className="pastel-section bg-wash text-center md:text-left">
          <div className="mx-auto max-w-2xl md:mx-0">
            <span className="caps text-slate">About Zyvorah</span>
            <p className="mt-4 text-[1.05rem] leading-relaxed text-charcoal">
              We build wallpaper around the wall&mdash;not around a standard roll. Zyvorah combines
              considered design, exact-size production and digital tools that make choosing and
              ordering wallpaper easier.
            </p>
            <Link href="/our-story" className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-charcoal underline-offset-4 hover:underline">
              Our Story <span aria-hidden>&rarr;</span>
            </Link>
          </div>
        </div>
      </section>
      </Reveal>

      {/* ---------- a note from our founder ---------- */}
      <Reveal>
      <FounderNote />
      </Reveal>

      {/* ---------- commercial discovery ---------- */}
      <Reveal>
      <section className="container-x pb-6">
        <div className="pastel-section grid items-center gap-8 bg-charcoal text-surface md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold lg:text-3xl">Wallpaper for places people remember.</h2>
            <p className="mt-2 text-sm text-surface/75">Hotels, restaurants, offices, retail — designed and produced for commercial spaces.</p>
          </div>
          <div className="flex flex-wrap gap-3 md:justify-end">
            <Link href="/commercial" className="btn border-surface bg-surface text-charcoal hover:bg-surface/90">
              Explore Commercial Wallpaper
            </Link>
            <Link href="/commercial#enquire" className="btn border-surface/40 bg-transparent text-surface hover:bg-surface hover:text-charcoal">
              Submit a Project
            </Link>
          </div>
        </div>
      </section>
      </Reveal>
    </div>
  );
  return inMarket(landingCountryCode, page);
}

export default process.env.MIMIPIP_LOCAL_REVIEW === "1" ? Home : withBrandEditorial("/", Home);
export function generateMetadata() { return process.env.MIMIPIP_LOCAL_REVIEW==="1" ? {title:"MimiPip · Little spaces, big possibilities"} : editorialMetadata("/"); }
