import {axes,label,options} from "@/brand/review/data";
import { JourneyLink } from "./ShoppingJourney";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { unstable_noStore } from "next/cache";
import { BrandHomeLink } from "./BrandHomeLink";
import { BrandWordmark } from "./BrandWordmark";
import { NavSearch } from "./NavSearch";
import { VisualSearch } from "./VisualSearch";
import { WishlistNavIcon } from "./WishlistNavIcon";
import { ShippingBannerText } from "./FreightBasis";
import { ShipToCountry } from "./MarketProvider";
import { CartOrPartnerIcon } from "./PartnerNavBadge";
import { Concierge } from "./Concierge";
import { MobileNav } from "./MobileNav";
import { ScrollHeader } from "./ScrollHeader";
import { MobileBrowseRail, type BrowseLink } from "./MobileBrowseRail";
import { StorefrontOnly } from "./StorefrontOnly";
import { AudienceMenu } from "./AudienceMenu";
import { MegaMenu, type MegaMenuFamily, type MegaMenuGroup } from "./MegaMenu";
import { getCollectionsByKind, getSubCollections } from "@/lib/queries";
import { getShopDestinations, WALLPAPER_CATEGORY, WALLPAPER_FALLBACK, getProductCategory, CANVAS_CATEGORY } from "@/lib/product-category";
import { WORKSPACES } from "@/content/workspaces";
import { HOSPITALITY_SPACES } from "@/content/hospitality";
import { REAL_ESTATE_SPACES } from "@/content/real-estate";
import { hiddenConceptSlugs } from "@/lib/concept-availability";
import { shopConceptsForSegment, SHOP_CONCEPTS, availableHomeBedroomCounts, homeBedroomConceptPath } from "@/lib/shop-concepts";
import { NAFAS_COLLECTION_HANDLE, NAFAS_PATH } from "@/lib/nafas";
import { LORANGE_NAME, LORANGE_PATH, ZYVORAH_KIDS_COLLECTIONS } from "@/lib/lorange-kids";
import { homeMenuCollections } from "@/lib/home-rooms";

// The four things that actually differentiate Zyvorah from a conventional
// wallpaper catalogue — the primary nav leads with these, and the whole
// catalogue sits behind a single "Shop" entry rather than competing with them
// for top-level space. All four still show in the mobile hamburger (see
// MobileNav below); the desktop bar only surfaces DESKTOP_JOURNEYS.
const JOURNEYS = [
  { label: "Find My Wallpaper", href: "/design-with" },
  { label: "See It in My Room", href: "/see-it-in-my-room" },
  { label: "Match a Photo", href: "/match-a-photo" },
  { label: "Your Own Image", href: "/print-your-own" },
];

// See It in My Room duplicates the room visualizer that already lives on
// every product page, and Match a Photo posts to the same /api/visual-search
// endpoint as the camera icon a few slots to its right — two doors onto
// journeys that already have a better-placed door. Desktop keeps the two
// that don't overlap with anything else, one on each side of the wordmark.
const DESKTOP_JOURNEYS = [JOURNEYS[0], JOURNEYS[3]];

