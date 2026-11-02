// Per-square-foot pricing for custom murals and ready sizes.
// The wall is measured, converted to square feet, and multiplied by the
// selected material's per-sq-ft rate. This is the single source of truth used
// by the storefront, the (future) agent API, and the print pipeline.

export const CM_PER_FOOT = 30.48;
export const CM_PER_INCH = 2.54;
export const MM_PER_FOOT = 304.8;

export type Unit = "cm" | "ft" | "in";

export function toCm(value: number, unit: Unit | "mm"): number {
  if (unit === "mm") return value / 10;
  if (unit === "ft") return value * CM_PER_FOOT;
  if (unit === "in") return value * CM_PER_INCH;
  return value;
}

export function areaSqFt(widthCm: number, heightCm: number): number {
  const ft2 = (widthCm / CM_PER_FOOT) * (heightCm / CM_PER_FOOT);
  return Math.round(ft2 * 1000) / 1000;
}

export function priceFor(
  widthCm: number,
  heightCm: number,
  pricePerSqFt: number,
  quantity = 1,
): number {
  const raw = areaSqFt(widthCm, heightCm) * pricePerSqFt * quantity;
  return Math.round(raw); // whole rupees
}

// --- Small-order minimums (Roheena, 2026-08-13) -----------------------------
// Mural wallpaper prints on a roll about 4 ft wide, and a narrower
// wall still consumes the full roll width — so the chargeable print width is
// never less than 4 ft, even when the wall (or the printed area) is narrower.
// On top of that, wallpaper has a minimum billing of 20 sq ft per order: an
// order is never billed for less wallpaper than that, no matter how small the
// wall. Both floors apply to BILLING only — the print itself is still made to
// the customer's real measurements.
//
// The ₹1,000 courier charge is WAIVED once the 20 sq ft minimum is billed
// (Roheena, 2026-08-13): a customer already paying the minimum must not pay
// courier on top. Since every storefront surface bills small prints up to the
// minimum, shipping is free in practice on every order — the courier survives
// only as a checkout_cart safety net against a stale or tampered client that
// under-bills a small order (billed wallpaper area under 20 sq ft).
// These rules are for the e-commerce store only — trade/corporate freight is
// to-pay and follows its own terms.
export const MIN_PRINT_WIDTH_FT = 4;       // ft — minimum chargeable print width
export const MIN_WALLPAPER_SQFT = 20;      // sq ft — minimum billed wallpaper area
export const SMALL_ORDER_COURIER_FEE = 1000; // ₹ — courier on orders under 20 sq ft

/**
 * The BILLED area of a mural wallpaper print: the measured (or
 * openings-adjusted chargeable) area, plus the phantom strip a sub-4-ft width
 * still consumes on the roll, floored at the 20 sq ft minimum billing. Pass
 * `chargeableSqFt` when openings exclusions have already reduced the area —
 * the width and minimum floors then apply on top of that reduced figure.
 * Same 3-decimal rounding as areaSqFt() so line totals reconcile everywhere.
 */
export function billedSqFt(widthCm: number, heightCm: number, chargeableSqFt?: number): number {
  const wFt = widthCm / CM_PER_FOOT;
  const hFt = heightCm / CM_PER_FOOT;
  const base = chargeableSqFt ?? wFt * hFt;
  if (!(base > 0) || !(wFt > 0) || !(hFt > 0)) return 0;
  const widthShortfall = Math.max(0, MIN_PRINT_WIDTH_FT - wFt) * hFt;
  const billed = Math.max(base + widthShortfall, MIN_WALLPAPER_SQFT);
  return Math.round(billed * 1000) / 1000;
}

/** priceFor() on the billed (minimums-applied) area — every made-to-measure
 *  wallpaper surface must price through this, never raw area × rate. */
export function billedPriceFor(
  widthCm: number,
  heightCm: number,
  pricePerSqFt: number,
  quantity = 1,
): number {
  return Math.round(billedSqFt(widthCm, heightCm) * pricePerSqFt * quantity);
}

