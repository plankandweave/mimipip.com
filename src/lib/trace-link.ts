import "server-only";
import { randomBytes, randomInt } from "node:crypto";
import type { SupabaseClient } from "@/brand/database-types";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sha256, type CorporateAccount } from "@/lib/corporate-auth";
import { SITE_URL } from "@/lib/seo";
import {
  DEFAULT_LINK_DAYS, looksLikeTraceToken, MAX_LINK_DAYS, type TraceLinkState,
} from "@/lib/trace";

// ─── Trace links ────────────────────────────────────────────────────────────
//
// The person who walks a campus has no login and never will: a facilities
// officer, an estate manager, the Chancellor's assistant. The link IS the
// credential, exactly as a measurement link is (lib/measure-link.ts), and the
// same rule makes an unauthenticated write surface safe:
//
//   THE ACCOUNT AND THE BLUEPRINT ARE READ FROM THE RESOLVED LINK, NEVER FROM
//   THE REQUEST BODY. A caller cannot name a target.
//
// What holding a token permits, exhaustively: open the walk page, start a walk
// on its own Blueprint, record pieces and taps into that walk, ask for those
// pieces to be transcribed. Nothing here reaches the Vault, the designs, the
// proposals, the member list or any other Blueprint.

/** No look-alike characters: a ref gets read aloud over the phone. */
const REF_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export type TraceLinkRow = {
  id: string; blueprint_id: string; account_id: string; ref: string;
  recipient_name: string | null; recipient_email: string | null; brief: string | null;
  created_by_email: string; expires_at: string;
  revoked_at: string | null; revoked_by_email: string | null;
  opened_at: string | null; last_seen_at: string | null; created_at: string;
};

export type BlueprintRow = {
  id: string; account_id: string; name: string; city: string | null; state: string | null;
  language: string; status: string; brief: string | null;
  created_by_email: string | null; created_at: string; updated_at: string;
};

export type TraceWalkRow = {
  id: string; link_id: string | null; blueprint_id: string; account_id: string;
  walker_name: string | null; walker_phone: string | null; where_label: string | null;
  status: "recording" | "ended"; seconds: number;
  started_at: string; ended_at: string | null; note: string | null; created_at: string;
};

export type TraceSegmentRow = {
  id: string; walk_id: string; seq: number;
  video_path: string | null; video_bytes: number | null; video_error: string | null;
  audio_path: string | null; audio_bytes: number | null; seconds: number | null;
  transcript: string | null; transcript_json: unknown; transcript_error: string | null;
  transcribed_at: string | null; created_at: string;
};

export type TraceMarkRow = {
  id: string; walk_id: string; seq: number; segment_seq: number;
  at_seconds: number; walk_seconds: number;
  still_path: string | null; still_error: string | null; label: string | null; created_at: string;
};

/** 43 URL-safe chars over 256 bits — travels through email and WhatsApp intact. */
const newToken = () => randomBytes(32).toString("base64url");
const newRef = (prefix: string) =>
  `${prefix}-T-${Array.from({ length: 6 }, () => REF_ALPHABET[randomInt(0, REF_ALPHABET.length)]).join("")}`;

export const hashTraceToken = (token: string) => sha256(token);
export const traceUrl = (token: string) => `${SITE_URL}/trace/${token}`;

/** Every file a walk owns, addressed by ids the server already checked. */
export const tracePath = {
  video: (slug: string, walkId: string, seq: number, ext: string) =>
    `trace/${slug}/${walkId}/piece-${String(seq).padStart(2, "0")}.${ext}`,
  audio: (slug: string, walkId: string, seq: number, ext: string) =>
    `trace/${slug}/${walkId}/piece-${String(seq).padStart(2, "0")}-narration.${ext}`,
  still: (slug: string, walkId: string, seq: number) =>
    `trace/${slug}/${walkId}/wall-${String(seq).padStart(3, "0")}.jpg`,
};

export type ResolvedTraceLink = {
  state: TraceLinkState;
  link?: TraceLinkRow;
  blueprint?: BlueprintRow;
  account?: Pick<CorporateAccount, "id" | "slug" | "name" | "email_domain">;
};

export async function resolveTraceLink(rawToken: string): Promise<ResolvedTraceLink> {
  const token = (rawToken ?? "").trim();
  if (!looksLikeTraceToken(token)) return { state: "unknown" };
  const sb = supabaseAdmin();
  if (!sb) return { state: "unknown" };

  const { data: link } = await sb.from("trace_links")
    .select("*").eq("token_hash", hashTraceToken(token)).maybeSingle();
  if (!link) return { state: "unknown" };
  const row = link as TraceLinkRow;
  if (row.revoked_at) return { state: "revoked", link: row };
  if (new Date(row.expires_at).getTime() <= Date.now()) return { state: "expired", link: row };

  const { data: blueprint } = await sb.from("campus_blueprints")
    .select("*").eq("id", row.blueprint_id).maybeSingle();
  if (!blueprint || blueprint.account_id !== row.account_id) return { state: "unknown", link: row };

  const { data: account } = await sb.from("corporate_accounts")
    .select("id, slug, name, email_domain, active").eq("id", row.account_id).maybeSingle();
  if (!account || !(account as { active: boolean }).active) return { state: "unknown", link: row };

  return {
    state: "ok", link: row, blueprint: blueprint as BlueprintRow,
    account: account as Pick<CorporateAccount, "id" | "slug" | "name" | "email_domain">,
  };
}

