/**
 * Who may be put on the newsletter when they hand us an email.
 *
 * The database is the enforcement (auto_subscribe / email_suppressed in
 * migration 20261006090000); this is the same rule written down in one place
 * the tests can pin, and the shape the app code reasons with.
 *
 * Never re-subscribe someone who unsubscribed, whose mail bounced, or who is in
 * DoNotContact. Giving us their email again — at checkout, in the concierge, by
 * a stranger typing it into the footer — is not them taking that back.
 */
export type SubscriberState = {
  unsubscribedAt?: string | Date | null;
  bouncedAt?: string | Date | null;
  doNotContact?: boolean;
  /** Trade contacts carry their own unsubscribe/bounce marks. */
  tradeSuppressed?: boolean;
};

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function normaliseEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const e = raw.trim().toLowerCase();
  return e.length > 0 && e.length <= 254 && EMAIL_RE.test(e) ? e : null;
}

export function isSuppressed(s: SubscriberState | null | undefined): boolean {
  if (!s) return false;
  return !!s.unsubscribedAt || !!s.bouncedAt || !!s.doNotContact || !!s.tradeSuppressed;
}

/** True when giving us `email` should turn marketing on for this person. */
export function mayAutoSubscribe(email: unknown, existing: SubscriberState | null | undefined): boolean {
  return normaliseEmail(email) !== null && !isSuppressed(existing);
}