/**
 * Flat courier charge for an under-billed wallpaper order: ₹1,000 when the
 * order's BILLED wallpaper area (sum of area_sqft × qty across wallpaper
 * lines) is under 20 sq ft. An order billed at (or above) the 20 sq ft
 * minimum has the courier WAIVED — paying the minimum already covers it, so
 * through the normal storefront this fee is always ₹0. The authoritative
 * copy lives in checkout_cart (migration 0091); this mirror keeps the
 * cart/checkout previews equal to what checkout will charge.
 */
export function smallOrderCourierFee(billedWallpaperSqFt: number): number {
  if (!(billedWallpaperSqFt > 0)) return 0;
  return billedWallpaperSqFt < MIN_WALLPAPER_SQFT ? SMALL_ORDER_COURIER_FEE : 0;
}

// --- Canvas Wall Art -------------------------------------------------------
// Canvas Wall Art is sold ONLY at a fixed ladder of sizes (2×2, 3×3, 4×4 ft …),
// shipped rolled to frame at home. Its per-sq-ft make rate (~₹400) is an
// INTERNAL cost the customer must NEVER see — every storefront surface shows a
// finished "from ₹<lowest size>" price or no per-unit line at all, never ₹/sq ft.
export const CANVAS_MATERIAL_SLUG = "eco-cotton-canvas";
/** The tag the studio pipeline sets as the storefront's canvas signal. */
export const CANVAS_TAG = "Canvas Wall Art";

/**
 * Whether a product is Canvas Wall Art. True when it carries the "Canvas Wall
 * Art" tag OR its only available material is eco-cotton canvas — the studio
 * pipeline sets both together, so either alone is enough to stay safe on card
 * surfaces that don't fetch tags.
 */
export function isCanvasProduct(materialSlugs: string[], tags: string[] = []): boolean {
  if (tags.some((t) => t.trim().toLowerCase() === CANVAS_TAG.toLowerCase())) return true;
  return materialSlugs.length > 0 && materialSlugs.every((s) => s === CANVAS_MATERIAL_SLUG);
}

// --- Autograph -------------------------------------------------------------
// A PRICE CATEGORY, not a collection. Autograph designs default to ₹400 per
// sq ft (Stallion Spirit is ₹300; product_materials is authoritative), on the linen-textured
// non-woven stock ONLY, and are sold exclusively on zyvorah.com — never listed
// on Amazon, Pepperfry, HomeLane or any future channel.
//
// Autograph is orthogonal to collections: an Autograph design carries its own
// collection name like any other, and there will be several such collections.
// Do not confuse it with `is_signature`, which is a separate editorial concept.
//
// The rate lives in the database too (autograph_rate()) and THAT is the authority,
// because
// the cart prices off product_materials.price_per_sqft. This constant is for
// COPY — "Autograph designs are ₹400/sq ft" — never for pricing a line; a line
// is always priced from the material rate the database returned, exactly like
// every other design.
export const AUTOGRAPH_TIER = "autograph";
export const AUTOGRAPH_RATE = 400; // ₹ per sq ft, GST-inclusive
export const AUTOGRAPH_MATERIAL_SLUG = "linen-touch";
export const AUTOGRAPH_LABEL = "Autograph";
/** The one phrasing for Autograph's exclusivity — reused on cards, product
 *  pages, the where-to-buy page and AI copy so every surface says it alike. */
export const AUTOGRAPH_EXCLUSIVE_LABEL = "Only on zyvorah.com";
export const AUTOGRAPH_RATE_LABEL = `₹${AUTOGRAPH_RATE}/sq ft`;

export function isAutographTier(priceTier?: string | null): boolean {
  return priceTier === AUTOGRAPH_TIER;
}

