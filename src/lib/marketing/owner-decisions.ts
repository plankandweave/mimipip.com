// The founder's decision page (/admin/marketing/decisions), database-free.
//
// Founder, 10 October 2026: she wants to make the calls herself, on one page,
// with the picture in front of her and one button per call. The Diwali plan's
// posts were held behind notes written for a production team ("require direct
// owner design review", "need owner confirmation") that no screen ever offered
// her as a decision. This turns each post's holds into ONE plain decision for
// her, separates what is production's (an export, a film), and says which
// holds her answer clears — so a post moves on the moment she answers.

export type DecisionKind = "choose-product" | "approve-design" | "confirm-film" | "redraw" | "production";

/** Holds that are hers to answer, and the decision that answers them. Order
 *  matters: the first that matches a post names its decision. */
const OWNER_HOLDS: { kind: Exclude<DecisionKind, "redraw" | "production">; test: RegExp }[] = [
  { kind: "choose-product", test: /exact collection and product destination need owner confirmation/i },
  { kind: "choose-product", test: /owner review required for revised seasonal copy and destination/i },
  { kind: "choose-product", test: /awaiting owner artwork, collection and destination/i },
  { kind: "confirm-film", test: /confirm video, caption and catalogue match in owner review/i },
  { kind: "approve-design", test: /require direct owner design review/i },
];

/** Holds her answer also settles: she is choosing to post what she can see
 *  on the page rather than wait for a file handed off elsewhere, or she has
 *  watched the film here. The final frame ("house-v5 footer", "final
 *  publishable creative") is what the redraw after her answer produces, in
 *  the measured house frame, so it is not a separate wait. And a Story's Link
 *  sticker is optional (founder, 9 October 2026): never a hold at all. */
const SETTLED_BY_ANSWER = [
  /native jpeg export is in the owner library handoff/i,
  /verify actual off-grid placement before publication/i,
  /private saved library preview requires staff sign-in/i,
  /final house-v5 footer frame not yet exported/i,
  /catalogue source preview: final publishable creative not exported/i,
  /link sticker/i,
];

export type Decision = {
  kind: DecisionKind;
  /** The one question, in her words. */
  question: string;
  /** What stays with production after she answers (never hers). */
  production: string[];
};

const ownerHold = (b: string) => OWNER_HOLDS.some((h) => h.test.test(b)) || SETTLED_BY_ANSWER.some((r) => r.test(b));

export function decisionFor(post: { format: string; blockers: string[] }): Decision {
  const production = post.blockers.filter((b) => !ownerHold(b));
  const owner = OWNER_HOLDS.find((h) => post.blockers.some((b) => h.test.test(b)));
  if (owner) return { kind: owner.kind, question: QUESTION[owner.kind], production };
  // A hold that is only the Library hand-off: her call is simply to use the
  // picture shown here.
  if (post.blockers.length && post.blockers.every((b) => SETTLED_BY_ANSWER.some((r) => r.test(b)))) {
    return { kind: "approve-design", question: QUESTION["approve-design"], production: [] };
  }
  if (production.length) return { kind: "production", question: "", production };
  // Nothing held but the picture itself (an old frame with no measured
  // house layout): one tap redraws it, then it waits for her final yes.
  return { kind: "redraw", question: QUESTION.redraw, production: [] };
}

const QUESTION: Record<Exclude<DecisionKind, "production">, string> = {
  "choose-product": "Which wallpaper should this post sell?",
  "approve-design": "Go ahead with this design?",
  "confirm-film": "Does this film, its caption and the wallpaper match?",
  redraw: "Redraw this in the house frame?",
};

/** The holds left once she answers. Production's holds stay. */
export function blockersAfterAnswer(blockers: string[]): string[] {
  return blockers.filter((b) => !ownerHold(b));
}

/** A post whose holds are all cleared is drawn again at once, in the
 *  measured house frame, and then waits on the review page for her yes. */
export const redrawsAfterAnswer = (blockers: string[]): boolean => blockersAfterAnswer(blockers).length === 0;
