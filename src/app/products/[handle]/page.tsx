import {find as findReview} from "@/brand/review/data";
import {ReviewDetail} from "@/brand/review/pages";

import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import { JAIN_DESIGNS, JAIN_SHORT_RESPECT } from "@/content/jain-temples";
import { isLorangeVendor, LORANGE_FAMILY_LINE, LORANGE_NAME, LORANGE_PATH } from "@/lib/lorange-kids";
import { ShoppingJourney } from "@/components/ShoppingJourney";
import { religiousIdentity, religionHref } from "@/lib/religion";
import { notFound, redirect } from "next/navigation";
import { FreightToPayNote } from "@/components/FreightBasis";
import { isSampleableForPage } from "@/lib/queries";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import {
  getCollectionCards,
  getProductByHandle,
  getRelatedProductCards,
  pickFlatImage,
  sortImages,
} from "@/lib/queries";
import { ProductGallery } from "@/components/ProductGallery";
import { InstalledWalls } from "@/components/InstalledWalls";
import { TaashFilm } from "@/components/TaashFilm";
import { filmAspect, getSiteFilm, shapeOf, videoObjectJsonLd } from "@/lib/site-films";
import { ProductConfigurator } from "@/components/ProductConfigurator";
import { WallBuilderProvider, WallBuilderStage } from "@/components/WallBuilderStage";
import { MobileConfigureBar } from "@/components/MobileConfigureBar";
import { WhatsAppBarButton } from "@/components/WhatsAppButton";
import { SeeOnWallLink } from "@/components/SeeOnWallLink";
import { MarketProvider } from "@/components/MarketProvider";
import { MarketMoney, MarketPricingNote } from "@/components/MarketMoney";
import { fetchPrintRules } from "@/lib/print-rules";
import { BorderConfigurator } from "@/components/BorderConfigurator";
import { BorderPlacementScene } from "@/components/BorderPlacementScene";
import { BORDER_LENGTH_OPTIONS_M, getProductCategory, webMedia, type ProductCategory } from "@/lib/product-category";
import { REAL_ESTATE_SPACES } from "@/content/real-estate";
import { roomForIdeasWalls } from "@/content/projects/room-for-ideas";
import { productFacts, supplyLabel, fixedSizeLabel, wallArtMedia, MEDIUM_LABEL, MEDIUM_SUPPLY } from "@/lib/product-facts";
import { BespokeAddOn, BESPOKE_HANDLE } from "@/components/BespokeAddOn";
import { isServiceHandle, serviceRedirect } from "@/lib/services";
import { DeliveryEstimator } from "@/components/DeliveryEstimator";
import { ProductCard } from "@/components/ProductCard";
import { WishlistButton } from "@/components/WishlistButton";
import { FeaturedReview } from "@/components/FeaturedReview";
import { RecentlyViewed } from "@/components/RecentlyViewed";
import { TasteSignal } from "@/components/TasteSignal";
import { ForYouRow } from "@/components/ForYouRow";
import { RatingSummary } from "@/components/RatingSummary";
import { ProductReviews } from "@/components/ProductReviews";
import { ArrivesBy } from "@/components/ArrivesBy";
import {
  isCeilingProduct,
  isAutographTier,
  AUTOGRAPH_LABEL,
  AUTOGRAPH_EXCLUSIVE_LABEL,
} from "@/lib/pricing";
import {
  CATALOGUE_FLOOR_RATE,
  deliveryPitch,
  HOME_MARKET,
  marketMetadataAlternates,
  marketPriceLabel,
  marketUrl,
  searchMarketFor,
} from "@/lib/market-seo";
import { productAttributesRaw, productRating, productEditionSold } from "@/lib/product-page-reads";
import { JsonLd } from "@/components/JsonLd";
import { ProductAttributes } from "@/components/ProductAttributes";
import { SITE_URL, productJsonLd, productGroupJsonLd, stripHtml, truncate, cleanProductAttributes, designDiscoveryLine, productImageAlt, type RawAttributes } from "@/lib/seo";
import {
  madeToMeasureVariants,
  readySizeVariants,
  canvasSizeVariants,
  borderLengthVariants,
  marketVariant,
  parseReadySizeParam,
  type RepresentativeVariant,
} from "@/lib/variants";
import { normalizeCountryCode } from "@/lib/markets";

// Cache the fully-rendered public catalogue page at the Cloudflare edge. The
// product query is separately stored in VINEXT_KV_CACHE, so an edge miss does
// not turn every product view into a database request.
export const revalidate = 3600;

const ART_STORIES = {
  matsya: {
    heading: "The world worth carrying",
    introduction: "An immense fish fills the sky above a delicate world of boats, trees and human places. Hear the story held in the painting.",
    film: "https://media.zyvorah.com/art-films/matsya-karma-river/matsya-landscape-v2.mp4",
    poster: "https://media.zyvorah.com/product-images/matsya-karma-river/matsya-living-v1.webp",
    companion: { name: "Karma", handle: "karma", text: "The waters recede. Life begins again, and the work of renewal becomes ours." },
  },
  karma: {
    heading: "What happens after the waters",
    introduction: "A small fish, returning growth and a vessel on deep blue water carry the next chapter of the story.",
    film: "https://media.zyvorah.com/art-films/matsya-karma-river/karma-landscape-v2.mp4",
    poster: "https://media.zyvorah.com/product-images/matsya-karma-river/karma-reading-v1.webp",
    companion: { name: "Matsya", handle: "matsya", text: "Return to the beginning: the protecting presence that carries a vulnerable world through pralaya." },
  },
} as const;

/**
 * The lowest rate THIS design is actually sold at on the website, for the
 * "from" pitch in its meta description.
 *
 * This used to be the hardcoded catalogue floor (₹200), which is true only of
 * a standard-tier design. Every premium design under-quoted itself in Google
 * results and social cards by up to half — TAASH sells at ₹400 and advertised
 * ₹200 — which is a price the page will not honour, exactly the failure the
 * webMedia() gate exists to prevent a few functions below. So the floor is
 * read off the design's own sellable finishes through that same gate, and
 * falls back to the catalogue figure only when a product carries no priced
 * material at all.
 */
function fromRateFor(
  p: { product_materials?: { available: boolean | null; price_per_sqft: number | string | null; materials: { slug: string } | null }[] | null },
  category: Pick<ProductCategory, "webMaterialSlug">,
): number {
  const priced = webMedia(
    (p.product_materials ?? [])
      .filter((m) => m.available && m.materials)
      .map((m) => ({ slug: m.materials!.slug, rate: Number(m.price_per_sqft) })),
    category,
  ).filter((m) => m.rate > 0);
  return priced.length ? Math.min(...priced.map((m) => m.rate)) : CATALOGUE_FLOOR_RATE;
}

/** Shared unique meta description for a product (used by <head>, OG and
 *  JSON-LD). The price pitch follows the FAMILY — a fixed-size wall-art piece
 *  or a per-metre border must never be described as a per-sq-ft mural — and
 *  the CURRENCY follows the market this URL is published for, so the snippet
 *  Google shows an American searcher quotes the dollars that page charges. */
function productDescription(
  title: string,
  description: string | null | undefined,
  family: "area" | "length" | "fixed" = "area",
  fromRate: number = CATALOGUE_FLOOR_RATE,
  countryCode: string = HOME_MARKET,
  attributes?: ReturnType<typeof cleanProductAttributes> | null,
): string {
  const text = stripHtml(description);
  const discovery = designDiscoveryLine(attributes);
  const snippet = discovery
    ? truncate(`${title}. ${discovery}`, 108)
    : text ? truncate(text, 108) : `${title}, an original mural wallpaper design for your space.`;
  const delivery = deliveryPitch(countryCode);
  const pitch =
    family === "fixed"
      ? `In fixed finished sizes. ${delivery}`
      : family === "length"
        ? `Sold by the linear metre. ${delivery}`
        : `From ${marketPriceLabel(fromRate, countryCode)}/sq ft. ${delivery}`;
  return `${snippet} ${pitch}`;
}
type FixedMetaProduct = {
  title: string;
  ready_sizes?: [number, number][] | null;
  product_materials?: { available: boolean | null; materials: { slug: string } | null }[] | null;
};

