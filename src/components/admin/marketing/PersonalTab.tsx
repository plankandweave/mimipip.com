"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { DeskSlot } from "@/app/api/admin/marketing/plan/route";
import { Btn, Card, Empty, Kicker, LINE, MIST } from "./ui";

type Channel = "instagram" | "linkedin";
export function PersonalTab({ slots, loading, error, onReload, renderSlot }: {
  slots: DeskSlot[]; loading: boolean; error: string | null; onReload: () => Promise<void>;
  renderSlot: (slot: DeskSlot) => ReactNode;
}) {
  const [channel, setChannel] = useState<Channel>("instagram");
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showRemoved, setShowRemoved] = useState(false);
  useEffect(() => {
    const sync = () => setChannel(new URLSearchParams(window.location.search).get("channel") === "linkedin" ? "linkedin" : "instagram");
    const timer = setTimeout(sync, 0);
    window.addEventListener("popstate", sync);
    return () => { clearTimeout(timer); window.removeEventListener("popstate", sync); };
  }, []);
  const choose = (next: Channel) => {
    setChannel(next); setMessage(null);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "personal"); url.searchParams.set("channel", next);
    window.history.replaceState(null, "", url);
  };
  const save = async () => {
    setSaving(true); setMessage(null);
    try {
      const response = await fetch("/api/admin/marketing/personal", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel, title, brief }),
      });
      const result = await response.json();
      if (!response.ok) { setMessage(result.error ?? "Could not save the idea."); return; }
      setTitle(""); setBrief(""); setMessage("Idea saved. It is not scheduled or approved for publication.");
      await onReload();
    } catch { setMessage("Could not reach the server. Your writing is still here."); }
    finally { setSaving(false); }
  };
  const visible = slots.filter((s) => s.channel === channel && (showRemoved || s.status !== "removed"));
  const active = visible.filter((s) => s.status !== "removed");
  return (
    <section aria-label="Roheena personal creative" style={{ marginTop: 24, display: "grid", gap: 20 }}>
      <Card style={{ background: "#f7f2ec", padding: "28px clamp(16px, 4vw, 32px)", borderColor: "#e3d8cc" }}>
        <Kicker>Your personal creative studio</Kicker>
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: "clamp(28px, 5vw, 42px)", fontWeight: 400, margin: "8px 0 12px", lineHeight: 1.12 }}>Roheena Nagpal</h2>
        <p style={{ fontSize: 16, maxWidth: 670, lineHeight: 1.65, margin: 0 }}>How I see, imagine and create spaces — through pattern, colour and the stories behind them.</p>
        <p style={{ color: MIST, fontSize: 13, lineHeight: 1.7, maxWidth: 720, marginBottom: 0 }}>Beautiful design stories, AI-created visuals and your own voice. Occasional photographs of you. No filming yourself. Spirituality stays optional; the creative work leads.</p>
      </Card>
      <nav aria-label="Personal channels" style={{ display: "flex", gap: 8, borderBottom: `1px solid ${LINE}`, paddingBottom: 12 }}>
        {(["instagram", "linkedin"] as const).map((value) => (
          <button key={value} type="button" aria-pressed={value === channel} onClick={() => choose(value)}
            style={{ font: "inherit", fontSize: 14, border: `1px solid ${value === channel ? "#4f3546" : LINE}`, borderRadius: 999, padding: "10px 22px", color: value === channel ? "#fff" : "#4f3546", background: value === channel ? "#4f3546" : "#fff", cursor: "pointer" }}>
            {value === "instagram" ? "Instagram" : "LinkedIn"}
          </button>
        ))}
      </nav>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 290px), 1fr))", gap: 16 }}>
        <Card>
          <Kicker>{channel === "instagram" ? "@RoheenaNagpal · Instagram" : "Roheena Nagpal · personal LinkedIn"}</Kicker>
          <h3 style={{ fontSize: 19, fontWeight: 500, margin: "4px 0 10px" }}>{channel === "instagram" ? "A visual journal of your eye" : "The thinking behind the work"}</h3>
          <p style={{ fontSize: 13, lineHeight: 1.65, color: MIST, margin: 0 }}>{channel === "instagram" ? "Full-image stories, thoughtful carousels and films of designs with your narration. Each piece should help someone notice something new." : "Personal observations on design decisions, developing wallpapers and creating with AI. Adapted for your professional audience, in your own voice."}</p>
          <p style={{ fontSize: 12, marginBottom: 0 }}>{active.filter((s) => s.status === "idea").length} ideas · {active.filter((s) => s.post?.status === "published").length} published</p>
        </Card>
        <Card>
          <Kicker>Publishing connection</Kicker>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#946023", margin: "6px 0" }}>Personal account not connected</p>
          <p style={{ fontSize: 13, lineHeight: 1.65, color: MIST }}>{channel === "instagram" ? "Automatic publishing needs a Creator or Business account and your Instagram publishing authorization." : "Automatic publishing needs your LinkedIn member authorization, separate from the Zyvorah company page."} Being signed in on your desktop does not connect the scheduler.</p>
          <p style={{ fontSize: 12, marginBottom: 0 }}>Review finished visuals and copy before scheduling. Nothing in this workspace is auto-publishing yet.</p>
        </Card>
      </div>
      <details style={{ border: `1px solid ${LINE}`, borderRadius: 14, padding: 18 }}>
        <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 600 }}>Creative direction &amp; voice</summary>
        <p style={{ fontSize: 13, lineHeight: 1.7 }}>The detail that starts a design. A pattern taking shape. Colour and scale changing a room. The decisions you kept, changed or rejected. Lead with the work and give the viewer something worth noticing.</p>
        <p style={{ fontSize: 13, lineHeight: 1.7 }}>Use your own narration when it adds meaning. Preserve exact artwork for real wallpaper; identify illustrative work as “AI CONCEPT STUDY”. First-person stories must reflect your real decisions.</p>
        <p style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 0 }}>Your creative team develops the idea, script, visuals and edit. You review the finished piece, correct the facts and add your voice where relevant.</p>
      </details>
      <Card>
        <Kicker>Add an idea for {channel === "instagram" ? "Instagram" : "LinkedIn"}</Kicker>
        <form onSubmit={(event) => { event.preventDefault(); void save(); }} style={{ display: "grid", gap: 10 }}>
          <label style={{ fontSize: 13 }}>Title<input required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="The detail that became a wallpaper" style={{ display: "block", width: "100%", boxSizing: "border-box", padding: 10, border: `1px solid ${LINE}`, borderRadius: 8, marginTop: 5, font: "inherit" }} /></label>
          <label style={{ fontSize: 13 }}>Thoughts or creative brief<textarea maxLength={8000} value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="An observation, a design to explore, or a direction for your creative team…" style={{ display: "block", width: "100%", boxSizing: "border-box", padding: 10, minHeight: 90, border: `1px solid ${LINE}`, borderRadius: 8, marginTop: 5, font: "inherit" }} /></label>
          <div><Btn kind="dark" disabled={saving || !title.trim()} onClick={() => void save()}>{saving ? "Saving…" : "Save idea"}</Btn></div>
        </form>
        {message && <p role="status" style={{ fontSize: 13 }}>{message}</p>}
      </Card>
      <div>
        <div style={{ display: "flex", gap: 12, justifyContent: "space-between", flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <Kicker>{channel === "instagram" ? "Your Instagram ideas & drafts" : "Your LinkedIn ideas & drafts"}</Kicker>
          <Btn small onClick={() => setShowRemoved((value) => !value)}>{showRemoved ? "Hide removed" : "Show removed"}</Btn>
        </div>
        <p style={{ color: MIST, fontSize: 12 }}>Ideas are unscheduled. Open one to read its brief, leave a note or remove it.</p>
        {error ? <p role="alert" style={{ color: "#cf222e" }}>{error}</p> : loading ? <Empty>Loading your creative workspace…</Empty> : !visible.length ? <Empty>No {channel === "instagram" ? "Instagram" : "LinkedIn"} ideas here yet. Add your first thought above.</Empty> : (
          <div style={{ display: "grid", gridTemplateColumns: channel === "instagram" ? "repeat(auto-fill, minmax(min(100%, 230px), 1fr))" : "repeat(auto-fill, minmax(min(100%, 330px), 1fr))", gap: 16 }}>{visible.map(renderSlot)}</div>
        )}
      </div>
    </section>
  );
}
