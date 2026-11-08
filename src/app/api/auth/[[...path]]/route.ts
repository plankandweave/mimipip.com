import { backendUrl, backendPublicKey, MIMIPIP_SCHEMA } from "@/brand/backend";
import { serviceAvailable } from "@/brand/services";
import { eventContext } from "@/lib/concierge-events";
import { recordConciergeEvent } from "@/lib/concierge-store";
import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseServerAuth } from "@/lib/auth-server";
import { sendEmail } from "@/lib/email";
import { loginCodeEmail } from "@/lib/email-templates";
import { TASTE_COOKIE } from "@/lib/taste";
import { toIndianMobile } from "@/lib/phone";
import { cookies } from "next/headers";
import { accountForEmail, partnerHome } from "@/lib/corporate-auth";

// Retail sign-in, multiplexed like /api/forms and /api/curator.
//
//   POST /api/auth/request-code  { email }             → emails a one-time code
//                                                         (8 digits — Supabase's
//                                                         own admin.generateLink
//                                                         format, not ours to pick)
//   POST /api/auth/check-phone   { phone }             → which door this number
//                                                         goes through: sms, or
//                                                         back to its own email
//   POST /api/auth/request-sms   { phone }             → texts a one-time code
//   POST /api/auth/complete      { source? }           → links customer + history,
//                                                         enrols the verified email
//   POST /api/auth/email-code    { email }             → email step for a
//   POST /api/auth/email-verify  { email, code }         phone-first signup
//   POST /api/auth/phone         { phone, marketing }  → optional second step
//
// Why not supabase.auth.signInWithOtp({ email }) straight from the browser?
// Because that sends through Supabase's built-in mailer, which is capped at a
// few messages per hour — fine for a demo, but it would lock real customers out
// of a store that already has 600+ of them. Instead we mint the same one-time
// code with admin.generateLink and deliver it over Resend, the sender the store
// already uses for every order email. Verification still runs through Supabase
// Auth on the client, so auth.uid() and all the existing RLS keep working.
//
// SMS is the same shape, and for once signInWithOtp IS the right call: Supabase
// has an SMS provider again — the send_sms auth hook in
// supabase/functions/send-sms-hook, which hands the code to 2Factor. There is no
// per-hour cap to route around, and no admin API that mints a phone OTP anyway.
// It still runs server-side rather than from the browser, so the throttle and
// the one-identity check below cannot be skipped by calling Supabase directly.

export const runtime = "nodejs";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const EMAIL_CODE_TTL_MIN = 15;
const MAX_EMAIL_CODE_ATTEMPTS = 5;

function clientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0].trim() : req.headers.get("x-real-ip");
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Constant-time compare of two hex digests, as in corporate-auth. */
function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/* ---------------------------- request-code ------------------------------ */


/**
 * A partner's work address belongs to the partner's portal, not to a retail
 * account. HomeLane's people were making their own customer accounts on the
 * storefront — invisible to their account, unable to file walls to a project,
 * and one step from buying at retail. Refusing the code here, with the door
 * they should use, keeps one person one identity. 409 rather than 403: the
 * address is fine, it is just the wrong door.
 */
async function partnerDoorFor(email: string): Promise<NextResponse | null> {
  const account = await accountForEmail(email);
  if (!account) return null;
  return NextResponse.json(
    {
      error: `${email} is part of ${account.name}. Sign in through the ${account.name} portal instead.`,
      code: "partner_domain",
      portal: partnerHome(account),
      accountName: account.name,
    },
    { status: 409 },
  );
}

