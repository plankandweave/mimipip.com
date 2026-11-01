// The store's CRM screens are retired (Roheena, 29 Oct 2026: "I don't want
// multiple places to review data … I don't want this on the Zyvorah website.
// Let everything be in the OS."). Deals are reviewed and edited on the OS
// Pipeline; the data stays here. /admin/crm and /admin/crm/<company> send
// people to it. The Proposal Studio (/admin/crm/<company>/studio) stays: it
// is a tool, reached from the deal in the OS.

const OS_BASE = () => (process.env.OS_BASE_URL ?? "https://os.magnitudegroup.in").replace(/\/$/, "");

const UUID = /^[0-9a-f-]{36}$/i;

/** The OS Pipeline, opened on a store deal when there is one. */
export function osPipelineUrl(dealId?: string | null): string {
  const base = `${OS_BASE()}/sales`;
  return dealId && UUID.test(dealId) ? `${base}?deal=${encodeURIComponent(`store:${dealId}`)}` : base;
}

/** Of a company's deals, the one to open: the newest open one, else the newest. */
export function dealToOpen(deals: { id: string; stage: string | null; updated_at: string | null }[]): string | null {
  const newest = [...deals].sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")));
  return (newest.find((d) => d.stage !== "won" && d.stage !== "lost") ?? newest[0])?.id ?? null;
}