// --- Exclusive tiers --------------------------------------------------------
//
// Autograph was once the ONLY tier above standard, so "is this exclusive to
// zyvorah.com?" got written everywhere as `price_tier === 'autograph'`. That
// equality is a trap the moment a second exclusive tier exists: a Saanjha
// design is not equal to 'autograph', so every one of those checks answers
// "not exclusive" and hands the collection to a reseller's storefront. Nothing
// errors; the design simply appears somewhere it was never meant to be.
//
// So ask the PROPERTY, never the name. `price_tiers.exclusive` in the database
// is the authority (migration 0140); this list is the same fact for code paths
// that only have a tier string in hand, and the two must be changed together.
//
// SAANJHA is the collaboration tier — TAASH, Zyvorah x Mati, is the first.
// ATELIER is the January collection's. Neither is Autograph: they must never
// inherit autograph_rate(), the linen pin or the Autograph badge. Saanjha and
// Autograph both sitting at Rs 400 today is a coincidence, not a shared rule —
// TAASH prices its three grounds at Rs 300 and everything else at Rs 400,
// which a single pinned rate could not express.
export const SAANJHA_TIER = "saanjha";
export const ATELIER_TIER = "atelier";

export const EXCLUSIVE_TIERS = [AUTOGRAPH_TIER, SAANJHA_TIER, ATELIER_TIER] as const;

/** The label a tier wears on a card. Only Autograph carries its own badge
 *  today; a collab is named by its collection, not by its tier. */
export const TIER_LABEL: Record<string, string> = {
  [AUTOGRAPH_TIER]: AUTOGRAPH_LABEL,
  [SAANJHA_TIER]: "Saanjha",
  [ATELIER_TIER]: "Atelier",
};

/**
 * Whether a design is sold only on zyvorah.com.
 *
 * Use this — NOT isAutographTier — for every question about where a design may
 * appear: reseller catalogues, channel feeds, marketplace exports. Reserve
 * isAutographTier for things that are true of Autograph specifically, like its
 * badge and its pinned linen stock.
 */
export function isExclusiveTier(priceTier?: string | null): boolean {
  return (EXCLUSIVE_TIERS as readonly string[]).includes(priceTier ?? "");
}

/**
 * The tags that name a PRICE TIER rather than an aesthetic — "Autograph",
 * "Saanjha", "Atelier".
 *
 * Migration 0145 moved Autograph off the curated shelf and every index now
 * filters by an explicit `kind`, which is the real fix. This is the backstop
 * for the one thing a migration cannot hold: `collections.kind` is ordinary
 * data, and a re-seed or a hand edit that writes 'curated' walks a tier
 * straight back onto /collections, silently — which is how it got there the
 * first time.
 *
 * Derived from TIER_LABEL, so a tier added there is excluded on the same
 * commit; Saanjha and Atelier already are. Pinned by collections-axis.test.ts.
 */
export const PRICE_TIER_TAGS = new Set(Object.values(TIER_LABEL));


/**
 * Whether Autograph is withheld from this partner.
 *
 * The rule is about a design appearing on somebody else's STOREFRONT, not about
 * who buys it. An ONLINE partner resells through their own site (HomeLane,
 * LivSpace) — listing Autograph there is exactly what "only on zyvorah.com"
 * forbids. An OFFLINE partner specifies a wall for one client or sells it
 * across a counter (a design studio, a showroom), which is a sale on our terms
 * and has always been fine.
 *
 * So this reads the account's own channel_kind rather than a list of names in
 * this file: onboarding the next online channel is a field on the desk form,
 * not a deploy. An account with no value set is treated as ONLINE — withholding
 * Autograph from an offline partner by mistake is a phone call the same day,
 * while leaking it onto a channel is invisible.
 */
export function autographBlockedForPartner(channelKind?: string | null): boolean {
  return (channelKind ?? "online") !== "offline";
}

/** Autograph, decided by what the account IS (migration 0127).
 *
 *  Prefer this over autographBlockedForPartner: the old test read
 *  channel_kind, a two-value column that had to be set to 'offline' to let
 *  Autograph through — so Vijay Sales, a corporate consumer, carried a
 *  reseller's channel label purely to get access. Only an ONLINE reseller is
 *  blocked; see lib/account-types. */
export { autographBlockedForType } from "./account-types";

