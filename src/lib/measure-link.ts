import { istDateKey } from "@/lib/ist";
import "server-only";
import { partnerCapabilities } from "./partner-capabilities";
import { legacyPartnerWorkflowAllowed } from "./partner-legacy-policy";
import { randomBytes, randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sha256, type CorporateAccount } from "@/lib/corporate-auth";
import { SITE_URL } from "@/lib/seo";

// ─── Measurement links ──────────────────────────────────────────────────────
//
// A partner's HQ admin mints a link for ONE store and emails it to whoever is
// going to walk that store with a phone. That person has no login and never
// will — they may not even be on the partner's email domain — so the link IS
// the credential.
//
// The rule that makes an unauthenticated write surface safe: the account and
// the store are read from the RESOLVED LINK, never from the request body. A
// caller cannot name a target. Everything a route needs comes back from
// resolveMeasureLink() or it does not happen.
//
// What holding a token permits, exhaustively: read its own store's shell, write
// walls to its own draft batch, upload photos into its own slots, submit once.
// There is no path from here to approve, feedback, allocate, compose, propose,
// orders, the design library, or the member list.

/** 14 days. A store walk-through is not one sitting — someone starts on the
 *  ground floor, gets pulled away, and finishes tomorrow. */
export const DEFAULT_LINK_DAYS = 14;
export const MAX_LINK_DAYS = 30;
export const MAX_WALLS = 40;

/** No look-alike characters: a ref gets read aloud and retyped. */
const REF_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export type MeasureLinkRow = {
  id: string; account_id: string; store_id: string; ref: string;
  recipient_email: string; recipient_name: string | null;
  brief: string | null; series_names: string[];
  created_by_email: string;
  expires_at: string; revoked_at: string | null; revoked_by_email: string | null;
  opened_at: string | null; last_seen_at: string | null; submitted_at: string | null;
  batch_id: string | null; photo_uploads: number; last_write_at: string | null;
  created_at: string;
};

export type StoreRow = {
  id: string; account_id: string; code: string; name: string;
  state: string; city: string | null; address_line: string | null;
  pincode: string | null; contact_name: string | null; contact_phone: string | null;
  gps: string | null; floors: number | null; series_names: string[];
  notes: string | null; active: boolean;
};

/** Why a link is not usable. Distinguished deliberately: "this link expired on
 *  2 September — ask your head office for a new one" is a genuinely better
 *  screen than a 404, and it leaks nothing, because whoever is reading it
 *  already holds the token. The API layer still answers unknown/expired/revoked
 *  with one indistinguishable status so a scanner learns nothing. */
export type LinkState = "ok" | "expired" | "revoked" | "submitted" | "unknown";

export type ResolvedLink = {
  state: LinkState;
  link?: MeasureLinkRow;
  store?: StoreRow;
  account?: Pick<CorporateAccount, "id" | "slug" | "name">;
};

/** 43 URL-safe chars over 256 bits of entropy — the same strength as the portal
 *  session token, base64url rather than hex because this string travels through
 *  email and WhatsApp, where 43 characters survive line-wrapping and 64 do not. */
const newToken = () => randomBytes(32).toString("base64url");

const newRef = (prefix: string) =>
  `${prefix}-M-${Array.from({ length: 6 }, () => REF_ALPHABET[randomInt(0, REF_ALPHABET.length)]).join("")}`;

export const hashToken = (token: string) => sha256(token);

/** Shape-check before touching the database, so a malformed or hostile path
 *  segment never becomes a query. Copied from the /w/:token precedent. */
export const looksLikeToken = (raw: string) => /^[A-Za-z0-9_-]{40,64}$/.test(raw);

export const measureUrl = (token: string) => `${SITE_URL}/measure/${token}`;

/** The public entry point: one token in, everything a route may act on out.
 *
 *  Ordered so the cheapest and least revealing checks come first. */
export async function resolveMeasureLink(rawToken: string): Promise<ResolvedLink> {
  const token = (rawToken ?? "").trim();
  if (!looksLikeToken(token)) return { state: "unknown" };
  const sb = supabaseAdmin();
  if (!sb) return { state: "unknown" };

  const { data: link } = await sb.from("corporate_measure_links")
    .select("*").eq("token_hash", hashToken(token)).maybeSingle();
  if (!link) return { state: "unknown" };
  const row = link as MeasureLinkRow;

  // Revocation before expiry: an admin who has just revoked a link wants it
  // dead now, and should be told that rather than "expired".
  if (row.revoked_at) return { state: "revoked", link: row };
  if (new Date(row.expires_at).getTime() <= Date.now()) return { state: "expired", link: row };

  const { data: store } = await sb.from("corporate_stores")
    .select("*").eq("id", row.store_id).maybeSingle();
  if (!store || !(store as StoreRow).active) return { state: "unknown", link: row };

  const { data: account } = await sb.from("corporate_accounts")
    .select("*").eq("id", row.account_id).maybeSingle();
  if (!account || !(account as { active: boolean }).active) return { state: "unknown", link: row };
  // Previously issued bearer links must not reopen a legacy, staff-visible
  // survey after the account switches to the private purchasing workflow.
  if (partnerCapabilities(account).poRequiredRelease) return { state: "unknown" };

  // Submitted last, because a submitted link must still be able to render its
  // "already sent, nothing more to do" screen with the store's name on it.
  const state: LinkState = row.submitted_at ? "submitted" : "ok";
  return {
    state,
    link: row,
    store: store as StoreRow,
    account: account as Pick<CorporateAccount, "id" | "slug" | "name">,
  };
}

