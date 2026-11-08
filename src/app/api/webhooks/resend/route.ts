import { backendUrl, MIMIPIP_SCHEMA } from "@/brand/backend";
import { serviceAvailable } from "@/brand/services";
import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Resend webhook receiver — the engagement firehose. Resend POSTs an event here
// for every delivery, open, click, bounce and complaint; we verify the Svix
// signature, store the event in email_events (joined to the newsletter issue via
// the Resend email id / tags), and suppress undeliverable addresses so they are
// never mailed again.
//
// Security: events are only accepted with a valid signature against
// RESEND_WEBHOOK_SECRET. Without the secret configured we reject — unverified
// events could poison analytics or maliciously bounce-suppress real customers.

type ResendEvent = {
  type: string; // e.g. "email.delivered", "email.opened", ...
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    subject?: string;
    tags?: { name: string; value: string }[] | Record<string, string>;
    click?: { link?: string; user_agent?: string };
    bounce?: { type?: string; subType?: string; message?: string };
  };
};

/** Verify a Svix-style signature (Resend uses Svix under the hood). */
function verifySvix(secret: string, id: string, timestamp: string, body: string, sigHeader: string): boolean {
  // 5-minute tolerance against replay.
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
  const expectedBuf = Buffer.from(expected);

  // Header form: "v1,<sig> v1,<sig2> ..."
  for (const part of sigHeader.split(" ")) {
    const sig = part.startsWith("v1,") ? part.slice(3) : part;
    try {
      const sigBuf = Buffer.from(sig);
      if (sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf)) return true;
    } catch {
      // ignore malformed candidate
    }
  }
  return false;
}

const EVENT_MAP: Record<string, string> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.delivery_delayed": "delivery_delayed",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.bounced": "bounced",
  "email.complained": "complained",
};

/** The signing secret: env var, else admin_config (where one-click setup from
 *  the admin dashboard stores it). Cached per lambda instance. */
let cachedSecret: string | null | undefined;
async function webhookSecret(): Promise<string | null> {
  if (process.env.RESEND_WEBHOOK_SECRET) return process.env.RESEND_WEBHOOK_SECRET;
  if (cachedSecret !== undefined) return cachedSecret;
  const url = backendUrl();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return (cachedSecret = null);
  const sb = createClient(url, serviceKey, { auth: { persistSession: false }, db: { schema: MIMIPIP_SCHEMA } });
  const { data } = await sb.from("admin_config").select("v").eq("k", "resend_webhook_secret").limit(1);
  cachedSecret = (data?.[0]?.v as string | undefined) ?? null;
  return cachedSecret;
}

export async function POST(req: Request) {
  if (!serviceAvailable("database")) return NextResponse.json({ error: "Brand service not configured", code: "BRAND_SERVICE_NOT_CONFIGURED" }, { status: 503 });
  const secret = await webhookSecret();
  if (!secret) return NextResponse.json({ error: "webhook secret not configured" }, { status: 503 });

  const body = await req.text();
  const svixId = req.headers.get("svix-id") ?? "";
  const svixTs = req.headers.get("svix-timestamp") ?? "";
  const svixSig = req.headers.get("svix-signature") ?? "";
  if (!svixId || !svixTs || !svixSig || !verifySvix(secret, svixId, svixTs, body, svixSig)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }

  const eventType = EVENT_MAP[event.type];
  if (!eventType) return NextResponse.json({ ok: true, ignored: event.type });

  const url = backendUrl();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({ error: "storage not configured" }, { status: 503 });
  const sb = createClient(url, serviceKey, { auth: { persistSession: false }, db: { schema: MIMIPIP_SCHEMA } });

  const to = Array.isArray(event.data?.to) ? event.data?.to?.[0] : event.data?.to;
  const email = (to ?? "").toLowerCase().trim();
  if (!email) return NextResponse.json({ ok: true, ignored: "no recipient" });
  const resendId = event.data?.email_id ?? null;

  // Resolve the newsletter issue: prefer the tag stamped at send time, else the
  // send-ledger row that recorded this Resend id.
  let issueId: string | null = null;
  const tags = event.data?.tags;
  if (Array.isArray(tags)) issueId = tags.find((t) => t.name === "issue_id")?.value ?? null;
  else if (tags && typeof tags === "object") issueId = (tags as Record<string, string>).issue_id ?? null;
  if (!issueId && resendId) {
    const { data } = await sb.from("newsletter_sends").select("issue_id").eq("resend_id", resendId).limit(1);
    issueId = (data?.[0]?.issue_id as string | undefined) ?? null;
  }
  // Fallback for emails sent before tagging existed (e.g. the first feature
  // issue): attribute to the most recent issue this address was sent, within
  // the last 30 days. Newsletter cadence is weekly, so this is unambiguous.
  if (!issueId) {
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { data } = await sb
      .from("newsletter_sends")
      .select("issue_id, sent_at")
      .eq("email", email)
      .gte("sent_at", since)
      .order("sent_at", { ascending: false })
      .limit(1);
    issueId = (data?.[0]?.issue_id as string | undefined) ?? null;
  }

  const meta: Record<string, unknown> = {};
  if (event.data?.click?.link) meta.link = event.data.click.link;
  if (event.data?.click?.user_agent) meta.user_agent = event.data.click.user_agent;
  if (event.data?.bounce) meta.bounce = event.data.bounce;
  if (event.data?.subject) meta.subject = event.data.subject;

  await sb.from("email_events").insert({
    event_type: eventType,
    email,
    resend_id: resendId,
    issue_id: issueId,
    meta: Object.keys(meta).length ? meta : null,
    occurred_at: event.created_at ?? new Date().toISOString(),
  });

  // Suppression: bounces stop future sends; complaints also unsubscribe — a
  // spam report is a clear "stop emailing me".
  if (eventType === "bounced") {
    await sb.from("customers").update({ email_bounced_at: new Date().toISOString() }).ilike("email", email);
  } else if (eventType === "complained") {
    await sb
      .from("customers")
      .update({ email_bounced_at: new Date().toISOString(), unsubscribed_at: new Date().toISOString() })
      .ilike("email", email);
  }

  return NextResponse.json({ ok: true });
}
