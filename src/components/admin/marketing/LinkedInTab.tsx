"use client";

import { useEffect, useMemo, useState } from "react";
import type { DeskSlot } from "@/app/api/admin/marketing/plan/route";
import type { MarketingPlan } from "@/lib/marketing/plan";
import {
  LINKEDIN_POST_TIME_IST,
  LINKEDIN_RUNWAY_WEEKS,
  foldCaption,
  runway,
  manualLinkedInSlots,
  type RunwayDayState,
} from "@/lib/marketing/linkedin-desk";
import { awaitingReview, longDay, shortDay, stateLabel, tileImage } from "./desk-lib";
import { Btn, Card, Empty, INK, Kicker, LINE, MIST, Pill } from "./ui";

// The LinkedIn tab: Zyvorah's company page, a month ahead.
//
// Astra writes it (scripts/linkedin-agent.ts, every Monday), the founder
// approves it here a week at a time, and it posts Monday to Friday at 09:30 IST.
// Three questions, top to bottom:
//   1. Is the next month covered and approved?   — the runway
//   2. What will the page say?                    — each post as it will
//                                                    look in someone's feed
//   3. Is it working?                             — followers, per-post numbers
//
// Until LinkedIn grants the page connection, an approved post is put up by
// hand: copy the text, save the picture, then record the published link.

const LI_BLUE = "#0a66c2";

export type ChannelStat = { channel: string; day_key: string; followers: number | null };

const RUNWAY_STYLE: Record<RunwayDayState, { label: string; fg: string; bg: string }> = {
  empty: { label: "Astra owes", fg: "#9a6700", bg: "#fff4d6" },
  idea: { label: "idea", fg: "#6b6b6b", bg: "#f1f1ef" },
  "to-compose": { label: "composing", fg: "#8250df", bg: "#f3eefc" },
  "needs-work": { label: "being redone", fg: "#9a6700", bg: "#fff4d6" },
  "to-review": { label: "to review", fg: "#8250df", bg: "#f3eefc" },
  approved: { label: "approved", fg: "#0969da", bg: "#e7f0fb" },
  posted: { label: "posted", fg: "#1a7f37", bg: "#e6f4ea" },
};

export function linkedInSlots(slots: DeskSlot[], plans: MarketingPlan[]): DeskSlot[] {
  const live = new Set(plans.filter((p) => p.status === "live").map((p) => p.key));
  return slots
    .filter((s) => s.channel === "linkedin" && s.kind !== "ad" && s.status !== "removed" && (s.unplanned || live.has(s.plan_key)))
    .sort((a, b) => (a.day_key === b.day_key ? a.seq - b.seq : a.day_key < b.day_key ? -1 : 1));
}

