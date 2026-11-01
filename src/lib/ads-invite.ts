// The one-time email that asks the list whether we may show them Zyvorah
// designs in ads on Google and Meta (Customer Match / Custom Audiences).
//
// The button goes to /ads-consent/yes?t=<unsubscribe_token>, a page whose own
// button records the "yes" — opening the email link never does (see migration
// 20261005090000 for why). Sent by /api/cron/ads-invite.

import { newsletterEmail } from "./newsletter-template";

/** Business-hours window for customer mail: Monday to Saturday, 10:00–18:00
 *  IST. Inside the founder's 9–7, never on a Sunday, and away from both edges
 *  so a slow run cannot spill past 7 PM. */
export function inInviteWindow(now: Date): boolean {
  const ist = new Date(now.getTime() + 330 * 60_000);
  const day = ist.getUTCDay(); // 0 = Sunday
  const hour = ist.getUTCHours();
  return day !== 0 && hour >= 10 && hour < 18;
}

export function adsInviteEmail(input: {
  siteUrl: string;
  yesUrl: string;
  unsubscribeUrl: string;
  senderName: string;
  senderAddress?: string | null;
}): { subject: string; html: string } {
  return newsletterEmail({
    subject: "May we show you new Zyvorah designs on Instagram?",
    previewText: "One click, entirely optional, and you can change your mind at any time.",
    kicker: "A small question from Zyvorah",
    title: "May we show you our new designs as you browse?",
    introHtml: [
      "<p>Thank you for being part of Zyvorah. We release new wallpapers and murals every week, and many of the people who love them first see them on Instagram, Facebook or YouTube.</p>",
      "<p>With your permission, we would share a scrambled copy of your email address with Google and Meta, so that our new collections appear for you there. They use it only for this, and nothing about your orders is shared.</p>",
      "<p>It is entirely optional. If you would rather not, simply ignore this email and nothing changes. If you say yes, you can change your mind at any time from your account page or from any of our emails.</p>",
    ].join(""),
    sections: [],
    gallery: [],
    ctaLabel: "Yes, show me",
    ctaKicker: null,
    ctaHref: input.yesUrl,
    unsubscribeUrl: input.unsubscribeUrl,
    siteUrl: input.siteUrl,
    senderName: input.senderName,
    senderAddress: input.senderAddress ?? null,
  });
}
