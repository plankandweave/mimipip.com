/**
 * What a launch mail actually says.
 *
 * The generic mail is built from the two facts the launch module knows: a name
 * and a date. That is a dispatch note. The 5 September TAASH teaser opened
 * "A new collection · in 3 days", led on a packing list — "fourteen to repeat,
 * seven to hang whole" — and closed on "Nothing to do until then; we will write
 * once more, on the morning it lands", which is a sentence about our email
 * schedule. Nothing in it made anyone want a wall.
 *
 * So a collection with a story tells it. This is that copy, per collection,
 * keyed by handle; anything without an entry falls back to the generic wording
 * and still sends correctly.
 *
 * The register is the one the collection page uses (see lib/taash): plain, one
 * idea per sentence, no compressed poetry. The test for every line is whether
 * you could say it aloud to a customer without feeling silly.
 */
export type LaunchCopy = {
  shopfrontPath?: string;
  /** The homepage hero writes the collection's name the way its own shopfront
   *  does — for TAASH, the tracked-out Cormorant of the /mati title plate.
   *  Left unset, the hero keeps the store's own display face. */
  serifHeroTitle?: boolean;
  teaserHook?: string;
  teaserStoryHtml?: string;
  teaserCtaLabel?: string;
  launchSubject?: string;
  launchHook?: string;
  launchStoryHtml?: string;
  launchCtaLabel?: string;
  galleryHeading?: string;
  heroCaption?: string;
  /** Where two houses made the collection, the hero says so under the name,
   *  in the order the printed object does — and the partner's name is a link
   *  to their own house. Unset for anything Zyvorah made alone. */
  heroCredit?: { partner: string; partnerHref: string; house: string };
};

export const LAUNCH_COPY: Record<string, LaunchCopy> = {
  taash: {
    // /mati is live and public before the collection is buyable, so the teaser
    // can send people to something real. The old mail's only link was the
    // homepage.
    shopfrontPath: "/mati",
    serifHeroTitle: true,
    heroCaption: "Bisaat — Gehra, close",
    heroCredit: { partner: "Mati", partnerHref: "https://stylemati.in", house: "Zyvorah" },

    teaserHook: "A sheet of playing cards that nobody ever cut.",
    teaserStoryHtml:
      "<p>It came to us in a tin. One sheet of playing cards, hand-blocked, " +
      "printed once and printed badly, then folded away before anybody took a " +
      "blade to it.</p>" +
      "<p>The register had slipped. The setter's pencil marks were never rubbed " +
      "out. We did not restore it — we made it big enough to stand in.</p>" +
      "<p>Twenty-one surfaces, with Mati. Every one named for the sheet, the " +
      "press-room or the mark that made it.</p>",
    teaserCtaLabel: "See the collection",

    launchSubject: "TAASH — choose your hand",
    launchHook: "Twenty-one surfaces from a deck that was never cut. On the wall from today.",
    launchStoryHtml:
      "<p>The sheet in the tin is now a collection. Twenty-one surfaces, made " +
      "with Mati: fourteen that repeat across a wall, and seven murals drawn to " +
      "hang whole.</p>" +
      "<p>Every one carries its name — <i>Dhoop</i>, sunlight, for the sheet the " +
      "sun turned brown. <i>Soona</i>, empty, for the wall after the players " +
      "leave. <i>Parakh</i>, the test, for the single red pip a printer drops in " +
      "to check his work.</p>" +
      "<p>Printed to your wall, on matt linen-textured paper. No sheen, because " +
      "the artwork is a handled sheet and a glossy ground would argue with it.</p>",
    launchCtaLabel: "Bring a card to the wall",
    galleryHeading: "From the deck",
  },
};

export function launchCopyFor(handle: string): LaunchCopy {
  return LAUNCH_COPY[handle] ?? {};
}