// --- Ceiling Wallpaper ------------------------------------------------------
// A design from Zyvorah's dedicated ceiling range — still an ordinary
// mural wallpaper (same materials, same per-sq-ft pricing, same
// width/height entry) but printed and hung on the CEILING, not a wall. The
// only difference from a normal mural is where it's shown: which room-scene
// renders it gets (same room picker) and how those scenes are staged (the
// artwork goes on the ceiling in every one of them). Tag-only, like Canvas
// Wall Art above — no schema change, no separate pricing path.
export const CEILING_TAG = "Ceiling Wallpaper";

export function isCeilingProduct(tags: string[] = []): boolean {
  return tags.some((t) => t.trim().toLowerCase() === CEILING_TAG.toLowerCase());
}

// --- Fixed-size retail pricing ---------------------------------------------
// A made-to-measure wall is priced by ITS area, and the customer can do that
// multiplication themselves — rounding it would read as an error. A fixed-size
// piece is different: the per-sq-ft rate is internal and never shown, so the
// finished price is just a price, and a price like ₹13,958 looks computed
// rather than set. Fixed sizes are therefore quoted at clean figures.
//
// Rounded to the nearest ₹1,000 at ₹5,000 and above, nearest ₹500 below — so
// ₹6,667 becomes ₹7,000 and a small piece isn't swallowed by a coarse step.

/** Nearest clean retail figure for a finished, fixed-size piece. */
export function roundRetail(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const step = amount >= 5000 ? 1000 : 500;
  return Math.round(amount / step) * step;
}

/**
 * The finished price of a fixed-size piece. Rounds the PER-PIECE price and
 * then multiplies, so two of a ₹7,000 piece is ₹14,000 — quantity can never
 * make the unit price disagree with the one on the page.
 *
 * Every fixed-size surface (product page, chat, cart, feeds, JSON-LD) must
 * price through this, or two of them will quote different totals.
 */
export function fixedSizePrice(
  widthCm: number,
  heightCm: number,
  pricePerSqFt: number,
  quantity = 1,
): number {
  const unit = roundRetail(areaSqFt(widthCm, heightCm) * pricePerSqFt);
  return unit * Math.max(1, Math.round(quantity));
}

/** Whole-rupee finished prices for a fixed-size ladder at a per-sq-ft rate. */
export function readySizePrices(readySizes: [number, number][], ratePerSqFt: number): number[] {
  return readySizes
    .map(([wIn, hIn]) => fixedSizePrice(wIn * CM_PER_INCH, hIn * CM_PER_INCH, ratePerSqFt))
    .filter((n) => n > 0);
}

/**
 * Which listed ready size (if any) a submitted width/height (in inches)
 * matches — same orientation, within a small tolerance for unit round-trip
 * float error (cm↔in conversion). A fixed-size product has no OTHER valid
 * size: every price/order path that accepts a customer-supplied width and
 * height must run it through this before pricing, or a caller can smuggle an
 * arbitrary custom size past a ladder that's supposed to be the only option.
 */
export function matchReadySize(
  readySizes: [number, number][],
  widthIn: number,
  heightIn: number,
  toleranceIn = 0.15,
): [number, number] | null {
  return (
    readySizes.find(
      ([w, h]) => Math.abs(w - widthIn) <= toleranceIn && Math.abs(h - heightIn) <= toleranceIn,
    ) ?? null
  );
}

/** Lowest finished fixed-size price ("from ₹X") for a ready-size product, or null. */
export function fromReadySizePrice(readySizes: [number, number][], ratePerSqFt: number): number | null {
  const prices = readySizePrices(readySizes, ratePerSqFt);
  return prices.length ? Math.min(...prices) : null;
}

