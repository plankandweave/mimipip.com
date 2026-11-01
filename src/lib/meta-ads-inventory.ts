import { metaAdAccountIds, metaAdsToken } from "./meta-env";

/** Follow Graph cursors on a fixed origin; never follow a token-bearing next URL. */
export async function metaPages<T>(path: string, fields: string, token: string, read: typeof fetch = fetch, extra: Record<string, string> = {}): Promise<T[]> {
  const rows: T[] = [];
  const seen = new Set<string>();
  let after: string | undefined;
  do {
    const params = new URLSearchParams({ ...extra, fields, limit: "100", ...(after ? { after } : {}) });
    const res = await read(`https://graph.facebook.com/v21.0/${path}?${params}`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Meta returned HTTP ${res.status}; check account access and token permissions.`);
    const body = await res.json() as { data?: T[]; paging?: { next?: string; cursors?: { after?: string } } };
    if (!Array.isArray(body.data)) throw new Error("Meta returned no inventory list.");
    rows.push(...body.data);
    after = body.paging?.next ? body.paging.cursors?.after : undefined;
    if (body.paging?.next && !after) throw new Error("Meta pagination was incomplete; inventory is unverified.");
    if (after && (seen.has(after) || seen.size >= 100)) throw new Error("Meta pagination did not finish; inventory is unverified.");
    if (after) seen.add(after);
  } while (after);
  return rows;
}

type MetaAccount = { id: string; name?: string; currency?: string };
export type MetaAd = {
  id: string; name: string; effective_status: string;
  campaign?: { id: string; name: string };
  adset?: { id: string; name: string };
};
export type MetaInventory = {
  configured: boolean;
  checkedAt: string;
  discoveryError: string | null;
  untrackedAccounts: MetaAccount[];
  accounts: { id: string; ads: MetaAd[] | null; error: string | null }[];
};

export async function metaInventory(): Promise<MetaInventory> {
  const token = metaAdsToken();
  const ids = [...new Set(metaAdAccountIds())];
  const result: MetaInventory = { configured: !!token && ids.length > 0, checkedAt: new Date().toISOString(), discoveryError: null, untrackedAccounts: [], accounts: [] };
  if (!token) return result;
  const [discovery, ...accounts] = await Promise.allSettled([
    metaPages<MetaAccount>("me/adaccounts", "id,name,currency", token),
    ...ids.map((id) => metaPages<MetaAd>(`${id}/ads`, "id,name,effective_status,campaign{id,name},adset{id,name}", token)),
  ]);
  if (discovery.status === "fulfilled") result.untrackedAccounts = (discovery.value as MetaAccount[]).filter((a) => !ids.includes(a.id));
  else result.discoveryError = "Could not discover other accessible ad accounts; coverage outside the configured accounts is unverified.";
  result.accounts = accounts.map((r, i) => ({ id: ids[i], ads: r.status === "fulfilled" ? r.value as MetaAd[] : null, error: r.status === "rejected" ? (r.reason as Error).message : null }));
  result.checkedAt = new Date().toISOString();
  return result;
}
