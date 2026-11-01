import { runVoiceFollowup, FOLLOWUP_GOODBYE, type VoiceMessage, type FollowupCallContext } from "@/lib/voice-concierge";
import { VOICE_FOLLOWUP_ENABLED } from "@/lib/voice-flag";
import { loadFollowupContext } from "@/lib/voice-followup";
import { anthropicKeyFor } from "@/lib/ai-keys";

// The brain of an OUTBOUND follow-up call. Vapi's "Custom LLM" calls this like
// an OpenAI Chat Completions API on every turn of a call placed by
// src/lib/voice-followup.ts, and speaks back whatever text we return. The shape
// is deliberately the inbound concierge's (src/app/api/voice/chat) — same SSE,
// same history handling — with two differences:
//
//  1. It is NOT gated by VOICE_ENABLED. That switch keeps the browser button
//     and the inbound endpoint off; this is a separate feature with its own
//     switch, VOICE_FOLLOWUP_ENABLED (src/lib/voice-flag.ts).
//  2. It knows who it rang. The transient assistant's url carries &f=<row id>;
//     Vapi appends "/chat/completions" after the query string, so the id is
//     pulled out of the raw url by pattern rather than by searchParams. If that
//     ever fails, the request body's call.id finds the row by vapi_call_id.
//
// Catch-all for the same reason as voice/chat: Vapi calls
// /api/voice/followup/chat/completions (or the url with the path glued after
// the query), and this route answers both.

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Fails CLOSED, like voice/chat: without VOICE_LLM_SECRET this would be an open
// Sonnet relay. The secret must appear in the url or the Authorization header —
// Vapi reshapes the url, so we look for it rather than parse for it.
function authorized(req: Request): boolean {
  const secret = process.env.VOICE_LLM_SECRET;
  if (!secret) {
    console.error("[voice-followup] VOICE_LLM_SECRET is not set — refusing to serve.");
    return false;
  }
  const auth = req.headers.get("authorization") ?? "";
  return req.url.includes(encodeURIComponent(secret)) || req.url.includes(secret) || auth.includes(secret);
}

const FOLLOWUP_ID = /[?&]f=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

type OpenAIMessage = { role: string; content: unknown };

/** Flatten OpenAI content (string, or array of {type:"text",text}) to text. */
function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        const p = part as { type?: string; text?: string };
        return p?.type === "text" && typeof p.text === "string" ? p.text : "";
      })
      .join(" ")
      .trim();
  }
  return "";
}

const MODEL_NAME = "zyvorah-followup";

function chunk(id: string, created: number, delta: object, finish: string | null) {
  return { id, object: "chat.completion.chunk", created, model: MODEL_NAME, choices: [{ index: 0, delta, finish_reason: finish }] };
}

const json = (body: object, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Said when the row cannot be found or the person has opted out since the call
// was placed. Ends with the goodbye phrase, so Vapi hangs up.
const WRONG_ROW = `Sorry, I don't seem to have your details in front of me. Our team will reach you on WhatsApp instead. ${FOLLOWUP_GOODBYE}`;

export async function POST(req: Request) {
  if (!VOICE_FOLLOWUP_ENABLED) return json({ error: "voice_followup_disabled" }, 503);
  if (!authorized(req)) {
    // Diagnostic (no secret, no query string): what Vapi sent if it 401s.
    console.warn("voice/followup 401", { path: new URL(req.url).pathname, hasAuthHeader: !!req.headers.get("authorization") });
    return json({ error: "unauthorized" }, 401);
  }
  if (!anthropicKeyFor("shoppers")) return json({ error: "not_configured" }, 503);

  let body: { messages?: OpenAIMessage[]; stream?: boolean; call?: { id?: unknown } };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const followupId = FOLLOWUP_ID.exec(req.url)?.[1] ?? null;
  const callId = typeof body.call?.id === "string" ? body.call.id : null;
  const found = await loadFollowupContext(followupId, callId).catch(() => null);

  // Keep only the spoken back-and-forth; drop Vapi's own system prompt and any
  // tool scaffolding. Alternate roles, end on the user.
  const raw = (body.messages ?? [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: textOf(m.content) }))
    .filter((m) => m.content.length > 0)
    .slice(-24);
  const history: VoiceMessage[] = [];
  for (const m of raw) {
    const prev = history[history.length - 1];
    if (prev && prev.role === m.role) prev.content = `${prev.content}\n\n${m.content}`;
    else history.push({ ...m });
  }
  while (history.length && history[history.length - 1].role !== "user") history.pop();
  // On an outbound call WE spoke first (Vapi's firstMessage), so the history
  // opens on an assistant turn. Give it a user turn to answer to.
  if (history.length && history[0].role === "assistant") {
    history.unshift({ role: "user", content: "(The customer picked up the phone.)" });
  }

  let reply: string;
  if (!found || found.status === "opted_out") reply = WRONG_ROW;
  else if (!history.length) reply = "Hello, this is Zyvorah's AI assistant. Is this a good time for two minutes?";
  else reply = await safeRun(history, found.ctx);

  const id = `chatcmpl-${Date.now().toString(36)}`;
  const created = Math.floor(Date.now() / 1000);

  if (body.stream === false) {
    return new Response(
      JSON.stringify({
        id,
        object: "chat.completion",
        created,
        model: MODEL_NAME,
        choices: [{ index: 0, message: { role: "assistant", content: reply }, finish_reason: "stop" }],
      }),
      { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
    );
  }

  // One continuous SSE burst, for the turn-detection reason voice/chat records.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (o: object) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(o)}\n\n`));
      send(chunk(id, created, { role: "assistant" }, null));
      let group = "";
      for (const w of reply.split(/(\s+)/)) {
        group += w;
        if (group.length >= 24) {
          send(chunk(id, created, { content: group }, null));
          group = "";
        }
      }
      if (group) send(chunk(id, created, { content: group }, null));
      send(chunk(id, created, {}, "stop"));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", Connection: "keep-alive" },
  });
}

async function safeRun(history: VoiceMessage[], ctx: FollowupCallContext): Promise<string> {
  try {
    return await runVoiceFollowup(history, ctx);
  } catch (e) {
    console.error("voice follow-up error:", e instanceof Error ? e.message : "unknown");
    return "I'm having a little trouble on my end — could you say that once more?";
  }
}