/** Mint one. Returns the plaintext token EXACTLY once — it is never stored, so
 *  it cannot be shown again later. That is deliberate: "resend" mints a fresh
 *  token and revokes the old one, which is the behaviour you want the moment
 *  someone says "I think I forwarded that to the wrong person". */
export async function mintMeasureLink(input: {
  accountId: string;
  storeId: string;
  refPrefix: string;
  recipientEmail: string;
  recipientName?: string | null;
  brief?: string | null;
  seriesNames?: string[];
  days?: number;
  byEmail: string;
}): Promise<{ ref: string; token: string; url: string; id: string } | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;

  const days = Math.min(MAX_LINK_DAYS, Math.max(1, Math.round(input.days ?? DEFAULT_LINK_DAYS)));
  const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();

  // Retry on the astronomically unlikely ref collision rather than 500.
  for (let attempt = 0; attempt < 5; attempt++) {
    const token = newToken();
    const ref = newRef(input.refPrefix || "ZYV");
    const { data, error } = await sb.from("corporate_measure_links").insert({
      account_id: input.accountId,
      store_id: input.storeId,
      ref,
      token_hash: hashToken(token),
      recipient_email: input.recipientEmail.trim().toLowerCase(),
      recipient_name: input.recipientName?.trim() || null,
      brief: input.brief?.trim()?.slice(0, 2000) || null,
      series_names: (input.seriesNames ?? []).map(String).slice(0, 8),
      created_by_email: input.byEmail,
      expires_at: expiresAt,
    }).select("id").single();
    if (!error && data) {
      return { ref, token, url: measureUrl(token), id: data.id as string };
    }
    if (error && !/duplicate key/i.test(error.message)) {
      console.error("[measure-link] mint failed:", error.message);
      return null;
    }
  }
  return null;
}

export async function revokeMeasureLink(id: string, byEmail: string): Promise<boolean> {
  const sb = supabaseAdmin();
  if (!sb) return false;
  // Conditional: a link that is already revoked stays as it was, so the audit
  // trail keeps the first revoker rather than the most recent clicker.
  const { data } = await sb.from("corporate_measure_links")
    .update({ revoked_at: new Date().toISOString(), revoked_by_email: byEmail })
    .eq("id", id).is("revoked_at", null)
    .select("id").maybeSingle();
  return Boolean(data);
}

/** Record that a human is on the other end, so an admin can see whether the
 *  link was ever opened without having to ring the store and ask. */
export async function touchLink(
  id: string,
  opts: { opened?: boolean; wrote?: boolean } = {},
): Promise<void> {
  const sb = supabaseAdmin();
  if (!sb) return;
  const patch: Record<string, unknown> = { last_seen_at: new Date().toISOString() };
  if (opts.wrote) patch.last_write_at = new Date().toISOString();
  await sb.from("corporate_measure_links").update(patch).eq("id", id);
  if (opts.opened) {
    // First open only — the interesting fact is when it was first picked up.
    await sb.from("corporate_measure_links")
      .update({ opened_at: new Date().toISOString() })
      .eq("id", id).is("opened_at", null);
  }
}

/** Per-action resource caps, in Postgres because a Vercel function has no shared
 *  memory between invocations (the one in-process limiter in this codebase is
 *  process-local and therefore decorative across replicas).
 *
 *  FAILS CLOSED. The OTP limiter this copies fails open, reasoning that being
 *  able to log in beats a missed throttle; here the downside is money spent and
 *  storage filled, not a customer locked out, so the default flips. */
export async function linkActionAllowed(
  tokenHash: string,
  ip: string | null,
  action: "open" | "save" | "sign" | "commit" | "submit",
): Promise<boolean> {
  const sb = supabaseAdmin();
  if (!sb) return false;
  const { data, error } = await sb.rpc("measure_link_action_allowed", {
    p_token_hash: tokenHash, p_ip: ip, p_action: action,
  });
  if (error) {
    console.error("[measure-link] limiter unavailable:", error.message);
    return false;
  }
  return Boolean((data as { allowed?: boolean } | null)?.allowed);
}

/** Best-effort client IP. `trust proxy` equivalents aren't available here, so
 *  take the left-most hop of x-forwarded-for, which on Vercel is the client. */
export function clientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim() || null;
  return req.headers.get("x-real-ip");
}

