import { runVoiceConcierge, type VoiceMessage } from "@/lib/voice-concierge";
import { VOICE_ENABLED } from "@/lib/voice-flag";
import { anthropicKeyFor } from "@/lib/ai-keys";

// VAPI's "Custom LLM" calls this endpoint like an OpenAI Chat Completions API:
// it does speech-to-text, POSTs the running transcript here, and speaks back
// whatever text we return. We ignore VAPI's own system prompt/tools and run the
// Zyvorah voice concierge brain (src/lib/voice-concierge.ts) instead, so voice
// stays in lock-step with the text concierge — same catalogue, pricing, policy
// grounding and order tools, executed server-side where the secrets live.
//
// Why a catch-all ([[...rest]]): VAPI appends "/chat/completions" to the
// configured custom-LLM url, so it actually calls
// /api/voice/chat/chat/completions — this route matches both that and the bare
// /api/voice/chat. Reachability: VAPI's servers (not the browser) call this, so
// it must be the DEPLOYED https origin — it can't be tested against localhost.

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Shared secret so only VAPI can spend our Claude budget here. VAPI appends
// "/chat/completions" to the url, which mangles a trailing "?k=<secret>", and
// it may also send the secret as an Authorization header. The secret is
// high-entropy, so we simply require it to appear SOMEWHERE in the request URL
// or the Authorization header — robust to however VAPI reshapes the url.
//
// Fails CLOSED: with no VOICE_LLM_SECRET set this endpoint would be an open,
// unmetered Sonnet 5 relay for anyone who found the url. Voice is only rendered
// when the VAPI keys are configured anyway, so requiring the secret alongside
// them costs nothing. This route is called by VAPI's servers rather than a
// browser, so it can't use the customer email gate the other AI routes use.
function authorized(req: Request): boolean {
  const secret = process.env.VOICE_LLM_SECRET;
  if (!secret) {
    console.error("[voice] VOICE_LLM_SECRET is not set — refusing to serve.");
    return false;
  }
  const auth = req.headers.get("authorization") ?? "";
  return req.url.includes(secret) || auth.includes(secret);
}

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

function chunk(id: string, created: number, delta: object, finish: string | null) {
  return {
    id,
    object: "chat.completion.chunk",
    created,
    model: "zyvorah-voice-concierge",
    choices: [{ index: 0, delta, finish_reason: finish }],
  };
}

export async function POST(req: Request) {
  // Voice is switched off. Refuse before auth and before any Claude call, so an
  // assistant still configured on VAPI's side (the keys remain in production)
  // can't keep spending Sonnet budget on inbound calls now that the browser
  // button is gone.
  if (!VOICE_ENABLED) {
    return new Response(JSON.stringify({ error: "voice_disabled" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!authorized(req)) {
    // Diagnostic (no secret leaked): shows what VAPI actually sent if it 401s.
    console.warn("voice/chat 401", {
      path: new URL(req.url).pathname,
      hasAuthHeader: !!req.headers.get("authorization"),
    });
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!anthropicKeyFor("shoppers")) {
    return new Response(JSON.stringify({ error: "not_configured" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: { messages?: OpenAIMessage[]; stream?: boolean };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Keep only the spoken back-and-forth. Drop VAPI's system prompt and any
  // tool/function scaffolding — the brain supplies its own. The Messages API
  // needs alternating roles ending on the user, so collapse consecutive
  // same-role turns and trim any trailing assistant turn.
  const raw = (body.messages ?? [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: textOf(m.content) }))
    .filter((m) => m.content.length > 0)
    .slice(-16);

  const history: VoiceMessage[] = [];
  for (const m of raw) {
    const prev = history[history.length - 1];
    if (prev && prev.role === m.role) prev.content = `${prev.content}\n\n${m.content}`;
    else history.push({ ...m });
  }
  while (history.length && history[history.length - 1].role !== "user") history.pop();

  const id = `chatcmpl-${Date.now().toString(36)}`;
  const created = Math.floor(Date.now() / 1000);

  const GREETING = "Hi! You've reached the Zyvorah concierge. How can I help with your walls today?";

  // Non-streaming path (stream:false) — a single completion object.
  if (body.stream === false) {
    const reply = history.length ? await safeRun(history) : GREETING;
    return new Response(
      JSON.stringify({
        id,
        object: "chat.completion",
        created,
        model: "zyvorah-voice-concierge",
        choices: [
          { index: 0, message: { role: "assistant", content: reply }, finish_reason: "stop" },
        ],
      }),
      { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
    );
  }

  // Streaming path — VAPI's default. Compute the reply, then stream it as OpenAI
  // SSE chunks in ONE continuous burst. We deliberately do NOT speak a mid-turn
  // "hold" line: the silent gap between the hold and the real answer desynced
  // VAPI's turn detection and made it miss the caller's next answer. Most turns
  // are quick clarifying questions (no catalogue search) so pauses stay rare;
  // the occasional search/price turn just has a brief wait before speech begins.
  const reply = history.length ? await safeRun(history) : GREETING;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (o: object) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(o)}\n\n`));
      send(chunk(id, created, { role: "assistant" }, null));
      // Emit in word groups so TTS gets natural chunks without a flood of events.
      const words = reply.split(/(\s+)/);
      let group = "";
      for (const w of words) {
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
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    },
  });
}

async function safeRun(history: VoiceMessage[]): Promise<string> {
  try {
    return await runVoiceConcierge(history);
  } catch (e) {
    console.error("voice concierge error:", e);
    return "I'm having a little trouble on my end — could you say that once more?";
  }
}
