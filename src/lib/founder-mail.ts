import { serviceFetch } from "../brand/service-transport";
const fetch: typeof globalThis.fetch = (input,init) => serviceFetch("email",input,init);
import "server-only";

// Email that leaves as Roheena herself — roheena@zyvorah.com — not as the shop.
// Used by the CRM when she presses Send on a drafted task. Every other email
// the site sends goes from hello@mail.zyvorah.com through src/lib/email.ts; a
// founder writing to a Chairman or a Registrar must not arrive looking like an
// order confirmation.
//
// Two routes, picked per send:
//
//   gmail  — her real mailbox, through the Gmail API. The message sits in her
//            Sent folder and inside the existing Gmail thread, exactly as if
//            she had typed it there. The token is BORROWED from the OS
//            (POST <OS>/api/zyvorah/google/send-token, the same
//            x-zyvorah-token link corporate orders use), which holds the one
//            Google connection to roheena@plankandweave.com — roheena@zyvorah.com
//            is a send-as alias on that mailbox. The site's own login
//            (GMAIL_CLIENT_ID / _SECRET / _REFRESH_TOKEN) is only a fallback:
//            it died on 8 Oct 2026 and four CRM emails went by Resend without
//            anyone noticing. One grant, kept alive in one place.
//
//   resend — until then. Same From address (zyvorah.com carries Resend's DKIM
//            and return-path records alongside Google's), replies come back to
//            her Gmail as normal, and she is BCC'd so every sent email also
//            lands in her inbox as the record. The reply subject and
//            In-Reply-To keep it inside the recipient's conversation where we
//            know the original Message-ID.

import { buildMime, type MailAttachment } from "./founder-mime";

export const FOUNDER_ADDRESS = "roheena@zyvorah.com";
const FROM = `Roheena Nagpal <${FOUNDER_ADDRESS}>`;

export type FounderMail = {
  to: string[];
  cc: string[];
  subject: string;
  html: string;
  text: string;
  /** Gmail thread id in Roheena's mailbox, when this replies to one. */
  gmailThreadId?: string | null;
  /** RFC 5322 Message-ID of the message being answered, when known. */
  inReplyTo?: string | null;
  /** Files on the email — a quotation and its specification sheets. Both
   *  routes carry them; Gmail as a multipart/mixed part, Resend as base64. */
  attachments?: MailAttachment[];
};

export type { MailAttachment };

export type FounderSendResult =
  | { ok: true; provider: "gmail" | "resend"; messageId: string | null }
  | { ok: false; provider: "gmail" | "resend"; error: string };

const OS_BASE = (process.env.OS_BASE_URL ?? "https://os.magnitudegroup.in").replace(/\/$/, "");
const osLinked = () => !!process.env.ZYVORAH_WEBHOOK_TOKEN;
const ownGmailLogin = () =>
  !!(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN);

export function founderMailProvider(): "gmail" | "resend" {
  return osLinked() || ownGmailLogin() ? "gmail" : "resend";
}

export async function sendAsFounder(m: FounderMail): Promise<FounderSendResult> {
  return founderMailProvider() === "gmail" ? viaGmail(m) : viaResend(m);
}

/* --------------------------------- resend --------------------------------- */

let senderCheck: { at: number; ok: boolean | null } | null = null;

/** Is zyvorah.com verified with Resend, so a send as roheena@zyvorah.com will
 *  be accepted? true / false, or null when it can't be told (a sending-only
 *  key cannot list domains). Asked when a draft opens, so a refusal shows up
 *  before she has written anything, not after she presses Send. Cached per
 *  isolate for ten minutes. */
