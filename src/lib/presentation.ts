import "server-only";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { supabaseAdmin } from "./supabase-admin";
import { privateBucket } from "./r2-media";
import {
  presUpload, presDownload, presExists, presHead, presSignedUrl, presSignedUploadUrl,
} from "./presentation-store";
import { rewriteLegacySignedUrls } from "./presentation-sign";

// Access control for a corporate presentation. Everything the "Outcreate" page
// only pretended to do lives here: a real gate, a real record of who opened it,
// and a revoke that actually revokes.
//
// The URL token is a capability, emailed to one address. `require_code`
// escalates to a one-time code sent to the INVITED address, which forwarding
// the link cannot defeat. See the header of 0117_crm_presentations.sql.

export const PRES_COOKIE = "zyv_pres";
const SESSION_TTL_DAYS = 30;
const CODE_TTL_MIN = 15;
const MAX_CODE_ATTEMPTS = 5;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** 32 random bytes, hex. Used for both the URL token and the session token. */
export function mintToken(): string {
  return randomBytes(32).toString("hex");
}

export type Recipient = {
  id: string;
  presentation_id: string;
  email: string;
  name: string | null;
  revoked_at: string | null;
};

export type Presentation = {
  id: string;
  company_id: string;
  deal_id: string | null;
  title: string;
  format: "html" | "pdf" | "video";
  storage_path: string;
  lead_video_id?: string | null;
  require_code: boolean;
  status: string;
};

export type Invite = { recipient: Recipient; presentation: Presentation };

/** Resolve a URL token to its recipient + presentation, or null.
 *
 *  Returns null for a revoked recipient and for an archived presentation, so
 *  both are a dead link rather than a 403 that confirms the deck exists. */
export async function inviteForToken(token: string): Promise<Invite | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const sb = supabaseAdmin();
  if (!sb) return null;

  const { data } = await sb
    .from("crm_presentation_recipients")
    .select("id, presentation_id, email, name, revoked_at, crm_presentations(*)")
    .eq("token", token)
    .maybeSingle();
  if (!data || data.revoked_at) return null;

  // The embedded row comes back as an object for a to-one relation, but the
  // generated types widen it to an array — normalise before use.
  const p = (Array.isArray(data.crm_presentations)
    ? data.crm_presentations[0]
    : data.crm_presentations) as Presentation | undefined;
  if (!p || p.status === "archived") return null;

  return {
    recipient: {
      id: data.id,
      presentation_id: data.presentation_id,
      email: data.email,
      name: data.name,
      revoked_at: data.revoked_at,
    },
    presentation: p,
  };
}

/** True when this browser already holds a live session for this recipient. */
export async function hasSession(recipientId: string): Promise<boolean> {
  const raw = (await cookies()).get(PRES_COOKIE)?.value;
  if (!raw) return false;
  const sb = supabaseAdmin();
  if (!sb) return false;

  const { data } = await sb
    .from("crm_presentation_sessions")
    .select("recipient_id, expires_at")
    .eq("token_hash", sha256(raw))
    .maybeSingle();
  if (!data) return false;
  if (new Date(data.expires_at) < new Date()) return false;
  return data.recipient_id === recipientId;
}

export async function startSession(recipientId: string): Promise<void> {
  const sb = supabaseAdmin();
  if (!sb) return;
  const token = mintToken();
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
  await sb.from("crm_presentation_sessions").insert({
    recipient_id: recipientId,
    token_hash: sha256(token),
    expires_at: expires.toISOString(),
  });
  (await cookies()).set(PRES_COOKIE, token, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", expires,
  });
}

/** Record an open. Bumps the recipient's counters and appends a view row. */
export async function recordOpen(recipientId: string, userAgent: string | null): Promise<void> {
  const sb = supabaseAdmin();
  if (!sb) return;
  await sb.from("crm_presentation_views").insert({
    recipient_id: recipientId,
    user_agent: userAgent?.slice(0, 400) ?? null,
  });
  // Two statements rather than one RPC: the view row is the record that
  // matters, and the denormalised counters on the recipient are a convenience
  // for the admin list. If the second fails the audit trail is still intact.
  const { data: agg } = await sb
    .from("crm_presentation_views")
    .select("opened_at")
    .eq("recipient_id", recipientId)
    .order("opened_at", { ascending: true });
  if (!agg?.length) return;
  await sb
    .from("crm_presentation_recipients")
    .update({
      first_opened_at: agg[0].opened_at,
      last_opened_at: agg[agg.length - 1].opened_at,
      open_count: agg.length,
    })
    .eq("id", recipientId);
}

/* -------------------------------------------------------------------------- */
/* One-time codes — only used when presentation.require_code is on.            */
/* -------------------------------------------------------------------------- */

/** Issue a 6-digit code for this recipient and return it for emailing. */
export async function issueCode(recipientId: string): Promise<string | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;
  const code = String(randomInt(100_000, 1_000_000));
  const { error } = await sb.from("crm_presentation_codes").insert({
    recipient_id: recipientId,
    code_hash: sha256(code),
    expires_at: new Date(Date.now() + CODE_TTL_MIN * 60_000).toISOString(),
  });
  return error ? null : code;
}

