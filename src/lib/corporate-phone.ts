import { backendUrl, MIMIPIP_SCHEMA } from "@/brand/backend";
import "server-only";
import { serviceAvailable } from "../brand/services";
import { partnerCapabilities } from "./partner-capabilities";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "./supabase-admin";
import { toE164, toIndianMobile } from "./phone";
import {
  startCorporateSession,
  type CorporateAccount,
  type CorporateMember,
  type CorporateSession,
} from "./corporate-auth";

// ─── The phone door into a partner portal ───────────────────────────────────
//
// The portal's original door proves a login by emailing a one-time code to an
// address on the account's own domain. That door is wrong for a commercial
// property owner: the people who walk those buildings are reached on a mobile,
// they are added by their own admin rather than by us, and some of them have no
// company inbox we can reach at all.
//
// So this door proves the HANDSET instead, and it does so by reusing the
// storefront's shipped mobile sign-in wholesale (migration 0146): Supabase Auth
// mints, stores, expires and verifies the code, and the send_sms hook delivers
// it through 2Factor. Nothing here talks to 2Factor, holds an SMS key, or
// invents a code format — there is exactly one OTP implementation on this site
// and this is not a second one.
//
// What Supabase cannot answer is which ACCOUNT a proved handset belongs to.
// That is corporate_members.phone, and it is the whole bridge.
//
// THE RULE THAT MAKES THIS SAFE, and it is the measure-link rule again: the
// account is read from the resolved MEMBER ROW, never from the request body. A
// caller cannot name the account they would like to sign in to. The only thing
// a caller supplies is a phone number and a code that was sent to it.

export type PhoneMember = {
  member: CorporateMember;
  account: CorporateAccount;
};

/** Which account does this handset belong to?
 *
 *  Exactly one, or none. corporate_members_phone_idx (migration 0156) is a
 *  GLOBAL unique index over active rows, so this cannot return an ambiguous
 *  answer that the caller would then have to disambiguate — which is how a
 *  request body ends up choosing an account. */
export async function memberByPhone(mobile: string): Promise<PhoneMember | null> {
  if (!toIndianMobile(mobile)) return null;
  const sb = supabaseAdmin();
  if (!sb) return null;

  const { data: member } = await sb.from("corporate_members")
    .select("*").eq("phone", mobile).eq("active", true).maybeSingle();
  if (!member) return null;

  const { data: account } = await sb.from("corporate_accounts")
    .select("*").eq("id", (member as CorporateMember).account_id)
    .eq("active", true).maybeSingle();
  if (!account) return null;
  // This workflow proves a company inbox, not possession of a handset assigned
  // through the legacy phone-only team screen.
  if (partnerCapabilities(account).poRequiredRelease) return null;

  return { member: member as CorporateMember, account: account as CorporateAccount };
}

/** A throwaway anon client, never the cookie-bound one.
 *
 *  Two reasons. Sending must not disturb a storefront session that already
 *  exists in this browser; and verifying server-side means a portal login does
 *  not leave the visitor signed in to the SHOP as a side effect. The portal
 *  session cookie is the only thing this door mints. */
function otpClient() {
  if (!serviceAvailable("database")) return null;
  const url = backendUrl();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false }, db: { schema: MIMIPIP_SCHEMA } });
}

export type SendResult =
  | { ok: true; accountName: string; accountSlug: string }
  | { ok: false; status: number; error: string };

/**
 * Send a sign-in code to a member's handset.
 *
 * Refuses a number that holds no member row, and refuses it BEFORE any SMS is
 * sent. That is a deliberate trade, and it goes the other way from the
 * measure-link "one indistinguishable answer" rule:
 *
 *   · Answering differently for a member and a stranger tells someone holding a
 *     list of numbers which of them can reach a portal. That is a small leak
 *     about a handful of named people.
 *   · Sending anyway would text an arbitrary stranger at our expense, on
 *     demand, for any number typed. The storefront's own auth route names this
 *     the louder harm, and it is also the one that costs money.
 *
 * The storefront door can afford to be generous because signing up IS the
 * product; a partner portal has no such reason to text a non-member.
 */
