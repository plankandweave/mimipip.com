import { serviceAvailable } from "../brand/services";
// Transactional email via Resend. No-op (logs) until RESEND_API_KEY is set, so
// the order-lifecycle automation is fully wired and starts sending the moment
// the key is configured — same pattern as the Razorpay/GST credentials.

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  cc?: string | string[];
  /** File attachments — content is base64. Keep them small (Resend caps ~40MB). */
  attachments?: { filename: string; content: string }[];
  /** Extra RFC-5322 headers, e.g. List-Unsubscribe for marketing mail. */
  headers?: Record<string, string>;
  /** Resend tags — echoed back on webhook events, used to join engagement
   *  events (opens/clicks/bounces) to what was sent (e.g. a newsletter issue). */
  tags?: { name: string; value: string }[];
  /** Hand the send to Resend now but have it delivered later — an ISO 8601
   *  timestamp, or natural language like "in 1 hour". Resend holds it, so a
   *  delayed email needs no cron of ours and can't be missed if a deploy or a
   *  scheduler hiccups. */
  scheduledAt?: string;
  /** Resend idempotency key (an HTTP header, not an email header): a retried
   *  send with the same key inside 24h is accepted but delivered only once. */
  idempotencyKey?: string;
};

/** Send and return the Resend email id — the join key for engagement events. */
export async function sendEmailWithId(
  input: SendEmailInput,
): Promise<{ ok: boolean; id: string | null }> {
  if (!serviceAvailable("email")) return { ok: false, id: null };
  const key = process.env.RESEND_API_KEY;
  // We send from mail.zyvorah.com (its own verified Resend domain) so link
  // tracking never needs a CNAME on www — that record belongs to the store.
  // mail.zyvorah.com has no inbox, so every send falls back to a reply-to on
  // zyvorah.com; a reply must always reach a mailbox someone actually reads.
  const from = input.from || process.env.EMAIL_FROM || "Mimi Pip <hello@mimipip.com>";
  const replyTo = input.replyTo || process.env.EMAIL_REPLY_TO || "hello@mimipip.com";
  if (!key) {
    console.warn(`[email] RESEND_API_KEY not set — skipped "${input.subject}" → ${input.to}`);
    return { ok: false, id: null };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(input.to) ? input.to : [input.to],
        subject: input.subject,
        html: input.html,
        ...(replyTo ? { reply_to: replyTo } : {}),
        ...(input.cc ? { cc: Array.isArray(input.cc) ? input.cc : [input.cc] } : {}),
        ...(input.attachments?.length ? { attachments: input.attachments } : {}),
        ...(input.headers ? { headers: input.headers } : {}),
        ...(input.tags?.length ? { tags: input.tags } : {}),
        ...(input.scheduledAt ? { scheduled_at: input.scheduledAt } : {}),
      }),
    });
    if (!res.ok) {
      console.error("[email] send failed:", res.status, await res.text());
      return { ok: false, id: null };
    }
    const json = (await res.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, id: json?.id ?? null };
  } catch (e) {
    console.error("[email] error:", e);
    return { ok: false, id: null };
  }
}

export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  const { ok } = await sendEmailWithId(input);
  return ok;
}