/** The media a fixed-size piece is really on sale in ON THE WEBSITE — the one
 *  source both the <head> title and description read, so neither can invent a
 *  medium. Filtered through the category's declared web medium: a wall-art
 *  design may also carry the self-adhesive row for Amazon FBA, and that must
 *  not make the page title hedge to "Wall Art" (or drop the medium from the
 *  description) when the website only ever sells the canvas. */
function fixedMedia(p: FixedMetaProduct, webMaterialSlug: string | null) {
  const slugs = (p.product_materials ?? [])
    .filter((m) => m.available && m.materials)
    .map((m) => m.materials!.slug);
  const web = webMaterialSlug ? slugs.filter((sl) => sl === webMaterialSlug) : slugs;
  return wallArtMedia(web.length ? web : slugs);
}

/** What to call the piece in a title. People search for a "canvas painting"
 *  of a size ("6 feet by 4 feet painting"), not for "fixed-size canvas art",
 *  so a canvas is titled the way it is searched for; a piece sold only as
 *  peel & stick must still never be called canvas. */
function fixedFamilyNoun(p: FixedMetaProduct, webMaterialSlug: string | null): string {
  const media = fixedMedia(p, webMaterialSlug);
  if (media.length === 1) return media[0] === "canvas" ? "Canvas Painting" : "Self-Adhesive Wall Art";
  return "Wall Art";
}

/** "4 × 6 ft" when both sides are whole feet (how the size is typed into a
 *  search box), else the exact feet-and-inches label. */
function compactSize(widthIn: number, heightIn: number): string {
  if (widthIn % 12 === 0 && heightIn % 12 === 0) return `${widthIn / 12} × ${heightIn / 12} ft`;
  return fixedSizeLabel(widthIn, heightIn);
}

/** The <head> title for a fixed-size piece: the design, what it is, and the
 *  sizes it comes in — the size is the query, so it belongs in the title and
 *  not only three sentences into the description. At most two sizes, so the
 *  title stays inside what Google shows. */
function fixedSizeTitle(p: FixedMetaProduct, webMaterialSlug: string | null): string {
  const noun = fixedFamilyNoun(p, webMaterialSlug);
  const sizes = (p.ready_sizes ?? []).map(([w, h]) => compactSize(w, h));
  const shown = [...sizes].reverse().slice(0, 2).reverse();
  const head = `${p.title} ${noun}`;
  const withSizes = shown.length ? `${head} — ${shown.join(" & ")}` : head;
  return `${withSizes.length <= 62 ? withSizes : head} | Zyvorah`;
}

/** The <head> description for a fixed-size piece. Both the medium and the
 *  sizes are read off THIS product — the medium because a self-adhesive piece
 *  must never be advertised as canvas, and the sizes because they follow each
 *  artwork's own shape, so there is no one range to quote for the family. */
function fixedSizeDescription(p: FixedMetaProduct, webMaterialSlug: string | null, countryCode: string): string {
  // Each size is given both ways round ("4 × 6 ft, i.e. 6 × 4 feet") because
  // searchers type it both ways round. "Not sized to your wall" used to open the
  // snippet's second sentence — true, and said on the page itself, but a
  // negative is a poor first thing for a search result to say.
  const sizes = (p.ready_sizes ?? []).map(([w, h]) => {
    const size = compactSize(w, h);
    return w !== h && w % 12 === 0 && h % 12 === 0 ? `${size} (${h / 12} × ${w / 12} feet)` : size;
  });
  const media = fixedMedia(p, webMaterialSlug);
  const what =
    media.length === 1 ? (media[0] === "canvas" ? "canvas painting on eco-cotton canvas" : "self-adhesive wall art") : "wall art";
  const range = sizes.length ? ` in ${sizes.join(", ")}` : " in a fixed finished size";
  return `${p.title} ${what}${range}. ${deliveryPitch(countryCode)}`;
}

import { productBadges } from "@/lib/badges";
import { BadgeIcon } from "@/components/BadgeIcon";

// Shown on Founder's Favourite pieces when no per-product note is set — written
// in the founder's voice, so even the un-personalised ones feel personal.
const DEFAULT_FOUNDERS_NOTE =
  "This is one of my personal favourites — and I've only ever marked a handful. If it caught your eye too, we clearly share a soft spot for it. Wherever it ends up in your home, I hope it makes you pause and smile a little every time you walk past.";
const FOUNDERS_SIGNATURE = "— Roheena, Founder";

// How far a flat's aspect may sit from 1:1 and still be framed by the square
// hero. Inside this band the crop takes only a sliver off a repeating pattern;
// outside it the crop starts eating the composition (a 1.5 flat loses a third,
// a 2:1 mural loses half), so the frame takes the artwork's shape instead.
const SQUARE_TOLERANCE = 0.1;

/** The <head> title for a mural wallpaper design. A design name alone
 *  ("Chateau Village") tells a searcher nothing about what is on the wall or
 *  where it goes, and Search Console showed the result: impressions on
 *  descriptive searches, clicks only on the brand. So the title carries the
 *  design's first subject and first room from its own attributes, falling
 *  back step by step to keep inside what Google displays (~60 characters
 *  before " | Zyvorah"). A subject already in the name is not repeated. */