const cleanTitle = (title: string) => title.replace(/\s*wallpapers?$/i, "").replace(/['’]\s*$/, "").trim() || title;

// The header is on EVERY page — the storefront, checkout, and every partner
// portal. Its menus are navigation chrome, never the page itself, so a menu
// read that fails (catalogue-cache throws after its deadline) costs that menu,
// not the page. On 28 September 2026 a stalled menu read held pages open to
// Cloudflare's 100 s limit, and Homelane could not reach their portal at all.
//
// The framework's own control-flow signals are NOT failures and must pass
// straight through: `connection()` (inside hiddenConceptSlugs, during
// `next build` only) throws one to say "do not prerender this page". Swallowing it made the build treat
// /colours and friends as static and prerender them, which is how the first
// version of this fence failed CI.
function menuRead<T>(label: string, read: () => Promise<T>, fallback: T): Promise<T> {
  if (process.env.MIMIPIP_LOCAL_REVIEW==="1")return Promise.resolve(fallback);
  return read().catch((err: unknown) => {
    unstable_rethrow(err);
    // Serve this degraded header, but never hold it at the edge for an hour:
    // the next visitor gets a fresh render with the menu back.
    unstable_noStore();
    console.error(`[header] ${label} failed; rendering the header without it`, err);
    return fallback;
  });
}

export async function Header() {
  // Fails CLOSED: if we cannot learn which concepts are hidden, show none of
  // them rather than risk advertising one that is switched off.
  const hiddenConcepts = await menuRead<Set<string> | null>("hidden concepts", ()=>hiddenConceptSlugs(), null);
  // The Shop menu is the shop architecture itself: three product families, each
  // with its own way in, plus Samples and Gift Cards. The families are NOT
  // top-level peers of the wallpaper catalogue — a border is one of three
  // product lines inside the shop, not a rival to the whole of it.
  const [rooms, styles, colours, moods, curated, destinations, wallpaper] = await Promise.all([
    menuRead("rooms", ()=>getCollectionsByKind("room"), []),
    menuRead("styles", ()=>getCollectionsByKind("category"), []),
    menuRead("colours", ()=>getCollectionsByKind("color"), []),
    // Mood was already a filter inside a collection, but 1,300+ mood tags had
    // no landing page — so "show me something serene" was a thing the catalogue
    // knew and the shopper could not ask.
    menuRead("moods", ()=>getCollectionsByKind("mood"), []),
    menuRead("curated", ()=>getCollectionsByKind("curated"), []),
    menuRead("shop destinations", ()=>getShopDestinations(), []),
    menuRead("wallpaper category", ()=>getProductCategory(WALLPAPER_CATEGORY), WALLPAPER_FALLBACK),
  ]);

  // Wallpapers & Murals browses along four axes; the other families are a flat
  // list of sub-collections. An empty sub-collection is never listed: a visitor
  // must never be offered a link to a listing with nothing in it.
  const familyChildren = await Promise.all(
    destinations
      .filter((d) => d.category)
      .map(async (d) => ({
        href: d.href,
        items: await menuRead(
          `sub-collections of ${d.href}`,
          ()=>getSubCollections(d.category!.collectionHandle, d.category!.slug),
          [],
        ),
      })),
  );
  const childrenFor = (href: string) => familyChildren.find((f) => f.href === href)?.items ?? [];

  // The room collections front the "Homes" audience door, not the Shop menu:
  // Homes / For Offices / For Hospitality / For Real Estate is one "who are
  // you buying for" rail, and a living room is the Homes answer to what an
  // office or a hotel lobby is for the doors beside it. Shop keeps only the
  // look-based axes — where a wallpaper goes left the menu with the rooms.
  // Which rooms count as a home is decided (and tested) in src/lib/home-rooms.ts.
  const homesItems = homeMenuCollections(rooms, styles)
    .map((c) => ({ label: cleanTitle(c.title), href: `/collections/${c.handle}` }));

  const kidsItems = ZYVORAH_KIDS_COLLECTIONS
    .map(({ handle }) => rooms.find((c) => c.handle === handle))
    .filter((c): c is NonNullable<typeof c> => c !== undefined)
    .map((c) => ({ label: cleanTitle(c.title), href: `/collections/${c.handle}` }));

  // The commercial doors front the space definitions that already drive
  // /office/[space], /hospitality/[space] and /real-estate/[space] — the nav
  // and the section cannot drift apart, because there is only one list.
  const workspaceItems = WORKSPACES.map((w) => ({ label: w.label, href: `/office/${w.slug}` }));
  const hospitalityItems = HOSPITALITY_SPACES.map((s) => ({ label: s.label, href: `/hospitality/${s.slug}` }));
  const realEstateItems = REAL_ESTATE_SPACES.map((s) => ({ label: s.label, href: `/real-estate/${s.slug}` }));
  // Shoppable concepts inherit their audience placement from their segment.
  // Add a shoppable concept once to the project library and it appears here
  // automatically, as well as on /concepts.
  const conceptMenuItems = (segment: "workplaces" | "hospitality" | "healthcare" | "education" | "retail" | "homes" | "real-estate") =>
    shopConceptsForSegment(segment).filter(concept => hiddenConcepts !== null && !hiddenConcepts.has(concept.slug)).map((concept) => ({
      label: concept.title,
      href: `/concepts/${concept.slug}`,
    }));
  const homeConceptItems = availableHomeBedroomCounts(
    shopConceptsForSegment("homes").filter(concept => hiddenConcepts !== null && !hiddenConcepts.has(concept.slug)),
  ).map(count => ({ label: `${count}-bedroom`, href: homeBedroomConceptPath(count) }));
  const realEstateConceptItems = conceptMenuItems("real-estate");
  const workplaceConceptItems = conceptMenuItems("workplaces");
  const hospitalityConceptItems = conceptMenuItems("hospitality");
  const conceptsFor = (segment: "homes" | "workplaces" | "hospitality" | "real-estate") =>
    `/concepts?space=${segment}`;

  // The Concepts column of "Shop by": every shoppable concept that is switched
  // on, in library order. Fails closed like the audience doors above.
  const allConceptItems = [...homeConceptItems, ...SHOP_CONCEPTS
    .filter((concept) => !concept.segments.includes("homes") && hiddenConcepts !== null && !hiddenConcepts.has(concept.slug))
    .map((concept) => ({ label: concept.title, href: `/concepts/${concept.slug}` }))];

  // "Series & Sets" is no longer an axis. A set is panels cut for one physical
  // thing, so it belongs with the space it is cut for: Phone Booth under
  // For Offices > Phone booths & focus pods (/office/phone-booths), Triple Lift
  // under For Real Estate > Lift lobbies (/real-estate/lift-lobbies). Both
  // spaces already exist in the audience doors; /series stays live.
  const wallpaperGroups: MegaMenuGroup[] = [
    { title: "Concepts", href: "/concepts", items: allConceptItems },
    // Every axis carries its index. The column shows six; named collections are newest first;
    // without a "see all" the seventh onwards is live and unreachable, which is
    // what had happened to 20 of the 26 style collections.
    { title: "By Style", href: "/styles", items: styles.map((c) => ({ label: cleanTitle(c.title), href: `/collections/${c.handle}` })) },
    { title: "By Colour", href: "/colours", items: colours.map((c) => ({ label: cleanTitle(c.title), href: `/collections/${c.handle}` })) },
    { title: "By Mood", href: "/moods", items: moods.map((c) => ({ label: cleanTitle(c.title), href: `/collections/${c.handle}` })) },
    // Unlike By Room / By Colour, a curated collection's name does not say what
    // it is — so this axis needs its index more than any of them: /collections
    // shows a design from each.
    {
      title: "Collections",
      href: "/collections",
      items: curated.map((c) => ({
        label: cleanTitle(c.title),
        href: c.handle === "taash" ? "/mati"
          : c.handle === NAFAS_COLLECTION_HANDLE ? NAFAS_PATH
          : `/collections/${c.handle}`,
      })),
    },
  ].filter((g) => g.items.length > 0);

  // H7 (30 Sep 2026 walkthrough): the mobile drawer's new "Wall art" tile
  // needs a real destination — reuse the same Canvas Art destination the
  // Shop tree already resolved, rather than guessing a collection handle
  // (the wallpaper family's OWN collection handle happens to be "wall-art",
  // which would have silently sent shoppers to wallpaper instead of canvas).
  const wallArtHref = destinations.find((d) => d.category?.slug === CANVAS_CATEGORY)?.href
    ?? `/collections/${WALLPAPER_FALLBACK.collectionHandle}`;

  // The phone's browse axes — the rail under the header and the top of the
  // drawer both read this one list, so they cannot drift apart. Each is an
  // index page that shows a picture per collection, which a phone can scan in
  // a way a sixty-link menu cannot. Wall art only appears when its collection
  // resolved above. Kids & nursery opens the sister brand's shop inside the
  // site (founder, 29 October 2026), which lists Zyvorah's own children's
  // rooms beneath its own collection — so it never depends on a menu read.
  const browseLinks: BrowseLink[] = process.env.MIMIPIP_LOCAL_REVIEW === "1" ? [...axes.map(a=>({label:"Shop by "+label(a),href:"/browse/"+a})),{label:"Floor games",href:"/floor-games/"},{label:"In real homes",href:"/in-real-homes/"}] : [
    // The two first-wall answers lead (7 October 2026): on a phone they were a
    // separate chip row on the homepage only, under the header's own rows.
    { label: "Price my wall", href: "/wall-price" },
    { label: "Samples", href: "/samples" },
    { label: "Rooms", href: "/rooms" },
    { label: "Colours", href: "/colours" },
    { label: "Styles", href: "/styles" },
    { label: "Collections", href: "/collections" },
    { label: "Concepts", href: "/concepts" },
    { label: "New", href: "/new" },
    { label: "Kids & nursery", href: LORANGE_PATH },
    { label: "Wall art", href: wallArtHref },
    { label: "Religion", href: "/wall-art/religion" },
    { label: "Moods", href: "/moods" },
  ];

  const shopFamilies: MegaMenuFamily[] = process.env.MIMIPIP_LOCAL_REVIEW === "1" ? axes.map(a=>({title:"Shop by "+label(a),href:"/browse/"+a,items:options(a).map(v=>({label:label(v),href:"/browse/"+a+"?value="+encodeURIComponent(v)}))})) : [
    // The menu opens on "Shop by" and its five columns. The artist launches
    // (TAASH, Nafas's Face Parade) lead its Collections column, and Shop
    // Concepts is the first column, so neither needs a row of its own here.
    { title: "Shop by", href: `/collections/${wallpaper.collectionHandle}`, groups: wallpaperGroups },
    // Children's rooms get their own row, straight under "Shop by". They were
    // reachable only through Homes > By Room, mixed in with kitchens and
    // foyers, so a parent opening Shop found no way to them at all (founder,
    // 4 October 2026). Youngest first; a room collection that does not exist
    // or is not live simply drops out, like every other menu entry. The row
    // itself, and its first entry, open the L'Orange Kids shop (29 Oct 2026).
    {
      title: "Kids & Nursery",
      href: LORANGE_PATH,
      items: [{ label: `${LORANGE_NAME} shop`, href: LORANGE_PATH }, ...kidsItems],
    },
    ...destinations.map((d) => ({
      title: d.category?.slug === CANVAS_CATEGORY ? "Wall Art" : d.label,
      href: d.href,
      items: [
        ...(d.category?.slug === CANVAS_CATEGORY ? [
          { label: "Religion · Shop by Religion", href: "/wall-art/religion" },
        ] : []),
        ...childrenFor(d.href).map((c) => ({ label: c.title, href: `/collections/${c.handle}` })),
      ],
    })),
  ];


  return (
    <ScrollHeader className="sticky top-0 z-40 bg-cloud/90 backdrop-blur-md">
      {/* The whole shop chrome — shipping banner, nav, journeys, icons — is
          stripped on the casestudy.zyvorah.com outreach host, where the shop
          does not exist. All that remains there is the centred wordmark, which
          leads back to /projects (see BrandHomeLink). */}
      <StorefrontOnly>
        {/* One quiet line: shipping and the delivery country on the left, the
            concierge on the right. The artist collections (TAASH, Nafas's Face
            Parade) left this strip on 4 October 2026 (Roheena) — they live in
            the Shop menu's Collections column and the phone drawer instead. */}
        {/* Worldwide reach stays visible on phones; the destination picker also lives in the mobile menu. */}
        <div className="bg-gradient-to-r from-lavender via-blush to-peach">
          <div className="container-x flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-[0.68rem] font-semibold text-charcoal/80">
              <span className="min-w-0">
                {process.env.MIMIPIP_LOCAL_REVIEW==="1" ? "Wall stickers, borders and wallpapers" : <ShippingBannerText />}
              </span>
              <span aria-hidden className="hidden text-charcoal/30 xl:inline">|</span>
              <ShipToCountry className="min-w-0" />
            </div>
            <div className="hidden shrink-0 md:block">{process.env.MIMIPIP_LOCAL_REVIEW === "1" ? <Link href="/faq">Shopping FAQs</Link> : <Concierge />}</div>
          </div>
        </div>
      </StorefrontOnly>

      <div className="border-b border-edge">
        {/* Positioning context for the Shop mega-menu panel: anchored to the page
            container it can never spill past the viewport, which it did when it
            hung off the Shop button itself. */}
        <div className="container-x relative grid h-16 max-w-[1800px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 sm:gap-4 md:h-20">
          <div className="header-left-rail col-start-1 row-start-1 flex min-w-0 items-center">
          <StorefrontOnly>
            <MobileNav journeys={JOURNEYS} shop={shopFamilies} browse={browseLinks} homeConcepts={homeConceptItems} />
          </StorefrontOnly>
          {/* Shopping and personal journeys sit to the left of the centred logo. */}
          <StorefrontOnly>
          <nav className="hidden min-w-0 items-center gap-4 md:flex xl:gap-5">
            <Link
              href="/new"
              className="whitespace-nowrap rounded-full bg-sage px-3 py-1.5 text-[0.78rem] font-semibold text-charcoal transition-transform hover:scale-105"
            >
              New
            </Link>
            {process.env.MIMIPIP_LOCAL_REVIEW !== "1" && <AudienceMenu
              label="Homes"
              shoppingLinks={[
                { label: "Wall Art", href: wallArtHref },
                { label: "Religion · Shop by Religion", href: "/wall-art/religion" },
              ]}
              pillClassName="bg-peach"
              heading="By Room"
              href="/rooms"
              items={homesItems}
              seeAllLabel="See all rooms"
              secondarySection={{heading:"By Concepts",href:conceptsFor("homes"),items:homeConceptItems,seeAllLabel:"See all home concepts"}}
            />}
            <div className="hidden min-[900px]:block">
              <MegaMenu families={shopFamilies} />
            </div>
            <nav className="header-left-journeys hidden items-center gap-4 min-[1200px]:flex xl:gap-5">
              {(process.env.MIMIPIP_LOCAL_REVIEW === "1" ? [{label:"Find a design",href:"/search"},{label:"Floor games",href:"/floor-games/"},{label:"In real homes",href:"/in-real-homes/"}] : DESKTOP_JOURNEYS).map((journey) => (
                <JourneyLink
                  key={journey.href}
                  href={journey.href}
                  className={`whitespace-nowrap text-[0.82rem] font-medium text-slate transition-colors hover:text-charcoal ${journey.href === "/print-your-own" ? "hidden min-[1500px]:block" : ""}`}
                >
                  {journey.label}
                </JourneyLink>
              ))}
            </nav>
          </nav>
          </StorefrontOnly>
          </div>

          {/* The centre column reserves the wordmark's space even when either
              navigation rail grows after sign-in. */}
          <BrandHomeLink className="col-start-2 row-start-1 shrink-0">
            <BrandWordmark className="h-7 w-auto" />
          </BrandHomeLink>

          <StorefrontOnly>
          <div className="header-right-rail col-start-3 row-start-1 flex min-w-0 items-center justify-end gap-3 xl:gap-5">
            {process.env.MIMIPIP_LOCAL_REVIEW !== "1" && <nav className="header-business-nav items-center gap-3 xl:gap-4">
              <AudienceMenu
                label="For Offices"
                pillClassName="bg-sky"
                heading="By Space"
                href="/office"
                items={workspaceItems}
                seeAllLabel="See all workspaces"
                secondarySection={{ heading: "By Concepts", href: conceptsFor("workplaces"), items: workplaceConceptItems, seeAllLabel: "See all concepts" }}
                className="header-business-door header-business-office"
                align="right"
              />
              <AudienceMenu
                label="For Hospitality"
                pillClassName="bg-lavender"
                heading="By Space"
                href="/hospitality"
                items={hospitalityItems}
                seeAllLabel="See all hospitality spaces"
                secondarySection={{ heading: "By Concepts", href: conceptsFor("hospitality"), items: hospitalityConceptItems, seeAllLabel: "See all concepts" }}
                className="header-business-door header-business-hospitality"
                align="right"
              />
              <AudienceMenu
                label="For Real Estate"
                pillClassName="bg-sage"
                heading="By Space"
                href="/real-estate"
                items={realEstateItems}
                seeAllLabel="See all common areas"
                secondarySection={{ heading: "By Concepts", href: conceptsFor("real-estate"), items: realEstateConceptItems, seeAllLabel: "See all real estate concepts" }}
                className="header-business-door header-business-real-estate"
                align="right"
              />
            </nav>}
            <div className="flex items-center gap-0.5">
              {/* Below sm, five icons ran under the centred wordmark (seen on
                  a 390px iPhone, 6 Oct 2026). Photo search and Account give
                  way there — both are in the phone drawer — leaving search,
                  saved and cart clear of it down to a 360px screen. */}
              <NavSearch />
              {process.env.MIMIPIP_LOCAL_REVIEW !== "1" && <VisualSearch triggerClassName="hidden sm:grid" />}
              <span className="header-saved-icon"><WishlistNavIcon /></span>
              <Link
                href="/account"
                aria-label="Account"
                className="hidden h-10 w-10 place-items-center rounded-full text-charcoal transition-colors hover:bg-wash sm:grid"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="12" cy="8" r="3.6" /><path d="M5 20c1.2-3.6 4-5 7-5s5.8 1.4 7 5" /></svg>
              </Link>
              <CartOrPartnerIcon />
            </div>
          </div>
          </StorefrontOnly>
        </div>
      </div>
      <StorefrontOnly>
        <MobileBrowseRail links={browseLinks} lead={process.env.MIMIPIP_LOCAL_REVIEW === "1" ? <Link href="/faq">Shopping FAQs</Link> : <Concierge />} />
      </StorefrontOnly>
    </ScrollHeader>
  );
}