async function requestCode(req: Request) {
  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Sign-in is unavailable." }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { email?: string } | null;
  const email = body?.email?.trim().toLowerCase() ?? "";
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  const partnerDoor = await partnerDoorFor(email);
  if (partnerDoor) return partnerDoor;

  // Throttle before we send anything: this endpoint is public, so without a cap
  // it's a way to flood a stranger's inbox and burn our Resend quota. If the RPC
  // itself fails (infra hiccup, not a real "too many" decision) we log it and
  // let the request through rather than locking every customer out of sign-in
  // over an abuse check that couldn't run — availability of login beats a missed
  // edge case on the throttle.
  const { data: gate, error: gateError } = await admin.rpc("otp_request_allowed", {
    p_email: email,
    p_ip: clientIp(req),
  });
  if (gateError) {
    console.error("[auth] otp_request_allowed RPC failed:", gateError.message);
  } else {
    const decision = gate as { allowed?: boolean; reason?: string } | null;
    if (!decision?.allowed) {
      const tooMany = decision?.reason?.startsWith("too_many");
      return NextResponse.json(
        {
          error: tooMany
            ? "Too many codes requested. Please wait an hour and try again."
            : "Enter a valid email address.",
        },
        { status: tooMany ? 429 : 400 },
      );
    }
  }

  // generateLink only works for an existing user, so create one on first sight.
  // email_confirm marks the address usable; entering the code is still what
  // proves the customer owns it, since no session exists until verifyOtp.
  let link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) {
    await admin.auth.admin.createUser({ email, email_confirm: true });
    link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  }

  const code = link.data?.properties?.email_otp;
  if (link.error || !code) {
    console.error("[auth] generateLink failed:", link.error?.message);
    return NextResponse.json({ error: "Couldn't send your code. Please try again." }, { status: 502 });
  }

  const { subject, html } = loginCodeEmail(code);
  const sent = await sendEmail({ to: email, subject, html });
  if (!sent) {
    return NextResponse.json({ error: "Couldn't send your code. Please try again." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}

/* ----------------------------- check-phone ------------------------------ */

/**
 * One person, one account.
 *
 * A number already attached to a signed-up customer is sent back to the email
 * they signed up with, rather than being allowed to open a second identity.
 * login_sync (0016) adopts an UNLINKED customers row by mobile, but it cannot
 * merge two LINKED ones — so without this check, a customer who signed in by
 * email in March and by mobile in April would end up with their orders, boards
 * and trade status split across two accounts, each showing half their history.
 *
 * The hint the RPC returns is masked (r••@gmail.com): this route is public and
 * unauthenticated, and an unmasked answer would make it a phone-to-email lookup
 * for anyone holding a list of mobile numbers.
 */
async function checkPhone(req: Request) {
  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Sign-in is unavailable." }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { phone?: string } | null;
  const digits = toIndianMobile(body?.phone);
  if (!digits) {
    return NextResponse.json({ error: "Enter a valid 10-digit mobile number." }, { status: 400 });
  }

  const { data, error } = await admin.rpc("phone_signin_route", { p_phone: digits });
  if (error) {
    // Failing open here means "carry on to SMS", which is the safe direction:
    // the worst case is a duplicate account we can merge later, where failing
    // closed would lock a customer out of a store they can already reach.
    console.error("[auth] phone_signin_route failed:", error.message);
    return NextResponse.json({ route: "sms" });
  }
  return NextResponse.json((data as { route?: string; hint?: string } | null) ?? { route: "sms" });
}

/* ----------------------------- request-sms ------------------------------ */

async function requestSms(req: Request) {
  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Sign-in is unavailable." }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { phone?: string } | null;
  const digits = toIndianMobile(body?.phone);
  if (!digits) {
    return NextResponse.json({ error: "Enter a valid 10-digit mobile number." }, { status: 400 });
  }

  // Tighter than the email throttle, and for a different reason: every one of
  // these costs real money, and a flood of texts to a stranger's phone is a
  // louder harm than a flood to their inbox. Same fail-open reasoning as above.
  const { data: gate, error: gateError } = await admin.rpc("sms_otp_request_allowed", {
    p_phone: digits,
    p_ip: clientIp(req),
  });
  if (gateError) {
    console.error("[auth] sms_otp_request_allowed RPC failed:", gateError.message);
  } else {
    const decision = gate as { allowed?: boolean; reason?: string } | null;
    if (!decision?.allowed) {
      const tooMany = decision?.reason?.startsWith("too_many");
      return NextResponse.json(
        {
          error: tooMany
            ? "Too many codes requested. Please wait an hour and try again."
            : "Enter a valid 10-digit mobile number.",
        },
        { status: tooMany ? 429 : 400 },
      );
    }
  }

  // A throwaway anon client, NOT the cookie-bound one: signInWithOtp only sends
  // the code here, but binding it to the request's cookie jar would let it
  // disturb a session that already exists. Supabase stores the OTP and fires the
  // send_sms hook, which is what actually reaches 2Factor.
  const sender = createClient(
    backendUrl(),
    backendPublicKey(),
    { auth: { persistSession: false }, db: { schema: MIMIPIP_SCHEMA } },
  );
  const { error } = await sender.auth.signInWithOtp({ phone: `+91${digits}` });
  if (error) {
    console.error("[auth] signInWithOtp(phone) failed:", error.message);
    return NextResponse.json({ error: "Couldn't send your code. Please try again." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}

/* ------------------------------ complete -------------------------------- */

/**
 * Called once, right after the code is verified — by either door. Reconciles the
 * auth user into `customers` (merging the imported/newsletter row with the same
 * email or mobile rather than duplicating it) and attaches the visitor's
 * anonymous browsing history to that customer. The zyv_taste cookie is httpOnly,
 * so this can only happen server-side — which is the whole reason this endpoint
 * exists.
 */
async function complete(req: Request) {
  const supabase = await supabaseServerAuth();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data, error } = await supabase.rpc("login_sync");
  if (error) console.error("[auth] login_sync failed:", error.message);

  // Mimi Pip marketing consent is collected separately by the newsletter form.

  const token = (await cookies()).get(TASTE_COOKIE)?.value;
  if (token) {
    const { error: linkErr } = await supabase.rpc("link_taste_token", { p_token: token });
    if (linkErr) console.error("[auth] link_taste_token failed:", linkErr.message);
  }

  const profile = data as { phone?: string | null } | null;
  return NextResponse.json({
    ok: true,
    needsPhone: !profile?.phone,
    // Signed in by mobile: they have a session and their account, but every
    // token-spending feature stays shut until there is a confirmed address,
    // because getGatedUser requires one.
    needsEmail: !auth.user.email,
  });
}

/* --------------------- email step for a phone signup -------------------- */

/**
 * The mirror of the optional phone step: a mobile-first customer has no email,
 * no way to be told about their own order, and no access to the AI features.
 *
 * The code is ours, not Supabase's — admin.generateLink would mint one against a
 * DIFFERENT auth user for that address, which is exactly the second identity
 * this whole flow exists to prevent. So it follows the corporate portal's shape
 * instead (0037): a 6-digit code stored only as a SHA-256 hash, 15-minute TTL,
 * five attempts, delivered over Resend like every other code the store sends.
 */
async function emailCode(req: Request) {
  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Sign-in is unavailable." }, { status: 503 });

  const supabase = await supabaseServerAuth();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { email?: string } | null;
  const email = body?.email?.trim().toLowerCase() ?? "";
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  const partnerDoor = await partnerDoorFor(email);
  if (partnerDoor) return partnerDoor;

  // Signed in, so this is not an open relay — but it is still a "send mail to an
  // address I typed" button, so it shares the email throttle rather than having
  // none of its own.
  const { data: gate, error: gateError } = await admin.rpc("otp_request_allowed", {
    p_email: email,
    p_ip: clientIp(req),
  });
  if (gateError) {
    console.error("[auth] otp_request_allowed RPC failed:", gateError.message);
  } else if (!(gate as { allowed?: boolean } | null)?.allowed) {
    return NextResponse.json(
      { error: "Too many codes requested. Please wait an hour and try again." },
      { status: 429 },
    );
  }

  // Refuse an address that already belongs to another account. Attaching it here
  // would collide on auth.users.email, and the customer's real intent in that
  // case is to sign in as the account they already have.
  const { data: taken } = await admin
    .from("customers")
    .select("auth_user_id")
    .ilike("email", email)
    .not("auth_user_id", "is", null)
    .limit(1);
  if (taken?.length && taken[0].auth_user_id !== auth.user.id) {
    return NextResponse.json(
      { error: "That email already has an account. Sign in with it instead." },
      { status: 409 },
    );
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const { error: insErr } = await admin.from("auth_email_codes").insert({
    user_id: auth.user.id,
    email,
    code_hash: sha256(code),
    expires_at: new Date(Date.now() + EMAIL_CODE_TTL_MIN * 60_000).toISOString(),
  });
  if (insErr) {
    console.error("[auth] auth_email_codes insert failed:", insErr.message);
    return NextResponse.json({ error: "Couldn't send your code. Please try again." }, { status: 500 });
  }

  const { subject, html } = loginCodeEmail(code);
  const sent = await sendEmail({ to: email, subject, html });
  if (!sent) {
    return NextResponse.json({ error: "Couldn't send your code. Please try again." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}

async function emailVerify(req: Request) {
  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Sign-in is unavailable." }, { status: 503 });

  const supabase = await supabaseServerAuth();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as
    | { email?: string; code?: string; source?: string; marketing?: boolean }
    | null;
  const email = body?.email?.trim().toLowerCase() ?? "";
  const code = (body?.code ?? "").trim();

  const { data: rows } = await admin
    .from("auth_email_codes")
    .select("id, code_hash, attempts")
    .eq("user_id", auth.user.id)
    .eq("email", email)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1);

  const row = rows?.[0] as { id: string; code_hash: string; attempts: number } | undefined;
  // One message for every failure mode — expired, wrong, burnt through its
  // attempts — so a guesser learns nothing from which answer they got.
  const bad = NextResponse.json(
    { error: "That code didn't work — check it, or send a new one." },
    { status: 400 },
  );
  if (!row || row.attempts >= MAX_EMAIL_CODE_ATTEMPTS) return bad;

  if (!safeEqual(sha256(code), row.code_hash)) {
    // Count the miss, so a 6-digit code cannot simply be enumerated.
    await admin.from("auth_email_codes").update({ attempts: row.attempts + 1 }).eq("id", row.id);
    return bad;
  }
  await admin
    .from("auth_email_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id);

  // email_confirm is honest here: the code above is the proof of ownership, the
  // same proof the email door accepts. This is what opens the gated features,
  // since getGatedUser wants a confirmed address and nothing weaker.
  const { error: updErr } = await admin.auth.admin.updateUserById(auth.user.id, {
    email,
    email_confirm: true,
  });
  if (updErr) {
    console.error("[auth] updateUserById(email) failed:", updErr.message);
    return NextResponse.json({ error: "Couldn't save your email." }, { status: 500 });
  }

  // Verifying an address does not grant marketing consent.
  const { error: syncErr } = await supabase.rpc("save_customer_email", { p_email: email, p_marketing: false });
  if (syncErr) console.error("[auth] save_customer_email failed:", syncErr.message);

  return NextResponse.json({ ok: true });
}

/* -------------------------------- phone --------------------------------- */

async function savePhone(req: Request) {
  const supabase = await supabaseServerAuth();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as
    | { phone?: string; marketing?: boolean }
    | null;
  const digits = toIndianMobile(body?.phone);
  if (!digits) {
    return NextResponse.json({ error: "Enter a valid 10-digit mobile number." }, { status: 400 });
  }

  const { error } = await supabase.rpc("save_customer_phone", {
    p_phone: digits,
    p_marketing: body?.marketing ?? null,
  });
  if (error) {
    console.error("[auth] save_customer_phone failed:", error.message);
    return NextResponse.json({ error: "Couldn't save your number." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// Record actual code-send and signed-in completion outcomes, independently of
// browser beacons. Read only the UUID context; never put the address in events.
async function observedAuth(req: Request, action: "code" | "complete", run: (req: Request) => Promise<Response>) {
  const body = await req.clone().json().catch(() => null);
  const context = eventContext(action === "code" ? body?.concierge : body?.source === "concierge" ? body : null);
  if (!context) return run(req);
  if (action === "code") await recordConciergeEvent(context, "code_request_received");
  try {
    const response = await run(req);
    await recordConciergeEvent(context, action === "code"
      ? (response.ok ? "code_sent" : "code_send_failed")
      : (response.ok ? "auth_completed" : "auth_complete_failed"), { status: response.status });
    return response;
  } catch (error) {
    await recordConciergeEvent(context, action === "code" ? "code_send_failed" : "auth_complete_failed", { status: 500 });
    throw error;
  }
}

/* -------------------------------- router -------------------------------- */

export async function POST(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  if (!serviceAvailable("database")) return NextResponse.json({ error: "Brand service not configured", code: "BRAND_SERVICE_NOT_CONFIGURED" }, { status: 503 });
  const { path } = await params;
  switch (path?.[0] ?? "") {
    case "request-code":
      return observedAuth(req, "code", requestCode);
    case "check-phone":
      return checkPhone(req);
    case "request-sms":
      return requestSms(req);
    case "complete":
      return observedAuth(req, "complete", complete);
    case "email-code":
      return emailCode(req);
    case "email-verify":
      return emailVerify(req);
    case "phone":
      return savePhone(req);
    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 404 });
  }
}
