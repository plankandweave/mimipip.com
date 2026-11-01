"use client";

/** The founder's decision queue. The server performs the same readiness checks
 * as the daily brief and approval endpoint before returning any post. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { StaffGate, useStaff } from "@/lib/use-staff";
import { slotDigestWeb, approvalMedia } from "@/lib/marketing/digest-web";

type Post = {
  id: string;
  created_at: string;
  channel: string;
  format: string;
  pillar: string;
  product_handle: string | null;
  status: string;
  safety_passed: boolean;
  safety_issues: { severity: string; code: string; detail: string }[] | null;
  caption: string | null;
  media_urls: string[];
  slot_key: string | null;
  approved_at: string | null;
  regenerate_requested_at: string | null;
};

const INK = "#0F0F0F";
const MIST = "#6b6b6b";
const LINE = "#e6e6e6";
const GO = "#1a7f37";

/** The day a slot is FOR, out of "2026-09-28#0". */
const slotDay = (p: Post) => (p.slot_key ?? "").split("#")[0];

function prettyDay(day: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "an unscheduled slot";
  const d = new Date(`${day}T00:00:00+05:30`);
  return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
}

export default function ReviewQueue() {
  const staff = useStaff();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [held, setHeld] = useState(0);
  const [heldPosts, setHeldPosts] = useState<{ id: string; slot_key: string | null; format: string; product_handle: string | null; reason: string; approved: boolean }[]>([]);
  const [showHeld, setShowHeld] = useState(false);
  const [at, setAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ approved: number; rewrite: number; dropped: number }>({
    approved: 0,
    rewrite: 0,
    dropped: 0,
  });

  const load = useCallback(async () => {
    setError(null);
    setPosts(null);
    try {
      const res = await fetch("/api/admin/marketing/review", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Review checks could not be completed.");
      setPosts(data.posts as Post[]);
      setHeld(data.held ?? 0);
      setHeldPosts(Array.isArray(data.heldPosts) ? data.heldPosts : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the qualified queue.");
      setPosts(null);
    }
    setAt(0);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (staff === "in") load();
  }, [staff, load]);

  const current = posts?.[at] ?? null;
  const remaining = posts ? posts.length - at : 0;

  const decide = useCallback(
    async (action: "approve" | "reject" | "regenerate") => {
      if (!current || busy) return;
      let reason: string | null = null;
      if (action !== "approve") {
        reason = window.prompt(
          action === "reject"
            ? "Why is this one not running? (recorded, so the engine learns)"
            : "What should be different? (this goes to the writer)",
          "",
        );
        if (reason === null) return; // cancelled — no decision is safer than a blank one
      }
      setBusy(true);
      setMsg(null);
      try {
        // Sign exactly what this screen rendered. The server rejects the id if
        // the stored row no longer hashes to this, so an approval cannot drift
        // onto content she did not look at.
        const digest = await slotDigestWeb(current.caption, approvalMedia(current));
        const res = await fetch("/api/admin/marketing/approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ids: [current.id], digests: { [current.id]: digest }, reason }),
        });
        const j = await res.json();
        const outcome = (j.outcomes ?? [])[0];
        if (!res.ok || !outcome?.ok) {
          await load();
          setMsg(outcome?.error ?? j.error ?? `That did not save (${res.status}). Nothing was changed.`);
        } else {
          setDone((d) => ({
            approved: d.approved + (action === "approve" ? 1 : 0),
            rewrite: d.rewrite + (action === "regenerate" ? 1 : 0),
            dropped: d.dropped + (action === "reject" ? 1 : 0),
          }));
          setAt((i) => i + 1);
        }
      } catch {
        setMsg("Couldn't reach the server. Nothing was changed.");
      }
      setBusy(false);
    },
    [current, busy, load],
  );

  const summary = useMemo(() => {
    const bits = [
      done.approved ? `${done.approved} approved` : null,
      done.rewrite ? `${done.rewrite} sent back for a rewrite` : null,
      done.dropped ? `${done.dropped} dropped` : null,
    ].filter(Boolean);
    return bits.length ? bits.join(" · ") : "nothing decided yet";
  }, [done]);

  if (staff !== "in") return <StaffGate state={staff} title="Review queue" />;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "36px 22px 80px", fontFamily: "Inter, system-ui, Arial, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <h1 style={{ fontSize: 22, margin: 0, color: INK }}>Review queue</h1>
        <span style={{ display: "flex", gap: 14 }}>
          <a href="/admin/marketing/decisions" style={{ fontSize: 13, color: MIST }}>
            Your decisions
          </a>
          <a href="/admin/marketing" style={{ fontSize: 13, color: MIST }}>
            Back to the desk
          </a>
        </span>
      </div>

      {error && (
        <p style={{ marginTop: 20, color: "#cf222e", fontSize: 14 }}>
          Could not load the queue: {error}
        </p>
      )}

      {posts === null && !error && <p style={{ marginTop: 24, color: MIST }}>Loading…</p>}

      {posts && !current && (
        <div style={{ marginTop: 28, padding: 24, border: `1px solid ${LINE}`, borderRadius: 16, background: "#fff" }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: INK }}>
            {posts.length === 0 ? "Nothing is waiting on you." : "That's the queue cleared."}
          </div>
          <p style={{ marginTop: 8, fontSize: 14, lineHeight: 1.65, color: MIST }}>
            {posts.length === 0
              ? "Only posts with finished content, verified media, a valid schedule and all required checks appear here. The morning brief uses the same checks."
              : `This session: ${summary}. Approved posts go out on their own day; nothing publishes early.`}
          </p>
          <button
            onClick={() => load()}
            style={{ marginTop: 16, padding: "9px 18px", borderRadius: 999, border: `1px solid ${LINE}`, background: "#fff", cursor: "pointer" }}
          >
            Check again
          </button>
        </div>
      )}

      {posts && held > 0 && (
        <div style={{ marginTop: 16, fontSize: 13, color: MIST }}>
          <button onClick={() => setShowHeld((v) => !v)} style={{ background: "none", border: "none", padding: 0, color: MIST, fontSize: 13, textDecoration: "underline", cursor: "pointer" }}>
            {held} post{held === 1 ? "" : "s"} held before review or publish — not waiting on you. {showHeld ? "Hide" : "See why"}
          </button>
          {showHeld && (
            <ul style={{ margin: "8px 0 0", paddingLeft: 18, lineHeight: 1.5 }}>
              {heldPosts.map((h) => (
                <li key={h.id}>
                  {prettyDay((h.slot_key ?? "").split("#")[0])} · {h.format}{h.product_handle ? ` · ${h.product_handle}` : ""}{h.approved ? " · approved" : ""}: {h.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {current && (
        <>
          <div style={{ marginTop: 6, fontSize: 13, color: MIST }}>
            {remaining} waiting · this one posts on {prettyDay(slotDay(current))}
          </div>

          <div style={{ marginTop: 18, border: `1px solid ${LINE}`, borderRadius: 18, overflow: "hidden", background: "#fff" }}>
            {current.media_urls?.length ? (
              <div style={{ display: "flex", overflowX: "auto", gap: 2, background: "#fafafa" }}>
                {current.media_urls.map((u) =>
                  /\.mp4($|\?)/i.test(u) ? (
                    <video key={u} src={u} controls style={{ width: "100%", maxHeight: 520, objectFit: "contain", flex: "0 0 100%" }} />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={u}
                      src={u}
                      alt=""
                      style={{ width: "100%", maxHeight: 520, objectFit: "contain", flex: "0 0 100%" }}
                    />
                  ),
                )}
              </div>
            ) : (
              <div style={{ padding: 28, color: MIST, fontSize: 14 }}>
                This post has no image yet. Sending it back for a rewrite is usually the right call.
              </div>
            )}

            <div style={{ padding: "18px 20px" }}>
              <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: MIST, fontWeight: 700 }}>
                {current.channel} · {current.format}
                {current.product_handle ? ` · ${current.product_handle}` : ""}
              </div>
              <div style={{ marginTop: 10, fontSize: 15, lineHeight: 1.65, color: INK, whiteSpace: "pre-wrap" }}>
                {current.caption || "No caption was written."}
              </div>
            </div>
          </div>

          {msg && (
            <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 12, background: "#fdf6ee", fontSize: 14, color: "#8a6d3b" }}>
              {msg}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
            <button
              onClick={() => decide("approve")}
              disabled={busy}
              style={{
                padding: "12px 26px",
                borderRadius: 999,
                border: "none",
                background: busy ? "#9bbfa6" : GO,
                color: "#fff",
                fontWeight: 700,
                fontSize: 15,
                cursor: busy ? "default" : "pointer",
              }}
            >
              {busy ? "Saving…" : "Approve for scheduled day"}
            </button>
            <button
              onClick={() => decide("regenerate")}
              disabled={busy}
              style={{ padding: "12px 20px", borderRadius: 999, border: `1px solid ${LINE}`, background: "#fff", fontSize: 15, cursor: busy ? "default" : "pointer" }}
            >
              Rewrite it
            </button>
            <button
              onClick={() => decide("reject")}
              disabled={busy}
              style={{ padding: "12px 20px", borderRadius: 999, border: `1px solid ${LINE}`, background: "#fff", fontSize: 15, color: MIST, cursor: busy ? "default" : "pointer" }}
            >
              Don&apos;t run it
            </button>
            {/* Skip changes nothing on the server: it is for "I want to think
                about this one", and the post stays in the queue for tomorrow. */}
            <button
              onClick={() => setAt((i) => i + 1)}
              disabled={busy}
              style={{ padding: "12px 16px", borderRadius: 999, border: "none", background: "transparent", color: MIST, fontSize: 14, cursor: "pointer" }}
            >
              Decide later
            </button>
          </div>

          <p style={{ marginTop: 22, fontSize: 12.5, lineHeight: 1.7, color: MIST }}>
            Approving schedules this post for {prettyDay(slotDay(current))} — it does not go out now, and it
            cannot go out early. Approval is tied to the exact words and pictures on this screen: if the engine
            rewrites it afterwards, the approval no longer counts and it comes back here.
          </p>
        </>
      )}
    </div>
  );
}
