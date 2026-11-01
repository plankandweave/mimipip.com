import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { formatIstDateTime } from "@/lib/ist";
import {
  insideServiceWindow,
  parseWebhook,
  verifyMetaSignature,
  verifySubscription,
  whatsappVerifyToken,
  type InboundMessage,
} from "@/lib/whatsapp-cloud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Meta's WhatsApp Cloud API webhook — the store line's inbox.
//
// GET  is the one-time handshake when the callback URL is saved in the Meta
//      app dashboard: echo hub.challenge if hub.verify_token matches ours.
// POST carries customer messages and delivery statuses. Every POST must be
//      signed with the app secret (X-Hub-Signature-256); with no secret
//      configured we refuse everything, because an unsigned POST could plant
//      a conversation that never happened.
//
// A message is stored once (Meta retries, so wa_message_id is the key) and the
// FIRST message of a new conversation — nothing from that number in 24 hours —
// is emailed to Roheena, so a warm customer is never left waiting in an inbox
// nobody opens. Later messages in the same conversation are stored silently.
// Anything we cannot handle still gets a 200: a non-2xx only makes Meta retry,
// and after enough failures it disables the webhook.

const LEAD_TO = process.env.LEAD_ALERT_TO || "roheena@plankandweave.com";
const FROM = "Zyvorah alerts <hello@mail.zyvorah.com>";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function GET(req: Request) {
  const challenge = verifySubscription(new URL(req.url).searchParams, await whatsappVerifyToken());
  if (challenge == null) return new NextResponse("forbidden", { status: 403 });
  return new NextResponse(challenge, { status: 200, headers: { "content-type": "text/plain" } });
}

async function alertNewConversation(m: InboundMessage): Promise<void> {
  const name = m.contactName ?? "A customer";
  const phone = `+${m.from}`;
  await sendEmail({
    to: LEAD_TO,
    from: FROM,
    subject: `WhatsApp from ${name} (${phone}): ${(m.body ?? `[${m.kind}]`).slice(0, 120)}`,
    html: `
      <p><strong>${esc(name)}</strong> · ${esc(phone)}</p>
      <p style="white-space:pre-wrap">${esc(m.body ?? `[${m.kind}]`)}</p>
      <p><a href="https://wa.me/${esc(m.from)}">Reply on WhatsApp</a></p>
      <p style="color:#888;font-size:12px">Received ${esc(formatIstDateTime(m.at))} IST on the Zyvorah WhatsApp line.
      A free-text reply is possible until 24 hours after the customer's last message.</p>`,
  });
}

export async function POST(req: Request) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return NextResponse.json({ error: "webhook secret not configured" }, { status: 503 });

  const raw = await req.text();
  if (!verifyMetaSignature(secret, raw, req.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true, ignored: "bad payload" });
  }

  const { messages, statuses } = parseWebhook(payload);
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ ok: true, stored: false });

  for (const m of messages) {
    try {
      const { data: prior } = await sb
        .from("whatsapp_messages")
        .select("created_at")
        .eq("wa_phone", m.from)
        .eq("direction", "in")
        .neq("wa_message_id", m.waMessageId)
        .order("created_at", { ascending: false })
        .limit(1);
      const { data: inserted } = await sb
        .from("whatsapp_messages")
        .upsert(
          {
            wa_message_id: m.waMessageId,
            direction: "in",
            wa_phone: m.from,
            contact_name: m.contactName,
            kind: m.kind,
            body: m.body,
            payload: m.raw,
            created_at: m.at.toISOString(),
          },
          { onConflict: "wa_message_id", ignoreDuplicates: true },
        )
        .select("id");
      const isNew = (inserted?.length ?? 0) > 0;
      const last = prior?.[0]?.created_at ? new Date(prior[0].created_at as string) : null;
      if (isNew && !insideServiceWindow(last, m.at)) await alertNewConversation(m);
    } catch (e) {
      console.error("[whatsapp webhook] message not stored:", e instanceof Error ? e.message : "unknown");
    }
  }

  for (const s of statuses) {
    await sb
      .from("whatsapp_messages")
      .update({ status: s.status, status_at: s.at.toISOString(), ...(s.error ? { error: s.error } : {}) })
      .eq("wa_message_id", s.waMessageId)
      .then(({ error }) => error && console.error("[whatsapp webhook] status not stored:", error.message));
  }

  return NextResponse.json({ ok: true, messages: messages.length, statuses: statuses.length });
}