export async function founderSenderReady(): Promise<boolean | null> {
  if (founderMailProvider() === "gmail") return true;
  if (senderCheck && Date.now() - senderCheck.at < 600_000) return senderCheck.ok;
  const key = process.env.RESEND_API_KEY;
  let ok: boolean | null = null;
  if (!key) ok = false;
  else {
    try {
      const res = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${key}` } });
      if (res.ok) {
        const json = (await res.json()) as { data?: { name: string; status: string }[] };
        const d = json.data?.find((x) => x.name === "zyvorah.com");
        ok = !!d && d.status === "verified";
      }
    } catch {
      ok = null;
    }
  }
  senderCheck = { at: Date.now(), ok };
  return ok;
}

async function viaResend(m: FounderMail): Promise<FounderSendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, provider: "resend", error: "RESEND_API_KEY is not set" };

  const headers: Record<string, string> = {};
  if (m.inReplyTo) {
    headers["In-Reply-To"] = m.inReplyTo;
    headers["References"] = m.inReplyTo;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: m.to,
        ...(m.cc.length ? { cc: m.cc } : {}),
        // Her copy. Without it the email would exist nowhere she looks.
        bcc: [FOUNDER_ADDRESS],
        reply_to: FOUNDER_ADDRESS,
        subject: m.subject,
        html: m.html,
        text: m.text,
        ...(m.attachments?.length
          ? { attachments: m.attachments.map((a) => ({ filename: a.filename, content: Buffer.from(a.content).toString("base64"), content_type: a.contentType })) }
          : {}),
        ...(Object.keys(headers).length ? { headers } : {}),
        tags: [{ name: "kind", value: "crm-founder" }],
      }),
    });
    const body = await res.text();
    if (!res.ok) {
      console.error("[founder-mail] resend refused:", res.status, body);
      return { ok: false, provider: "resend", error: resendReason(res.status, body) };
    }
    const id = (JSON.parse(body) as { id?: string }).id ?? null;
    return { ok: true, provider: "resend", messageId: id };
  } catch (e) {
    console.error("[founder-mail] resend error:", e);
    return { ok: false, provider: "resend", error: "Could not reach the email service" };
  }
}

/** Resend's refusals, in words Roheena can act on. The one that matters: if
 *  zyvorah.com ever drops out of verification, every send fails loudly here
 *  rather than silently going from some other address. */
function resendReason(status: number, body: string): string {
  if (/not verified|domain/i.test(body)) return "zyvorah.com is not verified with the email service, so it refused to send as roheena@zyvorah.com";
  if (status === 429) return "The email service is rate-limiting — try again in a minute";
  return `The email service refused the send (${status})`;
}

/* --------------------------------- gmail ---------------------------------- */

async function gmailAccessToken(): Promise<string | null> {
  return (await osGmailToken()) ?? (await ownGmailToken());
}

/** A gmail.send token from the OS's Google connection. */
async function osGmailToken(): Promise<string | null> {
  if (!osLinked()) return null;
  try {
    const res = await fetch(`${OS_BASE}/api/zyvorah/google/send-token`, {
      method: "POST",
      headers: { "x-zyvorah-token": process.env.ZYVORAH_WEBHOOK_TOKEN! },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.error("[founder-mail] OS refused a gmail token:", res.status, await res.text());
      return null;
    }
    return ((await res.json()) as { accessToken?: string }).accessToken ?? null;
  } catch (e) {
    console.error("[founder-mail] could not reach the OS for a gmail token:", e);
    return null;
  }
}

async function ownGmailToken(): Promise<string | null> {
  if (!ownGmailLogin()) return null;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID!,
      client_secret: process.env.GMAIL_CLIENT_SECRET!,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    console.error("[founder-mail] gmail token refresh failed:", res.status, await res.text());
    return null;
  }
  return ((await res.json()) as { access_token?: string }).access_token ?? null;
}

/** The raw message, base64url as the Gmail API wants it. Built by
 *  src/lib/founder-mime.ts so a test can read it back. */
function rawMime(m: FounderMail): string {
  const id = () => `zy_${crypto.randomUUID().replace(/-/g, "")}`;
  return buildMime(
    { from: FROM, to: m.to, cc: m.cc, subject: m.subject, html: m.html, text: m.text, inReplyTo: m.inReplyTo, attachments: m.attachments },
    { alt: id(), mixed: id() },
  );
}
const mime = (m: FounderMail) => Buffer.from(rawMime(m), "utf8").toString("base64url");

async function viaGmail(m: FounderMail): Promise<FounderSendResult> {
  const token = await gmailAccessToken();
  if (!token) {
    // A revoked or expired Gmail connection must not strand her mid-send:
    // fall back to the route that works, and say so in the log.
    console.warn("[founder-mail] gmail unavailable — falling back to resend");
    return viaResend(m);
  }
  // The simple send endpoint caps the JSON body around 5 MB of base64; the
  // upload endpoint takes a multipart body and is what a message with PDFs
  // on it needs. Both return the same {id}.
  const withFiles = !!m.attachments?.length;
  const res = withFiles
    ? await fetch("https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=multipart", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "multipart/related; boundary=zy_upload" },
        body: [
          "--zy_upload",
          "Content-Type: application/json; charset=UTF-8",
          "",
          JSON.stringify(m.gmailThreadId ? { threadId: m.gmailThreadId } : {}),
          "--zy_upload",
          "Content-Type: message/rfc822",
          "",
          rawMime(m),
          "--zy_upload--",
          "",
        ].join("\r\n"),
      })
    : await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ raw: mime(m), ...(m.gmailThreadId ? { threadId: m.gmailThreadId } : {}) }),
      });
  if (!res.ok) {
    const body = await res.text();
    console.error("[founder-mail] gmail send failed:", res.status, body);
    return { ok: false, provider: "gmail", error: `Gmail refused the send (${res.status})` };
  }
  const json = (await res.json()) as { id?: string };
  return { ok: true, provider: "gmail", messageId: json.id ?? null };
}