/** The draft batch, created on the FIRST save rather than at mint time — so
 *  minting twenty links for twenty stores does not litter the board with twenty
 *  empty surveys. Idempotent: once link.batch_id is set, this returns it.
 *
 *  Everything the batch needs about where it is comes from the STORE row, which
 *  is why nobody on site ever retypes an address: it is never typed. */
export async function ensureDraftBatch(
  sb: SupabaseClient,
  link: MeasureLinkRow,
  store: StoreRow,
  account: Pick<CorporateAccount, "name">,
): Promise<string | null> {
  const { data: currentAccount } = await sb.from("corporate_accounts")
    .select("*").eq("id", link.account_id).maybeSingle();
  if (!legacyPartnerWorkflowAllowed(currentAccount)) return null;
  if (link.batch_id) return link.batch_id;

  const today = istDateKey();
  const { data: batch, error } = await sb.from("corporate_site_batches").insert({
    account_id: link.account_id,
    store_id: store.id,
    title: `${account.name} · ${store.name} · ${today}`,
    status: "collecting",
    // The store's standing brief, unless HQ set one for this visit.
    series_names: link.series_names.length ? link.series_names : store.series_names,
    state: store.state,
    ship_address: store.address_line,
    ship_city: store.city,
    gps: store.gps,
    // 'source' has existed since the pipeline was built with a default of
    // 'calculator' and was read by nothing. This is the other kind of survey it
    // was waiting for.
    source: "measure_link",
    source_ref: link.ref,
    created_by: link.recipient_name?.trim()
      ? `${link.recipient_name.trim()} <${link.recipient_email}>`
      : link.recipient_email,
  }).select("id").single();
  if (error || !batch) {
    console.error("[measure-link] draft batch failed:", error?.message);
    return null;
  }

  // Claim it for this link. Conditional, so two simultaneous first-saves from a
  // double-tapped button cannot leave two batches with one link pointing at the
  // loser — the second insert is orphaned and empty rather than half-filled.
  const { data: claimed } = await sb.from("corporate_measure_links")
    .update({ batch_id: batch.id as string })
    .eq("id", link.id).is("batch_id", null)
    .select("batch_id").maybeSingle();
  if (claimed) return batch.id as string;

  // Someone else won: bin ours and use theirs.
  await sb.from("corporate_site_batches").delete().eq("id", batch.id as string);
  const { data: fresh } = await sb.from("corporate_measure_links")
    .select("batch_id").eq("id", link.id).maybeSingle();
  return (fresh?.batch_id as string) ?? null;
}

/** Is this link still writable? Separated from resolve so every write route
 *  refuses in exactly the same way. */
export function writableState(state: LinkState): { ok: boolean; status: number; error: string } {
  switch (state) {
    case "ok":        return { ok: true, status: 200, error: "" };
    case "submitted": return { ok: false, status: 409, error: "These measurements have already been sent to head office." };
    case "expired":   return { ok: false, status: 403, error: "This link has expired. Ask your head office for a new one." };
    case "revoked":   return { ok: false, status: 403, error: "This link is no longer active. Ask your head office for a new one." };
    default:          return { ok: false, status: 404, error: "This link is not active." };
  }
}

export type MeasureContext = {
  link: MeasureLinkRow;
  store: StoreRow;
  account: Pick<CorporateAccount, "id" | "slug" | "name">;
  sb: SupabaseClient;
  tokenHash: string;
};

/** The whole preamble every public route needs, in one place: shape-check,
 *  resolve, refuse a closed link, check the per-action cap, hand back a service
 *  client. Four routes doing this by hand is four chances to forget the cap or
 *  to trust the request body for the account. */
export async function guardMeasureRequest(
  req: Request,
  rawToken: string,
  action: "open" | "save" | "sign" | "commit" | "submit",
  opts: { requireWritable?: boolean } = {},
): Promise<
  | { ok: true; ctx: MeasureContext }
  | { ok: false; status: number; error: string; state: LinkState }
> {
  const token = (rawToken ?? "").trim();
  const r = await resolveMeasureLink(token);
  if (!r.link || !r.store || !r.account) {
    // Unknown, expired-and-unresolvable, inactive store, inactive account: all
    // one answer, so this is not an oracle for what exists.
    return { ok: false, status: 404, error: "This link is not active.", state: r.state };
  }
  if (opts.requireWritable !== false) {
    const w = writableState(r.state);
    if (!w.ok) return { ok: false, status: w.status, error: w.error, state: r.state };
  }
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, status: 503, error: "Unavailable", state: r.state };

  const tokenHash = hashToken(token);
  if (!(await linkActionAllowed(tokenHash, clientIp(req), action))) {
    return {
      ok: false, status: 429, state: r.state,
      error: "That is a lot of requests in a short time — wait a moment and try again.",
    };
  }
  return { ok: true, ctx: { link: r.link, store: r.store, account: r.account, sb, tokenHash } };
}
