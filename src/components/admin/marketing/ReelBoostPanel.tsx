"use client";

import { useCallback, useEffect, useState } from "react";
import type { BoostPreview, BoostOutcome } from "@/lib/marketing/ads/reel-boost";
import { Btn, Card, Empty, Kicker, LINE, MIST, Pill } from "./ui";

// Promote a published reel to named postcodes (/api/admin/marketing/reel-boost).
// One card per boost. "Launch live" is the moment a person agrees to spend, so
// its confirm() names the ₹/day, the area and the week committed. The server
// re-checks every gate; the disabled state here is a courtesy, not the lock.

const inr = (n: number | null | undefined) => (n == null ? "—" : `₹${Math.round(n).toLocaleString("en-IN")}`);

async function fetchPreviews(): Promise<{ previews?: BoostPreview[]; error?: string }> {
  try {
    const res = await fetch("/api/admin/marketing/reel-boost", { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) return { error: json?.error || `HTTP ${res.status}` };
    return { previews: json.previews as BoostPreview[] };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export function ReelBoostPanel() {
  const [previews, setPreviews] = useState<BoostPreview[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>("load");
  const [result, setResult] = useState<Record<string, BoostOutcome>>({});

  const apply = useCallback((r: { previews?: BoostPreview[]; error?: string }) => {
    if (r.previews) setPreviews(r.previews);
    setErr(r.error ?? null);
    setBusy(null);
  }, []);

  useEffect(() => {
    let live = true;
    fetchPreviews().then((r) => live && apply(r));
    return () => {
      live = false;
    };
  }, [apply]);

  async function launch(p: BoostPreview, activate: boolean) {
    if (activate) {
      const ok = window.confirm(
        `Promote “${p.label}” LIVE at ${inr(p.dailyBudgetInr)}/day?\n\nShown to people who live in ${p.pins.filter((x) => x.key).length} Gurgaon postcodes.\n${inr(p.weeklyInr)} is committed to this week's ad budget. Spend starts as soon as Meta approves the ad.`,
      );
      if (!ok) return;
    }
    setBusy(`${p.boost}:${activate ? "live" : "paused"}`);
    try {
      const res = await fetch("/api/admin/marketing/reel-boost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boost: p.boost, activate }),
      });
      const json = await res.json().catch(() => null);
      if (!json) throw new Error(`HTTP ${res.status}`);
      setResult((r) => ({ ...r, [p.boost]: json as BoostOutcome }));
      apply(await fetchPreviews());
    } catch (e) {
      setErr((e as Error).message);
      setBusy(null);
    }
  }

  if (busy === "load" && !previews) return <Card><Kicker>Reel promotion</Kicker><Empty>Asking Meta what a promotion would do…</Empty></Card>;
  if (err && !previews) return <Card><Kicker>Reel promotion</Kicker><Empty>Could not load: {err}</Empty></Card>;

  return (
    <>
      {(previews ?? []).map((p) => {
        const live = p.existing?.adStatus === "ACTIVE";
        const r = result[p.boost];
        return (
          <Card key={p.boost}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
              <Kicker>Reel promotion · {p.label} · {inr(p.dailyBudgetInr)}/day</Kicker>
              {p.existing && <Pill label={live ? "live" : `campaign ${p.existing.status}`} colour={live ? "#1a7f37" : p.existing.status === "failed" ? "#cf222e" : "#57606a"} bg="#f4f2ec" />}
            </div>
            <div style={{ fontSize: 12, color: MIST, lineHeight: 1.7, marginTop: 4 }}>
              {p.reel ? <>The reel is on Instagram (media {p.reel.mediaId}).</> : <>The reel is not on Instagram yet.</>} Learn more → {p.link.replace("https://", "")}
              <br />
              {p.objective} · {inr(p.weeklyInr)} a week
            </div>
            <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", fontSize: 12, borderTop: `1px solid ${LINE}` }}>
              {p.pins.map((x) => (
                <li key={x.code} style={{ padding: "4px 0", borderBottom: `1px solid ${LINE}`, color: x.key ? "#3f3f3f" : "#9a6700" }}>
                  <b>{x.code}</b> · {x.area}
                  {!x.key && x.error ? ` — ${x.error}` : ""}
                </li>
              ))}
            </ul>
            {(p.blockers.length > 0 || p.liveBlockers.length > 0 || p.existing?.lastError) && (
              <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 12, lineHeight: 1.6 }}>
                {p.blockers.map((b) => <li key={b} style={{ color: "#cf222e" }}>{b}</li>)}
                {p.liveBlockers.map((b) => <li key={b} style={{ color: "#9a6700" }}>{b}</li>)}
                {p.existing?.lastError && <li style={{ color: "#cf222e" }}>Last attempt: {p.existing.lastError}</li>}
              </ul>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              <Btn disabled={!!busy || p.blockers.length > 0} onClick={() => launch(p, false)} title="Creates the campaign, ad set and ad PAUSED. Nothing spends.">
                {busy === `${p.boost}:paused` ? "Creating…" : "Create paused"}
              </Btn>
              <Btn kind="dark" disabled={!!busy || live || p.blockers.length > 0 || p.liveBlockers.length > 0} onClick={() => launch(p, true)}>
                {busy === `${p.boost}:live` ? "Launching…" : live ? "Live" : `Launch live — ${inr(p.dailyBudgetInr)}/day`}
              </Btn>
            </div>
            {r && (
              <div style={{ fontSize: 12, marginTop: 8, color: r.ok ? "#1a7f37" : "#cf222e" }}>
                {r.ok ? r.notes.join(" · ") : `${r.failedStep ? `${r.failedStep}: ` : ""}${r.error ?? "failed"}`}
              </div>
            )}
          </Card>
        );
      })}
    </>
  );
}
