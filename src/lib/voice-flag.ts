/**
 * Master switch for the voice concierge (VAPI call button + the /api/voice/chat
 * custom-LLM endpoint it drives). Off while we concentrate spend on the text
 * concierge and the curator.
 *
 * Deliberately a plain constant rather than an env var: the VAPI keys are still
 * set in production, so an env-based switch would leave the endpoint live the
 * moment someone re-added a variable. Flipping this to `true` re-enables both
 * halves together — the browser widget and the server endpoint must never
 * disagree, or VAPI's servers keep spending Sonnet budget on calls placed to an
 * assistant whose button no longer exists.
 */
export const VOICE_ENABLED = false;

/**
 * Master switch for the OUTBOUND follow-up caller (src/lib/voice-followup.ts,
 * the voice-followups cron and the /api/voice/followup custom-LLM endpoint).
 *
 * Separate from VOICE_ENABLED on purpose (30 September 2026). The inbound
 * concierge is off to save Sonnet spend on anonymous browsers; the follow-up
 * caller only ever talks to a customer who has just paid for a sample, written
 * to us or filled a cart, which is exactly where a conversation earns its cost.
 * Turning the browser button back on must not start dialling customers, and
 * pausing the calls must not need the button touched.
 *
 * `true` does not by itself place a call: the cron is inert until
 * VAPI_PHONE_NUMBER_ID names a number imported into Vapi (see
 * docs/voice-followup-agent.md). Set this to `false` to stop every outbound
 * call AND refuse the endpoint mid-call — a plain constant, like
 * VOICE_ENABLED, so it cannot be flipped by a stray environment variable.
 */
export const VOICE_FOLLOWUP_ENABLED = true;