export async function sendPortalPhoneCode(
  mobile: string,
  clientIp: string | null,
): Promise<SendResult> {
  const digits = toIndianMobile(mobile);
  if (!digits) {
    return { ok: false, status: 400, error: "Enter a valid 10-digit mobile number." };
  }

  const found = await memberByPhone(digits);
  if (!found) {
    return {
      ok: false, status: 403,
      error: "That number isn't set up for a portal. Ask your account administrator to add it.",
    };
  }

  const sb = supabaseAdmin();
  if (!sb) return { ok: false, status: 503, error: "Sign-in is unavailable." };

  // The storefront's throttle, reused rather than reimplemented: same table,
  // same per-number and per-IP ceilings, same reason (every one of these costs
  // real money). It fails OPEN, which is the right direction here too — the
  // membership check above already bounds who can trigger a send at all.
  const { data: gate, error: gateError } = await sb.rpc("sms_otp_request_allowed", {
    p_phone: digits, p_ip: clientIp,
  });
  if (gateError) {
    console.error("[corp-phone] throttle unavailable:", gateError.message);
  } else if (!(gate as { allowed?: boolean } | null)?.allowed) {
    return {
      ok: false, status: 429,
      error: "Too many codes requested. Please wait an hour and try again.",
    };
  }

  const client = otpClient();
  if (!client) return { ok: false, status: 503, error: "Sign-in is unavailable." };

  const { error } = await client.auth.signInWithOtp({ phone: toE164(digits) });
  if (error) {
    console.error("[corp-phone] signInWithOtp failed:", error.message);
    return { ok: false, status: 502, error: "Couldn't send your code. Please try again." };
  }

  // Named back to the caller so the code screen can say which account is being
  // opened — "Knowledge Realty Trust" on screen is how someone notices they
  // have been sent a link for the wrong tenant.
  return { ok: true, accountName: found.account.name, accountSlug: found.account.slug };
}

export type VerifyResult =
  | { ok: true; session: CorporateSession }
  | { ok: false; status: number; error: string };

/**
 * Verify a code and open the portal session.
 *
 * The phone arrives in the request body, and that is safe here because it is
 * never trusted on its own: Supabase checks the (phone, code) PAIR, and only a
 * caller holding that handset can produce the pair. What must not happen — and
 * does not — is any account, slug or email travelling in the body alongside it.
 * Everything about who this is comes from the member row.
 */
export async function verifyPortalPhoneCode(
  mobile: string,
  code: string,
): Promise<VerifyResult> {
  const digits = toIndianMobile(mobile);
  const token = String(code ?? "").replace(/\D/g, "");
  if (!digits || token.length < 4) {
    return { ok: false, status: 400, error: "Enter the code we sent you." };
  }

  const client = otpClient();
  if (!client) return { ok: false, status: 503, error: "Sign-in is unavailable." };

  const { data, error } = await client.auth.verifyOtp({
    phone: toE164(digits), token, type: "sms",
  });
  if (error || !data?.user) {
    return { ok: false, status: 401, error: "That code didn't match. Check it and try again." };
  }

  // Trust the handset Supabase just proved, not the one we were told about: if
  // these ever disagree, the body is the thing that is wrong.
  const proved = toIndianMobile(data.user.phone ?? digits);
  if (!proved) return { ok: false, status: 401, error: "That code didn't match. Check it and try again." };

  // Resolved AFTER verification, so a revocation in the last few minutes bites
  // now rather than at the end of a thirty-day session.
  const found = await memberByPhone(proved);
  if (!found) {
    return {
      ok: false, status: 403,
      error: "That number isn't set up for a portal. Ask your account administrator to add it.",
    };
  }

  const session = await startCorporateSession(found.account, found.member.email, "phone");
  if (!session) {
    return { ok: false, status: 403, error: "That number isn't set up for a portal." };
  }
  return { ok: true, session };
}
