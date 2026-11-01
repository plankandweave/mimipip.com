"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Preview, LaunchOutcome, VariantKey } from "@/lib/marketing/ads/retarget";
import { Btn, Card, Empty, Kicker, LINE, MIST, Pill } from "./ui";

// The Meta sales launcher, on the Ads tab. Reads the dry run
// (/api/admin/marketing/meta-retarget GET) and offers the only two buttons that
// create Meta objects: "Create paused" (nothing can spend) and "Launch live"
// (commits the week to the ledger and switches the ticked variants on).
//
// The server re-checks every gate; the disabled state here is a courtesy, not
// the lock. What this panel must get right is the SENTENCE: the confirm() names
// the exact ₹/day of what is ticked, because that dialog is the moment a person
// agrees to spend.

async function fetchPreview(): Promise<{ preview?: Preview; error?: string }> {
  try {
    const res = await fetch("/api/admin/marketing/meta-retarget", { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) return { error: json?.error || `HTTP ${res.status}` };
    return { preview: json.preview as Preview };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

const inr = (n: number | null | undefined) => (n == null ? "—" : `₹${Math.round(n).toLocaleString("en-IN")}`);

export function MetaRetargetPanel() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<"load" | "paused" | "live" | null>("load");
  const [result, setResult] = useState<LaunchOutcome | null>(null);
  const [picked, setPicked] = useState<Set<VariantKey>>(new Set(["retarget"]));
  const [showPayloads, setShowPayloads] = useState(false);

  // The fetch is its own function so the first load can run from the effect
  // without a synchronous setState there (the initial state already says "load").
  const apply = useCallback((r: { preview?: Preview; error?: string }) => {
    if (r.preview) setPreview(r.preview);
    setErr(r.error ?? null);
    setBusy(null);
  }, []);

  const load = useCallback(async () => {
    setBusy("load");
    apply(await fetchPreview());
  }, [apply]);

  useEffect(() => {
    let live = true;
    fetchPreview().then((r) => live && apply(r));
    return () => {
      live = false;
    };
  }, [apply]);

  const selected = useMemo(() => (preview?.variants ?? []).filter((v) => picked.has(v.key)), [preview, picked]);
  const dailyTotal = selected.reduce((s, v) => s + v.dailyBudgetInr, 0);
  // Only what is not already live is committed again.
  const weekCommit = selected.filter((v) => v.existing?.status !== "ACTIVE").reduce((s, v) => s + v.weeklyInr, 0);

  const liveBlockers = useMemo(() => {
    if (!preview) return ["loading"];
    const out = [...preview.blockers, ...preview.liveBlockers];
    for (const v of selected) out.push(...v.liveBlockers.map((b) => `${v.label}: ${b}`));
    if (preview.budget && weekCommit > (preview.budget.remaining_this_week ?? 0))
      out.push(`the week's budget has ${inr(preview.budget.remaining_this_week)} left; these variants need ${inr(weekCommit)}`);
    if (!selected.length) out.push("tick at least one variant");
    return out;
  }, [preview, selected, weekCommit]);
  const createBlocked = !preview || preview.blockers.length > 0 || !selected.length;

  async function launch(activate: boolean) {
    if (!selected.length) return;
    if (activate) {
      const lines = selected.map((v) => `  · ${v.label}: ${inr(v.dailyBudgetInr)}/day`).join("\n");
      const ok = window.confirm(
        `Launch Meta ads LIVE at ${inr(dailyTotal)}/day in Mumbai, Delhi NCR and Bengaluru?\n\n${lines}\n\n${inr(weekCommit)} is committed to this week's ad budget. Spend starts as soon as Meta approves the ads.`,
      );
      if (!ok) return;
    }
    setBusy(activate ? "live" : "paused");
    setResult(null);
    setErr(null);
    try {
      const res = await fetch("/api/admin/marketing/meta-retarget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "launch", activate, variants: selected.map((v) => v.key) }),
      });
      const json = await res.json().catch(() => null);
      if (!json) throw new Error(`HTTP ${res.status}`);
      setResult(json as LaunchOutcome);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const aud = preview?.audiences;
  const size = (a: Preview["audiences"]["visitors"] | undefined) =>
    !a ? "—" : a.error ? "lookup failed" : !a.exists ? "not created yet" : a.lowerBound == null || a.lowerBound < 0 ? "size pending" : `~${a.lowerBound.toLocaleString("en-IN")}${a.upperBound ? `–${a.upperBound.toLocaleString("en-IN")}` : ""}`;

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <Kicker>Meta retargeting · ₹500/day · Mumbai, Delhi NCR, Bengaluru</Kicker>
        {preview?.existing && (
          <Pill
            label={`campaign ${preview.existing.status}`}
            colour={preview.existing.status === "live" ? "#1a7f37" : preview.existing.status === "failed" ? "#cf222e" : "#57606a"}
            bg="#f4f2ec"
          />
        )}
      </div>

      {busy === "load" && !preview ? (
        <Empty>Asking Meta what a launch would do…</Empty>
      ) : err && !preview ? (
        <Empty>Could not load the preview: {err}</Empty>
      ) : preview ? (
        <>
          <div style={{ display: "grid", gap: 8, marginTop: 4 }}>
            {preview.variants.map((v) => (
              <label key={v.key} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, padding: "8px 10px", border: `1px solid ${LINE}`, borderRadius: 10, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={picked.has(v.key)}
                  onChange={(e) => {
                    const next = new Set(picked);
                    if (e.target.checked) next.add(v.key);
                    else next.delete(v.key);
                    setPicked(next);
                  }}
                  style={{ marginTop: 3 }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                    <b>{v.label}</b>
                    <span>{inr(v.dailyBudgetInr)}/day</span>
                    <span style={{ color: MIST, fontSize: 12 }}>({inr(v.weeklyInr)} a week)</span>
                    {v.existing && <Pill label={v.existing.status === "ACTIVE" ? "live" : "created · paused"} colour={v.existing.status === "ACTIVE" ? "#1a7f37" : "#57606a"} bg="#f4f2ec" />}
                  </div>
                  <div style={{ color: MIST, fontSize: 12, marginTop: 2 }}>{v.summary}</div>
                  {v.liveBlockers.map((b) => (
                    <div key={b} style={{ color: "#9a6700", fontSize: 12, marginTop: 2 }}>Not live-ready: {b}</div>
                  ))}
                </div>
              </label>
            ))}
          </div>

          <div style={{ fontSize: 12, color: MIST, marginTop: 10, lineHeight: 1.7 }}>
            Visitors (30 days): <b style={{ color: "#3f3f3f" }}>{size(aud?.visitors)}</b> · Purchasers excluded (180 days): <b style={{ color: "#3f3f3f" }}>{size(aud?.purchasers)}</b>
            <br />
            Cities: {preview.cities.map((c) => (c.key ? `${c.name} (${c.region})` : `${c.query} — unresolved`)).join(" · ")}
            {preview.budget && (
              <>
                <br />
                Ad budget this week: {inr(preview.budget.remaining_this_week)} left of {inr(preview.budget.weekly_cap)}
                {preview.budget.active ? "" : " · paused"}
              </>
            )}
          </div>

          {preview.creatives.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10, marginTop: 12 }}>
              {preview.creatives.map((c) => (
                <div key={c.handle} style={{ border: `1px solid ${LINE}`, borderRadius: 10, overflow: "hidden" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.imageUrl} alt={c.title} loading="lazy" style={{ width: "100%", aspectRatio: "1.91/1", objectFit: "cover", objectPosition: "bottom", display: "block", background: "#f4f2ec" }} />
                  <div style={{ padding: 8, fontSize: 12 }}>
                    <div style={{ fontWeight: 700 }}>{c.title}</div>
                    <div style={{ color: "#3f3f3f", whiteSpace: "pre-wrap", marginTop: 4, lineHeight: 1.5 }}>{c.message}</div>
                    <a href={c.link} target="_blank" rel="noreferrer" style={{ color: MIST, fontSize: 11 }}>
                      Shop now → {c.link.replace("https://", "")}
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}

          {(preview.blockers.length > 0 || preview.liveBlockers.length > 0 || preview.unresolved.length > 0) && (
            <ul style={{ margin: "12px 0 0", paddingLeft: 18, fontSize: 12, lineHeight: 1.6 }}>
              {preview.blockers.map((b) => <li key={b} style={{ color: "#cf222e" }}>{b}</li>)}
              {preview.liveBlockers.map((b) => <li key={b} style={{ color: "#9a6700" }}>{b}</li>)}
              {preview.unresolved.map((b) => <li key={b} style={{ color: MIST }}>{b}</li>)}
            </ul>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14, alignItems: "center" }}>
            <Btn disabled={!!busy || createBlocked} onClick={() => launch(false)} title="Creates the campaign, ad sets and ads PAUSED. Nothing spends.">
              {busy === "paused" ? "Creating…" : "Create paused (review in Ads Manager)"}
            </Btn>
            <Btn
              kind="dark"
              disabled={!!busy || liveBlockers.length > 0}
              onClick={() => launch(true)}
              title={liveBlockers.length ? liveBlockers.join("\n") : `Goes live at ${inr(dailyTotal)}/day`}
            >
              {busy === "live" ? "Launching…" : `Launch live · ${inr(dailyTotal)}/day`}
            </Btn>
            <Btn small onClick={() => load()} disabled={!!busy}>Refresh</Btn>
            <button type="button" onClick={() => setShowPayloads((s) => !s)} style={{ background: "none", border: "none", color: MIST, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              {showPayloads ? "Hide" : "Show"} the Graph calls ({preview.payloads.length})
            </button>
          </div>

          {result && (
            <div style={{ marginTop: 12, fontSize: 12, padding: "8px 10px", borderRadius: 10, background: result.ok ? "#eef7f0" : "#fbefee", color: result.ok ? "#1a7f37" : "#cf222e", lineHeight: 1.6 }}>
              <b>{result.state}</b>
              {result.campaignId ? ` · campaign ${result.campaignId}` : ""}
              {result.failedStep ? ` · failed at ${result.failedStep}` : ""}
              {result.error ? ` — ${result.error}` : ""}
              {[...(result.rolledBack ?? []), ...result.notes].map((n) => (
                <div key={n} style={{ color: "#3f3f3f" }}>{n}</div>
              ))}
            </div>
          )}
          {err && preview && <div style={{ marginTop: 8, fontSize: 12, color: "#cf222e" }}>{err}</div>}

          {showPayloads && (
            <pre style={{ marginTop: 10, fontSize: 11, background: "#faf9f6", border: `1px solid ${LINE}`, borderRadius: 10, padding: 10, maxHeight: 360, overflow: "auto", whiteSpace: "pre-wrap" }}>
              {JSON.stringify(preview.payloads, null, 2)}
            </pre>
          )}
        </>
      ) : null}
    </Card>
  );
}
