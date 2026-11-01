// Words that are printed ON the picture must be words for a follower.
//
// On 3 October 2026 the reel engine set "AHIMSA · October 2 Reel —
// publication verification required" in display type across an Ahimsa reel.
// That was the review board's working title for the slot — a note to the
// founder about the post, not the post — and the composer prints slot.title
// as the headline. The brand-safety gate only ever read the CAPTION, so
// nothing between the plan and the frame read the headline at all.
//
// Pure, so the desk (which hides Compose and Approve) and the composer (which
// refuses to render, and refuses to publish a frame already rendered) agree.

const WORKFLOW = /\b(?:verification|unverified|publication|approval|reapproval|pending|awaiting|required|placeholder|tbd|todo|do not post|retry|blockers?|draft|record[- ]only|owner review|not composed)\b/i;
const MONTHS = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
// "October 2 Reel", "Oct 7th story", "2 October post" — a slot's address, not a headline.
const SLOT_ADDRESS = new RegExp(
  `\\b(?:(?:${MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?|\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTHS}))\\s+(?:reel|reels|story|stories|post|carousel|slot|grid)\\b`,
  "i",
);

/** Why this text cannot be printed on a frame, or null when it can. */
export function frameTextProblem(text: string | null | undefined): string | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  const w = t.match(WORKFLOW);
  if (w) return `"${t}" reads as a working note ("${w[0]}"), not a headline — give the slot a real title before composing`;
  const a = t.match(SLOT_ADDRESS);
  if (a) return `"${t}" names the slot ("${a[0]}"), not the post — give the slot a real title before composing`;
  return null;
}

/** The first problem with the words a slot would print on its picture. */
export function slotFrameTextProblem(slot: { title?: string | null; hook?: string | null; collection?: string | null }): string | null {
  return frameTextProblem(slot.title) ?? frameTextProblem(slot.hook) ?? frameTextProblem(slot.collection);
}
