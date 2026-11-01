"use client";

import { useCallback, useEffect, useState } from "react";
import type { MetaInventory } from "@/lib/meta-ads-inventory";
import { Btn, Card, Empty, Kicker, MIST } from "./ui";

export function MetaAdsPanel() {
  const [data, setData] = useState<MetaInventory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/meta-ads", { cache: "no-store" });
      if (!res.ok) throw new Error(`Could not check Meta ads (HTTP ${res.status}).`);
      setData(await res.json());
      setError(null);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load]);
  return <Card>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <Kicker>Meta · account ad inventory</Kicker>
      <Btn disabled={busy} onClick={() => void load()}>{busy ? "Checking…" : "Refresh"}</Btn>
    </div>
    <p style={{ fontSize: 12, color: MIST }}>Ads read directly from each configured account, including boosted posts and ads with no spend or website visits. ACTIVE is Meta’s effective status; it does not guarantee delivery.</p>
    {error && <p role="alert">{error} {data ? "The previous results below may be stale." : ""}</p>}
    {!data && !error && <Empty>Checking Meta accounts…</Empty>}
    {data && <>
      <p style={{ fontSize: 12, color: MIST }}>Checked: {new Date(data.checkedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</p>
      {!data.configured && <Empty>Meta reporting needs an ads token and the ad account IDs on the server. Current ad status is unverified.</Empty>}
      {data.discoveryError && <p role="alert">{data.discoveryError}</p>}
      {data.untrackedAccounts.length > 0 && <p role="alert">Accessible accounts outside this report: {data.untrackedAccounts.map((a) => `${a.name || a.id} (${a.id})`).join(", ")}. Add any Zyvorah accounts to the reporting configuration to include their ads and spend.</p>}
      {data.accounts.map((account) => <section key={account.id} style={{ marginTop: 14 }}>
        <b>{account.id}</b>
        {account.error ? <p role="alert">{account.error} Ad status for this account is unverified.</p> : <>
          <p style={{ fontSize: 12 }}>{account.ads?.filter((a) => a.effective_status === "ACTIVE").length ?? 0} active ads · {account.ads?.length ?? 0} total returned</p>
          {!account.ads?.length ? <Empty>No ads returned for this account.</Empty> : <div style={{ overflowX: "auto" }}><table style={{ width: "100%", textAlign: "left", fontSize: 12 }}>
            <thead><tr>{["Ad", "Campaign", "Ad set", "Effective status"].map((label) => <th key={label}>{label}</th>)}</tr></thead>
            <tbody>{[...account.ads].sort((a, b) => Number(b.effective_status === "ACTIVE") - Number(a.effective_status === "ACTIVE")).map((ad) => <tr key={ad.id}>
              <td>{ad.name}<br /><span style={{ color: MIST }}>{ad.id}</span></td>
              <td>{ad.campaign?.name ?? "—"}</td><td>{ad.adset?.name ?? "—"}</td><td>{ad.effective_status}</td>
            </tr>)}</tbody>
          </table></div>}
        </>}
      </section>)}
    </>}
  </Card>;
}
