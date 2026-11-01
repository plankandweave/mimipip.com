// The weekly newsletter email — "The Zyvorah Letter". A visual, image-led
// case study: a hero room scene, a mapped room image inside every section, and
// a closing scene gallery — so each issue reads like a little design story with
// the wallpaper shown on real walls, not a text bulletin.
//
// Typography is deliberately editorial: a serif (Georgia) for the headline and
// section headings, a clean sans for body, and letter-spaced uppercase "eyebrow"
// labels — so it reads like a design magazine, not a system email.
import { emailWordmark } from "@/lib/email-wordmark";

const CLOUD = "#FAFAF7";
const CHARCOAL = "#141414";
const INK = "#2b2b2b";
const SLATE = "#4a4a4a";
const MIST = "#8a8a86";
const CYAN = "#48b3d7";
const EDGE = "#eceae4";
const WASH = "#f4f2ec";

// Font stacks — all system fonts (web fonts are stripped by most mail clients).
const SERIF = "Georgia, 'Times New Roman', Times, serif";
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";

const MOBILE = `@media only screen and (max-width:600px){
  .zy-pad{padding-left:24px!important;padding-right:24px!important}
  .zy-h1{font-size:28px!important;line-height:1.18!important}
  .zy-gcell{display:block!important;width:100%!important;padding:0 0 16px 0!important}
}`;

export function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export type NewsletterSection = {
  heading: string;
  body_html: string;
  image?: string | null; // a design shown on the room's wall (mapped image)
  imageCaption?: string | null;
  href?: string | null; // link to the featured design
};
export type NewsletterGalleryItem = {
  title: string;
  handle: string;
  image: string | null;
  priceFrom?: string | null;
};

export type NewsletterEmailInput = {
  subject: string;
  previewText?: string | null;
  kicker?: string | null; // e.g. "The Zyvorah Letter · A living-room case study"
  title: string;
  heroImage?: string | null;
  heroCaption?: string | null;
  introHtml: string;
  sections: NewsletterSection[];
  gallery: NewsletterGalleryItem[];
  galleryHeading?: string | null;
  unsubscribeUrl: string;
  siteUrl: string;
  senderName: string;
  senderAddress?: string | null;
  // Optional primary-CTA override. Defaults to "Explore the wallpaper" → the
  // wall-art hub; the feature-nurture letters point it at the feature itself.
  ctaLabel?: string | null;
  ctaHref?: string | null;
  /** The small label above the button. Defaults to "Bring one home"; null
   *  hides it (a permission question is not a sales pitch). */
  ctaKicker?: string | null;
};

// Small uppercase, wide-tracked label used for eyebrows / captions / section kickers.
function eyebrow(text: string, color = MIST): string {
  return `<span style="font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:${color};">${esc(text)}</span>`;
}

// The primary CTA — a crisp charcoal button with wide-tracked uppercase type and
// a cyan arrow (echoing the wordmark's cyan dot). Not a fat black pill.
function cta(label: string, href: string): string {
  return `<a href="${esc(href)}" style="display:inline-block;background:${CHARCOAL};color:#ffffff;text-decoration:none;font-family:${SANS};font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;border-radius:8px;padding:17px 42px;">${esc(label)}&nbsp;&nbsp;<span style="color:${CYAN};">&#8594;</span></a>`;
}

// A full-width room image with a caption — the "mapped image".
function roomImage(src: string, caption?: string | null, href?: string | null): string {
  const img = `<img src="${esc(src)}" width="512" alt="${esc(caption || "")}" style="display:block;width:100%;max-width:512px;height:auto;border:0;border-radius:14px;" />`;
  const wrapped = href ? `<a href="${esc(href)}" style="text-decoration:none;">${img}</a>` : img;
  const cap = caption
    ? `<div style="margin-top:9px;">${eyebrow(caption)}</div>`
    : "";
  return `<div style="margin:22px 0 4px;">${wrapped}${cap}</div>`;
}

function sectionBlock(s: NewsletterSection): string {
  const heading = `<h2 style="margin:34px 0 6px;font-family:${SERIF};font-size:22px;line-height:1.28;font-weight:700;color:${CHARCOAL};">${esc(s.heading)}</h2>`;
  const image = s.image ? roomImage(s.image, s.imageCaption, s.href) : "";
  const body = `<div style="font-family:${SANS};font-size:15px;line-height:1.8;color:${SLATE};">${s.body_html}</div>`;
  const link = s.href
    ? `<div style="margin-top:12px;"><a href="${esc(s.href)}" style="font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${CYAN};text-decoration:none;">See it on your wall &#8594;</a></div>`
    : "";
  return heading + image + body + link;
}