export function LinkedInTab({
  slots,
  plans,
  today,
  connected,
  connection,
  stats,
  busy,
  onOpen,
  onApprove,
  onPosted,
}: {
  slots: DeskSlot[];
  plans: MarketingPlan[];
  today: string;
  connected: boolean;
  connection: string | null;
  stats: ChannelStat[];
  busy: string | null;
  onOpen: (s: DeskSlot) => void;
  onApprove: (s: DeskSlot[]) => void;
  onPosted: (s: DeskSlot, url: string) => void;
}) {
  const [showPast, setShowPast] = useState(false);
  const li = useMemo(() => linkedInSlots(slots, plans), [slots, plans]);
  const rw = useMemo(() => runway(li, today), [li, today]);
  const waiting = li.filter(awaitingReview);
  const upcoming = li.filter((s) => s.day_key >= today);
  const past = li.filter((s) => s.day_key < today).reverse();
  // Approved, its day has come, not out yet, and nothing will post it: hers
  // to put up by hand (or, if its day passed, still hers to decide).
  const byHand = manualLinkedInSlots(li, today, connected);
  const plan = plans.find((p) => p.status === "live" && li.some((s) => s.plan_key === p.key));

  const followerRows = stats.filter((r) => r.channel === "linkedin" && r.followers !== null);
  const latest = followerRows[followerRows.length - 1];
  const monthAgo = followerRows.find((r) => r.day_key >= addDays(today, -28));
  const growth = latest && monthAgo && latest !== monthAgo ? (latest.followers ?? 0) - (monthAgo.followers ?? 0) : null;

  return (
    <div style={{ marginTop: 20, display: "grid", gap: 18 }}>
      <ConnectNotice />
      {/* Who runs it, when it posts, how it is doing. */}
      <Card>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", justifyContent: "space-between" }}>
          <div style={{ minWidth: 260, flex: 1 }}>
            <Kicker>Zyvorah on LinkedIn</Kicker>
            <div style={{ fontSize: 17, fontWeight: 700 }}>{plan?.name ?? "Walls that give places their identity"}</div>
            <p style={{ fontSize: 13, lineHeight: 1.55, margin: "6px 0 0", color: "#3f3f3f" }}>
              Leadership in wall design for hotels, hospitality and workplaces. One post every working day, Monday to Friday, at {LINKEDIN_POST_TIME_IST} IST.
              Written four weeks ahead to the LinkedIn strategy; you approve a week at a time here.
            </p>
          </div>
          <div style={{ display: "grid", gap: 6, minWidth: 220 }}>
            <Stat label="Followers" value={latest?.followers != null ? latest.followers.toLocaleString("en-IN") : "—"} note={latest ? (growth != null ? `${growth >= 0 ? "+" : ""}${growth} in 4 weeks` : `counted ${shortDay(latest.day_key)}`) : "counted daily once the page is connected"} />
            <div style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "flex-start", lineHeight: 1.45 }}>
              <span style={{ color: connected ? "#1a7f37" : "#9a6700", fontWeight: 700 }}>{connected ? "●" : "○"}</span>
              <span style={{ color: MIST }}>
                {connected ? "Posts automatically, directly to the company page." : "Not connected yet: approved posts wait for you to post them by hand."}
                {connection ? <span title={connection}> ⓘ</span> : null}
              </span>
            </div>
            <a href="/admin/linkedin/connect" style={{ fontSize: 12, color: LI_BLUE, fontWeight: 600 }}>
              {connected ? "Reconnect LinkedIn" : "Connect LinkedIn"}
            </a>
          </div>
        </div>
      </Card>

      {/* Put these up today. */}
      {byHand.length > 0 && (
        <Card style={{ borderColor: LI_BLUE }}>
          <Kicker>Approved posts awaiting publication ({byHand.length})</Kicker>
          <p style={{ fontSize: 13, margin: "0 0 12px", lineHeight: 1.55 }}>
            {connected ? "Past dates stay held even with the page connected." : "The page connection is unavailable, so publication requires a manual post."}
            {" "}Review past dates for relevance before posting. For a post you choose to publish, copy the text, save the picture and post on the Zyvorah page, then record its link here. Check the page first to avoid a duplicate.
          </p>
          <div style={{ display: "grid", gap: 12 }}>
            {byHand.map((s) => (
              <HandPost key={s.id} slot={s} today={today} busy={busy} onPosted={onPosted} />
            ))}
          </div>
        </Card>
      )}

      {/* The runway: every posting day of the next four weeks. */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
          <div>
            <Kicker>The next {LINKEDIN_RUNWAY_WEEKS} weeks</Kicker>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {rw.complete
                ? "Every posting day is approved."
                : [
                    rw.approved ? `${rw.approved} approved` : null,
                    rw.toReview ? `${rw.toReview} to review` : null,
                    rw.unfinished ? `${rw.unfinished} being made` : null,
                    rw.empty ? `${rw.empty} Astra still owes` : null,
                  ].filter(Boolean).join(" · ")}
              <span style={{ color: MIST, fontWeight: 400 }}> — of {rw.days.length} posting days</span>
            </div>
          </div>
          {waiting.length > 0 && (
            <Btn kind="primary" onClick={() => onApprove(waiting)} disabled={busy !== null}>
              Approve all {waiting.length} ready
            </Btn>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))", gap: 6, marginTop: 12 }}>
          {rw.days.map((d) => {
            const st = RUNWAY_STYLE[d.state];
            const slot = li.find((s) => s.day_key === d.day);
            return (
              <button
                key={d.day}
                type="button"
                onClick={() => slot && onOpen(slot)}
                disabled={!slot}
                style={{ textAlign: "left", border: `1px solid ${LINE}`, borderRadius: 10, padding: "7px 9px", background: st.bg, cursor: slot ? "pointer" : "default", fontFamily: "inherit" }}
              >
                <div style={{ fontSize: 11, color: MIST }}>{longDay(d.day)}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: st.fg }}>{st.label}</div>
              </button>
            );
          })}
        </div>
        {rw.empty > 0 && (
          <p style={{ fontSize: 12, color: MIST, margin: "10px 0 0" }}>
            Astra fills the gaps on its Monday run. Days you removed count as gaps, and it writes a replacement.
          </p>
        )}
      </Card>

      {/* The page, as a reader scrolls it. */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <Kicker>{showPast ? "Past scheduled posts — check each status" : "Coming up — as it will look in the feed"}</Kicker>
          <button type="button" onClick={() => setShowPast((v) => !v)} style={{ background: "none", border: "none", color: MIST, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
            {showPast ? "show coming up" : `show past (${past.length})`}
          </button>
        </div>
        {(showPast ? past : upcoming).length === 0 ? (
          <Empty>{showPast ? "No past scheduled posts." : "Nothing is planned yet — Astra's first run writes the month ahead."}</Empty>
        ) : (
          <div style={{ display: "grid", gap: 16, justifyItems: "center" }}>
            {(showPast ? past : upcoming).map((s) => (
              <FeedCard key={s.id} slot={s} today={today} connected={connected} busy={busy} onOpen={onOpen} onApprove={() => onApprove([s])} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * What came back from Connect LinkedIn (?linkedin=…&msg=… on the way back from
 * /admin/linkedin/callback), and the one-time form the connection may need:
 * the LinkedIn app's Client ID and Secret, or the company page's ID.
 */
function ConnectNotice() {
  const [status, setStatus] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [page, setPage] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setStatus(q.get("linkedin"));
    setMsg(q.get("msg"));
  }, []);
  if (!status) return null;

  const needsApp = status === "needs-app";
  const needsPage = status === "needs-page";
  const save = async () => {
    setSaving(true);
    setSaved(null);
    const res = await fetch("/api/admin/linkedin/app", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(needsApp ? { clientId, clientSecret, page: page || undefined } : { page }),
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    setSaving(false);
    if (!res.ok) return setSaved(j.error ?? "Could not save.");
    // Saved: run the sign-in (again) straight away.
    window.location.href = "/admin/linkedin/connect";
  };
  const field = { fontSize: 12, padding: "6px 8px", borderRadius: 8, border: `1px solid ${LINE}`, fontFamily: "inherit", minWidth: 220 } as const;

  return (
    <Card style={{ borderColor: status === "connected" ? "#1a7f37" : LI_BLUE }}>
      <Kicker>{status === "connected" ? "LinkedIn connected" : "Connecting LinkedIn"}</Kicker>
      {msg && <p style={{ fontSize: 13, margin: "0 0 10px", lineHeight: 1.55 }}>{msg}</p>}
      {(needsApp || needsPage) && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {needsApp && (
            <>
              <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="Client ID" aria-label="LinkedIn app Client ID" style={field} />
              <input value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder="Primary Client Secret" aria-label="LinkedIn app Primary Client Secret" type="password" style={field} />
            </>
          )}
          <input value={page} onChange={(e) => setPage(e.target.value)} placeholder={needsPage ? "Company page ID" : "Company page ID (optional)"} aria-label="Zyvorah company page ID" style={field} />
          <Btn small kind="dark" onClick={save} disabled={saving || (needsApp ? !clientId || !clientSecret : !page)}>
            {saving ? "Saving" : "Save and connect"}
          </Btn>
          {saved && <span style={{ fontSize: 12, color: "#9a3412" }}>{saved}</span>}
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: MIST, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: 12, color: MIST }}>{note}</div>
    </div>
  );
}

/** One post, drawn the way LinkedIn draws a company post: the page's name,
 *  the text folded at "…see more", the picture, the action bar. */
function FeedCard({
  slot,
  today,
  connected,
  busy,
  onOpen,
  onApprove,
}: {
  slot: DeskSlot;
  today: string;
  connected: boolean;
  busy: string | null;
  onOpen: (s: DeskSlot) => void;
  onApprove: () => void;
}) {
  const [more, setMore] = useState(false);
  const p = slot.post;
  const caption = p?.caption ?? slot.caption ?? "";
  const { head, rest } = foldCaption(caption);
  const img = tileImage(slot);
  const base = stateLabel(slot, today);
  // "approved · posting" is only true once the page is connected; until then
  // an approved post on its day is waiting for her hands.
  const st =
    !connected && base.state === "approved" && slot.day_key <= today
      ? { ...base, label: "approved · post by hand" }
      : base;
  const metrics = p?.metrics && Object.keys(p.metrics).length ? p.metrics : null;

  return (
    <div style={{ width: "100%", maxWidth: 555 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>
          {longDay(slot.day_key)} · {LINKEDIN_POST_TIME_IST} IST
        </span>
        <Pill label={st.label} colour={st.colour} bg={st.bg} />
      </div>
      <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, background: "#fff", overflow: "hidden", fontFamily: "-apple-system, system-ui, 'Segoe UI', Roboto, sans-serif", color: "rgba(0,0,0,0.9)" }}>
        <div style={{ display: "flex", gap: 8, padding: "12px 16px 0" }}>
          <div style={{ width: 48, height: 48, background: INK, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16, flex: "0 0 auto" }}>z.</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Zyvorah</div>
            <div style={{ fontSize: 12, color: "rgba(0,0,0,0.6)" }}>Wallpaper &amp; murals</div>
            <div style={{ fontSize: 12, color: "rgba(0,0,0,0.6)" }}>{slot.day_key === today ? "now" : shortDay(slot.day_key)} · 🌐</div>
          </div>
        </div>
        <div style={{ padding: "8px 16px 10px", fontSize: 14, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>
          {caption ? (
            <>
              {more ? caption : head}
              {!more && rest && (
                <button type="button" onClick={() => setMore(true)} style={{ border: "none", background: "none", padding: 0, marginLeft: 4, color: "rgba(0,0,0,0.6)", cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>
                  …see more
                </button>
              )}
            </>
          ) : (
            <span style={{ color: MIST }}>No text yet.</span>
          )}
        </div>
        <div onClick={() => onOpen(slot)} style={{ background: "#f3f2ef", cursor: "pointer", position: "relative" }}>
          {img.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img.src} alt="" loading="lazy" style={{ width: "100%", display: "block", opacity: img.composed ? 1 : 0.75 }} />
          ) : (
            <div style={{ padding: 40, textAlign: "center", color: MIST, fontSize: 13 }}>No picture yet.</div>
          )}
          {!img.composed && img.src && (
            <div style={{ position: "absolute", top: 10, left: 10, fontSize: 11, background: "rgba(15,15,15,0.72)", color: "#fff", padding: "3px 8px", borderRadius: 6 }}>
              catalogue picture — not composed yet
            </div>
          )}
        </div>
        {metrics && (
          <div style={{ padding: "8px 16px", fontSize: 12, color: "rgba(0,0,0,0.6)", borderBottom: `1px solid ${LINE}` }}>
            {[
              metrics.impressions != null ? `${metrics.impressions} impressions` : null,
              metrics.reactions != null ? `${metrics.reactions} reactions` : null,
              metrics.comments != null ? `${metrics.comments} comments` : null,
              metrics.reposts != null ? `${metrics.reposts} reposts` : null,
              metrics.clicks != null ? `${metrics.clicks} clicks` : null,
              metrics.engagement_rate != null ? `${(metrics.engagement_rate * 100).toFixed(1)}% engagement` : null,
            ].filter(Boolean).join(" · ")}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-around", padding: "6px 8px", fontSize: 13, fontWeight: 600, color: "rgba(0,0,0,0.6)" }}>
          <span>👍 Like</span>
          <span>💬 Comment</span>
          <span>🔁 Repost</span>
          <span>➤ Send</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        {awaitingReview(slot) && (
          <Btn kind="primary" small onClick={onApprove} disabled={busy !== null}>
            Approve for {shortDay(slot.day_key)}
          </Btn>
        )}
        <Btn small onClick={() => onOpen(slot)}>
          {awaitingReview(slot) ? "Note, rewrite or remove" : "Open"}
        </Btn>
        {p?.status === "published" && p.external_id && (
          <a href={postLink(p.external_id)} target="_blank" rel="noreferrer" style={{ fontSize: 12, alignSelf: "center", color: LI_BLUE }}>
            Open on LinkedIn
          </a>
        )}
      </div>
    </div>
  );
}

/** Copy, save, post, paste the link back. */
function HandPost({ slot, today, busy, onPosted }: { slot: DeskSlot; today: string; busy: string | null; onPosted: (s: DeskSlot, url: string) => void }) {
  const [copied, setCopied] = useState(false);
  const [link, setLink] = useState("");
  const p = slot.post!;
  const picture = p.media_urls?.[0] ?? null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(p.caption ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy the text:", p.caption ?? "");
    }
  };

  const save = async () => {
    if (!picture) return;
    try {
      const blob = await (await fetch(picture)).blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `zyvorah-linkedin-${slot.day_key}.jpg`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch {
      window.open(picture, "_blank", "noopener");
    }
  };

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", borderTop: `1px solid ${LINE}`, paddingTop: 12 }}>
      {picture && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={picture} alt="" style={{ width: 64, height: 80, objectFit: "cover", borderRadius: 6 }} />
      )}
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>
          {longDay(slot.day_key)}
          {slot.day_key < today ? " — its day has passed" : ""}
        </div>
        <div style={{ fontSize: 12, color: MIST, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 420 }}>{(p.caption ?? "").split("\n")[0]}</div>
        <div style={{ fontSize: 12, color: LI_BLUE, marginTop: 4 }}>Awaiting manual publication · no published link recorded</div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <Btn small onClick={copy}>{copied ? "Copied" : "Copy text"}</Btn>
        <Btn small onClick={save} disabled={!picture}>Save picture</Btn>
        <a href="https://www.linkedin.com/company/zyvorah/posts/" target="_blank" rel="noreferrer" style={{ fontSize: 12, color: LI_BLUE }}>Open Zyvorah page</a>
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="paste the post's link"
          aria-label={`Published LinkedIn post link for ${longDay(slot.day_key)}`}
          style={{ fontSize: 12, padding: "5px 8px", borderRadius: 8, border: `1px solid ${LINE}`, width: 190, fontFamily: "inherit" }}
        />
        <Btn small kind="dark" onClick={() => link.trim() && onPosted(slot, link.trim())} disabled={busy !== null || !link.trim()}>
          Record published link
        </Btn>
      </div>
    </div>
  );
}

function postLink(externalId: string): string {
  if (externalId.startsWith("https://")) return externalId;
  return `https://www.linkedin.com/feed/update/${externalId}/`;
}

function addDays(dayKey: string, n: number): string {
  return new Date(Date.parse(`${dayKey}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}
