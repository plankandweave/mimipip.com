"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Card, INK, LINE, MIST, PAPER } from "./ui";
import { DIVISIONS, describeFilm, divisionOf, divisionsFor, filmOf, isDivision, type Division } from "@/lib/marketing/video-divisions";
import { LANGUAGES, isLanguage, type FilmLanguage } from "@/lib/marketing/film-language";
import {
  CLEARANCE_ITEMS, PLATFORM_LABEL, STATUS, STATUS_LABEL, isCleared, isProven, normaliseClearance, pendingClearance,
  type Clearance, type ClearanceItem, type ClearanceState, type Post,
} from "@/lib/marketing/library-record";
import { longformOf } from "@/lib/marketing/youtube-longform";

// The Library's Videos section. Every finished film is filed under the
// destination it was made for — Reels, YouTube Shorts, Stories, Ad films,
// Amazon, YouTube. The server reads each film's shape and length from the MP4
// itself and files it where it fits: a 16:9 film filed as a Reel is moved to
// YouTube, never shown as failing (Roheena, 28 Sep 2026).
//
// The header (search, language, status, divisions — each with its count)
// stays pinned while the films scroll, and every choice is kept in the address
// bar. Language is what the viewer HEARS: English, Hindi or no voice.
// Every film is drawn in its own shape — vertical films vertical, widescreen
// films 16:9 across two columns — so no film sits in black bars.
//
// Each card also carries the film's record: where it has been posted (links
// the server checked against YouTube and Instagram — the status is computed
// from those, never typed), its other versions, and whether it is cleared for
// public use (voice licence, music licence, listening review — Roheena's call,
// each with written evidence).

type Asset = {
  id: string; title: string; wallpaper: string; product_url: string;
  status: string; notes: string | null; media_key: string | null;
  cover_key: string | null; created_at: string; format: string;
  width: number | null; height: number | null; duration_s: number | string | null;
  language: FilmLanguage | null;
  posts: Post[] | null; version_group: string | null; clearance: unknown;
  youtube?: unknown;
  captions_key?: string | null; captions_source?: string | null; captions_error?: string | null; captions_attempts?: number | null;
  site_kind?: string | null; site_handle?: string | null; site_enabled?: boolean; site_state?: string;
  site_error?: string | null; site_published_at?: string | null; site_refusal?: string | null;
};

/** What a film did on zyvorah.com — people, not events (marketing_film_stats). */
type FilmStats = { plays: number; sound: number; halves: number; completes: number; ctas: number; carts: number };

type View = "all" | Division;
type LangView = "all" | FilmLanguage | "unset";
type StatusView = "all" | "ready" | "unposted" | "unverified" | "posted";
type Viewer = { email: string; canClear: boolean };

const endpoint = "/api/admin/marketing/library";

// Rows of a card, shared with its grid through CSS subgrid so every card in a
// grid row puts each part — above all the Download button — on the same line,
// however long the title above it runs.
const CARD_ROWS = 12;

const postsOf = (a: Asset): Post[] => a.posts ?? [];
const clearanceOf = (a: Asset): Clearance => normaliseClearance(a.clearance);
/** Nothing stands between this film and the public, and it has not gone out yet. */
const isReady = (a: Asset) => isCleared(clearanceOf(a)) && postsOf(a).length === 0;

const statusMatches = (a: Asset, s: StatusView) =>
  s === "all" ? true
    : s === "ready" ? isReady(a)
    : s === "unposted" ? a.status === STATUS.none
      : s === "unverified" ? a.status === STATUS.unproven
      : a.status === STATUS.posted;

// The filters live in the address bar, so a narrowed view survives a reload
// and can be linked. `find`, not `q`: the desk has its own Search tab.
const PARAMS = { division: "division", lang: "lang", status: "posted", find: "find" } as const;
const STATUS_VIEWS: StatusView[] = ["ready", "unposted", "unverified", "posted"];

// Which films' notes are open, remembered per browser. Storage can be blocked
// (private window, site data off), so every access is guarded.
const NOTES_KEY = "zy-library-notes-open";
function readOpenNotes(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(NOTES_KEY) ?? "[]") as string[]); } catch { return new Set(); }
}
function writeOpenNotes(ids: Set<string>) {
  try { localStorage.setItem(NOTES_KEY, JSON.stringify([...ids])); } catch { /* not remembered */ }
}

const STATUS_TONE: Record<string, string> = {
  [STATUS.none]: "#f2e9d5",
  [STATUS.unproven]: "#fbe7c2",
  [STATUS.posted]: "#e3f1ea",
};

function shapeName(a: Asset): string {
  const film = filmOf(a);
  if (!film) return "Film";
  return film.width > film.height ? "Widescreen" : film.width < film.height ? "Portrait" : "Square";
}

function LibraryFilm({ asset, frame }: { asset: Asset; frame: string }) {
  const player = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const mediaUrl = `${endpoint}/media?id=${encodeURIComponent(asset.id)}`;

  return <div>
    <div style={{ position: "relative", width: "100%", aspectRatio: frame, background: "#0b0b0b", borderRadius: 8, overflow: "hidden" }}>
      <video
        ref={player}
        src={mediaUrl}
        poster={asset.cover_key ? `${mediaUrl}&kind=cover` : undefined}
        controls
        playsInline
        preload="metadata"
        aria-label={`${asset.title} video`}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => setFailed(true)}
        style={{ display: "block", width: "100%", height: "100%", objectFit: "contain" }}
      />
      {!playing && !failed && <button
        type="button"
        aria-label={`Play ${asset.title}`}
        onClick={() => { void player.current?.play(); }}
        style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 56, height: 56, borderRadius: "50%", border: "2px solid white", background: "rgba(0,0,0,.72)", color: "white", fontSize: 22, cursor: "pointer", paddingLeft: 5 }}
      >▶</button>}
    </div>
    {failed && <p role="alert" style={{ color: "#b42318", fontSize: 12, margin: "6px 0 0" }}>The preview could not load. Try downloading the video.</p>}
  </div>;
}

