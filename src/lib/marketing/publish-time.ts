/** A proposal becomes a release time only when explicitly locked for publishing. */
export function publishTimeHold(art: Record<string, unknown> | null | undefined, now: Date): string | null {
  if (!art || art.publish_at === undefined) return null;
  const value = art.publish_at;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) {
    return 'The locked publication time is invalid. Correct it before publishing.';
  }
  return now.getTime() < Date.parse(value) ? `Approved, waiting until ${value}` : null;
}

export function lockedTimeIST(art: Record<string, unknown> | null | undefined): string | null {
  if (!art?.publish_at || typeof art.publish_at !== 'string' || !Number.isFinite(Date.parse(art.publish_at))) return null;
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(art.publish_at));
}
