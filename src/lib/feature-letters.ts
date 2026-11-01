// The feature-nurture sequence — a distinct newsletter track from the weekly
// room case study. It re-engages people who visited the old Zyvorah store by
// walking them through one new way to choose wallpaper per week:
//
//   1. See it in your room   → /see-it-in-my-room   (true-scale room preview)
//   2. Print your wallpaper   → /print-your-own      (upload your own artwork)
//   3. Find my wallpaper      → /design-with         (the AI design curator)
//   4. Match a photo          → /match-a-photo       (find designs from an image)
//
// Each issue reuses the existing "Zyvorah Letter" email template (hero, sections
// with a real design on a wall, closing gallery, unsubscribe) so it looks native
// and carries the unsubscribe footer. Content is authored (not generated) so the
// re-engagement narrative is deliberate; imagery + gallery come from the live
// catalogue. Voice matches the brand (warm, editorial, made-to-measure).

import { SITE_URL } from "./seo";
import type { NewsletterEmailInput, NewsletterGalleryItem } from "./newsletter-template";

export type FeatureLetter = {
  slug: string; // stable id, also the theme stored on the issue
  path: string; // the feature's page
  subject: string;
  previewText: string;
  kicker: string;
  title: string;
  cta: string; // button label
  introHtml: string;
  sections: { heading: string; body_html: string }[];
  galleryHeading: string;
};

// The re-engagement opener is shared across the first send so returning visitors
// are reminded who we are and what's changed — warm, never guilt-y.
const RETURN_NOTE =
  "A little while ago, you stopped by Zyvorah. Thank you — it stayed with us. We've spent the months since making one thing true: you should never have to <em>guess</em> what a wall will look like. So here's the first of a few short notes, each about one new way to choose.";