const selectStyle = { font: "inherit", fontSize: 12, padding: "3px 6px", borderRadius: 6, border: `1px solid ${LINE}`, background: "#fff", color: INK, maxWidth: "100%" } as const;
const linkButton = { border: 0, background: "none", padding: 0, font: "inherit", fontSize: 12, color: INK, textDecoration: "underline", cursor: "pointer" } as const;
const smallInput = { font: "inherit", fontSize: 12, padding: "5px 8px", borderRadius: 6, border: `1px solid ${LINE}`, background: "#fff", color: INK, minWidth: 0, flex: 1 } as const;
const smallButton = { font: "inherit", fontSize: 12, padding: "5px 10px", borderRadius: 6, border: 0, background: INK, color: "#fff", cursor: "pointer", whiteSpace: "nowrap" } as const;

type Act = (a: Asset, action: string, body?: Record<string, unknown>) => Promise<string | null>;

const pct = (n: number, of: number) => `${Math.round((Number(n) / Math.max(1, Number(of))) * 100)}%`;

/** The page a film's link names, as a path. */
function sitePath(a: Asset): string | null {
  if (!a.site_kind || !a.site_handle) return null;
  switch (a.site_kind) {
    case "product": return `/products/${a.site_handle}`;
    case "collection": return a.site_handle === "taash" ? "/mati" : `/collections/${a.site_handle}`;
    case "concept": return `/concepts/${a.site_handle}`;
    case "page": return `/${a.site_handle}`;
    default: return null;
  }
}

/** Where this film stands on zyvorah.com, what it did there, and the one
 *  switch that keeps a cleared film off. Clearance is the approval; nothing
 *  else here needs a decision. */
function OnSite({ asset, stats, busy, onToggle }: { asset: Asset; stats: FilmStats | undefined; busy: boolean; onToggle: (a: Asset, on: boolean) => void }) {
  const path = sitePath(asset);
  const live = asset.site_state === "live";
  const failed = asset.site_state === "failed";
  const off = asset.site_enabled === false;
  const tone = live
    ? { bg: "#e3f1ea", fg: "#00614a", text: `Live on zyvorah.com${asset.site_published_at ? ` since ${asset.site_published_at.slice(0, 10)}` : ""}` }
    : failed
      ? { bg: "#fbe3e1", fg: "#A3211E", text: `Could not go live: ${asset.site_error ?? "unknown reason"}` }
      : asset.site_refusal
        ? { bg: "#f2f2f5", fg: "#5b5b70", text: `Not on the site — ${asset.site_refusal}` }
        : { bg: "#fbefd6", fg: "#7a5500", text: "Cleared — goes live on its page within ten minutes" };
  return <div style={{ fontSize: 12 }}>
    <div style={{ borderRadius: 8, padding: "6px 9px", background: tone.bg, color: tone.fg, fontWeight: 600 }}>{tone.text}</div>
    <div style={{ display: "flex", gap: "4px 12px", flexWrap: "wrap", alignItems: "center", marginTop: 6, color: MIST }}>
      {path
        ? <span>Page: <a href={`https://zyvorah.com${path}`} target="_blank" rel="noreferrer" style={{ color: INK }}>zyvorah.com{path}</a></span>
        : <span style={{ color: "#8a6100" }}>Give it a zyvorah.com page link to show it on the site.</span>}
      {path && asset.format !== "amazon" && asset.format !== "meeting" && <button type="button" disabled={busy} onClick={() => onToggle(asset, off)} style={linkButton}>
        {off ? "Show on the site" : "Keep off the site"}
      </button>}
      {failed && !off && <button type="button" disabled={busy} onClick={() => onToggle(asset, true)} style={linkButton}>Try again</button>}
    </div>
    {live && (stats && Number(stats.plays) > 0
      ? <p style={{ margin: "6px 0 0", color: INK }}>
        <strong>{stats.plays}</strong> {Number(stats.plays) === 1 ? "person" : "people"} played it · {pct(stats.sound, stats.plays)} heard it · {pct(stats.completes, stats.plays)} watched to the end
        {Number(stats.carts) > 0 ? ` · ${stats.carts} went on to a cart` : ""}
      </p>
      : <p style={{ margin: "6px 0 0", color: MIST }}>No plays recorded yet.</p>)}
  </div>;
}

/** The film's captions: written automatically from the narration a few
 *  minutes after filing (film-captions.ts), read here as part of the
 *  listening review, and corrected here when a word is wrong. They go to the
 *  website and YouTube with the film. */