/** Verify a code and, on success, start a session. */
export async function verifyCode(recipientId: string, code: string): Promise<boolean> {
  const sb = supabaseAdmin();
  if (!sb) return false;
  const { data: row } = await sb
    .from("crm_presentation_codes")
    .select("id, code_hash, expires_at, consumed_at, attempts")
    .eq("recipient_id", recipientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!row || row.consumed_at) return false;
  if (new Date(row.expires_at) < new Date()) return false;
  if (row.attempts >= MAX_CODE_ATTEMPTS) return false;

  if (!safeEqual(sha256(code.trim()), row.code_hash)) {
    await sb.from("crm_presentation_codes")
      .update({ attempts: row.attempts + 1 }).eq("id", row.id);
    return false;
  }
  await sb.from("crm_presentation_codes")
    .update({ consumed_at: new Date().toISOString() }).eq("id", row.id);
  await startSession(recipientId);
  return true;
}

/* -------------------------------------------------------------------------- */
/* Storage                                                                    */
/* -------------------------------------------------------------------------- */

export async function uploadDeck(
  path: string, body: ArrayBuffer, contentType: string,
): Promise<boolean> {
  const { error } = await presUpload(path, body, { contentType, upsert: true });
  if (error) console.error("[presentation] upload failed:", error.message);
  return !error;
}

/* -------------------------------------------------------------------------- */
/* Video                                                                      */
/* -------------------------------------------------------------------------- */
//
// A film lives in R2 with everything else in this store. It is uploaded by
// the browser to /api/media-upload against a one-path token (the Worker
// streams the body into the bucket), and played from /api/files/presentations
// against a signed URL — that route answers the Range requests that make a
// video seekable, from the binding, so playback costs no storage egress.

// The pure half lives in presentation-format.ts so it can be unit-tested —
// see the header there for the bug that makes it worth testing.
export {
  VIDEO_TYPES, MAX_VIDEO_BYTES, extOf, readFormat, contentTypeFor,
} from "./presentation-format";

/** A one-shot URL the BROWSER uploads to. It can only write the one fresh
 *  path minted for it, never overwrite an existing object. */
export async function signedUploadUrl(
  path: string,
): Promise<{ path: string; signedUrl: string } | null> {
  try {
    return presSignedUploadUrl(path);
  } catch (e) {
    console.error("[presentation] signed upload url failed:", (e as Error)?.message);
    return null;
  }
}

/** A short-lived read URL for playback.
 *
 *  Minted per open, AFTER the same invite/revoke/session checks the page runs,
 *  and good for two hours. It is a bearer URL, so that window is the one gap a
 *  revoke cannot close — two hours rather than a day is the whole reason the
 *  TTL is short. Long enough to watch a film, short enough not to be a link
 *  worth forwarding.
 *
 *  A film uploaded before the move to R2 is copied across HERE, before the
 *  URL exists: a player opens several Range requests at once, and each one
 *  finding the object missing would start its own copy of the whole file. */
export async function signedPlaybackUrl(path: string): Promise<string | null> {
  try {
    if ((await privateBucket()) && !(await presHead(path))) return null;
  } catch (e) {
    console.error("[presentation] playback read failed:", (e as Error)?.message);
    return null;
  }
  return await presSignedUrl(path, 2 * 60 * 60);
}

/** True when this object already exists in the store.
 *
 *  The browser uploads on its own, so the row must not be created on its
 *  say-so: a caller that skipped the upload, or whose upload failed halfway,
 *  would otherwise leave a presentation pointing at nothing and a recipient
 *  looking at a dead player. */
export async function objectExists(path: string): Promise<boolean> {
  try {
    return await presExists(path);
  } catch {
    return false;
  }
}

/** A stored deck's bytes. An HTML deck composed before the move still embeds
 *  Supabase signed URLs for its pictures; they are re-pointed at R2 as the
 *  deck is read, so opening an old proposal costs no storage egress either. */
export async function deckBytes(path: string): Promise<ArrayBuffer | null> {
  const { data, error } = await presDownload(path);
  if (error || !data) return null;
  if (!/\.html?$/i.test(path)) return data.arrayBuffer();
  const html = await data.text();
  const out = rewriteLegacySignedUrls(html);
  return new TextEncoder().encode(out).buffer as ArrayBuffer;
}

/** Read a lead film only through the already-authorized deck and its company. */
export async function leadVideoPath(presentation: Presentation): Promise<string | null> {
  if (!presentation.lead_video_id || presentation.format !== "html") return null;
  const sb = supabaseAdmin();
  if (!sb) return null;
  const { data } = await sb.from("crm_presentations").select("storage_path")
    .eq("id", presentation.lead_video_id).eq("company_id", presentation.company_id)
    .eq("format", "video").neq("status", "archived").maybeSingle();
  return data?.storage_path ?? null;
}
