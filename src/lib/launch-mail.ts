import { esc, type NewsletterEmailInput, type NewsletterGalleryItem } from "@/lib/newsletter-template";
import { countdownLabel, launchDateLabel, phaseOf, type CollectionLaunch } from "@/lib/launch";

/**
 * THE TWO LAUNCH MAILS.
 *
 * A launch writes to the list twice: once when the teaser opens, once on the
 * morning it goes live. Nothing else — a collection that mails four times in a
 * fortnight has taught the list to ignore it, and the second mail is the one
 * that has to arrive.
 *
 * Both are composed here as pure data, so the copy can be read and tested
 * without a mail server and without a database. Deciding WHETHER to send is
 * the route's job; deciding WHAT to say is this file's.
 */

export type LaunchMailKind = "teaser" | "launch";

/**
 * Which mail, if any, is due for this launch right now.
 *
 * Deliberately narrow. The teaser mail is due only on the day the teaser
 * OPENS, and the launch mail only on launch day itself — not on every day of
 * the window. A cron that runs hourly asks this repeatedly and must get "no"
 * on all but two mornings, with the ledger catching the repeats within those.
 */
export function launchMailDue(
  launch: CollectionLaunch,
  now: Date,
): LaunchMailKind | null {
  if (launch.cancelledAt) return null;
  const phase = phaseOf(launch, now);
  const DAY = 86_400_000;

  if (phase === "teaser") {
    const since = now.getTime() - (launch.launchAt.getTime() - launch.teaserDays * DAY);
    return since < DAY ? "teaser" : null;
  }
  if (phase === "live") {
    const since = now.getTime() - launch.launchAt.getTime();
    return since < DAY ? "launch" : null;
  }
  return null;
}

export type LaunchMailContext = {
  launch: CollectionLaunch;
  /** The collection's title as the catalogue holds it — "Taash". */
  collectionTitle: string;
  /** The line above the name: "Zyvorah × Mati", "A collaboration". */
  kicker: string;
  /** One or two sentences. The collection's own description, if it has one. */
  blurb: string;
  /** Where the mail sends people. Usually the collection, sometimes a
   *  dedicated shopfront like /mati. */
  href: string;
  heroImage: string | null;
  gallery: NewsletterGalleryItem[];
  siteUrl: string;
  senderName: string;
  senderAddress?: string | null;
  unsubscribeUrl: string;

  // --- copy overrides -------------------------------------------------------
  // A launch mail written from counts and dates reads like a dispatch note. A
  // collection that has a story should tell it, so these let the caller supply
  // real copy; every one falls back to the generic wording, so a launch with
  // nothing written still sends something correct.
  /** Inbox preview line — the second thing a reader sees, after the subject. */
  teaserHook?: string | null;
  launchHook?: string | null;
  /** The opening, as HTML. Replaces the blurb paragraph. */
  teaserStoryHtml?: string | null;
  launchStoryHtml?: string | null;
  launchSubject?: string | null;
  teaserCtaLabel?: string | null;
  launchCtaLabel?: string | null;
  galleryHeading?: string | null;
  heroCaption?: string | null;
  /** The collection's own page, when it has one. Live before launch, so the
   *  teaser can point somewhere real rather than at the homepage. */
  shopfrontHref?: string | null;
};

/**
 * The teaser mail: a date and three pictures, and nothing to click but the
 * date itself.
 *
 * It deliberately does not link to the collection. Everything is still a draft
 * on the day this goes out, so a link would land on a 404 or, worse, a page
 * that half-works — and a teaser whose only link is broken is a worse first
 * impression than no teaser at all.
 */
export function teaserMail(ctx: LaunchMailContext): NewsletterEmailInput {
  const when = launchDateLabel(ctx.launch);
  return {
    // The date IS the news. "A new collection · in 3 days" told the reader
    // about our publishing schedule; an inbox line has to earn a click with
    // something only this collection could say.
    subject: `${ctx.collectionTitle} — ${when}, 6pm`,
    previewText: ctx.teaserHook ?? ctx.blurb.slice(0, 110),
    kicker: ctx.kicker,
    title: ctx.collectionTitle,
    heroImage: ctx.heroImage,
    heroCaption: ctx.heroCaption ?? null,
    // The story, not the specification. The old version led with counts —
    // "fourteen to repeat, seven to hang whole" — which is a packing list, and
    // then closed on "nothing to do until then, we will write once more", which
    // is a note about email. Neither makes anyone want a wall.
    introHtml:
      (ctx.teaserStoryHtml ?? `<p>${esc(ctx.blurb)}</p>`) +
      `<p><strong>${esc(when)}, 6pm.</strong></p>`,
    sections: [],
    // Still no grid of designs — they cannot be bought yet, and a row of
    // shuttered doors is worse than none.
    gallery: [],
    galleryHeading: null,
    // The shopfront, when the collection has one. It is live and public before
    // launch, so the teaser can send people to something real instead of the
    // homepage — which is what "Visit Zyvorah" amounted to.
    ctaLabel: ctx.teaserCtaLabel ?? "Visit Zyvorah",
    ctaHref: ctx.shopfrontHref ?? ctx.siteUrl,
    unsubscribeUrl: ctx.unsubscribeUrl,
    siteUrl: ctx.siteUrl,
    senderName: ctx.senderName,
    senderAddress: ctx.senderAddress ?? null,
  };
}

/** The launch mail: it is here, this is what it is, here is the door. */
export function launchMail(ctx: LaunchMailContext): NewsletterEmailInput {
  return {
    subject: ctx.launchSubject ?? `${ctx.collectionTitle} is here`,
    previewText: ctx.launchHook ?? ctx.blurb.slice(0, 120),
    kicker: ctx.kicker,
    title: ctx.collectionTitle,
    heroImage: ctx.heroImage,
    heroCaption: ctx.heroCaption ?? null,
    introHtml: ctx.launchStoryHtml ?? `<p>${esc(ctx.blurb)}</p>`,
    sections: [],
    gallery: ctx.gallery,
    galleryHeading: ctx.galleryHeading ?? "From the collection",
    ctaLabel: ctx.launchCtaLabel ?? `See ${ctx.collectionTitle}`,
    ctaHref: ctx.shopfrontHref ?? ctx.href,
    unsubscribeUrl: ctx.unsubscribeUrl,
    siteUrl: ctx.siteUrl,
    senderName: ctx.senderName,
    senderAddress: ctx.senderAddress ?? null,
  };
}

export function composeLaunchMail(
  kind: LaunchMailKind,
  ctx: LaunchMailContext,
): NewsletterEmailInput {
  return kind === "teaser" ? teaserMail(ctx) : launchMail(ctx);
}