export const FEATURE_LETTERS: FeatureLetter[] = [
  {
    slug: "see-it-in-your-room",
    path: "/see-it-in-my-room",
    subject: "See any design on your own wall — before you decide ✦",
    previewText: "Upload your wall, or use your camera, and watch a mural settle into your room at true scale.",
    kicker: "The Zyvorah Letter · A new way to choose",
    title: "See it in your room.",
    cta: "See it on your wall",
    introHtml: `<p>${RETURN_NOTE}</p>`,
    sections: [
      {
        heading: "Your wall, not a mockup",
        body_html:
          "<p>Take a photo of the wall you have in mind — or open your camera and point it at the wall itself. Choose any design, and it settles onto your wall at true architectural scale: the right size, the right proportion, sitting in your own light.</p>",
      },
      {
        heading: "Because scale is everything",
        body_html:
          "<p>A design that sings on a screen can feel entirely different across three metres of your living room. Seeing it in your room — before anything is made — is how you choose with certainty instead of hope. Everything is still sized to your wall.</p>",
      },
    ],
    galleryHeading: "Try one of these on your wall",
  },
  {
    slug: "create-your-wallpaper",
    path: "/print-your-own",
    subject: "Have an image you love? Make it your wall ✦",
    previewText: "Upload your own artwork or photograph and we'll prepare it to your exact wall size.",
    kicker: "The Zyvorah Letter · Make it yours",
    title: "Print your wallpaper.",
    cta: "Print your wallpaper",
    introHtml:
      "<p>Some walls call for something that is only yours — a painting, a photograph, a pattern you've carried for years. This week, a note about turning that into a wall.</p>",
    sections: [
      {
        heading: "From your image to your wall",
        body_html:
          "<p>Upload your own artwork or photograph. We prepare it to your exact wall size — the crop, the proportion, the finish — and you approve exactly what will be made before anything is printed. Sized to your wall, prepared for your order, entirely your own.</p>",
      },
      {
        heading: "What people bring us",
        body_html:
          "<p>A grandmother's textile. A honeymoon photograph blown to a whole wall. A child's drawing, kept forever. If it means something to you, it belongs on your wall — at the scale it deserves.</p>",
      },
    ],
    galleryHeading: "Or start from one of ours",
  },
  {
    slug: "find-my-wallpaper",
    path: "/design-with",
    subject: "Not sure where to start? Let's find your wallpaper ✦",
    previewText: "Answer a few gentle questions and we'll hand-pick designs for your room.",
    kicker: "The Zyvorah Letter · Let us help you choose",
    title: "Find my wallpaper.",
    cta: "Find my wallpaper",
    introHtml:
      "<p>Hundreds of designs is a wonderful problem — until it's your wall and your decision. This week, the easiest way in.</p>",
    sections: [
      {
        heading: "A stylist, in a few questions",
        body_html:
          "<p>Tell us about your room — the mood you want, the light it gets, the wall you're thinking of. A few unhurried questions, and we hand-pick the designs that suit it, then show them on your wall. Like having a design consultant, without the appointment.</p>",
      },
      {
        heading: "Guidance, not a catalogue",
        body_html:
          "<p>North-facing rooms suit warmer palettes; small rooms suit lighter, airier designs. We choose with that in mind — so what you see is what actually belongs in your space.</p>",
      },
    ],
    galleryHeading: "A few of our signatures",
  },
  {
    slug: "match-a-photo",
    path: "/match-a-photo",
    subject: "Saw something you loved? Find it in a wall ✦",
    previewText: "Photograph anything — a fabric, a tile, a mood — and find designs that echo it.",
    kicker: "The Zyvorah Letter · From a photo to a wall",
    title: "Match a photo.",
    cta: "Match a photo",
    introHtml:
      "<p>Inspiration rarely arrives as a wallpaper. It's a fabric in a shop, a tile in a café, the colour of a particular evening. This week — how to follow it to your wall.</p>",
    sections: [
      {
        heading: "Photograph it, and we'll find its echo",
        body_html:
          "<p>Upload or snap a picture of anything you love — a textile, a tile, a painting, a palette — and we find the designs in our collection that echo its mood, colour and character. A way to start from a feeling instead of a search box.</p>",
      },
      {
        heading: "The wall that matches your room",
        body_html:
          "<p>Bring a photo of a cushion, a rug, a favourite corner — and find a mural that belongs with it. Then see it on your wall, ready to make your own.</p>",
      },
    ],
    galleryHeading: "Designs people match most",
  },
];

/**
 * Build the email-template input for feature issue `index`, given a hero image
 * and a gallery drawn from the live catalogue. The CTA is threaded into the
 * first section as a link, and each section can carry a design image supplied by
 * the caller. `unsubscribeUrl` is filled per-recipient by the send pipeline.
 */
export function buildFeatureIssue(
  index: number,
  media: { heroImage: string | null; heroCaption?: string; sectionImages?: (string | null)[]; gallery: NewsletterGalleryItem[] },
): Omit<NewsletterEmailInput, "unsubscribeUrl" | "siteUrl" | "senderName" | "senderAddress"> & { theme: string; ctaUrl: string; cta: string } {
  const f = FEATURE_LETTERS[index];
  const ctaUrl = `${SITE_URL}${f.path}?utm_source=newsletter&utm_medium=email&utm_campaign=feature_${f.slug}`;

  const sections = f.sections.map((s, i) => ({
    heading: s.heading,
    body_html: s.body_html,
    image: media.sectionImages?.[i] ?? null,
    href: i === 0 ? ctaUrl : null,
  }));

  return {
    subject: f.subject,
    previewText: f.previewText,
    kicker: f.kicker,
    title: f.title,
    heroImage: media.heroImage,
    heroCaption: media.heroCaption ?? "Sized to your wall · prepared for your order",
    introHtml: f.introHtml,
    sections,
    gallery: media.gallery,
    galleryHeading: f.galleryHeading,
    theme: f.slug,
    ctaUrl,
    cta: f.cta,
  };
}