function muralTitle(title: string, attributes: ReturnType<typeof cleanProductAttributes> | null): string {
  const has = (word: string) => title.toLowerCase().includes(word.toLowerCase());
  const subject = attributes?.subjects.find((s) => s.length <= 20 && !has(s));
  const room = attributes?.rooms.find((r) => r.length <= 20 && !/commercial|office|hotel|restaurant/i.test(r));
  const noun = /wallpaper|mural/i.test(title) ? "" : "Wallpaper Mural";
  const candidates = [
    subject && room ? `${title} — ${subject} ${noun || "Mural"} for ${room}` : null,
    subject ? `${title} — ${subject} ${noun || "Mural"}` : null,
    room ? `${title} ${noun} for ${room}`.replace(/\s+/g, " ") : null,
    `${title} ${noun} — Custom Size`.replace(/\s+/g, " "),
  ].filter((c): c is string => !!c);
  const fit = candidates.find((c) => c.length <= 60) ?? candidates[candidates.length - 1];
  return `${fit} | Zyvorah`;
}

 async function buildPageMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ market?: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  if(process.env.MIMIPIP_LOCAL_REVIEW==='1'){const p=findReview(handle);return {title:p?.name??'Design not found',description:p?.description};}
  const p = await getProductByHandle(handle, true);
  if (!p) return { title: "Product" };

  // Which country's page THIS URL is. Only a published search market earns its
  // own indexable variant; everything else answers as the home market, so a
  // stray ?market=XX cannot mint a new URL for every design.
  const marketCode = searchMarketFor((await searchParams).market);

  const ogImageRow = sortImages(p.product_images ?? [])[0];
  const ogImage = ogImageRow?.url;
  // A service isn't a "wallpaper mural, custom size, from ₹200/sq ft" — titling
  // it that way misdescribes a flat-fee studio service in search results. The
  // same goes for the other two families: a border is sold by the linear metre
  // and a canvas at a fixed finished size. Neither is a custom-size mural.
  const service = isServiceHandle(p.handle);
  const category = await getProductCategory(p.category);
  const family = category.measurementType;
  const attributes = family === "area" && !service ? cleanProductAttributes(await productAttributesRaw(handle)) : null;
  const officeWallNumber = /^room-for-ideas-(\d{2})$/.exec(handle)?.[1];
  const officeWall = family === "area" && officeWallNumber
    ? roomForIdeasWalls.find((wall) => wall.number === officeWallNumber)
    : undefined;
  const title = service
    ? `${p.title} — a Zyvorah service | Zyvorah`
    : family === "length"
      ? `${p.title} — ${category.title}, Sold Per Linear Metre | Zyvorah`
      : family === "fixed"
        ? // "Canvas Art" is the family's name, not a promise about the medium —
          // a piece sold only as peel & stick must not be titled canvas.
          fixedSizeTitle(p, category.webMaterialSlug)
        : officeWall
          ? `${officeWall.title} — ${officeWall.space} Wall Mural | Zyvorah`
        : p.handle.startsWith("piano-")
          ? `${p.title} Piano Wall Mural | Zyvorah`
        : muralTitle(p.title, attributes);
  const description = service
    ? truncate(stripHtml(p.description) || `${p.title}, a Zyvorah studio service.`, 155)
    : family === "length"
      ? `${p.title}, priced at ${marketPriceLabel(Number(p.price_per_metre ?? 0), marketCode)} per linear metre and supplied as ${supplyLabel(
          Math.max(category.minOrderQty, category.fixedLengthM ?? 1),
          p.supply_format ?? null,
          p.segment_length_m ?? null,
        )}. ${deliveryPitch(marketCode)}`
      : family === "fixed"
        ? fixedSizeDescription(p, category.webMaterialSlug, marketCode)
        : officeWall
          ? truncate(`${officeWall.title} for the ${officeWall.space.toLowerCase()} — a mural wallpaper design from Zyvorah's Room for Ideas office collection. Room image is a visualisation.`, 155)
        : productDescription(p.title, p.description, family, fromRateFor(p, category), marketCode, attributes);
  const path = `/products/${handle}`;
  const url = `${SITE_URL}${marketUrl(path, marketCode)}`;

  return {
    title: { absolute: title },
    description,
    ...(religiousIdentity(p.handle, (p.product_tags ?? []).map((t) => t.tag)) ? { robots: { index: false, follow: false } } : {}),
    alternates: marketMetadataAlternates(path, marketCode),
    openGraph: {
      type: "website",
      title,
      description,
      url,
      siteName: "Zyvorah",
      ...(ogImage ? { images: [{ url: ogImage, alt: ogImageRow.alt || productImageAlt(p.title, ogImageRow, attributes) }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  };
}

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ colourway?: string; w?: string; h?: string; sample?: string; material?: string; size?: string; length?: string; market?: string; edit?: string; configure?: string }>;
}) {
  const { handle } = await params;
  if(process.env.MIMIPIP_LOCAL_REVIEW==='1'){const p=findReview(handle);if(!p)notFound();return <ReviewDetail p={p} colourway={handle === "happy-petals" ? (await searchParams).colourway : undefined}/>;}
  const sp = await searchParams;
  // These room references are prepared and proofed for each measured wall.
  // Keep their catalogue cards shoppable through the verified collection flow.
  if (handle.startsWith("concept-the-lives-within-")) {
    redirect(`/concepts/the-lives-within/shop?design=${encodeURIComponent(handle)}`);
  }
  // `?configure=1` is the one-tap link from a Trending pin
  // (src/lib/trending-pins.ts): the page opens INSIDE the wall builder — the
  // preview up, the measure step on screen — instead of on the gallery, so a
  // shopper who has already seen the design on a card is measuring, not
  // browsing. Only the made-to-measure configurator honours it.
  const autoStartConfigure = sp.configure === "1";
  // Coming from a curation pick with a wall size already given, or asking
  // straight for a sample — the customer shouldn't have to re-enter either.
  // Google Shopping deep links additionally carry material (made-to-measure)
  // or size (ready-size ladders) so the advertised configuration is the one
  // the page opens with.
  const initialWidthFt = sp.w ? Number(sp.w) : undefined;
  const initialHeightFt = sp.h ? Number(sp.h) : undefined;
  const autoOpenSample = sp.sample === "1";
  const landingMarket = normalizeCountryCode(sp.market);
  // Structured data follows the market this URL is CANONICAL for, not any
  // ?market= a link carried: ?market=GB canonicalises to the India page, so
  // its markup must be in rupees too, or Google reads a USD price on an INR
  // page. Only a published search market (searchMarketFor) earns its own.
  const seoMarket = searchMarketFor(sp.market);
  const [product, printRules] = await Promise.all([getProductByHandle(handle, true), fetchPrintRules()]);
  if (!product) notFound();
  const jainPresentation = JAIN_DESIGNS.some(d => d.handle === product.handle);
  const faithIdentity = religiousIdentity(product.handle, (product.product_tags ?? []).map((t) => t.tag));
  // New faith artwork carries a reviewed first paragraph. Explain the subject
  // before the purchase controls as well as in the full Description accordion.
  const depiction = faithIdentity && product.description?.startsWith("<p><strong>What this artwork depicts</strong>")
    ? stripHtml(product.description.split("</p>")[0]).replace(/^What this artwork depicts/, "").trim()
    : null;

  // A service is not a design. `custom-wallpaper` has no artwork at all — it's
  // just the SKU the Print Your Own flow puts in the cart — so send visitors to
  // the real experience instead of an empty product page.
  const away = serviceRedirect(product.handle);
  if (away) redirect(away);

  // Gallery order: the styled/featured hero first, then the room shots by
  // position, and the clean flat wallpaper image ALWAYS last — every product
  // must show one plain image of the wallpaper itself, as the final image.
  // sortImages owns that order; the inline sort it replaces let a flat that
  // had been marked featured lead the gallery.
  const images = sortImages(product.product_images ?? []);
  const artStory = ART_STORIES[product.handle as keyof typeof ART_STORIES];

  // The visualizer must map the clean flat pattern onto the customer's wall,
  // never the styled lifestyle hero (which has its own furniture baked in).
  const flatImage = pickFlatImage(product.product_images ?? []);

  // The category decides how this product is bought. Wallpapers are measured
  // and priced by area; Borders are a fixed design sold by the linear metre,
  // with no materials, measurements, visualiser or samples; Canvas Art is a
  // finished piece in one of six sizes, never cut to a wall.
  const category = await getProductCategory(product.category);

  // Canvas Art sells in ONE medium on the website — eco-cotton canvas, rolled
  // and framed by the customer. A wall-art design may also carry the
  // self-adhesive medium, but that row belongs to Amazon FBA, not to this page:
  // offering it here would sell a peel & stick good off a page promising an
  // unframed canvas, and its cheaper rate would set a "from" price the website
  // cannot honour. webMedia() is the one gate for that (migration 0065).
  const materials = webMedia(
    (product.product_materials ?? [])
      .filter((m) => m.available && m.materials)
      .map((m) => ({
        slug: m.materials!.slug,
        name: m.materials!.name,
        description: m.materials!.description,
        pricePerSqFt: Number(m.price_per_sqft),
        comingSoon: m.materials!.coming_soon,
        swatchUrl: m.materials!.swatch_url ?? null,
        textureUrl: m.materials!.texture_url ?? null,
        rollWidthMm: m.materials!.roll_width_mm ?? null,
      })),
    category,
  ).sort((a, b) => Number(a.comingSoon) - Number(b.comingSoon) || a.pricePerSqFt - b.pricePerSqFt);

  const fromPrice = materials.filter((m) => !m.comingSoon).length
    ? Math.min(...materials.filter((m) => !m.comingSoon).map((m) => m.pricePerSqFt))
    : null;

  // Child's-name personalisation is offered on children's designs. Kids/teen
  // rooms auto-select it (the name usually exists); nursery offers it but leaves
  // it off (the baby may be unnamed). Other designs don't show it at all.
  // Sample eligibility is checked against verified artwork and available stock — one
  // computation feeds every sample surface on this page (gallery pill,
  // configurator CTA, spec row), so they can never disagree.
  const sampleable = category.supportsSamples && await isSampleableForPage(product.handle);
  const tagList = (product.product_tags ?? []).map((t) => t.tag.toLowerCase());
  const isBagh = tagList.includes("bagh");
  // A design specified for a building's COMMON areas — one that carries any
  // shop-by-space tag from /real-estate. These are bought by a developer or
  // an architect for a lobby, a floor or a whole property, which is a
  // conversation rather than a cart, so they get a route to one.
  const projectSpaces = REAL_ESTATE_SPACES.filter((sp) =>
    tagList.includes(sp.tag.toLowerCase()),
  );

  // The other tower's light. A programme that ships one artwork in two
  // colourways names them `<family>-dusk` and `<family>-dawn`, and a buyer
  // choosing for one tower should be able to reach the other from here —
  // which is the practical form of "can this be adapted per tower?".
  //
  // Looked UP, never assumed: getCollectionCards returns only ACTIVE
  // products, so an unbuilt or unpublished colourway renders no link rather
  // than a dead one.
  const colourway = /^(.*)-(dusk|dawn)$/.exec(product.handle);
  const siblingHandle = colourway
    ? `${colourway[1]}-${colourway[2] === "dusk" ? "dawn" : "dusk"}`
    : null;
  const [sibling] = siblingHandle && projectSpaces.length
    ? await getCollectionCards([siblingHandle])
    : [];
  const siblingTower = colourway?.[2] === "dusk" ? "Dawn" : "Dusk";
  // Only a space a development builds ONCE PER TOWER can honestly claim the
  // two-tower framing. A shared amenity's second colourway is a palette
  // option, not another gym.
  const perTower = projectSpaces.some((sp) => sp.perTower);
  // Autograph — the top price category. Exclusive to zyvorah.com, so an
  // Autograph design NEVER shows the "also on Amazon" link below, whatever the
  // marketplace table happens to say.
  const isAutograph = isAutographTier(product.price_tier);
  // Where else this exact design can be bought. Only ever populated from a
  // VERIFIED ASIN — see getAmazonListing — so a missing one renders nothing
  // rather than guessing a link to somebody else's product.
  const perMetre = category.measurementType === "length";
  const isFixedSize = category.measurementType === "fixed";
  // Standard delivery (5 working days to dispatch, then up to 5 in transit —
  // src/lib/shipping.ts) is what checkout actually promises for wallpaper,
  // borders AND canvas/wall art alike; the TAASH book is the one exception —
  // it's a pre-order dispatched separately "when it is ready" (checkout's
  // hasPreorderBook branch) — and the bespoke Custom Print Studio SKU has no
  // fixed catalogue turnaround to quote honestly.
  const standardDispatchEligible = !jainPresentation && category.slug !== "book" && product.handle !== BESPOKE_HANDLE;
  const pricePerMetre = Number(product.price_per_metre ?? 0);
  const minMetres = category.minOrderQty;
  const nameAudience: "kids" | "nursery" | null = tagList.some((t) =>
    ["kids", "teen", "toddler", "toddler rooms", "play school", "play area", "play areas", "kids playroom", "kids' playroom", "children", "children's room"].includes(t),
  )
    ? "kids"
    : tagList.some((t) => ["nursery", "baby", "baby nursery", "baby nurseries"].includes(t))
      ? "nursery"
      : null;
  const relatedCandidates = await getRelatedProductCards(
    product.handle,
    (product.product_tags ?? []).map((t) => t.tag),
    4,
  );
  const related = isFixedSize
    ? relatedCandidates.filter((p) => p.category === (product.category ?? "canvas"))
    : relatedCandidates;

  // Structured data: Product (offers/brand/sku/shipping/returns + rating + attributes) + breadcrumb.
  const [ratingData, attrRaw, editionSoldData, siteFilm] = await Promise.all([
    // Cached and deadline-bound (src/lib/product-page-reads.ts): a stalled
    // read renders without it rather than holding the page to a 524.
    productRating(handle),
    productAttributesRaw(handle),
    product.edition_limit ? productEditionSold(handle) : Promise.resolve(null),
    // The cleared Library film filed with this product's link, if any
    // (src/lib/site-films.ts). It replaces the hardcoded films below when its
    // shape fits their frame; a product with no hardcoded film gets its own.
    getSiteFilm("product", product.handle),
  ]);
  const wideFilm = siteFilm && shapeOf(siteFilm) === "wide" ? siteFilm : null;
  const tallFilm = siteFilm && shapeOf(siteFilm) === "tall" ? siteFilm : null;
  // Limited edition: how many of the edition remain. Real sales only (paid
  // onwards) consume the edition; never negative even if oversold.
  const editionLimit = product.edition_limit ?? null;
  const editionRemaining = editionLimit != null
    ? Math.max(0, editionLimit - (Number(editionSoldData) || 0))
    : null;
  const rating = ratingData as { count: number; average: number } | null;
  const attributes = cleanProductAttributes(attrRaw as RawAttributes | null);
  const discoveryLine = designDiscoveryLine(attributes);
  const discoveryImages = images.map((image) => ({
    ...image,
    alt: image.alt || productImageAlt(product.title, image, attributes),
  }));
  const recommendedMaterial = materials.find((m) => !m.comingSoon)?.name ?? null;

  // Representative purchasable variants (what Merchant Center advertises), and
  // — when a deep link carries a configuration — the exact variant it selected,
  // so the visible price and the structured-data price always agree.
  const liveMaterials = materials.filter((m) => !m.comingSoon);
  const readySizes = (product.ready_sizes ?? null) as [number, number][] | null;

  // The structured facts that distinguish the three families — resolved once and
  // shared by the visible details, the JSON-LD and the configurator, so a
  // shopping agent and a shopper are never told different things.
  const facts = productFacts(category, {
    readySizes,
    borderHeightCm: product.border_height_cm ?? null,
    supplyFormat: product.supply_format ?? null,
    segmentLengthM: product.segment_length_m ?? null,
    pricePerMetre: product.price_per_metre ?? null,
    fromPricePerSqft: fromPrice,
    materialSlugs: liveMaterials.map((m) => m.slug),
  });

  // Every advertised family gets stable deep-linked variants. Borders use the
  // sellable set length rather than a material/area ladder.
  const variantsInr: RepresentativeVariant[] = perMetre
    ? borderLengthVariants(
        SITE_URL,
        product.handle,
        BORDER_LENGTH_OPTIONS_M,
        pricePerMetre,
        { format: product.supply_format ?? null, segmentLengthM: product.segment_length_m ?? null },
      )
    : readySizes?.length
    ? liveMaterials.length
      ? isFixedSize
        ? liveMaterials.flatMap((m) => canvasSizeVariants(SITE_URL, product.handle, readySizes, m))
        : readySizeVariants(SITE_URL, product.handle, readySizes, liveMaterials[0])
      : []
    : madeToMeasureVariants(SITE_URL, product.handle, liveMaterials);
  const seoVariants = seoMarket !== HOME_MARKET ? variantsInr.map((v) => marketVariant(v, seoMarket)) : variantsInr;
  // The JSON-LD description quotes the same market's price as the <head> one.
  const seoDescription = productDescription(
    product.title,
    product.description,
    category.measurementType,
    fromRateFor(product, category),
    seoMarket,
    attributes,
  );

  // A tall wall-art piece is a whole composition — often with a painted border
  // — so the square hero crop every wallpaper uses beheads it. These get a
  // frame shaped like the artwork instead. Scoped to the PORTRAIT fixed-size
  // ladder; square and landscape pieces are already at home in the square.
  const portraitFixed = isFixedSize && !!readySizes?.length && readySizes.every(([w, h]) => h > w);
  // Same problem wherever the flat isn't square. A border is a long horizontal
  // strip, so the square hero crop shows about a thirteenth of it blown up to
  // fill; a 2:1 mural is one composition, not a repeat, so the square crop
  // silently throws away half the scene — the whole reason "Gujarat Gateway"
  // reached the page as a centre section of itself. Both are the same fix:
  // frame the hero at the ARTWORK's own shape, read from the master's recorded
  // pixels. A repeating pattern is near enough to square that the crop takes
  // nothing meaningful, so those keep the square hero the catalogue is built
  // around — hence the tolerance rather than "anything but exactly 1:1".
  // Thumbnails stay square either way; only the main view has to be honest.
  const flatAspect =
    flatImage?.width && flatImage?.height ? flatImage.width / flatImage.height : null;
  const shapedFlat =
    flatAspect && (flatAspect > 1 + SQUARE_TOLERANCE || flatAspect < 1 / (1 + SQUARE_TOLERANCE))
      ? flatAspect
      : null;

  const sizeSel = parseReadySizeParam(sp.size, readySizes);
  const materialSel = liveMaterials.find((m) => m.slug === sp.material)?.slug;
  let selected: RepresentativeVariant | null = null;
  if (perMetre && BORDER_LENGTH_OPTIONS_M.some((length) => length === Number(sp.length))) {
    selected = seoVariants.find((v) => v.sizeText === `${Number(sp.length)} m`) ?? null;
  } else if (readySizes?.length && sizeSel) {
    selected = seoVariants.find(
      (v) => {
        const variantUrl = new URL(v.url);
        return variantUrl.searchParams.get("size") === `${sizeSel[0]}x${sizeSel[1]}` &&
          (!materialSel || v.materialSlug === materialSel);
      },
    ) ?? null;
  } else if (!readySizes?.length && materialSel && initialWidthFt && initialHeightFt) {
    selected =
      seoVariants.find(
        (v) => v.materialSlug === materialSel && v.sizeText === `${initialWidthFt} ft x ${initialHeightFt} ft`,
      ) ?? null;
  }

  const filmLd = siteFilm
    ? videoObjectJsonLd(siteFilm, {
        path: `/products/${product.handle}`,
        name: `${product.title} — the film`,
        description: truncate(stripHtml(product.description ?? ""), 300) || `${product.title} by Zyvorah, on the wall.`,
      })
    : null;
  const structuredData = [
    ...(filmLd ? [filmLd] : []),
    productJsonLd({
      handle: product.handle,
      title: product.title,
      code: product.code ?? null,
      description: seoDescription,
      images: discoveryImages.map((i) => i.url),
      materials: materials.map((m) => ({ name: m.name, pricePerSqFt: m.pricePerSqFt })),
      rating,
      attributes,
      readySizes,
      isCanvas: isFixedSize,
      perMetre: perMetre ? { price: pricePerMetre, minMetres } : null,
      facts,
      selected,
      marketCountryCode: seoMarket,
      marketVariants: seoMarket !== HOME_MARKET ? seoVariants : undefined,
    }),
    ...(seoVariants.length
      ? [
          productGroupJsonLd({
            handle: product.handle,
            title: product.title,
            description: seoDescription,
            image: discoveryImages[0]?.url ?? null,
            variants: seoVariants,
            marketCountryCode: seoMarket,
          }),
        ]
      : []),
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
        // The product's own family — filing a canvas or a border under
        // "Wallpaper" is exactly the confusion this breadcrumb should prevent.
        {
          "@type": "ListItem",
          position: 2,
          name: category.title,
          item: `${SITE_URL}/collections/${category.collectionHandle}`,
        },
        ...(isBagh ? [{ "@type": "ListItem", position: 3, name: "Bagh", item: `${SITE_URL}/collections/bagh` }] : []),
        { "@type": "ListItem", position: isBagh ? 4 : 3, name: product.title, item: `${SITE_URL}/products/${product.handle}` },
      ],
    },
  ];

  const page = (
    <div>
      <JsonLd data={structuredData} />
      <ShoppingJourney canvas={isFixedSize} />
      {/* invisible taste signal — feeds the "Picked for you" personalisation */}
      <TasteSignal handle={product.handle} title={product.title} />
      {/* The breadcrumb the JSON-LD has always described, now on the page too:
          a crawler (and a shopper) can climb from any design to its family's
          listing in one link, instead of only reaching products through the
          four related designs below. */}
      <nav aria-label="Breadcrumb" className="container-x pt-6 text-xs text-charcoal/60">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li><Link href="/" className="hover:text-charcoal">Home</Link></li>
          <li aria-hidden="true">›</li>
          <li><Link href={faithIdentity ? religionHref(faithIdentity.faith) : `/collections/${category.collectionHandle}`} className="hover:text-charcoal">{faithIdentity ? "Religion · " + faithIdentity.faith.charAt(0).toUpperCase() + faithIdentity.faith.slice(1) : category.title}</Link></li>
          <li aria-hidden="true">›</li>
          {isBagh && <><li><Link href="/collections/bagh" className="hover:text-charcoal">Bagh</Link></li><li aria-hidden="true">›</li></>}
          <li aria-current="page" className="text-charcoal/80">{product.title}</li>
        </ol>
      </nav>
      <WallBuilderProvider>
      <div
        // The catalogue rules, stamped for scripts/verify-product-pages.mjs,
        // which reads LIVE product pages after every deploy and every morning:
        // the gallery in order (each picture's room, or "flat" / "styled"), and
        // what "See it on your wall" places — it must be the flat, never a
        // styled photo with furniture baked in.
        data-product-gallery={images.map((i) => (i.is_flat ? "flat" : i.scene_key || "styled")).join(",")}
        data-visualiser={flatImage ? (flatImage.is_flat ? "flat" : "styled") : "none"}
        className="container-x grid gap-10 pt-6 pb-4 lg:grid-cols-2 lg:py-10 lg:gap-16"
      >
        {/* gallery — gives way to the wall builder's live preview once the
            customer starts building (see WallBuilderStage) */}
        <WallBuilderStage isArtwork={isFixedSize} gallery={
          <ProductGallery
            images={discoveryImages}
            title={product.title}
            showActions={category.supportsVisualiser || (category.supportsSamples && sampleable)}
            showSample={category.supportsSamples && sampleable}
            fit={portraitFixed || shapedFlat ? "contain" : "cover"}
            fallbackAspect={
              portraitFixed ? readySizes![0][0] / readySizes![0][1] : (shapedFlat ?? undefined)
            }
          />
        } />

        {/* details — min-w-0 so an opened panel can never widen the grid
            column past a phone screen */}
        <div className="min-w-0 max-w-lg">
          <div className="flex flex-wrap items-center gap-2">
            {productBadges({
              isAutograph: isAutograph,
              isFounders: product.is_founders_favourite,
              isSignature: product.is_signature,
              isLimited: product.is_limited,
              isNew: product.is_new,
              isShowroom: product.is_showroom_favourite,
              isCeiling: isCeilingProduct(tagList),
            }).map((b) => (
              <span key={b.key} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.1em] ${b.className}`}>
                <BadgeIcon badgeKey={b.key} className="h-3.5 w-3.5" />
                {b.label}
              </span>
            ))}
            {product.code && (
              <span className="inline-block rounded-full bg-lavender/50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate">
                {product.code}
              </span>
            )}
          </div>
          {isLorangeVendor(product.vendor) && (
            <p className="mt-3 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#934728]">
              <Link href={LORANGE_PATH} className="underline-offset-4 hover:underline">{LORANGE_NAME}</Link>
              <span className="text-slate"> · {LORANGE_FAMILY_LINE}</span>
            </p>
          )}
          <h1 className="mt-3 text-[clamp(1.8rem,3.4vw,2.6rem)] leading-tight">{product.title}</h1>
          {discoveryLine && (
            <p className="mt-2 text-sm leading-relaxed text-slate">{discoveryLine}</p>
          )}
          {depiction && (
            <div className="mt-4 rounded-[18px] bg-wash p-4 text-sm leading-relaxed">
              <p className="font-medium text-charcoal">What this artwork depicts</p>
              <p className="mt-1 text-slate">{depiction}</p>
            </div>
          )}

          <div className="mt-3 text-sm">
            <RatingSummary handle={product.handle} />
          </div>

          {/* Autograph — the premium price category. Stated plainly on the page
              because it explains BOTH the rate and why this design cannot be
              found on a marketplace. */}
          {isAutograph && (
            <div className="mt-5 rounded-[18px] border border-charcoal/15 bg-charcoal/[0.04] p-5">
              <p className="flex items-center gap-2 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-charcoal/70">
                <BadgeIcon badgeKey="autograph" className="h-4 w-4" /> {AUTOGRAPH_LABEL}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-charcoal">
                Part of our {AUTOGRAPH_LABEL} series — <MarketMoney inr={fromPrice ?? 0} /> per sq ft, with a linen feel. <MarketPricingNote india="GST included." />
              </p>
              <p className="mt-2 text-sm font-semibold text-charcoal">{AUTOGRAPH_EXCLUSIVE_LABEL}.</p>
            </div>
          )}

          {product.is_founders_favourite && (
            <div className="mt-5 rounded-[18px] bg-blush/50 p-5">
              <p className="flex items-center gap-2 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-charcoal/70">
                <BadgeIcon badgeKey="founders" className="h-4 w-4" /> A note from our founder
              </p>
              <p className="mt-2 text-sm italic leading-relaxed text-charcoal">
                {product.founders_note?.trim() || DEFAULT_FOUNDERS_NOTE}
              </p>
              <p className="mt-2 text-sm font-semibold text-charcoal">{FOUNDERS_SIGNATURE}</p>
            </div>
          )}

          {/* Limited edition: the honest count. Only real sales (paid onwards)
              consume the edition; when it's gone, it's never printed again. */}
          {editionLimit != null && editionRemaining != null && (
            <div className="mt-5 rounded-[18px] bg-peach/40 p-5">
              <p className="flex items-center gap-2 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-charcoal/70">
                <BadgeIcon badgeKey="limited" className="h-4 w-4" /> Limited edition
              </p>
              <p className="mt-2 text-sm leading-relaxed text-charcoal">
                {editionRemaining > 0 ? (
                  <>
                    An edition of <strong>{editionLimit}</strong> — only {editionLimit} of these will
                    ever be made. <strong>{editionRemaining} of {editionLimit}</strong>{" "}
                    {editionRemaining === 1 ? "remains" : "remain"}.
                  </>
                ) : (
                  <>
                    An edition of <strong>{editionLimit}</strong> — now fully sold. This piece will
                    not be made again.
                  </>
                )}
              </p>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between gap-4">
            {perMetre ? (
              <p className="text-slate">
                <span className="font-semibold text-charcoal"><MarketMoney inr={pricePerMetre} /> per linear metre</span>
                <span className="block text-xs text-mist">
                  {product.border_height_cm ? `${product.border_height_cm} cm tall · ` : ""}
                  {supplyLabel(Math.max(minMetres, category.fixedLengthM ?? 1), product.supply_format ?? null, product.segment_length_m ?? null)}
                  {" · "}<MarketPricingNote india="GST included" />
                </span>
              </p>
            ) : isFixedSize ? (
              // A finished piece has a starting price. Its per-sq-ft make rate
              // is an internal cost and must never reach the customer.
              <p className="text-slate">
                <span className="font-semibold text-charcoal">
                  {facts.fromPrice != null ? <>From <MarketMoney inr={facts.fromPrice} includeDelivery /></> : "Fixed sizes"}
                </span>
                <span className="block text-xs text-mist">
                  {facts.fixedSizes.length} fixed sizes · <MarketPricingNote india="GST included" />
                </span>
              </p>
            ) : fromPrice != null ? (
              <p className="text-slate">
                <span className="font-semibold text-charcoal"><MarketMoney inr={fromPrice} /> per sq ft</span>
                <span className="block text-xs text-mist">
                  {product.ready_sizes?.length
                    ? <>Ready sizes · Peel &amp; stick · <MarketPricingNote india="GST included" /></>
                    : <MarketPricingNote india="GST included" />}
                </span>
              </p>
            ) : (
              <span />
            )}
            <WishlistButton handle={product.handle} variant="inline" />
          </div>

          {!jainPresentation && !perMetre && product.handle !== BESPOKE_HANDLE && (
            <>
              {/* The room preview, one quiet tap away — it used to be a card
                  above the title that pushed name and price off the first
                  screen (8 Oct 2026). */}
              {category.supportsVisualiser && (
                <SeeOnWallLink handle={product.handle} className="w-full lg:justify-start" />
              )}
              {/* The same step, pinned to the bottom of the screen until the
                  builder scrolls into view (see MobileConfigureBar). */}
              <MobileConfigureBar targetId="create-your-wall">
                <div className="flex items-center gap-3">
                  {fromPrice != null && !isFixedSize && (
                    // data-mkt-price on the whole block: while a first visit's
                    // market is still unknown the figure is hidden, and
                    // " per sq ft" alone read as a missing price.
                    // Just the price — "Made to your wall" under it read as
                    // a warning, not a promise (founder, 8 October 2026); the
                    // builder explains made-to-measure once they are in it.
                    <p data-mkt-price className="min-w-0 shrink-0 text-sm font-semibold leading-tight text-charcoal">
                      <MarketMoney inr={fromPrice} /> per sq ft
                    </p>
                  )}
                  <a href="#create-your-wall" className="btn flex min-h-11 min-w-0 flex-1 items-center justify-center px-3 text-center leading-tight">
                    {isFixedSize ? "Choose your artwork size" : "Buy now"}
                  </a>
                  {/* WhatsApp shares this row, to the right of the buying action. */}
                  <WhatsAppBarButton />
                </div>
              </MobileConfigureBar>
            </>
          )}

          {/* When it arrives — computed fresh (client-side) from the same
              master shipping clock checkout reads, so the two can never
              disagree. Only for products that actually get the standard
              dispatch promise (see standardDispatchEligible above). */}
          {standardDispatchEligible && <ArrivesBy expressAvailable={!isFixedSize} />}

          {/* social proof at the point of decision — best published review */}
          <FeaturedReview handle={product.handle} />

          {/* The fixed-size family states it plainly, above the configurator —
              a shopper arriving from a wallpaper page must not have to infer
              that this one is not made to their wall. */}
          {isFixedSize && (
            <p className="mt-6 rounded-[14px] bg-lavender/40 px-4 py-3 text-sm text-charcoal">
              {facts.fixedSizeStatement}
            </p>
          )}

          <div className="mt-8">
            {jainPresentation ? <section id="create-your-wall" className="rounded-2xl bg-sage/20 p-5"><h2 className="text-2xl">Discuss this design</h2><p className="mt-3 text-sm leading-relaxed">Available for architectural review and project enquiries. We will confirm the final artwork scale, colour sample and installation specification before accepting a production order.</p><Link className="btn mt-5 inline-flex min-h-12 items-center px-5" href={`/contact?about=${encodeURIComponent(product.title + " — Jain Temples")}`}>Enquire about this design →</Link></section> : perMetre ? (
              <>
                {/* The placement scene needs the true repeat and the true
                    height — without either it would be showing a lie. */}
                {flatImage && product.border_height_cm ? (
                  <div className="mb-6">
                    <BorderPlacementScene
                      imageUrl={flatImage.url}
                      imageAlt={flatImage.alt ?? product.title}
                      heightCm={Number(product.border_height_cm)}
                      productTitle={product.title}
                      productHandle={product.handle}
                      metres={minMetres}
                    />
                  </div>
                ) : null}
              <BorderConfigurator
                productHandle={product.handle}
                pricePerMetre={pricePerMetre}
                minMetres={minMetres}
                supplyFormat={product.supply_format ?? null}
                segmentLengthM={product.segment_length_m ?? null}
                heightCm={product.border_height_cm ?? null}
                initialLengthM={BORDER_LENGTH_OPTIONS_M.some((length) => length === Number(sp.length)) ? Number(sp.length) : null}
              />
              </>
            ) : product.handle === BESPOKE_HANDLE ? (
              <BespokeAddOn forHandle="" forTitle="your design" />
            ) : (
            <ProductConfigurator
              productHandle={product.handle}
              productTitle={product.title}
              productId={product.id}
              materials={materials}
              image={
                flatImage
                  ? { url: flatImage.url, alt: flatImage.alt ?? product.title }
                  : null
              }
              initialWidthFt={initialWidthFt}
              initialHeightFt={initialHeightFt}
              autoOpenSample={autoOpenSample}
              readySizes={product.ready_sizes ?? null}
              initialMaterialSlug={materialSel ?? null}
              autoStart={autoStartConfigure}
              editItemId={sp.edit}
              initialSizeIn={sizeSel}
              nameAudience={nameAudience}
              isFixedSize={isFixedSize}
              seamless={
                product.is_seamless && product.repeat_width_cm
                  ? { repeatWidthCm: Number(product.repeat_width_cm) }
                  : null
              }
              sampleable={sampleable}
              printRules={{ maxPanelCm: printRules.maxPanelCm, overlapCm: printRules.overlapCm }}
              maxQty={editionRemaining ?? undefined}
            />
            )}
          </div>

          {/* The bespoke add-on, the Amazon route and the "specifying for a
              building?" block used to live here, directly under the
              configurator — which, on steps 1–3, put them right under the
              Continue button, before Add to cart ever appeared. All three
              now render at the bottom of the page, after reviews and "More
              like this" (Roheena, 30 Sep 2026 walkthrough: sized to your wall is
              the product and should own the order flow's screens; these are
              secondary paths, not competing with Add to cart). See the
              bottom of this file. */}

          {JAIN_DESIGNS.some(d => d.handle === product.handle) && <aside className="my-6 rounded-2xl border border-edge bg-sage/20 p-5"><h2 className="text-xl">Created with Respect</h2><p className="mt-2 text-sm leading-relaxed">{JAIN_SHORT_RESPECT}</p><p className="mt-2 text-xs text-slate">Presentation artwork. Final scale, colour and installation need project review; this is not a validated production master.</p><div className="mt-3 flex flex-wrap gap-4 text-sm"><Link className="inline-flex min-h-10 items-center underline underline-offset-4" href="/collections/jain-temples#suggest-a-correction">Suggest a Correction</Link><Link className="inline-flex min-h-10 items-center underline underline-offset-4" href="/collections/jain-temples">Jain Temples collection →</Link></div></aside>}
          <ProductAttributes
            code={product.code ?? null}
            attributes={attributes}
            recommendedMaterial={recommendedMaterial}
            facts={facts}
            sampleable={sampleable}
            readySizes={isFixedSize ? null : (product.ready_sizes ?? null)}
            orientation={product.orientation ?? null}
            maxPrintWidthIn={
              isFixedSize
                ? Math.round(
                    (materials.find((m) => m.slug === category.webMaterialSlug)?.rollWidthMm ??
                      materials[0]?.rollWidthMm ??
                      1371) / 25.4,
                  )
                : null
            }
          />

          {/* accordions — Design details (above) is the first of them */}
          <div className="mt-2 space-y-2">
            {[
              {
                t: "Description",
                c: (
                  <div
                    className="prose-sm space-y-2 text-sm text-slate [&_a]:underline"
                    dangerouslySetInnerHTML={{ __html: product.description ?? "" }}
                  />
                ),
              },
              perMetre
                ? {
                    t: "Sizing & ordering",
                    c: (
                      <p className="text-sm text-slate">
                        {category.title} are sold by the linear metre, not by area, and
                        are never cut to a custom size.
                        {product.border_height_cm ? ` This border is ${product.border_height_cm} cm tall.` : ""}{" "}
                        Orders are in {minMetres} m sets — each set arrives as{" "}
                        {supplyLabel(minMetres, product.supply_format ?? null, product.segment_length_m ?? null)} — at{" "}
                        <MarketMoney inr={pricePerMetre} /> per linear metre (GST included in India).
                      </p>
                    ),
                  }
                : isFixedSize
                ? {
                    t: "Sizing & ordering",
                    c: (
                      <div className="space-y-2 text-sm text-slate">
                        <p>{facts.fixedSizeStatement}</p>
                        <p>
                          Choose from {facts.fixedSizes.map((s) => s.label).join(", ")}. There
                          are no wall measurements to give — the artwork is made at the
                          finished size you pick, in its own proportions, so no size crops it.
                        </p>
                        {/* How it arrives depends on the medium, so it is read
                            off the product rather than assumed to be canvas. */}
                        {facts.media.map((m) => (
                          <p key={m}>
                            {facts.media.length > 1 ? `${MEDIUM_LABEL[m]}: ` : ""}
                            {MEDIUM_SUPPLY[m]}.
                          </p>
                        ))}
                      </div>
                    ),
                  }
                : {
                    t: "Surface",
                    c: (
                      <ul className="space-y-2 text-sm text-slate">
                        {materials.map((m) => (
                          <li key={m.slug}>
                            <span className="font-semibold text-charcoal">{m.name}</span>
                            {m.comingSoon ? " — Coming soon" : m.description ? ` — ${m.description}` : ""}
                          </li>
                        ))}
                      </ul>
                    ),
                  },
              {
                t: isFixedSize ? "Shipping & framing" : "Shipping & installation",
                c: isFixedSize ? (
                  <div className="space-y-3 text-sm text-slate">
                    <p>Free delivery across India, usually within 10 working days. We also deliver worldwide.</p>
                    <p>Canvas art arrives rolled and unframed in a protective tube, ready to frame or stretch locally. Frames shown in room images are styling suggestions and are not included. Installation is not offered for wall art.</p>
                    <DeliveryEstimator expressAvailable={!isFixedSize} />
                    <p>See our <a href="/shipping-policy" className="link-underline">shipping policy</a> for details.</p>
                  </div>
                ) : (
                  <div className="space-y-3 text-sm text-slate">
                    <p>
                      Free delivery across India, usually within 10 working days. Need it
                      sooner? Choose Express at checkout and it reaches you in about 4
                      working days. Every wallpaper is made to order for your wall and
                      arrives with an easy fitting guide.
                    </p>
                    <p>
                      Our own team can install it for you in select areas. Enter your
                      pincode when you order and we will tell you if we install there.
                      Anywhere else, any local wallpaper fitter can hang it with the guide
                      in the box.
                    </p>
                    <p>We also deliver worldwide.</p>
                    <FreightToPayNote />
                    <DeliveryEstimator expressAvailable={!isFixedSize} />
                    <p className="text-xs text-mist">
                      <MarketPricingNote
                        india="Design samples are available for ₹200 each."
                        international="Design samples are available within India only."
                      />{" "}
                      More in our{" "}
                      <a href="/shipping-policy" className="link-underline">shipping policy</a>.
                    </p>
                  </div>
                ),
              },
            ].map((row) => (
              <details key={row.t} className="group rounded-[18px] bg-wash">
                <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4">
                  <span className="text-sm font-semibold">{row.t}</span>
                  <span className="text-mist transition-transform group-open:rotate-45">+</span>
                </summary>
                <div className="px-5 pb-4">{row.c}</div>
              </details>
            ))}
          </div>

          {/* discreet founder link — below materials; must not crowd configuration */}
          <p className="mt-6 text-xs leading-relaxed text-mist">
            Chosen for walls, not merely catalogues. Discover the thinking behind Zyvorah —{" "}
            <Link href="/founders-note" className="font-medium text-slate underline underline-offset-2 hover:text-charcoal">A Note from Our Founder</Link>.
          </p>
        </div>
      </div>
      </WallBuilderProvider>

      {artStory && (
        <section className="container-x py-12 lg:py-20" aria-labelledby="art-story-heading">
          <div className="grid items-center gap-6 rounded-[28px] bg-[#eee6da] p-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,0.75fr)] lg:gap-8 lg:p-8">
            <TaashFilm
              src={wideFilm?.src ?? artStory.film}
              poster={artStory.poster}
              film={wideFilm}
              title={`${product.title} — the story of the artwork`}
              className="aspect-[3/2] min-w-0 w-full rounded-[18px]"
            />
            <div className="min-w-0 max-w-md">
              <p className="text-xs uppercase tracking-[0.18em] text-[#8b5744]">The story in the artwork</p>
              <h2 id="art-story-heading" className="mt-3 font-display text-2xl leading-tight text-[#30251d] md:text-3xl">{artStory.heading}</h2>
              <p className="mt-4 font-serif text-base leading-relaxed text-[#56483d]">{artStory.introduction}</p>
              <p className="mt-3 text-xs leading-relaxed text-[#77675a]">The film starts silently. Choose “Hear the story” for the narrated version.</p>
            </div>
          </div>
        </section>
      )}

      {artStory?.companion && (
        <section className="container-x pb-12 lg:pb-20" aria-labelledby="art-pair-heading">
          <div className="grid overflow-hidden rounded-[28px] border border-[#ded5c8] bg-[#f7f2e9] lg:grid-cols-[minmax(0,1.75fr)_minmax(0,0.75fr)]">
            <Image
              src="https://media.zyvorah.com/product-images/matsya-karma-river/matsya-karma-pair-v1.webp"
              alt="Matsya and Karma displayed as two separate framed paintings in one room"
              width={1536}
              height={1024}
              unoptimized
              className="aspect-[3/2] h-auto w-full object-contain"
            />
            <div className="flex min-w-0 flex-col justify-center p-6 lg:p-8">
              <p className="text-xs uppercase tracking-[0.18em] text-[#8b5744]">A pair, each sold separately</p>
              <h2 id="art-pair-heading" className="mt-3 font-display text-2xl text-[#30251d] lg:text-3xl">Pair it with {artStory.companion.name}</h2>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-[#56483d]">{artStory.companion.text}</p>
              <Link href={`/products/${artStory.companion.handle}`} className="mt-6 inline-flex w-fit items-center rounded-full bg-[#29221d] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#493a31]">
                See {artStory.companion.name} →
              </Link>
            </div>
          </div>
        </section>
      )}

      {product.handle === "taash-dhoop" && (
        <section className="container-x py-12 lg:py-20" aria-labelledby="dhoop-film-heading">
          <div className="mx-auto grid max-w-5xl items-center gap-8 rounded-[28px] bg-[#eee6da] p-5 md:grid-cols-[minmax(0,0.75fr)_minmax(0,1fr)] md:gap-12 md:p-10">
            <TaashFilm
              src={tallFilm?.src ?? "/films/taash/dhoop-roheena.mp4"}
              film={tallFilm}
              poster={tallFilm ? tallFilm.poster : "/films/taash/dhoop-poster.jpg"}
              title="Dhoop, a personal design story"
              className="mx-auto aspect-[9/16] w-full max-w-[310px] rounded-[18px]"
            />
            <div className="max-w-md">
              <p className="text-xs uppercase tracking-[0.18em] text-[#8b5744]">A note from Roheena</p>
              <h2 id="dhoop-film-heading" className="mt-4 font-display text-3xl leading-tight text-[#30251d] md:text-4xl">How I see Dhoop</h2>
              <p className="mt-5 font-serif text-lg leading-relaxed text-[#56483d]">
                I often look at a pattern and start imagining the room around it. Dhoop was one of those designs for me.
              </p>
              <p className="mt-4 text-sm text-[#77675a]">The film starts silently. Choose “Hear the story” to watch it with narration and music.</p>
            </div>
          </div>
        </section>
      )}

      {siteFilm && !artStory && product.handle !== "taash-dhoop" && (
        <section className="container-x py-12 lg:py-20" aria-labelledby="product-film-heading">
          <div
            className={`mx-auto grid items-center gap-6 rounded-[28px] bg-[#eee6da] p-5 lg:gap-10 lg:p-8 ${
              tallFilm ? "max-w-5xl md:grid-cols-[minmax(0,0.75fr)_minmax(0,1fr)]" : "lg:grid-cols-[minmax(0,1.65fr)_minmax(0,0.75fr)]"
            }`}
          >
            <TaashFilm
              src={siteFilm.src}
              poster={siteFilm.poster}
              title={siteFilm.title}
              film={siteFilm}
              style={filmAspect(siteFilm)}
              className={`min-w-0 w-full rounded-[18px] ${tallFilm ? "mx-auto max-w-[310px]" : ""}`}
            />
            <div className="min-w-0 max-w-md">
              <p className="text-xs uppercase tracking-[0.18em] text-[#8b5744]">The film</p>
              <h2 id="product-film-heading" className="mt-3 font-display text-2xl leading-tight text-[#30251d] md:text-3xl">{siteFilm.title}</h2>
              <p className="mt-4 text-xs leading-relaxed text-[#77675a]">The film starts silently. Choose “Hear the story” for the narrated version.</p>
            </div>
          </div>
        </section>
      )}

      {/* Lookalikes, ranked on the artwork itself — see getRelatedProductCards.
          The heading changed with the row: this used to be tag-matched
          "complete the look" pairing, and calling visual matches that would be
          telling the shopper the wrong thing about what they are seeing. */}
      {related.length > 0 && (
        <section className="container-x py-10 lg:py-16">
          <h2 className="mb-8 text-2xl">More like this</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.handle} product={p} />
            ))}
          </div>
        </section>
      )}

      {/* personalised picks — appears only once the visitor's taste is known */}
      <ForYouRow category={isFixedSize ? product.category ?? "canvas" : undefined} title="More in your taste" exclude={[product.handle, ...related.map((p) => p.handle)]} />
      {/* Real, consented, CEO-approved photos of this design on customers'
          walls, pushed by the OS. Cached read; renders nothing when none. */}
      <InstalledWalls productHandle={product.handle} designName={product.title} />

      <ProductReviews handle={product.handle} />

      {/* Bespoke customisation and the "specifying for a building?" door —
          moved here from directly under the configurator (Roheena, 30 Sep
          2026 walkthrough), so secondary paths never lead the order flow. Not shown on
          the SKU itself or on borders — a fixed product can't be customised. */}
      {product.handle !== BESPOKE_HANDLE && category.supportsCustomSize && (
        <section className="container-x py-8">
          <div className="max-w-lg">
            <BespokeAddOn forHandle={product.handle} forTitle={product.title} />
          </div>
        </section>
      )}

      {/* "Also on Amazon · Buy on Amazon" left the product page on 7 October
          2026 (Roheena: the audit's point 6). A shopper ready to pay was
          offered a cheaper, familiar checkout we cannot see, under our own
          price. The listings stay reachable from /where-to-buy in the footer,
          and the link-check cron still watches them there. */}

      {!isFixedSize && projectSpaces.length > 0 && (
        <section className="container-x py-8">
          <div className="max-w-lg rounded-[18px] border border-edge bg-wash p-5">
            <p className="font-display text-base font-bold">Specifying this for a building?</p>
            <p className="mt-1.5 text-sm text-slate">
              {`Chosen for the ${projectSpaces.map((sp) => sp.label.toLowerCase()).join(" and the ")}.`}{" "}
              We panel to your real elevations, keep your files for reordering floor by floor, and can
              adapt the palette to your scheme.
            </p>
            {sibling && (
              <p className="mt-3 text-sm text-slate">
                Also drawn in the {siblingTower.toLowerCase()} colourway —{" "}
                <Link href={`/products/${sibling.handle}`} className="link-underline font-semibold text-charcoal">
                  {sibling.title}
                </Link>
                .{" "}
                {perTower
                  ? "The same composition in the other tower's light — this is a space a development builds once per tower, so the pair is how two towers read as siblings rather than copies."
                  : "The same composition in a warmer palette. A development has one of this room, not two, so this is a choice of light rather than a second wall."}
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-2.5">
              <Link
                href={`/contact?about=${encodeURIComponent(product.title)}`}
                className="btn inline-flex h-11 px-5 text-[0.8rem]"
              >
                Use this in your project
              </Link>
              <Link
                href="/real-estate/walkthrough"
                className="btn btn-ghost inline-flex h-11 px-5 text-[0.8rem]"
              >
                See it in a building
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* records this view + shows other recently-viewed designs */}
      <RecentlyViewed currentHandle={product.handle} category={isFixedSize ? product.category ?? "canvas" : undefined} />
    </div>
  );
  return landingMarket ? (
    <MarketProvider initialCountryCode={landingMarket}>{page}</MarketProvider>
  ) : page;
}

export const generateMetadata = withBrandMetadata(buildPageMetadata);
