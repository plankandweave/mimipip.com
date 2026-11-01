"use client";

import { useCallback, useEffect, useState } from "react";
import type { Status } from "@/lib/google-ads/api";
import type { CampaignRow } from "@/lib/google-ads/spec";
import { Btn, Card, Empty, Kicker, LINE, MIST, Pill } from "./ui";

// Google Ads on the Ads tab (/api/admin/google-ads): what is connected, the
// one-time setup, and every campaign with a Pause button. Pausing is the only
// change it can make — it only ever reduces spend. Starting spend stays out of
// here until it goes through the budget ledger like the Meta launchers.

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const input = { padding: "8px 10px", border: `1px solid ${LINE}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", minWidth: 0, flex: "1 1 220px" } as const;

function notice(): { kind: string; msg: string } | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search);
  const kind = q.get("gads");
  return kind ? { kind, msg: q.get("msg") ?? "" } : null;
}

export function GoogleAdsPanel() {
  const [s, setS] = useState<Status | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>("load");
  const [note, setNote] = useState<{ kind: string; msg: string } | null>(null);
  const [form, setForm] = useState({ developerToken: "", clientId: "", clientSecret: "" });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/google-ads", { cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setS(j as Status);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setNote(notice());
      void load();
    }, 0);
    return () => clearTimeout(t);
  }, [load]);

  async function post(body: Record<string, unknown>, label: string) {
    setBusy(label);
    try {
      const res = await fetch("/api/admin/google-ads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      return j;
    } catch (e) {
      setNote({ kind: "problem", msg: (e as Error).message });
      return null;
    } finally {
      await load();
    }
  }

  async function saveSetup() {
    const j = await post({ action: "save_app", ...form }, "save");
    if (j) {
      setForm({ developerToken: "", clientId: "", clientSecret: "" });
      setNote({ kind: "saved", msg: "Saved. Now press Connect Google Ads." });
    }
  }

  async function pause(list: CampaignRow[]) {
    if (!list.length) return;
    const names = list.map((c) => `  · ${c.name}`).join("\n");
    if (!window.confirm(`Pause ${list.length === 1 ? "this campaign" : `these ${list.length} campaigns`} in Google Ads?\n\n${names}\n\nThey stop spending at once. Nothing is deleted; they can be switched back on in Google Ads.`)) return;
    const j = await post({ action: "pause", campaignIds: list.map((c) => c.id) }, "pause");
    if (j) setNote({ kind: "paused", msg: `Paused: ${(j.paused as string[]).join(", ") || "nothing"}${(j.refused as string[]).length ? ` · not paused: ${(j.refused as string[]).join("; ")}` : ""}` });
  }

  const running = (s?.campaigns ?? []).filter((c) => c.status === "ENABLED");
  const ready = !!s && s.pieces.oauthClient && s.pieces.developerToken;

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <Kicker>Google Ads · account {s?.account ?? "905-946-7956"}</Kicker>
        {s && <Pill label={s.campaigns ? "connected" : s.pieces.signedIn ? "signed in" : "not connected"} colour={s.campaigns ? "#1a7f37" : "#57606a"} bg="#f4f2ec" />}
      </div>

      {note?.msg && (
        <div style={{ fontSize: 12, marginTop: 6, color: note.kind === "problem" ? "#cf222e" : "#1a7f37" }}>{note.msg}</div>
      )}

      {busy === "load" && !s ? (
        <Empty>Checking the Google Ads connection…</Empty>
      ) : err && !s ? (
        <Empty>Could not check: {err}</Empty>
      ) : s ? (
        <>
          <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", fontSize: 12, lineHeight: 1.8 }}>
            <li>{s.pieces.developerToken ? "✓" : "○"} Developer token {s.pieces.developerToken ? "saved" : "— copy it from API Center in the Zyvorah Manager account"}</li>
            <li>{s.pieces.oauthClient ? "✓" : "○"} Google sign-in client {s.pieces.oauthClient ? "set" : "— not set"}</li>
            <li>
              {s.pieces.signedIn ? "✓" : "○"} Signed in{s.connectedAt ? ` ${new Date(s.connectedAt).toLocaleDateString("en-IN")}${s.connectedBy ? ` by ${s.connectedBy}` : ""}` : ""}
            </li>
          </ul>

          {(!s.pieces.developerToken || !s.pieces.oauthClient) && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              {!s.pieces.developerToken && (
                <input aria-label="Developer token" placeholder="Developer token" value={form.developerToken} onChange={(e) => setForm({ ...form, developerToken: e.target.value })} style={input} autoComplete="off" />
              )}
              {!s.pieces.oauthClient && (
                <>
                  <input aria-label="OAuth client ID" placeholder="OAuth client ID" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} style={input} autoComplete="off" />
                  <input aria-label="OAuth client secret" placeholder="OAuth client secret" type="password" value={form.clientSecret} onChange={(e) => setForm({ ...form, clientSecret: e.target.value })} style={input} autoComplete="off" />
                </>
              )}
              <Btn disabled={!!busy} onClick={saveSetup}>{busy === "save" ? "Saving…" : "Save"}</Btn>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
            {ready && (
              <Btn kind={s.pieces.signedIn ? "ghost" : "dark"} onClick={() => { window.location.href = "/admin/google-ads/connect"; }}>
                {s.pieces.signedIn ? "Reconnect Google Ads" : "Connect Google Ads"}
              </Btn>
            )}
            {s.campaigns && running.length > 0 && (
              <Btn kind="danger" disabled={!!busy} onClick={() => pause(running)}>
                {busy === "pause" ? "Pausing…" : `Pause all ${running.length} running`}
              </Btn>
            )}
          </div>

          {s.error && <div style={{ fontSize: 12, color: "#cf222e", marginTop: 8 }}>{s.error}</div>}

          {s.campaigns && (
            <div style={{ overflowX: "auto", marginTop: 12 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ color: MIST, textAlign: "left" }}>
                    {["Campaign", "Type", "Status", "Budget / day", "Spend 7 days", "Clicks 7 days", ""].map((h, i) => (
                      <th key={h || i} style={{ padding: "4px 6px", fontWeight: 500, borderBottom: `1px solid ${LINE}`, textAlign: i >= 3 && i <= 5 ? "right" : "left" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.campaigns.map((c) => (
                    <tr key={c.id} style={{ borderBottom: `1px solid ${LINE}` }}>
                      <td style={{ padding: "6px" }}>{c.name}</td>
                      <td style={{ padding: "6px", color: MIST }}>{c.channel.replace(/_/g, " ").toLowerCase()}</td>
                      <td style={{ padding: "6px", color: c.status === "ENABLED" ? "#1a7f37" : MIST }}>{c.status === "ENABLED" ? "running" : c.status.toLowerCase()}</td>
                      <td style={{ padding: "6px", textAlign: "right" }}>{c.dailyBudgetInr ? inr(c.dailyBudgetInr) : "—"}</td>
                      <td style={{ padding: "6px", textAlign: "right" }}>{c.cost7dInr ? inr(c.cost7dInr) : "—"}</td>
                      <td style={{ padding: "6px", textAlign: "right" }}>{c.clicks7d.toLocaleString("en-IN")}</td>
                      <td style={{ padding: "6px", textAlign: "right" }}>
                        {c.status === "ENABLED" && <Btn small disabled={!!busy} onClick={() => pause([c])}>Pause</Btn>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </Card>
  );
}