function galleryGrid(items: NewsletterGalleryItem[], siteUrl: string, heading: string): string {
  if (!items.length) return "";
  const cell = (it: NewsletterGalleryItem): string => {
    const href = `${siteUrl}/products/${encodeURIComponent(it.handle)}?utm_source=newsletter&utm_medium=email`;
    // Fixed aspect thumbnail (object-fit:cover) so every cell aligns regardless
    // of whether the source scene is portrait or landscape — mixed orientations
    // were breaking the grid.
    const img = it.image
      ? `<img src="${esc(it.image)}" width="240" height="288" alt="${esc(it.title)}" style="display:block;width:100%;height:288px;object-fit:cover;object-position:center;border-radius:12px;border:1px solid ${EDGE};" />`
      : `<div style="width:100%;height:288px;background:${WASH};border-radius:12px;"></div>`;
    const price = it.priceFrom ? `<span style="color:${MIST};font-weight:400;"> · ${esc(it.priceFrom)}</span>` : "";
    return `<td class="zy-gcell" width="50%" valign="top" style="padding:0 8px 18px 8px;">
      <a href="${esc(href)}" style="text-decoration:none;">${img}</a>
      <div style="font-family:${SERIF};font-size:15px;font-weight:700;color:${CHARCOAL};margin-top:10px;">${esc(it.title)}${price}</div>
      <div style="margin-top:5px;"><a href="${esc(href)}" style="font-family:${SANS};font-size:10.5px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${CYAN};text-decoration:none;">See it in your room &#8594;</a></div>
    </td>`;
  };
  const rows: string[] = [];
  for (let i = 0; i < items.length; i += 2) {
    rows.push(`<tr>${cell(items[i])}${items[i + 1] ? cell(items[i + 1]) : '<td width="50%"></td>'}</tr>`);
  }
  return `<div style="margin-top:38px;padding-top:28px;border-top:1px solid ${EDGE};">
    <div style="margin-bottom:18px;">${eyebrow(heading)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 -8px;"><tbody>${rows.join("")}</tbody></table>
  </div>`;
}

export function newsletterEmail(d: NewsletterEmailInput): { subject: string; html: string } {
  const preheader = (d.previewText || "").slice(0, 140);

  const hero = d.heroImage
    ? `<img src="${esc(d.heroImage)}" width="600" alt="${esc(d.heroCaption || d.title)}" style="display:block;width:100%;max-width:600px;height:auto;border:0;" />`
    : "";

  const sectionsHtml = d.sections.map(sectionBlock).join("");
  const gallery = galleryGrid(d.gallery, d.siteUrl, d.galleryHeading || "More designs on this wall");

  const html = `<!doctype html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light"/>
<style>${MOBILE}</style></head>
<body style="margin:0;padding:0;background:${CLOUD};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CLOUD};">
<tr><td align="center" style="padding:36px 16px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:22px;border:1px solid ${EDGE};overflow:hidden;box-shadow:0 12px 40px rgba(20,20,20,0.06);">
    <tr><td style="height:5px;background:${CYAN};font-size:0;line-height:0;">&nbsp;</td></tr>
    ${hero ? `<tr><td>${hero}</td></tr>` : ""}
    <tr><td class="zy-pad" style="padding:38px 48px 8px;">
      <div style="line-height:0;">${emailWordmark(28)}</div>
      ${d.kicker ? `<div style="margin-top:22px;">${eyebrow(d.kicker)}</div>` : ""}
      <h1 class="zy-h1" style="margin:10px 0 18px;font-family:${SERIF};font-size:32px;line-height:1.16;font-weight:700;color:${CHARCOAL};letter-spacing:-0.01em;">${esc(d.title)}</h1>
      <div style="font-family:${SANS};font-size:15.5px;line-height:1.8;color:${INK};">${d.introHtml}</div>
      ${sectionsHtml}
      ${gallery}
      <div style="margin:40px 0 4px;text-align:center;">
        ${d.ctaKicker === null ? "" : `<div style="margin-bottom:16px;">${eyebrow(d.ctaKicker ?? "Bring one home")}</div>`}
        ${cta(d.ctaLabel || "Explore the wallpaper", d.ctaHref || `${d.siteUrl}/collections/wall-art?utm_source=newsletter&utm_medium=email`)}
      </div>
    </td></tr>
    <tr><td class="zy-pad" style="padding:32px 48px 40px;border-top:1px solid ${EDGE};" align="center">
      <div style="line-height:0;">${emailWordmark(22)}</div>
      <div style="font-family:${SERIF};font-style:italic;font-size:14px;line-height:1.6;color:${SLATE};margin-top:10px;max-width:360px;margin-left:auto;margin-right:auto;">Mural wallpaper &amp; hand-designed murals, printed in India.</div>
      <div style="margin-top:16px;font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;">
        <a href="${esc(d.siteUrl)}" style="color:${CHARCOAL};text-decoration:none;">zyvorah.com</a>
        <span style="color:${MIST};">&nbsp;&nbsp;&middot;&nbsp;&nbsp;</span>
        <a href="mailto:hello@zyvorah.com" style="color:${CHARCOAL};text-decoration:none;">hello@zyvorah.com</a>
      </div>
      <div style="margin-top:18px;font-family:${SANS};font-size:11px;line-height:1.65;color:${MIST};">
        ${esc(d.senderName)}${d.senderAddress ? `<br/>${esc(d.senderAddress)}` : ""}
      </div>
      <div style="margin-top:16px;font-family:${SANS};font-size:11px;line-height:1.65;color:${MIST};">
        You&rsquo;re receiving this because you enrolled with Zyvorah.<br/>
        <a href="${esc(d.unsubscribeUrl)}" style="color:${MIST};text-decoration:underline;">Unsubscribe</a> anytime.
      </div>
    </td></tr>
  </table>
</td></tr></table></body></html>`;

  return { subject: d.subject, html };
}
