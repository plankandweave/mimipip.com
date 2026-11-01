import { NextResponse } from "next/server";
import { accountForEmail, accountForSlug, isStaffEmail, issueLoginCode, loginAllowed, normaliseEmail, verifyLoginCode } from "@/lib/corporate-auth";
import { sendPortalPhoneCode, verifyPortalPhoneCode } from "@/lib/corporate-phone";
import { sendEmail } from "@/lib/email";
import { relabelVisitAsPartner } from "@/lib/partner-traffic";

export const dynamic = "force-dynamic";

// POST { email }              -> emails a 6-digit code (step 1)
// POST { email, code }        -> verifies and sets the session cookie (step 2)
// POST { phone }              -> texts a code to a member's handset (step 1)
// POST { phone, code }        -> verifies and sets the same session cookie
//
// Two doors, one endpoint and one session. The phone door exists for accounts
// whose people are reached on a mobile rather than at a company inbox — see
// lib/corporate-phone.ts for why it refuses a non-member before sending, which
// is the one place its posture differs from the email door's.
//
// Step 1 tells the caller plainly when a domain isn't recognised, and when the
// code couldn't be mailed. It used to answer "sent" either way for
// anti-enumeration, but for a portal whose tenants we onboard by hand that hid
// nothing worth hiding and made a real outage invisible: a wrong domain and a
// dead mailer both looked exactly like success, so the customer sat on the
// code screen waiting for mail that was never coming.
/** Left-most hop of x-forwarded-for is the client on Vercel. */
function clientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0].trim() || null : req.headers.get("x-real-ip");
}

export async function POST(req: Request) {
  let body: { email?: string; code?: string; slug?: string; phone?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  // ── The phone door ──
  // Taken first and answered entirely here: no slug is read, and no account can
  // be named by the caller. Which account opens is decided by the member row
  // the verified handset resolves to.
  if (body.phone) {
    if (body.code) {
      const r = await verifyPortalPhoneCode(String(body.phone), String(body.code));
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
      await relabelVisitAsPartner(r.session);
      return NextResponse.json({
        ok: true,
        account: { name: r.session.account.name, slug: r.session.account.slug },
      });
    }
    const r = await sendPortalPhoneCode(String(body.phone), clientIp(req));
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    // The account is named back so the code screen can show whose portal is
    // being opened — that is how someone spots a link for the wrong tenant.
    return NextResponse.json({
      ok: true, sent: true,
      account: { name: r.accountName, slug: r.accountSlug },
    });
  }

  const email = normaliseEmail(String(body.email ?? ""));
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Enter your work email address." }, { status: 400 });
  }

  // ── Step 2: verify ──
  if (body.code) {
    const session = await verifyLoginCode(email, String(body.code), {
      ip: clientIp(req), userAgent: req.headers.get("user-agent"),
    });
    if (!session) {
      return NextResponse.json({ error: "That code is wrong or has expired. Request a new one." }, { status: 401 });
    }
    await relabelVisitAsPartner(session);
    return NextResponse.json({ ok: true, account: { name: session.account.name, slug: session.account.slug } });
  }

  // ── Step 1: request a code ──
  // Our own staff sign in to the portal they are standing in (by slug) using
  // their OWN inbox and their own code — the desk places partner orders
  // without ever holding a partner's mailbox, and every order still carries
  // the name of the person who placed it. Approval rights are unaffected:
  // isDesignApprover() matches the account's owner email, never ours.
  const staff = isStaffEmail(email);
  const slug = String(body.slug ?? "").trim();
  const account = staff && slug ? await accountForSlug(slug) : await accountForEmail(email);
  if (!account) {
    console.warn(`[corp-auth] no active account for ${staff ? `slug ${slug}` : `domain of ${email}`}`);
    return NextResponse.json({
      error: staff
        ? "That partner portal isn't recognised. Check the link and try again."
        : "We don't recognise that email domain. Please use your work email, or contact us at hello@zyvorah.com to get your account set up.",
    }, { status: 403 });
  }

  // On accounts that run their own member list (migration 0084), holding the
  // domain's inbox is no longer enough — an admin has to have added you. Said
  // plainly, and naming who can fix it, because the person to ask is inside
  // their own company and not us.
  if (!(await loginAllowed(account, email))) {
    console.warn(`[corp-auth] ${email} is not a member of ${account.slug}`);
    return NextResponse.json({
      error: `${email} doesn't have access to the ${account.name} portal yet. Ask one of your account admins to add you — they can do it from Team in the portal.`,
    }, { status: 403 });
  }

  const code = await issueLoginCode(account, email);
  if (!code) {
    console.error(`[corp-auth] could not issue a code for ${email}`);
    return NextResponse.json({
      error: "We couldn't start the sign-in just now. Please try again, or contact us at hello@zyvorah.com.",
    }, { status: 503 });
  }

  const sent = await sendEmail({
    to: email,
    subject: `${code} is your ${account.name} print portal code${staff ? " (staff)" : ""}`,
    html: `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px">
      <p style="font-size:14px;color:#475569">Signing in to the ${account.name} print portal</p>
      <p style="font-size:34px;font-weight:800;letter-spacing:.18em;margin:14px 0;color:#0f172a">${code}</p>
      <p style="font-size:13px;color:#64748b">This code expires in 15 minutes. If you did not request it, ignore this email.</p>
      <p style="font-size:12px;color:#94a3b8;margin-top:22px">Zyvorah · made-to-order wallpaper</p>
    </div>`,
  });
  if (!sent) {
    console.error(`[corp-auth] code issued but email send failed for ${email}`);
    return NextResponse.json({
      error: "We couldn't email your code just now. Please contact us at hello@zyvorah.com and we'll sign you in.",
    }, { status: 502 });
  }

  return NextResponse.json({ ok: true, sent: true });
}
