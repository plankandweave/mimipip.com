// ─── Guest walkthrough links for prospects ──────────────────────────────────
//
// A prospect (a company Roheena has spoken to, with NO partner account and
// never one: no sign-in, no prices, no agreements) is sent one link —
// /walk/<token> — to walk their own space with a phone, talking as they go
// and tapping each wall. The OS mints the link through /api/os/walk-links,
// puts it in Roheena's reply for her one-tap approval, and later reads the
// finished walk back through the same door for the Zyvorah design agent.
//
// Everything decidable without a database lives here, pure, so it is tested
// (prospect-walk.test.ts): the token and ref shapes, the life of a link, the
// state a link is in, where its files live and what a mint request must
// carry. No node imports, so the public page can share the copy and limits;
// the token, the hash and the OS door's secret check are in
// prospect-walk-token.ts, and the database half in prospect-walk-server.ts.

export const DEFAULT_LINK_DAYS = 30;
export const MAX_LINK_DAYS = 60;

/** The same ceilings as the partner walkthrough (src/lib/walkthrough.ts): a
 *  space is covered by several three-minute walks, not one long one. */
export const MAX_VIDEO_SECONDS = 180;
export const MAX_VIDEO_BYTES = 96 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 12 * 1024 * 1024;
export const MAX_STILL_BYTES = 6 * 1024 * 1024;
export const MAX_MARKS = 40;
/** Several walks per link, but not unbounded: a link is one company's space. */
export const MAX_WALKS = 12;
/** The signing window for an upload — long, because a three-minute video is
 *  going up on whatever signal a basement corridor has. */
export const UPLOAD_TTL_S = 1800;
/** How long the OS's signed links to a finished walk stay valid. */
export const OS_URL_TTL_S = 86_400;

/** No look-alike characters: a ref gets read aloud and retyped. The same
 *  alphabet as the measurement links. */
export const REF_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Shape-check before touching the database, so a hostile path segment never
 *  becomes a query. */
export const looksLikeWalkToken = (raw: string) => /^[A-Za-z0-9_-]{40,64}$/.test(String(raw ?? ""));

export const looksLikeUuid = (raw: unknown) =>
  typeof raw === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw);

export const walkUrl = (siteUrl: string, token: string) => `${siteUrl}/walk/${token}`;

/** A whole number of days between 1 and 60; 30 when not given. */
export function clampDays(days: unknown): number {
  const n = Number(days);
  if (days === undefined || days === null || days === "" || !Number.isFinite(n)) return DEFAULT_LINK_DAYS;
  return Math.min(MAX_LINK_DAYS, Math.max(1, Math.round(n)));
}

export type WalkLinkState = "open" | "expired" | "revoked" | "submitted";

type LinkTimes = { revoked_at: string | null; expires_at: string; submitted_at: string | null };

/** Revoked beats everything (someone has just killed it and wants it dead),
 *  then sent (a finished walk stays finished after the link's date passes),
 *  then expired. */
export function walkLinkState(link: LinkTimes, now = Date.now()): WalkLinkState {
  if (link.revoked_at) return "revoked";
  if (link.submitted_at) return "submitted";
  if (new Date(link.expires_at).getTime() <= now) return "expired";
  return "open";
}

/** What the walker is told when the link cannot be used. The page shows the
 *  distinction (whoever reads it already holds the token); the API answers
 *  unknown, expired and revoked with one status so a scanner learns nothing. */
export function closedWalkMessage(state: WalkLinkState | "unknown"): string | null {
  switch (state) {
    case "open": return null;
    case "submitted": return "Your walk has reached Zyvorah. Thank you — we will be in touch with ideas for your walls.";
    case "expired": return "This link has expired. Reply to our email and we will send you a fresh one.";
    case "revoked": return "This link is no longer active. Reply to our email and we will send you a fresh one.";
    default: return "This link is not active.";
  }
}

/** Every file a walk owns, addressed by ids only — never by anything a caller
 *  sends. The ref is ours (minted, shape-checked by the database); the walk id
 *  is a uuid we created. */
const ext3 = (e: string) => {
  if (!/^[a-z0-9]{2,4}$/.test(e)) throw new Error("bad extension");
  return e;
};
const refOk = (ref: string) => {
  if (!/^ZYV-W-[A-Z0-9]{6}$/.test(ref)) throw new Error("bad ref");
  return ref;
};
const idOk = (id: string) => {
  if (!looksLikeUuid(id)) throw new Error("bad id");
  return id;
};
export const prospectWalkPath = {
  video: (ref: string, walkId: string, ext: string) =>
    `prospect-walks/${refOk(ref)}/${idOk(walkId)}/walk.${ext3(ext)}`,
  audio: (ref: string, walkId: string, ext: string) =>
    `prospect-walks/${refOk(ref)}/${idOk(walkId)}/narration.${ext3(ext)}`,
  still: (ref: string, walkId: string, seq: number) => {
    if (!Number.isInteger(seq) || seq < 1 || seq > 99) throw new Error("bad seq");
    return `prospect-walks/${refOk(ref)}/${idOk(walkId)}/mark-${String(seq).padStart(2, "0")}.jpg`;
  },
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type MintAsk = {
  company: string;
  recipientEmail: string;
  recipientName: string | null;
  brief: string | null;
  osConversationId: number | null;
  days: number;
  by: string;
};

/** Read the OS's mint body. Everything is trimmed and capped; a request
 *  without a company and a valid recipient email is refused. */
export function readMintAsk(body: unknown): { ok: true; ask: MintAsk } | { ok: false; error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const text = (v: unknown, max: number) => {
    const s = typeof v === "string" ? v.trim() : "";
    return s ? s.slice(0, max) : null;
  };
  const company = text(b.company, 200);
  if (!company) return { ok: false, error: "company is required" };
  const email = text(b.recipientEmail, 254)?.toLowerCase() ?? null;
  if (!email || !EMAIL_RE.test(email)) return { ok: false, error: "recipientEmail must be an email address" };
  const conv = Number(b.osConversationId);
  const osConversationId = b.osConversationId == null || b.osConversationId === ""
    ? null
    : Number.isInteger(conv) && conv > 0 && conv <= 2_147_483_647 ? conv : NaN;
  if (Number.isNaN(osConversationId)) return { ok: false, error: "osConversationId must be a positive integer" };
  return {
    ok: true,
    ask: {
      company,
      recipientEmail: email,
      recipientName: text(b.recipientName, 160),
      brief: text(b.brief, 2000),
      osConversationId,
      days: clampDays(b.days),
      by: text(b.by, 160) ?? "OS",
    },
  };
}

/** `submittedSince` for the OS's poll: an ISO time, or nothing. */
export function readSince(raw: string | null): string | null {
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** The containers a phone's MediaRecorder produces, and the extension each is
 *  stored under. An allow-list: the content type decides a path segment. */
const VIDEO_EXT: Record<string, string> = { "video/webm": "webm", "video/mp4": "mp4", "video/quicktime": "mov" };
const AUDIO_EXT: Record<string, string> = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/mpeg": "mp3" };
const base = (t: string) => String(t ?? "").split(";")[0].trim().toLowerCase();
export const walkVideoExt = (t: string) => VIDEO_EXT[base(t)] ?? null;
export const walkAudioExt = (t: string) => AUDIO_EXT[base(t)] ?? null;

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
