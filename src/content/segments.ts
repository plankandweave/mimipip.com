import type { Segment } from "./projects/types";

/**
 * Segment landing pages — the pages cold outreach actually links to.
 *
 * An email to a hospital estates director and one to a developer should not
 * land on the same page. These are cheap to write and fast to render (words,
 * a hero, a strip of books), which is deliberate: the expensive artefact is
 * the case-study book, and books are shared across segments rather than
 * rebuilt per segment.
 *
 * Copy rule: say what the walls DO for their building, in their vocabulary.
 * Nothing here should read as wallpaper marketing.
 */
export type SegmentPage = {
  slug: Segment;
  /** Nav and card label. */
  label: string;
  title: string;
  standfirst: string;
  /** What the reader is actually worried about, in their words. */
  problems: { t: string; d: string }[];
  /** What a commission with us looks like for this sector. */
  promise: string[];
  /** Closing line above the enquiry link. */
  ask: string;
};

export const SEGMENTS: SegmentPage[] = [];

export function getSegment(slug: string): SegmentPage | undefined {
  return SEGMENTS.find((s) => s.slug === slug);
}