// On-site professional installation, offered in Bengaluru, Mumbai & Pune only —
// and only from 80 sq ft up. Shared by the product configurator and the
// concierge's add-to-cart so both quote the identical rate and threshold. The
// city list is the single source of truth for the "available in …" copy; the
// MG OS still gates actual fulfilment by the delivery city (and geotags the
// installer visit) against these same three cities. Kept in alphabetical order.
// Installation is PRICED ex-GST at ₹35/sq ft with GST added on top (Roheena
// 2026-07-25), but since 30 Sep 2026 it is QUOTED GST-inclusive (₹41.30/sq ft)
// like every other price on the site — "+ GST" was the one figure a first-time
// buyer had to do sums on (walkthrough roadmap P6, approved by Roheena). Quote
// INSTALL_RATE_LABEL and charge installationTotal(), never rate × area, or the
// tax gets dropped.
export const INSTALL_RATE_EX_GST = 35; // ₹ per sq ft, before GST
export const INSTALL_MIN_SQFT = 80;
export const INSTALL_CITIES = ["Bengaluru", "Mumbai", "Pune"] as const;
// Ready-to-use phrase for UI/AI copy so every surface names the cities identically.
export const INSTALL_CITIES_LABEL = "Bengaluru, Mumbai & Pune";

/**
 * What installation actually costs the customer: area × ₹35 × qty, plus GST,
 * in whole rupees. The result is GST-INCLUSIVE, which is what the cart, the
 * order and gstInvoice() all expect their line amounts to be — so the tax
 * breakup still reconciles.
 */
export function installationTotal(areaSqFt: number, quantity = 1): number {
  if (!(areaSqFt > 0)) return 0;
  return Math.round(areaSqFt * INSTALL_RATE_EX_GST * quantity * (1 + GST_RATE));
}


// How long a fitter takes on site: roughly two to three hours per 100 sq ft
// (Roheena 2026-07-25). Used to set the customer's expectation in the order
// email — "your ~250 sq ft is about a 5-to-8-hour job" — from the order's own
// measured area, so the number is always specific to their wall.
export const INSTALL_HOURS_PER_100_SQFT = { low: 2, high: 3 } as const;

/**
 * Estimated on-site fitting time for a given installed area, as a friendly
 * whole-hour range. Never returns less than the 2–3 hour floor (even a small
 * wall is a half-day once the ladder, paste and trimming are counted), and the
 * high end is always at least an hour above the low.
 */
export function estimateInstallHours(areaSqFt: number): { low: number; high: number; label: string } {
  const units = Math.max(0, areaSqFt) / 100;
  let low = Math.max(2, Math.round(units * INSTALL_HOURS_PER_100_SQFT.low));
  let high = Math.max(low + 1, Math.round(units * INSTALL_HOURS_PER_100_SQFT.high));
  if (low < 2) low = 2;
  if (high <= low) high = low + 1;
  return { low, high, label: `about ${low} to ${high} hours` };
}

// Flat add-ons (size-independent).
export const NAME_FEE = 500;      // ₹ — automatically rendered name-cloud add-on
// The bespoke/customisation design service: ₹1,000 per design, whatever the wall
// size, bought by the number of designs. DESIGN WORK ONLY — it never includes
// printing the wallpaper itself, which is ordered separately per sq ft. Unusually
// complicated artwork is quoted to the customer before any work starts.
export const BESPOKE_PRICE = 1000; // ₹ per design (GST-inclusive, like wallpaper)

// Women-entrepreneurs initiative: Zyvorah contributes ₹1 per chargeable square
// foot of eligible wallpaper (the SAME area used for pricing) towards a pooled
// grant + mentorship fund. It is FUNDED BY ZYVORAH — never added to the
// customer's total, never a discount, never a customer donation. Eligible lines
// are wallpaper measured in sq ft (area > 0); flat SKUs (bespoke) and samples
// have no chargeable area and so contribute nothing.
export const WOMEN_CONTRIBUTION_RATE = 1; // ₹ per chargeable sq ft
export const CONTRIBUTION_CURRENCY = "INR";

/**
 * Contribution for one line: chargeable sq ft × quantity × ₹1, whole rupees —
 * the same area and rounding basis as priceFor(). Sum per-line results for an
 * order total so it matches the amounts shown on each cart/product line.
 */
