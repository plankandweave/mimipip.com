import { serviceFetch } from "../brand/service-transport";
const fetch: typeof globalThis.fetch = (input,init) => serviceFetch("messaging",input,init);
// WhatsApp Business Platform (Cloud API) — the store line, sending and receiving.
//
// src/lib/whatsapp.ts is the OTHER kind of WhatsApp: wa.me deep links a person
// taps and sends from their own phone. This file is Zyvorah's own number
// talking through Meta's Graph API: inbound customer messages arrive at
// /api/webhooks/whatsapp, and the server can reply or send an approved
// template. Meta app 1747091966461843, business 1772151140225355.
//
// CREDENTIALS (set in Cloudflare by the founder, never committed):
//   WHATSAPP_ACCESS_TOKEN     a system-user token with whatsapp_business_messaging
//                             (the console's 24-hour test token works for a day)
//   WHATSAPP_PHONE_NUMBER_ID  the "Phone number ID" on the API Setup page — not
//                             the phone number itself
//   WHATSAPP_APP_SECRET       App settings → Basic → App secret; signs every
//                             webhook POST. Without it the webhook refuses all.
//   WHATSAPP_VERIFY_TOKEN     the word typed into Meta's webhook form. Falls back
//                             to admin_config 'whatsapp_verify_token' so it can be
//                             set without a deploy.
// The phone number id may also live in admin_config ('whatsapp_phone_number_id'):
// it is an identifier, not a secret.
//
// THE 24-HOUR RULE. Meta lets a business send free text only within 24 hours of
// the customer's last message. Outside it, only a pre-approved template is
// delivered. sendWhatsAppText refuses rather than let Meta reject it silently.
//
// Pure functions first (signature, parsing, payloads); the impure sender and
// the store are at the bottom.

import { createHmac, timingSafeEqual } from "node:crypto";
import { waNumber } from "@/lib/whatsapp";

export const WA_GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || "v21.0";
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Meta signs the raw body with the app secret: `X-Hub-Signature-256: sha256=<hex>`. */
export function verifyMetaSignature(appSecret: string, rawBody: string, header: string | null): boolean {
  const given = /^sha256=([0-9a-f]{64})$/i.exec(header ?? "")?.[1];
  if (!appSecret || !given) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  return timingSafeEqual(Buffer.from(given.toLowerCase(), "hex"), expected);
}

/** The GET handshake Meta does once, when the callback URL is saved. */
export function verifySubscription(params: URLSearchParams, verifyToken: string | null): string | null {
  if (!verifyToken) return null;
  if (params.get("hub.mode") !== "subscribe") return null;
  const given = params.get("hub.verify_token") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(verifyToken);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return params.get("hub.challenge");
}

export type InboundMessage = {
  waMessageId: string;
  from: string;
  contactName: string | null;
  kind: string;
  body: string | null;
  at: Date;
  raw: Record<string, unknown>;
};

export type StatusUpdate = {
  waMessageId: string;
  recipient: string;
  status: string;
  at: Date;
  error: string | null;
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const when = (ts: unknown): Date => {
  const n = Number(ts);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : new Date();
};

/** The words of a message, whatever shape it came in. */
function messageBody(m: Obj): string | null {
  const type = str(m.type);
  if (type === "text") return str(obj(m.text).body);
  if (type === "button") return str(obj(m.button).text);
  if (type === "interactive") {
    const i = obj(m.interactive);
    return str(obj(i.button_reply).title) ?? str(obj(i.list_reply).title);
  }
  if (type === "location") {
    const l = obj(m.location);
    return [str(l.name), str(l.address), l.latitude != null ? `${l.latitude},${l.longitude}` : null]
      .filter(Boolean)
      .join(" · ") || null;
  }
  if (type && ["image", "video", "document", "audio", "sticker"].includes(type)) {
    const media = obj(m[type]);
    return str(media.caption) ?? str(media.filename) ?? `[${type}]`;
  }
  if (type === "reaction") return str(obj(m.reaction).emoji);
  return null;
}

/** Every inbound message and status update in one webhook delivery. */
export function parseWebhook(payload: unknown): { messages: InboundMessage[]; statuses: StatusUpdate[] } {
  const messages: InboundMessage[] = [];
  const statuses: StatusUpdate[] = [];
  const root = obj(payload);
  if (root.object !== "whatsapp_business_account") return { messages, statuses };

  for (const entry of arr(root.entry)) {
    for (const change of arr(obj(entry).changes)) {
      const c = obj(change);
      if (c.field !== "messages") continue;
      const value = obj(c.value);
      const names = new Map<string, string>();
      for (const ct of arr(value.contacts)) {
        const id = str(obj(ct).wa_id);
        const name = str(obj(obj(ct).profile).name);
        if (id && name) names.set(id, name);
      }
      for (const raw of arr(value.messages)) {
        const m = obj(raw);
        const id = str(m.id);
        const from = str(m.from);
        if (!id || !from) continue;
        messages.push({
          waMessageId: id,
          from,
          contactName: names.get(from) ?? null,
          kind: str(m.type) ?? "unknown",
          body: messageBody(m),
          at: when(m.timestamp),
          raw: m,
        });
      }
      for (const raw of arr(value.statuses)) {
        const s = obj(raw);
        const id = str(s.id);
        const status = str(s.status);
        if (!id || !status) continue;
        const err = obj(arr(s.errors)[0]);
        statuses.push({
          waMessageId: id,
          recipient: str(s.recipient_id) ?? "",
          status,
          at: when(s.timestamp),
          error: str(err.title) ?? str(err.message) ?? (err.code != null ? `code ${err.code}` : null),
        });
      }
    }
  }
  return { messages, statuses };
}

/** True while a free-form reply is still allowed. */
export function insideServiceWindow(lastInboundAt: Date | null, now = new Date()): boolean {
  return !!lastInboundAt && now.getTime() - lastInboundAt.getTime() < SERVICE_WINDOW_MS;
}

export function textPayload(to: string, body: string) {
  return { messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: true, body } };
}

