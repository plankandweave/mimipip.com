import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { SITE_URL } from "@/lib/seo";
import { clientIp } from "@/lib/measure-link";
import {
  looksLikeUuid, looksLikeWalkToken, walkLinkState, walkUrl, type MintAsk, type WalkLinkState,
} from "@/lib/prospect-walk";
import { hashWalkToken, newWalkRef, newWalkToken, walkDoorOk } from "@/lib/prospect-walk-token";

// The database half of the guest walkthrough link (rules in prospect-walk.ts).
//
// The rule that makes a write surface with no sign-in safe: the link — and so
// the company, and every walk a request may touch — is read from the RESOLVED
// TOKEN, never from the request body. A caller names a walk id only to pick
// among the walks that link already owns.

export type WalkLinkRow = {
  id: string; ref: string; token_hash: string;
  company_name: string; recipient_email: string; recipient_name: string | null;
  brief: string | null; os_conversation_id: number | null; created_by: string;
  expires_at: string; revoked_at: string | null; opened_at: string | null;
  last_seen_at: string | null; submitted_at: string | null; created_at: string;
};

export type ProspectWalkRow = {
  id: string; link_id: string;
  video_path: string | null; video_seconds: number | null; video_error: string | null;
  audio_path: string | null;
  transcript: string | null; transcript_error: string | null; transcribed_at: string | null;
  note: string | null; created_at: string; submitted_at: string | null;
};

export type ProspectMarkRow = {
  id: string; walk_id: string; seq: number; at_seconds: number | string;
  still_path: string | null; still_error: string | null; label: string | null; created_at: string;
};

export type WalkAction = "open" | "write" | "sign" | "commit" | "submit";

/** The OS door. Same header and secret as internalTokenOk (site-batch.ts). */
export const osWalkDoorOk = (req: Request) =>
  walkDoorOk(req.headers.get("x-zyvorah-token"), process.env.ZYVORAH_WEBHOOK_TOKEN);

export type WalkContext = { sb: SupabaseClient; link: WalkLinkRow; state: WalkLinkState; tokenHash: string };

/** Every public route's preamble: shape-check, resolve, refuse a closed link,
 *  check the per-action cap. Unknown, expired and revoked are ONE answer (404)
 *  to a caller; the state rides along so the page can say which. */
export async function guardWalkRequest(
  req: Request,
  rawToken: string,
  action: WalkAction,
  opts: { allowClosed?: boolean } = {},
): Promise<{ ok: true; ctx: WalkContext } | { ok: false; status: number; error: string; state: WalkLinkState | "unknown" }> {
  const token = String(rawToken ?? "").trim();
  if (!looksLikeWalkToken(token)) return { ok: false, status: 404, error: "This link is not active.", state: "unknown" };
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, status: 503, error: "Unavailable", state: "unknown" };

  const tokenHash = hashWalkToken(token);
  const { data } = await sb.from("prospect_walk_links").select("*").eq("token_hash", tokenHash).maybeSingle();
  if (!data) return { ok: false, status: 404, error: "This link is not active.", state: "unknown" };
  const link = data as WalkLinkRow;
  const state = walkLinkState(link);

  if (state === "expired" || state === "revoked") {
    return { ok: false, status: 404, error: "This link is not active.", state };
  }
  if (state === "submitted" && !opts.allowClosed) {
    return { ok: false, status: 409, error: "This walk has already been sent to Zyvorah.", state };
  }

  const { data: allowed, error } = await sb.rpc("prospect_walk_action_allowed", {
    p_token_hash: tokenHash, p_ip: clientIp(req), p_action: action,
  });
  if (error) console.error("[prospect-walk] limiter unavailable:", error.message);
  // Fails closed: the cost of a missed throttle here is storage and Whisper.
  if (error || !(allowed as { allowed?: boolean } | null)?.allowed) {
    return { ok: false, status: 429, error: "That is a lot of requests in a short time — wait a moment and try again.", state };
  }
  return { ok: true, ctx: { sb, link, state, tokenHash } };
}

/** One walk, proven to belong to the link the token resolved to. */
export async function walkOfLink(sb: SupabaseClient, linkId: string, id: unknown): Promise<ProspectWalkRow | null> {
  if (!looksLikeUuid(id)) return null;
  const { data } = await sb.from("prospect_walks").select("*").eq("id", id as string).eq("link_id", linkId).maybeSingle();
  return (data as ProspectWalkRow | null) ?? null;
}

export async function touchWalkLink(sb: SupabaseClient, link: WalkLinkRow, opened: boolean): Promise<void> {
  const now = new Date().toISOString();
  await sb.from("prospect_walk_links").update({ last_seen_at: now }).eq("id", link.id);
  if (opened && !link.opened_at) {
    await sb.from("prospect_walk_links").update({ opened_at: now }).eq("id", link.id).is("opened_at", null);
  }
}

/** Mint one. The plaintext token is returned exactly once and never stored. */
export async function mintWalkLink(sb: SupabaseClient, ask: MintAsk): Promise<
  { ok: true; id: string; ref: string; url: string; expiresAt: string } | { ok: false; error: string }
> {
  const expiresAt = new Date(Date.now() + ask.days * 86_400_000).toISOString();
  for (let attempt = 0; attempt < 5; attempt++) {
    const token = newWalkToken();
    const ref = newWalkRef();
    const { data, error } = await sb.from("prospect_walk_links").insert({
      ref,
      token_hash: hashWalkToken(token),
      company_name: ask.company,
      recipient_email: ask.recipientEmail,
      recipient_name: ask.recipientName,
      brief: ask.brief,
      os_conversation_id: ask.osConversationId,
      created_by: ask.by,
      expires_at: expiresAt,
    }).select("id").single();
    if (!error && data) return { ok: true, id: data.id as string, ref, url: walkUrl(SITE_URL, token), expiresAt };
    if (error && !/duplicate key/i.test(error.message)) {
      console.error("[prospect-walk] mint failed:", error.message);
      return { ok: false, error: "Could not create the link." };
    }
  }
  return { ok: false, error: "Could not create the link." };
}