function Captions({ asset, busy, onAct }: { asset: Asset; busy: boolean; onAct: Act }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  if (asset.language === "none") return null;
  const failedOut = !asset.captions_key && !!asset.captions_error && (asset.captions_attempts ?? 0) >= 5;
  const status = asset.captions_key
    ? `Captions ${asset.captions_source === "edited" ? "corrected by hand" : "written automatically"}`
    : !asset.language
      ? "Captions wait for the film's language"
      : asset.captions_error
        ? `Captions not made yet: ${asset.captions_error}`
        : "Captions are being written";
  const toggle = async () => {
    setOpen((v) => !v);
    if (text !== null) return;
    const r = await fetch(`${endpoint}/captions?id=${encodeURIComponent(asset.id)}`, { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    setText(j.vtt ?? "");
    setDraft(j.vtt ?? "");
  };
  const save = async () => {
    const failure = await onAct(asset, "save_captions", { vtt: draft });
    setProblem(failure);
    if (!failure) { setText(draft); setEditing(false); }
  };
  return <div style={{ fontSize: 12 }}>
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ color: asset.captions_error && !asset.captions_key ? "#A3211E" : MIST }}>{status}</span>
      {asset.captions_key && <button type="button" onClick={() => void toggle()} style={linkButton}>{open ? "Hide" : "Read them"}</button>}
      {failedOut && <button type="button" disabled={busy} onClick={() => void onAct(asset, "retry_captions").then(setProblem)} style={linkButton}>Try again</button>}
    </div>
    {open && (text === null
      ? <p style={{ margin: "4px 0 0", color: MIST }}>Loading…</p>
      : editing
        ? <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={10} aria-label="Captions (WebVTT)" style={{ ...smallInput, fontFamily: "ui-monospace, monospace", fontSize: 11, whiteSpace: "pre" }} />
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" disabled={busy} onClick={() => void save()} style={smallButton}>Save captions</button>
            <button type="button" onClick={() => { setEditing(false); setDraft(text); setProblem(null); }} style={{ ...smallButton, background: "#fff", color: INK, border: `1px solid ${LINE}` }}>Cancel</button>
          </div>
        </div>
        : <div style={{ marginTop: 6 }}>
          <pre style={{ margin: 0, maxHeight: 180, overflow: "auto", whiteSpace: "pre-wrap", fontSize: 11, color: INK, background: "#fafafa", padding: 8, borderRadius: 6, border: `1px solid ${LINE}` }}>{text.replace(/^WEBVTT\s*/, "") || "No captions stored."}</pre>
          <button type="button" onClick={() => setEditing(true)} style={{ ...linkButton, marginTop: 4 }}>Correct the captions</button>
        </div>)}
    {problem && <p role="alert" style={{ margin: "4px 0 0", color: "#b42318" }}>{problem}</p>}
  </div>;
}

/** Voice licence, music licence, listening review — what still stands between
 *  this film and the public, and (for Roheena) the place to settle each one. */