export function womenContribution(areaSqFt: number, quantity = 1): number {
  if (!(areaSqFt > 0)) return 0;
  return Math.round(areaSqFt * quantity * WOMEN_CONTRIBUTION_RATE);
}

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function formatINR(amount: number): string {
  return inr.format(amount);
}

// All storefront prices are GST-INCLUSIVE at 18%. Invoices back the tax out of
// the inclusive amount so a mini-invoice reads: taxable value + GST = total,
// and the total always equals the price the customer was quoted.
export const GST_RATE = 0.18;

// Installation labels live below GST_RATE: a const read before its line is a
// module-load ReferenceError.
/** Installation's GST-inclusive rate per sq ft, to the paisa (₹41.30). */
export const INSTALL_RATE_INCL_GST = Math.round(INSTALL_RATE_EX_GST * (1 + GST_RATE) * 100) / 100;
/** "₹41.30/sq ft incl. GST" — one phrasing for every surface that quotes the rate. */
export const INSTALL_RATE_LABEL = `₹${INSTALL_RATE_INCL_GST.toFixed(2)}/sq ft incl. GST`;

/** Taxable (ex-GST) value of a GST-inclusive amount, in whole rupees. */
export function exGst(inclusive: number): number {
  return Math.round(inclusive / (1 + GST_RATE));
}

export type InvoiceLine = { label: string; incl: number };

/**
 * Decompose GST-inclusive line items into a reconciled mini-invoice. Each line
 * is shown at its ex-GST value; GST is the remainder so lines + GST === total
 * exactly (no rounding drift), and total === sum of the inclusive amounts.
 */
export function gstInvoice(lines: InvoiceLine[]) {
  const taxableLines = lines.map((l) => ({ ...l, taxable: exGst(l.incl) }));
  const taxableSubtotal = taxableLines.reduce((s, l) => s + l.taxable, 0);
  const total = lines.reduce((s, l) => s + l.incl, 0);
  const gst = total - taxableSubtotal;
  return { taxableLines, taxableSubtotal, gst, total, rate: GST_RATE };
}

// --- A price that is SET, not computed -------------------------------------
// Everything above prices a piece by its area at a per-sq-ft make-rate. A
// limited edition doesn't work that way: it is one piece, sold once, and its
// price is a decision — ₹31,000 because that is what the work is worth, not
// because it happens to be 18 sq ft.
//
// The temptation is a `fixed_price` column that every surface has to remember
// to prefer. There are a dozen surfaces (product page, chat, cart, checkout,
// agent, Merchant feed, JSON-LD), and the one that forgets quotes a different
// number for the same piece — a price disagreement is a refund, not a typo.
//
// So a set price is stored the ONLY way the whole store already reads: as the
// rate that produces exactly that price at the piece's one finished size.
// Every surface keeps pricing through fixedSizePrice() and they cannot
// disagree, because there is still only one number in the database.

/**
 * The per-sq-ft rate that makes a piece of exactly `widthIn × heightIn` cost
 * exactly `price`, or null when it can't be hit exactly.
 *
 * Only meaningful for a piece sold at ONE size — with a ladder of sizes a
 * single set price has no meaning, and the caller must refuse that first.
 *
 * The returned rate is rounded to the 2 decimals product_materials.price_per_sqft
 * actually stores, and then CHECKED back through fixedSizePrice() — so this can
 * never hand back a rate that stores as something quoting a different price.
 */
export function setPriceRate(price: number, widthIn: number, heightIn: number): number | null {
  const widthCm = widthIn * CM_PER_INCH;
  const heightCm = heightIn * CM_PER_INCH;
  const area = areaSqFt(widthCm, heightCm);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(area) || area <= 0) return null;
  // numeric(10,2): store what the column will hold, not what the float says.
  const rate = Math.round((price / area) * 100) / 100;
  if (rate <= 0) return null;
  // The quoted figure must be the figure that was SET. roundRetail() would
  // happily turn ₹31,500 into ₹32,000 and the store would then show a price
  // nobody chose, so an unclean figure is refused here rather than silently
  // moved.
  return fixedSizePrice(widthCm, heightCm, rate) === price ? rate : null;
}
