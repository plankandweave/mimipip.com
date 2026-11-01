// The one-time notice to EXISTING account holders who never opted in: from
// now on they will receive our new collections, with a one-click unsubscribe.
// Founder decision, 6 October 2026 — existing sign-ups are not flipped
// silently; each is told first, and marked opted in only once told
// (optin_notice_mark_sent, migration 20261006090000).
//
// Sent by /api/cron/optin-notice, which does nothing until a person sets
// optin_notice_settings.stage to 'test' or 'live'.

import { IST_OFFSET_MS } from "./ist";
import { newsletterEmail } from "./newsletter-template";

/** Customer mail goes out only between 9 am and 7 pm IST, and never on a
 *  Sunday. Checked before EVERY send, not once per run, so a slow run cannot
 *  spill past seven. */
export function inMailWindow(now: Date): boolean {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const day = ist.getUTCDay(); // 0 = Sunday
  const hour = ist.getUTCHours();
  return day !== 0 && hour >= 9 && hour < 19;
}

export type NoticeHeroCandidate = {
  title: string;
  images: { url: string; is_flat: boolean | null; width?: number | null; height?: number | null }[];
};

/**
 * The picture at the top of the notice: the newest design shown in a ROOM,
 * never the flat swatch (homepage rule 9 — a wallpaper is shown on a wall),
 * and a landscape render where one exists so the email stays short on a
 * phone. Candidates arrive newest first.
 */
export function pickNoticeHero(candidates: NoticeHeroCandidate[]): { image: string; caption: string } | null {
  const renders = (c: NoticeHeroCandidate) => c.images.filter((i) => !i.is_flat && i.url);
  const landscape = (i: { width?: number | null; height?: number | null }) =>
    !!i.width && !!i.height && i.width >= i.height;
  for (const c of candidates) {
    const img = renders(c).find(landscape);
    if (img) return { image: img.url, caption: c.title };
  }
  for (const c of candidates) {
    const img = renders(c)[0];
    if (img) return { image: img.url, caption: c.title };
  }
  return null;
}

export function optinNoticeEmail(input: {
  siteUrl: string;
  unsubscribeUrl: string;
  senderName: string;
  senderAddress?: string | null;
  hero?: { image: string; caption: string } | null;
}): { subject: string; html: string } {
  return newsletterEmail({
    subject: "New collections from Zyvorah, straight to your inbox",
    previewText: "A short note, and a one-click way to opt out if you would rather not.",
    kicker: "A short note from Zyvorah",
    title: "We will share our new collections with you",
    introHtml: [
      "<p>Thank you for having a Zyvorah account. We release new wallpapers and murals every week, and from now on we will send you a short note when a new collection arrives, along with the occasional update from our studio.</p>",
      // Kept deliberately small (founder, 6 Oct 2026): one quiet line.
      '<p style="font-size:12px;line-height:1.5;color:#8a8a8a;margin-top:4px;">Prefer not to? Unsubscribe below in one click. Order emails are unaffected.</p>',
    ].join(""),
    heroImage: input.hero?.image ?? null,
    heroCaption: input.hero?.caption ?? null,
    sections: [],
    gallery: [],
    ctaLabel: "See what is new",
    ctaKicker: null,
    ctaHref: `${input.siteUrl}/?utm_source=optin_notice&utm_medium=email`,
    unsubscribeUrl: input.unsubscribeUrl,
    siteUrl: input.siteUrl,
    senderName: input.senderName,
    senderAddress: input.senderAddress ?? null,
  });
}