export function templatePayload(to: string, name: string, language = "en", bodyParams: string[] = []) {
  return {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name,
      language: { code: language },
      ...(bodyParams.length
        ? { components: [{ type: "body", parameters: bodyParams.map((text) => ({ type: "text", text })) }] }
        : {}),
    },
  };
}

// ── Impure: configuration, store, sender ─────────────────────────────────────

async function adminConfig(k: string): Promise<string | null> {
  const { supabaseAdmin } = await import("@/lib/supabase-admin");
  const sb = supabaseAdmin();
  if (!sb) return null;
  const { data } = await sb.from("admin_config").select("v").eq("k", k).limit(1);
  return (data?.[0]?.v as string | undefined) ?? null;
}

export async function whatsappVerifyToken(): Promise<string | null> {
  return process.env.WHATSAPP_VERIFY_TOKEN || (await adminConfig("whatsapp_verify_token"));
}

export async function whatsappPhoneNumberId(): Promise<string | null> {
  return process.env.WHATSAPP_PHONE_NUMBER_ID || (await adminConfig("whatsapp_phone_number_id"));
}

export type SendResult = { ok: true; waMessageId: string } | { ok: false; error: string };

async function post(to: string, payload: Record<string, unknown>, kind: string, body: string): Promise<SendResult> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = await whatsappPhoneNumberId();
  if (!token || !phoneId) return { ok: false, error: "WhatsApp is not configured (token or phone number id missing)" };

  let result: SendResult;
  try {
    const res = await fetch(`https://graph.facebook.com/${WA_GRAPH_VERSION}/${phoneId}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = obj(await res.json().catch(() => ({})));
    const id = str(obj(arr(json.messages)[0]).id);
    result = res.ok && id ? { ok: true, waMessageId: id } : { ok: false, error: str(obj(json.error).message) ?? `HTTP ${res.status}` };
  } catch (e) {
    result = { ok: false, error: e instanceof Error ? e.message : "network error" };
  }

  const { supabaseAdmin } = await import("@/lib/supabase-admin");
  await supabaseAdmin()
    ?.from("whatsapp_messages")
    .insert({
      wa_message_id: result.ok ? result.waMessageId : null,
      direction: "out",
      wa_phone: to,
      kind,
      body,
      payload,
      status: result.ok ? "sent" : "failed",
      error: result.ok ? null : result.error,
    });
  return result;
}

/** When the customer last wrote to us, from the store. */
export async function lastInboundAt(phone: string): Promise<Date | null> {
  const { supabaseAdmin } = await import("@/lib/supabase-admin");
  const { data } = (await supabaseAdmin()
    ?.from("whatsapp_messages")
    .select("created_at")
    .eq("wa_phone", phone)
    .eq("direction", "in")
    .order("created_at", { ascending: false })
    .limit(1)) ?? { data: null };
  const at = data?.[0]?.created_at as string | undefined;
  return at ? new Date(at) : null;
}

/** A free-text reply. Refused outside the 24-hour window — send a template then. */
export async function sendWhatsAppText(phone: string, body: string): Promise<SendResult> {
  const to = waNumber(phone);
  if (!to) return { ok: false, error: "not a WhatsApp number" };
  if (!insideServiceWindow(await lastInboundAt(to))) {
    return { ok: false, error: "outside the 24-hour window: only an approved template can be sent" };
  }
  return post(to, textPayload(to, body), "text", body);
}

/** An approved template — the only thing that may open a conversation. */
export async function sendWhatsAppTemplate(
  phone: string,
  name: string,
  opts: { language?: string; bodyParams?: string[] } = {},
): Promise<SendResult> {
  const to = waNumber(phone);
  if (!to) return { ok: false, error: "not a WhatsApp number" };
  return post(to, templatePayload(to, name, opts.language, opts.bodyParams), "template", name);
}
