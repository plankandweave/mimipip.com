/**
 * No concierge conversation starts without a VERIFIED email (founder,
 * 6 October 2026: "every email should be 100% verified for the chat to
 * start"). Every message costs model tokens, and a typed-in address proves
 * nothing — anyone can type someone else's.
 *
 * Verified means the caller is signed in with a confirmed email: the
 * concierge's own email step sends the same one-time code the sign-in modal
 * does, and the code itself is the proof (see getGatedUser). There is no
 * "email only" door: an unverified session is refused, whatever the client
 * says, before /api/concierge builds a model client.
 *
 * Dependencies are injected so the rule is testable without a database.
 */

export const EMAIL_REQUIRED_BODY = {
  error: "Please verify your email to start chatting.",
  code: "email_required",
} as const;

export type ConciergeGateDeps = {
  /** The signed-in customer's CONFIRMED email, if any (getGatedUser). */
  verifiedEmail: () => Promise<string | null>;
  /** Links the chat session to that address (concierge_link_session) —
   *  links only; subscribing happens at sign-in, under its disclosure. */
  linkSession: (sessionId: string, email: string) => Promise<void>;
};

export type ConciergeGateResult =
  | { ok: true; email: string }
  | { ok: false; status: 401; body: { error: string; code: string } };

export async function conciergeGate(sessionId: string | null, deps: ConciergeGateDeps): Promise<ConciergeGateResult> {
  const email = await deps.verifiedEmail();
  if (!email) return { ok: false, status: 401, body: EMAIL_REQUIRED_BODY };
  if (sessionId) await deps.linkSession(sessionId, email);
  return { ok: true, email };
}