/** Mint one. The plaintext token is returned EXACTLY once and never stored;
 *  "send again" mints afresh and revokes the old one. */
export async function mintTraceLink(input: {
  accountId: string; blueprintId: string; refPrefix: string;
  recipientName?: string | null; recipientEmail?: string | null; brief?: string | null;
  days?: number; byEmail: string;
}): Promise<{ id: string; ref: string; token: string; url: string; expiresAt: string } | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;
  const days = Math.min(MAX_LINK_DAYS, Math.max(1, Math.round(input.days ?? DEFAULT_LINK_DAYS)));
  const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
  for (let attempt = 0; attempt < 5; attempt++) {
    const token = newToken();
    const ref = newRef(input.refPrefix || "ZYV");
    const { data, error } = await sb.from("trace_links").insert({
      account_id: input.accountId,
      blueprint_id: input.blueprintId,
      ref,
      token_hash: hashTraceToken(token),
      recipient_name: input.recipientName?.trim()?.slice(0, 120) || null,
      recipient_email: input.recipientEmail?.trim()?.toLowerCase()?.slice(0, 200) || null,
      brief: input.brief?.trim()?.slice(0, 2000) || null,
      created_by_email: input.byEmail,
      expires_at: expiresAt,
    }).select("id").single();
    if (!error && data) return { id: data.id as string, ref, token, url: traceUrl(token), expiresAt };
    if (error && !/duplicate key/i.test(error.message)) {
      console.error("[trace-link] mint failed:", error.message);
      return null;
    }
  }
  return null;
}

export async function revokeTraceLink(id: string, accountId: string, byEmail: string): Promise<boolean> {
  const sb = supabaseAdmin();
  if (!sb) return false;
  const { data } = await sb.from("trace_links")
    .update({ revoked_at: new Date().toISOString(), revoked_by_email: byEmail })
    .eq("id", id).eq("account_id", accountId).is("revoked_at", null)
    .select("id").maybeSingle();
  return Boolean(data);
}

export async function touchTraceLink(id: string, opened = false): Promise<void> {
  const sb = supabaseAdmin();
  if (!sb) return;
  await sb.from("trace_links").update({ last_seen_at: new Date().toISOString() }).eq("id", id);
  if (opened) {
    await sb.from("trace_links").update({ opened_at: new Date().toISOString() })
      .eq("id", id).is("opened_at", null);
  }
}

export type TraceAction = "open" | "write" | "sign" | "commit" | "transcribe";

/** Per-action caps live in Postgres (a worker has no shared memory). Fails
 *  closed: a limiter that cannot answer refuses. */
async function traceActionAllowed(tokenHash: string, ip: string | null, action: TraceAction): Promise<boolean> {
  const sb = supabaseAdmin();
  if (!sb) return false;
  const { data, error } = await sb.rpc("trace_link_action_allowed", {
    p_token_hash: tokenHash, p_ip: ip, p_action: action,
  });
  if (error) { console.error("[trace-link] limiter unavailable:", error.message); return false; }
  return Boolean((data as { allowed?: boolean } | null)?.allowed);
}

export function clientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim() || null;
  return req.headers.get("x-real-ip");
}

export type TraceContext = {
  link: TraceLinkRow;
  blueprint: BlueprintRow;
  account: Pick<CorporateAccount, "id" | "slug" | "name" | "email_domain">;
  sb: SupabaseClient;
  tokenHash: string;
};

/** The preamble every public route needs: shape-check, resolve, refuse a
 *  closed link, check the per-action cap, hand back a service client. */
export async function guardTraceRequest(
  req: Request, rawToken: string, action: TraceAction, opts: { allowClosed?: boolean } = {},
): Promise<
  | { ok: true; ctx: TraceContext }
  | { ok: false; status: number; error: string; state: TraceLinkState }
> {
  const token = (rawToken ?? "").trim();
  const r = await resolveTraceLink(token);
  if (!r.link || !r.blueprint || !r.account) {
    if (opts.allowClosed && r.link && (r.state === "expired" || r.state === "revoked")) {
      return { ok: false, status: 403, error: "closed", state: r.state };
    }
    return { ok: false, status: 404, error: "This link is not active.", state: r.state };
  }
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, status: 503, error: "Unavailable", state: r.state };
  const tokenHash = hashTraceToken(token);
  if (!(await traceActionAllowed(tokenHash, clientIp(req), action))) {
    return { ok: false, status: 429, state: r.state, error: "That is a lot of requests in a short time — wait a moment and try again." };
  }
  return { ok: true, ctx: { link: r.link, blueprint: r.blueprint, account: r.account, sb, tokenHash } };
}

/** One walk, proven to belong to the link's Blueprint. A caller supplies an id
 *  and the id is looked up scoped to what the link may already see. */
export async function walkOnLink(sb: SupabaseClient, ctx: TraceContext, walkId: string): Promise<TraceWalkRow | null> {
  const { data } = await sb.from("trace_walks")
    .select("*").eq("id", walkId).eq("blueprint_id", ctx.blueprint.id).eq("account_id", ctx.account.id).eq("link_id", ctx.link.id)
    .maybeSingle();
  return (data as TraceWalkRow | null) ?? null;
}
