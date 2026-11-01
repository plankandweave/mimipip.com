// Zyvorah gift-card designs. Each occasion is a credit-card-shaped face in a
// single SOLID colour drawn from the brand logo palette, carrying the real
// Zyvorah logo (embedded wordmark geometry, not a font). `giftCardSvg` is the
// single source of truth — used for the live preview on the page (as a data-URI)
// and rendered to a PNG for the delivery email, so the card the buyer designs is
// the card that arrives.

import { WORDMARK_VIEWBOX, WORDMARK_INNER } from "./wordmark-svg";

export type GiftDesign = {
  id: string;
  label: string;    // picker label
  greeting: string; // shown on the card face
  bg: string;       // solid background — a brand logo colour
  ink: string;      // text + logo colour (charcoal on light cards, white on the black one)
};

// Colours are the Zyvorah logo palette (zyvorah-color.svg). #48b3d7 (the dot's
// blue) is never used as a background so the logo dot always reads.
export const GIFT_DESIGNS: GiftDesign[] = [
  { id: "general",      label: "Classic",      greeting: "The gift of a beautiful wall", bg: "#0F0F0F", ink: "#FFFFFF" },
  { id: "birthday",     label: "Birthday",     greeting: "Happy Birthday",               bg: "#EA8F9E", ink: "#0F0F0F" },
  { id: "wedding",      label: "Wedding",      greeting: "To the happy couple",          bg: "#FFD3C2", ink: "#0F0F0F" },
  { id: "new-baby",     label: "New baby",     greeting: "Welcome, little one",          bg: "#B2DCFA", ink: "#0F0F0F" },
  { id: "housewarming", label: "Housewarming", greeting: "Happy Housewarming",           bg: "#BFD202", ink: "#0F0F0F" },
  { id: "diwali",       label: "Diwali",       greeting: "Happy Diwali",                 bg: "#FCBF51", ink: "#0F0F0F" },
  { id: "christmas",    label: "Christmas",    greeting: "Merry Christmas",              bg: "#92A519", ink: "#0F0F0F" },
  { id: "festival",     label: "Festival",     greeting: "Season's Greetings",           bg: "#D5A9CF", ink: "#0F0F0F" },
];

export function getGiftDesign(id?: string | null): GiftDesign {
  return GIFT_DESIGNS.find((d) => d.id === id) ?? GIFT_DESIGNS[0];
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The full gift-card face as an SVG string (credit-card ~1.586:1). */
export function giftCardSvg(
  designId: string | null | undefined,
  opts: { amountLabel: string; recipientName?: string | null } = { amountLabel: "" },
): string {
  const d = getGiftDesign(designId);
  const w = 500, h = 315;
  const forName = opts.recipientName?.trim();
  const white = d.ink === "#FFFFFF";
  // The real logo: dark letters by default; recolour to white on the black card.
  const wordmark = white ? WORDMARK_INNER.replace(/#0F0F0F/gi, "#FFFFFF") : WORDMARK_INNER;
  const sub = white ? "rgba(255,255,255,0.7)" : "rgba(15,15,15,0.55)";
  // Wordmark box: keep the logo's aspect (194:62 ≈ 3.13) — 150 wide → ~48 tall.
  const logoW = 150, logoH = Math.round((logoW * 62) / 194);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img">
  <defs><clipPath id="card"><rect x="0" y="0" width="${w}" height="${h}" rx="26"/></clipPath></defs>
  <g clip-path="url(#card)">
    <rect width="${w}" height="${h}" fill="${d.bg}"/>
    <!-- the real Zyvorah logo -->
    <svg x="30" y="30" width="${logoW}" height="${logoH}" viewBox="${WORDMARK_VIEWBOX}" preserveAspectRatio="xMinYMid meet">${wordmark}</svg>
    <!-- occasion greeting -->
    <text x="${w - 34}" y="52" text-anchor="end" font-family="Georgia, 'Times New Roman', serif" font-style="italic" font-size="21" fill="${d.ink}">${esc(d.greeting)}</text>
    <!-- gift card label + amount -->
    <text x="34" y="${h - 92}" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="700" letter-spacing="2.5" fill="${sub}">GIFT CARD</text>
    <text x="34" y="${h - 44}" font-family="Arial, Helvetica, sans-serif" font-size="52" font-weight="800" fill="${d.ink}">${esc(opts.amountLabel)}</text>
    ${forName ? `<text x="${w - 34}" y="${h - 30}" text-anchor="end" font-family="Georgia,'Times New Roman',serif" font-size="16" fill="${sub}">For ${esc(forName)}</text>` : ""}
  </g>
  <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="26" fill="none" stroke="rgba(0,0,0,0.08)"/>
</svg>`;
}

/** URL-encoded data URI for use as an <img src> in the browser preview. */
export function giftCardDataUri(
  designId: string | null | undefined,
  opts: { amountLabel: string; recipientName?: string | null },
): string {
  return `data:image/svg+xml,${encodeURIComponent(giftCardSvg(designId, opts))}`;
}
