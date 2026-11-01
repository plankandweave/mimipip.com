// Ads-personalisation (Customer Match) consent: the words and the policy
// version, shared by every checkbox and by the server that records the answer.
// Browser-safe on purpose — the hashing lives in ./customer-match (server only).

/**
 * Bump when the privacy-policy section "Personalised ads, only with your
 * consent" changes, so every consent row records which text the person agreed
 * to. Keep in step with the "Last updated" line on /privacy.
 */
export const ADS_CONSENT_POLICY_VERSION = "2026-10-05";

/** The words beside every ads-consent checkbox. One string, so every surface
 *  asks the identical question the policy version refers to. */
export const ADS_CONSENT_LABEL =
  "Show me Zyvorah designs in ads on Google and Meta (optional). We share a scrambled copy of my email and phone with them for this only; I can withdraw any time.";

/** Record the signed-in customer's answer. Fire-and-forget: a failed write
 *  leaves them NOT consented, which is the safe default. */
export function saveAdsConsent(granted: boolean, source: string): void {
  void fetch("/api/consent/ads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ granted, source }),
    keepalive: true,
  }).catch(() => {});
}
