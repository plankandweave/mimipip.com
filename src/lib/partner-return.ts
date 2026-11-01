// Where a partner lands after signing in, when they arrived from a link to
// one exact thing — the "approve your store's artwork" email, a bookmark of a
// survey. Before this, a signed-out tap on that link dropped them on the
// orders board and left them to find the store again (Vijay Sales, 8 October
// 2026: "he doesn't know where to go to find the file to approve").
//
// Only named local destinations are accepted, never an arbitrary URL: the
// value rides in a query string anyone can edit, and an open redirect on a
// sign-in page is a phishing kit.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The sub-path under `/partners/<slug>/` that `next` names, or null. */
export function partnerReturnPath(next: unknown): string | null {
  if (typeof next !== "string") return null;
  if (next === "documents") return "documents";
  if (next === "vault") return "vault";
  const batch = /^site-batches\/(.+)$/.exec(next);
  if (batch && UUID.test(batch[1])) return `site-batches/${batch[1].toLowerCase()}`;
  return null;
}
