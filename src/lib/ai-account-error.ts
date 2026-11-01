/**
 * Is this error about OUR Anthropic account rather than the item being worked?
 *
 * On 9 October 2026 the site's key was refused ("invalid x-api-key") and a
 * creator's pitch burned all three of its outreach-queue attempts in half an
 * hour, then sat as `failed` for good — the email was fine, the key was not.
 * A queue that charges an item an attempt for an account fault loses work
 * every time the key or the credit lapses. Callers that see `true` stop the
 * batch, leave the item's attempts alone and fail the cron run loudly, so
 * cron health shows the outage instead of a quiet "ok".
 */
export function isAiAccountError(message: string | null | undefined): boolean {
  const m = String(message ?? "");
  return (
    /authentication_error/i.test(m) ||
    /invalid x-api-key/i.test(m) ||
    /credit balance is too low/i.test(m) ||
    /permission_error/i.test(m) ||
    /ANTHROPIC_API_KEY not configured/i.test(m)
  );
}
