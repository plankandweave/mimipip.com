// Turns one Selection into a finished, safety-passed caption. The model writes
// in the brand voice; the safety gate vets the result; on a hard failure we
// regenerate (up to a few times) with the failure fed back, and only then give
// up. Soft issues (spelling) are auto-corrected in place.

import { copyWriterFor, type CopyWriter } from "./providers/copy";
import { CAPTION_SYSTEM, PILLARS } from "./voice";
import { checkCaption, autoCorrect, type SafetyResult } from "./safety";
import type { Selection } from "./select";

// CTAs rotate by pillar so the feed doesn't repeat one line forever.
const CTA_BY_PILLAR: Record<string, string> = {
  reveal: "See it on your own wall → link in bio.",
  room_story: "See it on your own wall → link in bio.",
  the_zyvorah_way: "Start with your wall size → link in bio.",
  founders_favourite: "Find it on zyvorah.com → link in bio.",
  feature: "Try it yourself → link in bio.",
  agentic_story: "Talk to the store → link in bio.",
  collection_story: "Explore the collection → link in bio.",
};

export type GeneratedCaption = {
  slotKey: string;
  handle: string;
  title: string;
  pillar: string;
  caption: string;
  safety: SafetyResult;
  attempts: number;
  /** Which model wrote it — recorded so a change of writer is visible in the
   *  review rather than inferred from a change in tone. */
  writer: string;
};

export type CaptionRevision = { original: string; note: string };

function buildUserPrompt(sel: Selection, priorFailure?: string, revision?: CaptionRevision): string {
  const c = sel.candidate;
  const pillar = PILLARS[sel.pillar];
  const priceLine =
    c.fromPrice != null
      ? `Verified from-price you MAY cite exactly: ₹${c.fromPrice}/sq ft, GST included, any size.`
      : `No price is available — do NOT mention any price.`;

  const parts = [
    `Write one Instagram caption.`,
    ``,
    `PILLAR: ${pillar.label}`,
    `PILLAR BRIEF: ${pillar.brief}`,
    ``,
    `DESIGN: ${c.title}`,
    c.descriptionPlain ? `ABOUT (background, use lightly — never lift verbatim): ${c.descriptionPlain.slice(0, 400)}` : ``,
    c.foundersNote ? `FOUNDER'S NOTE (spirit to draw on for a founder post): ${c.foundersNote}` : ``,
    c.rooms.length ? `SUITS ROOMS: ${c.rooms.join(", ")}` : ``,
    c.tags.length ? `STYLE/SUBJECT TAGS (for hashtag ideas): ${c.tags.join(", ")}` : ``,
    priceLine,
    `USE THIS CALL TO ACTION (verbatim, once, at the end): ${CTA_BY_PILLAR[sel.pillar]}`,
  ];

  if (revision) {
    parts.push(
      ``,
      `THE FOUNDER REVIEWED THE EXISTING CAPTION AND LEFT A NOTE. Honour the note — it outranks everything above except the safety rules.`,
      `EXISTING CAPTION:\n${revision.original}`,
      `FOUNDER'S NOTE (must be acted on, not merely acknowledged): ${revision.note}`,
      `Rewrite the caption accordingly, keeping the same length and register.`,
    );
  }

  if (priorFailure) {
    parts.push(
      ``,
      `Your previous attempt was REJECTED by the brand-safety check for: ${priorFailure}`,
      `Rewrite so this cannot happen. Do not describe how anything is made, and cite no price other than the verified one above.`,
    );
  }
  return parts.filter(Boolean).join("\n");
}

export async function generateCaption(
  sel: Selection,
  writer: CopyWriter = copyWriterFor(sel.channel),
  maxAttempts = 3,
  revision?: CaptionRevision,
): Promise<GeneratedCaption> {
  let lastResult: SafetyResult = { ok: false, issues: [] };
  let lastCaption = "";
  let priorFailure: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let caption = (await writer.write(CAPTION_SYSTEM, buildUserPrompt(sel, priorFailure, revision))).trim();

    caption = autoCorrect(caption); // fix spelling before judging
    const result = checkCaption(caption, { fromPrice: sel.candidate.fromPrice ?? undefined });

    lastCaption = caption;
    lastResult = result;

    if (result.ok) {
      return {
        slotKey: sel.slotKey,
        handle: sel.candidate.handle,
        title: sel.candidate.title,
        pillar: sel.pillar,
        caption,
        safety: result,
        attempts: attempt,
        writer: writer.name,
      };
    }
    priorFailure = result.issues
      .filter((i) => i.severity === "block")
      .map((i) => i.detail)
      .join("; ");
  }

  // Exhausted attempts — return the last (still-failing) result so the caller
  // logs and skips it rather than publishing.
  return {
    slotKey: sel.slotKey,
    handle: sel.candidate.handle,
    title: sel.candidate.title,
    pillar: sel.pillar,
    caption: lastCaption,
    safety: lastResult,
    attempts: maxAttempts,
    writer: writer.name,
  };
}
