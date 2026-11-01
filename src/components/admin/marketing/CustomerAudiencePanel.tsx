"use client";

import { useEffect, useState } from "react";
import { Card, Kicker } from "./ui";

type AudienceStatus = { eligible: number; withdrawn: number };

export function CustomerAudiencePanel() {
  const [status, setStatus] = useState<AudienceStatus | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    void fetch("/api/admin/customer-match", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("unavailable");
        const data = await response.json();
        if (!data || typeof data.eligible !== "number") throw new Error("unavailable");
        if (live) setStatus(data);
      }).catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, []);
  return (
    <Card>
      <Kicker>Customer audiences</Kicker>
      <p>Reach customers who chose personalised advertising. Signing in alone does not add them to these lists.</p>
      <p style={{ marginTop: 10 }}>
        {error ? "Audience counts could not be loaded. Refresh to try again." : status
          ? `${status.eligible} opted-in customers · ${status.withdrawn} withdrawn`
          : "Loading consent counts…"}
      </p>
      <p style={{ marginTop: 10 }}>
        <a className="underline" href="/api/admin/customer-match?download=1&platform=meta">Download Meta audience</a>
        {" · "}<a className="underline" href="/api/admin/customer-match?download=1">Download Google audience</a>
      </p>
      <p style={{ marginTop: 8, fontSize: 13 }}>Meta exports contain hashed emails only. Upload as a customer list in the Zyvorah ad account. Replace existing membership with a fresh export after withdrawals. An export is not a live audience or a running campaign.</p>
      <p style={{ marginTop: 10, fontSize: 13 }}><b>ChatGPT: not ready.</b> Customer-audience targeting currently requires at least 25,000 matched users and an eligible ad account. Existing consent covers Google and Meta; fresh consent naming ChatGPT is also needed before sharing customer identifiers with OpenAI.</p>
    </Card>
  );
}