function ClearancePanel({ asset, viewer, busy, onAct }: { asset: Asset; viewer: Viewer | null; busy: boolean; onAct: Act }) {
  const clearance = clearanceOf(asset);
  const pending = pendingClearance(clearance);
  const posted = postsOf(asset).length > 0;
  const [open, setOpen] = useState(false);
  const [evidence, setEvidence] = useState<Partial<Record<ClearanceItem, string>>>({});
  const [problem, setProblem] = useState<string | null>(null);

  const tone = pending.length === 0
    ? { bg: "#e3f1ea", fg: "#00614a", text: "Cleared for public use" }
    : posted
      ? { bg: "#fbe3e1", fg: "#A3211E", text: `Posted before clearance — ${pending.map((p) => p.label.toLowerCase()).join(", ")}` }
      : { bg: "#fbefd6", fg: "#7a5500", text: `Not cleared: ${pending.map((p) => p.label.toLowerCase()).join(", ")}` };

  const settle = async (item: ClearanceItem, state: ClearanceState) => {
    setProblem(await onAct(asset, "clear", { item, state, evidence: evidence[item] ?? "" }));
  };

  return <div>
    <button
      type="button"
      aria-expanded={open}
      onClick={() => setOpen((v) => !v)}
      style={{ display: "block", width: "100%", textAlign: "left", border: 0, borderRadius: 8, padding: "6px 9px", background: tone.bg, color: tone.fg, font: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
    >{tone.text} <span style={{ fontWeight: 400 }}>{open ? "▴" : "▾"}</span></button>
    {open && <div style={{ display: "grid", gap: 8, marginTop: 8, fontSize: 12 }}>
      {CLEARANCE_ITEMS.map((i) => {
        const c = clearance[i.key];
        return <div key={i.key} style={{ borderTop: `1px solid ${LINE}`, paddingTop: 7 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <strong>{i.label}</strong>
            <span style={{ color: c.state === "pending" ? "#7a5500" : "#00614a" }}>{c.state === "n/a" ? "not needed" : c.state}</span>
          </div>
          {c.evidence && <p style={{ margin: "3px 0 0", color: MIST }}>{c.evidence}{c.cleared_by ? ` — ${c.cleared_by}, ${c.cleared_at?.slice(0, 10)}` : ""}</p>}
          {viewer?.canClear && (c.state === "pending"
            ? <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              <input
                value={evidence[i.key] ?? ""}
                onChange={(e) => setEvidence((v) => ({ ...v, [i.key]: e.target.value }))}
                placeholder={i.ask}
                aria-label={`Evidence for ${i.label}`}
                style={smallInput}
              />
              <button type="button" disabled={busy} onClick={() => void settle(i.key, "cleared")} style={smallButton}>Clear</button>
              <button type="button" disabled={busy} onClick={() => void settle(i.key, "n/a")} style={{ ...smallButton, background: "#fff", color: INK, border: `1px solid ${LINE}` }}>Not needed</button>
            </div>
            : <button type="button" disabled={busy} onClick={() => void settle(i.key, "pending")} style={{ ...linkButton, marginTop: 4 }}>Reopen</button>)}
        </div>;
      })}
      {!viewer?.canClear && <p style={{ margin: 0, color: MIST }}>Only Roheena can clear a film.</p>}
      {problem && <p role="alert" style={{ margin: 0, color: "#b42318" }}>{problem}</p>}
    </div>}
  </div>;
}

/** The film's other versions, as chips that jump to them, and the one place
 *  to link or unlink a version. Versions are linked by a person, never guessed. */
function Versions({ asset, siblings, candidates, busy, onAct, onJump }: {
  asset: Asset; siblings: Asset[]; candidates: Asset[]; busy: boolean; onAct: Act; onJump: (a: Asset) => void;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  const link = async (otherId: string) => {
    const other = candidates.find((c) => c.id === otherId);
    if (!other) return;
    if (other.format === asset.format && other.language === asset.language && shapeName(other) === shapeName(asset)
      && !window.confirm(`“${other.title}” has the same shape, division and language as this film. Link them as versions anyway?`)) return;
    setProblem(await onAct(asset, "link_version", { otherId }));
  };
  return <div style={{ fontSize: 12 }}>
    {siblings.length > 0 && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
      <span style={{ color: MIST }}>Also as</span>
      {siblings.map((s) => <button
        key={s.id}
        type="button"
        onClick={() => onJump(s)}
        title={s.title}
        style={{ border: `1px solid ${LINE}`, background: "#fff", borderRadius: 999, padding: "3px 9px", font: "inherit", fontSize: 12, cursor: "pointer", color: INK }}
      >{shapeName(s)} · {divisionOf(s.format).label}{filmOf(s) ? ` · ${describeFilm(filmOf(s)!).split(" · ")[1]}` : ""} →</button>)}
    </div>}
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", color: MIST }}>
      <select value="" disabled={busy} onChange={(e) => void link(e.target.value)} aria-label="Link another version" style={{ ...selectStyle, color: MIST, flex: "1 1 140px", width: 0, minWidth: 0 }}>
        <option value="">{siblings.length ? "Link another version…" : "Link a version…"}</option>
        {candidates.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
      </select>
      {siblings.length > 0 && <button type="button" disabled={busy} onClick={() => void onAct(asset, "unlink_version").then(setProblem)} style={{ ...linkButton, color: MIST }}>Unlink</button>}
    </div>
    {problem && <p role="alert" style={{ margin: "4px 0 0", color: "#b42318" }}>{problem}</p>}
  </div>;
}

/** Where the film has gone out, each link as the platform confirmed it. */
function Posts({ asset, busy, onAct }: { asset: Asset; busy: boolean; onAct: Act }) {
  const posts = postsOf(asset);
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const cleared = isCleared(clearanceOf(asset));

  const record = async (event: FormEvent) => {
    event.preventDefault();
    const failure = await onAct(asset, "record_post", { url });
    setProblem(failure);
    if (!failure) { setUrl(""); setAdding(false); }
  };

  return <div style={{ fontSize: 12 }}>
    {posts.map((p) => {
      const proven = isProven(p);
      const privacy = p.evidence?.privacyStatus;
      return <div key={p.id} style={{ display: "flex", gap: 6, alignItems: "baseline", marginBottom: 4 }}>
        <span aria-hidden style={{ color: proven ? "#00875A" : "#B8860B" }}>{proven ? "✓" : "○"}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <a href={p.url} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>{PLATFORM_LABEL[p.platform]}</a>
          <span style={{ color: MIST }}>
            {proven ? " — confirmed" : p.verified ? ` — ours, but ${privacy} on ${PLATFORM_LABEL[p.platform]}` : ` — ${p.unverified_reason ?? "not yet confirmed"}`}
          </span>
        </div>
        <button type="button" disabled={busy} aria-label={`Remove ${PLATFORM_LABEL[p.platform]} post`} onClick={() => void onAct(asset, "remove_post", { postId: p.id }).then(setProblem)} style={{ ...linkButton, color: MIST, textDecoration: "none" }}>✕</button>
      </div>;
    })}
    {adding
      ? <form onSubmit={record} style={{ display: "flex", gap: 6 }}>
        <input autoFocus type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste the YouTube, Instagram, Amazon or Meta link" aria-label="Post link" style={smallInput} />
        <button type="submit" disabled={busy} style={smallButton}>{busy ? "Checking…" : "Record"}</button>
      </form>
      : <button type="button" onClick={() => { setAdding(true); setProblem(null); }} style={linkButton}>+ Record a post</button>}
    {adding && !cleared && <p style={{ margin: "5px 0 0", color: "#A3211E" }}>This film is not cleared for public use yet. Record the post anyway if it is already out — the card will say so.</p>}
    {problem && <p role="alert" style={{ margin: "5px 0 0", color: "#b42318" }}>{problem}</p>}
  </div>;
}

/** A widescreen film or square Short's own YouTube upload: where the pipeline stands, and
 *  Roheena's one tap that approves and runs it. Staff who are not Roheena see
 *  the state, never the button. */
function YouTubePublish({ asset, viewer, busy, onAct }: { asset: Asset; viewer: Viewer | null; busy: boolean; onAct: Act }) {
  const [problem, setProblem] = useState<string | null>(null);
  const film = filmOf(asset);
  if (asset.format !== "youtube" || !film || film.width < film.height || (film.width === film.height && film.durationS > 180.5)) return null;
  const lf = longformOf(asset);
  const line = !lf ? null
    : lf.state === "published" ? <>On YouTube{lf.privacy && lf.privacy !== "public" ? ` (${lf.privacy})` : ""} — <a href={lf.url} target="_blank" rel="noreferrer">{lf.title ?? "watch"}</a>{lf.thumbnail && lf.thumbnail !== "set from the Library cover" ? <span style={{ color: MIST }}> · thumbnail: {lf.thumbnail}</span> : null}</>
      : lf.state === "uploading" ? <>Uploading to YouTube now…</>
        : lf.state === "queued" ? <>Approved — queued for YouTube</>
          : <span style={{ color: "#A3211E" }}>{lf.state === "blocked" ? "Held" : "Failed"}: {lf.error}</span>;
  const canPublish = viewer?.canClear && lf?.state !== "published" && lf?.state !== "uploading";
  return <div style={{ fontSize: 12, marginTop: 6 }}>
    {line && <p style={{ margin: "0 0 5px" }}>{line}</p>}
    {canPublish && <button type="button" disabled={busy} style={smallButton}
      onClick={() => void onAct(asset, "publish_youtube").then(setProblem)}>
      {busy ? "Publishing…" : lf ? "Retry YouTube" : "Publish to YouTube"}
    </button>}
    {problem && <p role="alert" style={{ margin: "5px 0 0", color: "#b42318" }}>{problem}</p>}
  </div>;
}

function FilmCard({ asset, busy, viewer, onMove, onLanguage, onAct, onJump, inWideGrid, notesOpen, onToggleNotes, siblings, candidates, flash, stats, onSite }: {
  asset: Asset; busy: boolean; viewer: Viewer | null; inWideGrid: boolean; notesOpen: boolean; flash: boolean;
  siblings: Asset[]; candidates: Asset[]; stats: FilmStats | undefined;
  onSite: (a: Asset, on: boolean) => void;
  onMove: (a: Asset, to: Division) => void;
  onLanguage: (a: Asset, to: FilmLanguage) => void;
  onAct: Act;
  onJump: (a: Asset) => void;
  onToggleNotes: (id: string) => void;
}) {
  const division = divisionOf(asset.format);
  const film = filmOf(asset);
  const wide = film ? film.width > film.height : division.key === "youtube";
  const [copied, setCopied] = useState(false);
  const langLabel = LANGUAGES.find((l) => l.key === asset.language)?.label;
  const copy = () => {
    void navigator.clipboard?.writeText(asset.product_url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };
  return <div id={`film-${asset.id}`} style={{ display: "grid", gridTemplateRows: "subgrid", gridTemplateColumns: "minmax(0, 1fr)", minWidth: 0, gridRow: `span ${CARD_ROWS}`, gridColumn: wide && !inWideGrid ? "span 2" : undefined, scrollMarginTop: 220 }}>
    <Card style={{
      padding: 14, display: "grid", gridTemplateRows: "subgrid", gridTemplateColumns: "minmax(0, 1fr)", minWidth: 0, gridRow: `span ${CARD_ROWS}`, rowGap: 10, alignContent: "start",
      outline: flash ? `3px solid ${INK}` : "none", outlineOffset: 2, transition: "outline-color .6s",
    }}>
      {/* 1 — the film */}
      {asset.media_key ? <LibraryFilm asset={asset} frame={film ? `${film.width} / ${film.height}` : wide ? "16 / 9" : "9 / 16"} /> : <div />}
      {/* 2 — title, in full: the row grows to the longest title beside it */}
      <h3 style={{ margin: 0, fontSize: 16, lineHeight: 1.3 }}>{asset.title}</h3>
      {/* 3 — where it stands */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", fontSize: 12 }}>
        <span style={{ background: STATUS_TONE[asset.status] ?? "#f2e9d5", borderRadius: 20, padding: "3px 9px" }}>{STATUS_LABEL[asset.status] ?? asset.status}</span>
        {langLabel && <span style={{ border: `1px solid ${LINE}`, borderRadius: 20, padding: "2px 9px" }}>{langLabel}</span>}
        {film && <span style={{ color: MIST }}>{describeFilm(film)}</span>}
      </div>
      {/* 4 — cleared for public use? */}
      <ClearancePanel asset={asset} viewer={viewer} busy={busy} onAct={onAct} />
      {/* captions, for the listening review */}
      <Captions asset={asset} busy={busy} onAct={onAct} />
      {/* on zyvorah.com: where it stands, what it did, the keep-off switch */}
      <OnSite asset={asset} stats={stats} busy={busy} onToggle={onSite} />
      {/* 5 — its other versions */}
      <Versions asset={asset} siblings={siblings} candidates={candidates} busy={busy} onAct={onAct} onJump={onJump} />
      {/* 6 — filing */}
      <div style={{ display: "flex", gap: "6px 14px", flexWrap: "wrap", alignItems: "center", fontSize: 12, color: MIST }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          Filed under
          <select value={division.key} disabled={busy} onChange={(e) => onMove(asset, e.target.value as Division)} style={selectStyle}>
            {divisionsFor(film).map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center", color: asset.language ? MIST : "#8a6100" }}>
          Language
          <select value={asset.language ?? ""} disabled={busy} onChange={(e) => onLanguage(asset, e.target.value as FilmLanguage)} style={{ ...selectStyle, borderColor: asset.language ? LINE : "#B8860B" }}>
            {!asset.language && <option value="" disabled>Not set — choose</option>}
            {LANGUAGES.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
          </select>
        </label>
      </div>
      {/* 7 — what it sells */}
      <div style={{ fontSize: 13 }}>
        <p style={{ margin: "0 0 4px" }}><strong>Wallpaper / concept:</strong> {asset.wallpaper}</p>
        <p style={{ margin: 0, overflowWrap: "anywhere" }}>
          <a href={asset.product_url} target="_blank" rel="noreferrer">{asset.product_url.replace(/^https:\/\//, "")}</a>
          {" "}<button type="button" onClick={copy} style={linkButton}>{copied ? "Copied" : "Copy link"}</button>
        </p>
      </div>
      {/* 8 — the one action, level across the row */}
      <div>
        {asset.media_key && <a
          href={`${endpoint}/media?id=${encodeURIComponent(asset.id)}&download=1`}
          download
          style={{ display: "inline-block", padding: "8px 12px", background: INK, color: "white", borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: "none" }}
        >Download video (MP4)</a>}
      </div>
      {/* 9 — where it has gone out */}
      <div>
        <Posts asset={asset} busy={busy} onAct={onAct} />
        <YouTubePublish asset={asset} viewer={viewer} busy={busy} onAct={onAct} />
      </div>
      {/* 10 — production notes, folded */}
      <div style={{ fontSize: 12 }}>
        {asset.notes && <>
          <p style={{
            margin: 0, color: MIST, whiteSpace: "pre-wrap",
            ...(notesOpen ? {} : { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }),
          }}>{asset.notes}</p>
          <button type="button" aria-expanded={notesOpen} onClick={() => onToggleNotes(asset.id)} style={{ ...linkButton, marginTop: 4 }}>
            {notesOpen ? "Hide notes" : "Show notes"}
          </button>
        </>}
      </div>
    </Card>
  </div>;
}

/** A row of choices, one pressed, each with how many films it would show. */
function Choices<K extends string>({ label, value, options, onChange }: {
  label: string; value: K; onChange: (k: K) => void;
  options: { key: K; label: string; count: number }[];
}) {
  return <div role="group" aria-label={label} style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
    {options.map((o) => {
      const active = value === o.key;
      return <button
        key={o.key}
        type="button"
        aria-pressed={active}
        onClick={() => onChange(o.key)}
        style={{ padding: "6px 12px", borderRadius: 999, border: `1px solid ${active ? INK : LINE}`, background: active ? INK : "#fff", color: active ? "#fff" : INK, fontSize: 13, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
      >{o.label} <span style={{ opacity: 0.7 }}>{o.count}</span></button>;
    })}
  </div>;
}

/** Height of the site's own pinned header, so the Videos header pins just
 *  under it instead of sliding beneath it. Measured, because the header's
 *  height changes with the viewport. */
function useSiteHeaderHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const header = document.querySelector("header");
    if (!header || getComputedStyle(header).position !== "sticky") return;
    const measure = () => setHeight(header.getBoundingClientRect().height);
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  return height;
}

export function LibraryTab() {
  const headerHeight = useSiteHeaderHeight();
  const videosTop = useRef<HTMLDivElement>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [stats, setStats] = useState<Record<string, FilmStats>>({});
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View>("all");
  const [lang, setLang] = useState<LangView>("all");
  const [status, setStatus] = useState<StatusView>("all");
  const [find, setFind] = useState("");
  const [openNotes, setOpenNotes] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [format, setFormat] = useState<Division | "">("");
  const [language, setLanguage] = useState<FilmLanguage | "">("");
  const [wallpaper, setWallpaper] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [video, setVideo] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(endpoint, { cache: "no-store" });
    const json = await response.json().catch(() => ({}));
    setLoaded(true);
    if (!response.ok) { setError(json.error ?? "Could not load the library"); return; }
    setAssets(json.assets ?? []);
    setViewer(json.viewer ?? null);
    setStats(json.stats ?? {});
    setError(null);
  }, []);
  useEffect(() => {
    // Deferred a tick, as the desk does: the fetch waits anyway. The address
    // bar and the remembered open notes are read here, after hydration.
    const t = setTimeout(() => {
      const q = new URLSearchParams(window.location.search);
      const d = q.get(PARAMS.division); if (isDivision(d)) setView(d);
      const l = q.get(PARAMS.lang); if (isLanguage(l) || l === "unset") setLang(l);
      const s = q.get(PARAMS.status); if ((STATUS_VIEWS as string[]).includes(s ?? "")) setStatus(s as StatusView);
      setFind(q.get(PARAMS.find) ?? "");
      setOpenNotes(readOpenNotes());
      void load();
    }, 0);
    return () => clearTimeout(t);
  }, [load]);

  // Mirror the filters into the address bar, leaving the desk's own ?tab= alone.
  useEffect(() => {
    if (!loaded) return;
    const url = new URL(window.location.href);
    const put = (key: string, value: string, fallback: string) => {
      if (value && value !== fallback) url.searchParams.set(key, value); else url.searchParams.delete(key);
    };
    put(PARAMS.division, view, "all"); put(PARAMS.lang, lang, "all");
    put(PARAMS.status, status, "all"); put(PARAMS.find, find.trim(), "");
    window.history.replaceState(null, "", url);
  }, [loaded, view, lang, status, find]);

  const toggleNotes = (id: string) => setOpenNotes((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    writeOpenNotes(next);
    return next;
  });

  // Each count shows what that choice WOULD show given every other filter, so
  // no number on screen promises films that are not there.
  const needle = find.trim().toLowerCase();
  const matches = useCallback((a: Asset, skip: "division" | "lang" | "status" | null) => {
    if (skip !== "division" && view !== "all" && divisionOf(a.format).key !== view) return false;
    if (skip !== "lang" && lang !== "all" && (lang === "unset" ? a.language != null : a.language !== lang)) return false;
    if (skip !== "status" && !statusMatches(a, status)) return false;
    if (needle && !`${a.title} ${a.wallpaper} ${a.notes ?? ""} ${a.product_url}`.toLowerCase().includes(needle)) return false;
    return true;
  }, [view, lang, status, needle]);

  const visible = useMemo(() => assets.filter((a) => matches(a, null)), [assets, matches]);
  const byDivision = useMemo(() => {
    const groups = new Map<Division, Asset[]>(DIVISIONS.map((d) => [d.key, []]));
    for (const a of visible) groups.get(divisionOf(a.format).key)!.push(a);
    return groups;
  }, [visible]);
  const siblingsOf = useMemo(() => {
    const groups = new Map<string, Asset[]>();
    for (const a of assets) if (a.version_group) groups.set(a.version_group, [...(groups.get(a.version_group) ?? []), a]);
    return (a: Asset) => (a.version_group ? (groups.get(a.version_group) ?? []).filter((s) => s.id !== a.id) : []);
  }, [assets]);
  const candidatesFor = (a: Asset) => assets.filter((c) => c.id !== a.id && (!a.version_group || c.version_group !== a.version_group));
  const count = (skip: "division" | "lang" | "status", test: (a: Asset) => boolean) =>
    assets.filter((a) => matches(a, skip) && test(a)).length;
  const unset = assets.filter((a) => a.language == null).length;
  const filtered = view !== "all" || lang !== "all" || status !== "all" || needle !== "";

  const upload = async (event: FormEvent) => {
    event.preventDefault();
    if (!video || !format || !language) return;
    setBusy(true); setError(null);
    const form = new FormData();
    form.set("title", title); form.set("wallpaper", wallpaper); form.set("format", format);
    form.set("language", language);
    form.set("productUrl", productUrl); form.set("notes", notes);
    form.set("video", video);
    if (cover) form.set("cover", cover);
    let json;
    try {
      // Raw upload route, not a progressive multipart Server Action.
      const response = await fetch(endpoint, { method: "PUT", body: form });
      json = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(json.error ?? `The upload was refused (${response.status}). Your file is still selected; please retry.`);
        return;
      }
    } catch {
      setError("The upload connection was interrupted. Your file is still selected; please retry.");
      return;
    } finally {
      setBusy(false);
    }
    setShowForm(false); setTitle(""); setFormat(""); setLanguage(""); setWallpaper(""); setProductUrl(""); setNotes(""); setVideo(null); setCover(null);
    // The server files the film where it fits, which may not be where it was
    // aimed — open the division it actually landed in, with nothing hiding it.
    const landed = json.asset?.format as Division | undefined;
    setView(landed ?? format); setLang("all"); setStatus("all"); setFind("");
    await load();
  };

  /** Send a change; merge every film the server says it touched. Returns the
   *  server's reason on failure, for the card to show beside the control. */
  const patch = async (body: Record<string, unknown>, failure: string): Promise<string | null> => {
    setBusy(true); setError(null);
    const response = await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await response.json().catch(() => ({}));
    setBusy(false);
    // A refusal can still carry the rows it touched (a held YouTube upload
    // writes its reason on the film), so merge before reporting it.
    const changed = new Map<string, Asset>(((json.assets ?? []) as Asset[]).map((a) => [a.id, a]));
    if (changed.size) setAssets((list) => list.map((a) => (changed.has(a.id) ? { ...a, ...changed.get(a.id) } : a)));
    if (!response.ok) return json.error ?? failure;
    return null;
  };
  const move = (asset: Asset, to: Division) => void patch({ id: asset.id, format: to }, "Could not move the film").then((e) => e && setError(e));
  const setFilmLanguage = (asset: Asset, to: FilmLanguage) => void patch({ id: asset.id, language: to }, "Could not set the language").then((e) => e && setError(e));
  const act: Act = (asset, action, body = {}) => patch({ id: asset.id, action, ...body }, "That did not save");
  // The switch's effect on the page (and site_refusal) comes back on reload;
  // the publisher acts on it within ten minutes.
  const onSite = (asset: Asset, on: boolean) => void patch({ id: asset.id, site_enabled: on }, "Could not change the site switch")
    .then((e) => (e ? setError(e) : load()));

  // After the list re-renders, bring its top up under the pinned header —
  // only when the reader has scrolled past it.
  const toTop = () => requestAnimationFrame(() => {
    const anchor = videosTop.current;
    if (!anchor) return;
    const y = anchor.getBoundingClientRect().top + window.scrollY - headerHeight;
    if (window.scrollY > y) window.scrollTo({ top: y });
  });
  const clear = () => { setView("all"); setLang("all"); setStatus("all"); setFind(""); toTop(); };
  /** Open the division a version lives in, with nothing hiding it, and point at it. */
  const jump = (to: Asset) => {
    setView(divisionOf(to.format).key); setLang("all"); setStatus("all"); setFind("");
    setFlash(to.id);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.getElementById(`film-${to.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }));
    setTimeout(() => setFlash((f) => (f === to.id ? null : f)), 2200);
  };

  const shown = view === "all" ? DIVISIONS : DIVISIONS.filter((d) => d.key === view);

  return <div style={{ paddingTop: 22 }}>
    <h2 style={{ margin: "0 0 4px", fontSize: 22 }}>Asset library</h2>
    <p style={{ margin: "0 0 6px", color: MIST, fontSize: 14 }}>Finished films and artwork, with the wallpaper and shopping URL beside each one.</p>
    <div ref={videosTop} />
    {/* Pinned header: what the section is, how to narrow it, and the one action. */}
    <div style={{ position: "sticky", top: headerHeight, zIndex: 5, background: PAPER, margin: "0 -24px", padding: "14px 24px 12px", borderBottom: `1px solid ${LINE}`, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: "0 0 2px", fontSize: 18 }}>Videos</h3>
          <p style={{ margin: 0, color: MIST, fontSize: 13 }}>
            Choose a category by purpose. For platform videos, shape and length are read from the file itself.
          </p>
        </div>
        {viewer?.canClear && <button type="button" onClick={() => setShowForm((value) => !value)} style={{ padding: "9px 14px", background: INK, color: "white", border: 0, borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>
          {showForm ? "Close" : "Add finished video"}
        </button>}
      </div>
      <input
        type="search"
        value={find}
        onChange={(e) => setFind(e.target.value)}
        placeholder="Search titles, wallpapers, notes…"
        aria-label="Search the library"
        style={{ width: "100%", boxSizing: "border-box", padding: "9px 16px", borderRadius: 999, border: `1px solid ${LINE}`, background: "#fff", font: "inherit", fontSize: 14 }}
      />
      <div style={{ display: "flex", gap: "8px 18px", flexWrap: "wrap", alignItems: "center" }}>
        <Choices<LangView> label="Language" value={lang} onChange={(k) => { setLang(k); toTop(); }} options={[
          { key: "all", label: "All languages", count: count("lang", () => true) },
          ...LANGUAGES.map((l) => ({ key: l.key as LangView, label: l.label, count: count("lang", (a) => a.language === l.key) })),
          ...(unset > 0 || lang === "unset" ? [{ key: "unset" as LangView, label: "Not set", count: count("lang", (a) => a.language == null) }] : []),
        ]} />
        <span aria-hidden style={{ width: 1, height: 22, background: LINE }} />
        <Choices<StatusView> label="Status" value={status} onChange={(k) => { setStatus(k); toTop(); }} options={[
          { key: "all", label: "Any status", count: count("status", () => true) },
          { key: "ready", label: "Ready to post", count: count("status", isReady) },
          { key: "unposted", label: "Not posted", count: count("status", (a) => statusMatches(a, "unposted")) },
          { key: "unverified", label: "Unverified", count: count("status", (a) => statusMatches(a, "unverified")) },
          { key: "posted", label: "Posted", count: count("status", (a) => statusMatches(a, "posted")) },
        ]} />
      </div>
      <Choices<View> label="Division" value={view} onChange={(k) => { setView(k); toTop(); }} options={[
        { key: "all", label: "All", count: count("division", () => true) },
        ...DIVISIONS.map((d) => ({ key: d.key as View, label: d.label, count: count("division", (a) => divisionOf(a.format).key === d.key) })),
      ]} />
    </div>

    {error && <p role="alert" style={{ color: "#b42318" }}>{error}</p>}
    {showForm && viewer?.canClear && <form onSubmit={upload} style={{ display: "grid", gap: 12, maxWidth: 650, margin: "22px 0", padding: 20, border: "1px solid #ddd", borderRadius: 12, background: "#fff" }}>
      <label>Where is it for?
        <select required value={format} onChange={(event) => setFormat(event.target.value as Division)} style={input}>
          <option value="" disabled>Choose a division</option>
          {DIVISIONS.map((d) => <option key={d.key} value={d.key}>{d.label} — {d.purpose}</option>)}
        </select>
      </label>
      <label>What is it spoken in?
        <select required value={language} onChange={(event) => setLanguage(event.target.value as FilmLanguage)} style={input}>
          <option value="" disabled>Choose a language</option>
          {LANGUAGES.map((l) => <option key={l.key} value={l.key}>{l.key === "none" ? "No voice — music and on-screen text only" : l.label}</option>)}
        </select>
      </label>
      <label>Title<input required value={title} onChange={(event) => setTitle(event.target.value)} style={input} /></label>
      <label>Wallpaper or concept<input required value={wallpaper} onChange={(event) => setWallpaper(event.target.value)} style={input} /></label>
      <label>Shop URL<input required type="url" value={productUrl} onChange={(event) => setProductUrl(event.target.value)} placeholder="https://zyvorah.com/concepts/..." style={input} /></label>
      <label>Video (MP4)<input required type="file" accept="video/mp4" onChange={(event) => setVideo(event.target.files?.[0] ?? null)} style={input} /></label>
      <label>Cover image (optional)<input type="file" accept="image/jpeg,image/png" onChange={(event) => setCover(event.target.files?.[0] ?? null)} style={input} /></label>
      <label>Production notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} style={input} /></label>
      <p style={{ margin: 0, color: MIST, fontSize: 13 }}>Saving confirms you have reviewed the final picture and sound and cleared voice and music usage. The film will show green in the Library. A cleared film linked to a specific Zyvorah page can appear there automatically; other publishing remains separate. Its shape and length are read from the file.</p>
      <button disabled={busy || !format || !language} type="submit" style={{ width: "fit-content", padding: "9px 16px", background: INK, color: "white", border: 0, borderRadius: 8, cursor: "pointer" }}>{busy ? "Uploading…" : "Approve & save to library"}</button>
    </form>}

    {!loaded && <p style={{ color: MIST, marginTop: 24 }}>Loading the library…</p>}
    {loaded && shown.map((d) => {
      const films = byDivision.get(d.key)!;
      if (view === "all" && films.length === 0) return null;
      const wide = d.key === "youtube";
      return <section key={d.key} style={{ marginTop: 26 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <h4 style={{ margin: 0, fontSize: 16 }}>{d.label} <span style={{ color: MIST, fontWeight: 500 }}>{films.length}</span></h4>
          <span style={{ fontSize: 12, color: MIST }}>{d.purpose}</span>
        </div>
        {films.length === 0
          ? <p style={{ color: MIST, fontSize: 13 }}>{filtered ? `No ${d.label} match these filters.` : `No ${d.label} filed yet.`}</p>
          : <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${wide ? 340 : 230}px, 1fr))`, gap: 16 }}>
            {films.map((asset) => <FilmCard
              key={asset.id} asset={asset} busy={busy} viewer={viewer} inWideGrid={wide}
              onMove={move} onLanguage={setFilmLanguage} onAct={act} onJump={jump}
              siblings={siblingsOf(asset)} candidates={candidatesFor(asset)} flash={flash === asset.id}
              stats={stats[asset.id]} onSite={onSite}
              notesOpen={openNotes.has(asset.id)} onToggleNotes={toggleNotes}
            />)}
          </div>}
      </section>;
    })}
    {loaded && !error && assets.length === 0 && <p style={{ color: MIST, marginTop: 24 }}>No finished videos have been filed yet.</p>}
    {loaded && assets.length > 0 && visible.length === 0 && view === "all" && <p style={{ color: MIST, marginTop: 24 }}>
      No films match these filters. <button type="button" onClick={clear} style={linkButton}>Clear filters</button>
    </p>}
  </div>;
}

const input = { display: "block", width: "100%", boxSizing: "border-box" as const, padding: 9, marginTop: 5, border: "1px solid #ccc", borderRadius: 7, font: "inherit" };
