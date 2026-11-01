/**
 * L'Orange Kids — a sister brand with its own shop inside zyvorah.com.
 *
 * L'Orange Kids is its own brand (Zyvorah does not own it); one company owns
 * both (Roheena, 29 October 2026). A parent who picks kids, children or
 * nursery on Zyvorah lands on its shop at /lorange-kids without leaving the
 * site, and every page of that shop says whose family it belongs to:
 * "Part of the Zyvorah family" and "Back to Zyvorah" — her words, not ours.
 *
 * Its products are ordinary rows in the store's `products` table with
 * `vendor = LORANGE_VENDOR`, so they go through Zyvorah's cart, checkout and
 * order flow like any other design, and appear in the shop the moment they are
 * set active — no deploy. Zyvorah's own kids designs stay Zyvorah's: which
 * designs belong to which brand is the owner's decision, never a script's.
 *
 * The brand itself (assortment, copy, the standalone lorangekids.com) is being
 * built in its own project; this file carries only what the Zyvorah shop needs.
 * The look follows that project's brand direction: warm ivory, a burnt-orange
 * serif wordmark, small letter-spaced captions, a fine rust line.
 */

export const LORANGE_VENDOR = "L'Orange Kids";
export const LORANGE_NAME = "L’Orange Kids";
export const LORANGE_PATH = "/lorange-kids";
export const LORANGE_LOGO = "/lorange-kids/logo.png";

/** The brand's own domain. Its root opens the shop at LORANGE_PATH, kept on
 *  lorangekids.com (a rewrite, src/edge/gate.ts). */
export const LORANGE_HOST = "sister.mimi-pip.invalid";

/** What the OS is told a line was sold under (POST /api/zyvorah/web-order
 *  `brand`): the OS sends that customer's mail and invoice as L'Orange Kids.
 *  Nothing for a Zyvorah line — older OS builds never see the field. */
export function osBrandForVendor(vendor: string | null | undefined): "lorange" | undefined {
  return isLorangeVendor(vendor) ? "lorange" : undefined;
}

/**
 * Which paths lorangekids.com serves itself. The shop, its assets and the
 * same-origin API it calls stay on the brand's domain. Product, cart,
 * checkout and account pages go to zyvorah.com: sign-in and Razorpay are set
 * up for that domain, and the cart lives there, so a parent never ends up
 * with a basket split across two addresses.
 */
export function lorangeHostServes(pathname: string): boolean {
  if (pathname === "/" || pathname === LORANGE_PATH || pathname.startsWith(`${LORANGE_PATH}/`)) return true;
  if (pathname.startsWith("/api/") || pathname.startsWith("/assets/") || pathname.startsWith("/_next/") || pathname.startsWith("/media/")) return true;
  return pathname === "/robots.txt" || /\/[^/]+\.[a-z0-9]{2,5}$/i.test(pathname);
}

export const LORANGE_FAMILY_LINE = "Part of the Zyvorah family";
export const LORANGE_BACK_LINE = "Back to Zyvorah";

export const LORANGE_DESCRIPTION =
  "L’Orange Kids — walls for nurseries and children’s rooms. Wallpaper, wall borders, wall stickers and wall posters, part of the Zyvorah family.";

/** The four wall formats the brand launches with (its approved scope). */
export const LORANGE_FORMATS = [
  { name: "Wallpaper", line: "One wall or the whole room, in a story they will grow into." },
  { name: "Wall borders", line: "A band of colour at their height, along the wall." },
  { name: "Wall stickers", line: "Small pieces to place where they like, and change as they do." },
  { name: "Wall posters", line: "One picture for the wall above the bed or the desk." },
] as const;

/** Zyvorah's own children's-room collections, youngest first — the same list
 *  the header's Kids & Nursery row fronts, so the two cannot drift apart. */
export const ZYVORAH_KIDS_COLLECTIONS = [
  { handle: "baby-nursery-wallpapers", label: "Nursery" },
  { handle: "toddler-wallpaper", label: "Toddler" },
  { handle: "kids-wallpapers", label: "Kids" },
  { handle: "play-school-wallpaper", label: "Play school" },
  { handle: "teen-wallpaper", label: "Teen" },
] as const;

export function isLorangeVendor(vendor: string | null | undefined): boolean {
  return (vendor ?? "").trim().toLowerCase().replace(/[’‘]/g, "'") === LORANGE_VENDOR.toLowerCase();
}

/** Words that mean a parent is shopping for a child's room. Whole words only:
 *  "kidskin" or "babylon" are not a nursery. */
const KIDS_WORDS = new Set([
  "kid", "kids", "kiddie", "kiddies", "child", "children", "childrens", "child's", "children's",
  "baby", "babies", "nursery", "nurseries", "toddler", "toddlers", "infant", "newborn",
]);

export function isKidsQuery(query: string): boolean {
  return query
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .split(/[^a-z']+/)
    .some((w) => KIDS_WORDS.has(w) || KIDS_WORDS.has(w.replace(/'s?$/, "")));
}
