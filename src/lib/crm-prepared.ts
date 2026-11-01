// A CRM email prepared by hand rather than by the drafter — a designed letter
// with pictures, such as a new-collection note to the one customer who asked
// for it. The drafter writes plain text and bodyToHtml turns it into a plain
// HTML email; a prepared draft carries its own finished HTML beside the text.
//
// Why this exists (6 October 2026): the Gmail connector strips every <img>
// from a draft and rewrites every link to google.com/url?q=…, so a picture
// email to a customer could not be built there. The founder's own sender
// (src/lib/founder-mail.ts) passes HTML through untouched, so the letter is
// staged here and leaves when Roheena presses Send under the task.
//
// Two rules, both enforced server side:
//   1. A prepared draft is never silently replaced by the drafter. Its
//      context_hash is PREPARED_HASH, which the task-action route treats as
//      always current; "Write it again" still overwrites it on request.
//   2. The HTML sent is the STORED one, never HTML from the browser — the
//      client only says which option. And it is sent only while the text in
//      the box is still the prepared text: once Roheena edits the words, what
//      she sees is what goes, as plain text, rather than an HTML version that
//      no longer says what she wrote.

export const PREPARED_HASH = "prepared";

export type PreparedOption = { subject: string; body: string; html?: string };

/** The stored HTML to send for this option, or null to fall back to the plain
 *  text. Whitespace at the ends is ignored, as the route trims the body. */
export function preparedHtml(
  stored: PreparedOption | undefined,
  sent: { subject: string; body: string },
): string | null {
  if (!stored?.html) return null;
  if (stored.body.trim() !== sent.body.trim()) return null;
  if (stored.subject.trim() !== sent.subject.trim()) return null;
  return stored.html;
}
