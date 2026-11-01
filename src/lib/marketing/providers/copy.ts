import { serviceAvailable, requireService } from "../../../brand/services";
// Who writes the captions.
//
// Roheena's call (2026-09-22): ChatGPT is the copywriter for Instagram — the
// same division of labour the image lane already uses (providers/openai.ts).
// The engine stays the editor: it sets the brief, runs the brand-safety gate on
// whatever comes back, and regenerates on a failure. Changing the writer does
// not change the gate.
//
// Anthropic stays behind MARKETING_COPY_PROVIDER=anthropic as the fallback,
// because a caption lane with one provider and no switch is one outage away
// from a silent stop.
import { anthropicKeyFor } from "@/lib/ai-keys";

export type CopyWriter = {
  readonly name: string;
  /** One completion. Throws on transport/API failure; the caller decides what
   *  a failure means (here: the slot stays queued and is reported). */
  write(system: string, user: string): Promise<string>;
};

const OPENAI_MODEL = process.env.OPENAI_CREATIVE_MODEL || "gpt-5";
const ANTHROPIC_MODEL = "claude-sonnet-5";

class OpenAIWriter implements CopyWriter {
  readonly name = `openai/${OPENAI_MODEL}`;
  /** An explicit key (the Instagram lane's own) or the shared OPENAI_API_KEY. */
  constructor(private keyName = "OPENAI_API_KEY") {}
  async write(system: string, user: string): Promise<string> {
    if (!serviceAvailable("ai")) requireService("ai");
    const key = process.env[this.keyName];
    if (!key) throw new Error(`${this.keyName} is not set`);
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      signal: AbortSignal.timeout(90_000),
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(`openai ${res.status}: ${JSON.stringify(j).slice(0, 300)}`);
    const text = j?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) throw new Error("openai returned no caption");
    return text;
  }
}

class AnthropicWriter implements CopyWriter {
  readonly name = `anthropic/${ANTHROPIC_MODEL}`;
  /** An explicit key (the Instagram lane's own) or the marketing workflow's
   *  key (ai-keys.ts), which falls back to the shared ANTHROPIC_API_KEY. */
  constructor(private keyName?: string) {}
  async write(system: string, user: string): Promise<string> {
    if (!serviceAvailable("ai")) requireService("ai");
    // Imported lazily so the OpenAI path does not pay for the SDK.
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const apiKey = this.keyName ? process.env[this.keyName] : anthropicKeyFor("marketing");
    if (this.keyName && !apiKey) throw new Error(`${this.keyName} is not set`);
    // A caption is a few hundred tokens: 90 s is generous, and one retry is
    // enough. The SDK's defaults (10 min, two retries) could hold a compose
    // run for half an hour on a stalled connection (12 Oct 2026).
    const client = new Anthropic({ maxRetries: 1, timeout: 90_000, ...(apiKey ? { apiKey } : {}) });
    const msg = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 700,
      system,
      messages: [{ role: "user", content: user }],
    });
    return msg.content
      .filter((b): b is { type: "text"; text: string; citations: never } => b.type === "text")
      .map((b) => b.text)
      .join("");
  }
}

/**
 * A billing wall is not a missing key, and it used to stop the feed.
 *
 * On 27 Sep 2026 the OpenAI account ran out of credits ("429 ... You have no
 * credits remaining"). A MISSING key already degraded to Anthropic; an
 * EXHAUSTED account did not, so every caption — and therefore every composed
 * post — would have failed until someone topped up. Quota and billing refusals
 * now fall through to Anthropic for that call.
 */
export const OUT_OF_CREDIT = /insufficient_quota|no credits remaining|billing|exceeded your current quota|^openai 429/i;

export class FallbackWriter implements CopyWriter {
  constructor(
    private primary: CopyWriter,
    private backup: CopyWriter,
  ) {}
  get name() {
    return this.primary.name;
  }
  async write(system: string, user: string): Promise<string> {
    try {
      return await this.primary.write(system, user);
    } catch (e) {
      const msg = (e as Error).message || "";
      if (!OUT_OF_CREDIT.test(msg)) throw e;
      console.warn(`[marketing] ${this.primary.name} refused on credit — writing with ${this.backup.name}: ${msg.slice(0, 160)}`);
      return await this.backup.write(system, user);
    }
  }
}

/**
 * INSTAGRAM HAS ITS OWN KEYS (founder, 9 October 2026). Every shared key was
 * blocked after a leak; Instagram's captions now spend only keys issued for
 * Instagram, so their usage is the Instagram lane's and nothing else's, and a
 * leak anywhere else cannot reach them. There is deliberately no fallback to
 * the shared ANTHROPIC_API_KEY / OPENAI_API_KEY: an unset Instagram key is a
 * stated failure on the desk, never silent spend on a shared key.
 */
export const INSTAGRAM_KEYS = { anthropic: "ZYVORAH_INSTAGRAM_ANTHROPIC_KEY", openai: "ZYVORAH_INSTAGRAM_OPENAI_KEY" } as const;

export class MissingKeyWriter implements CopyWriter {
  readonly name = "instagram/no-key";
  async write(): Promise<string> {
    throw new Error(`no Instagram caption key is set — add ${INSTAGRAM_KEYS.anthropic} (or ${INSTAGRAM_KEYS.openai}) as a secret on the zyvorah-store Worker`);
  }
}

/** Is any Instagram caption key set? */
export const instagramKeySet = (env: Record<string, string | undefined> = process.env): boolean =>
  Object.values(INSTAGRAM_KEYS).some((k) => !!env[k]);

/** Instagram's writer: ChatGPT first when its Instagram key exists (the
 *  founder's 22 Sep choice), the Instagram Anthropic key otherwise or on a
 *  credit refusal. Shared keys are never read. */
export function instagramCopyWriter(env: Record<string, string | undefined> = process.env): CopyWriter {
  const openai = !!env[INSTAGRAM_KEYS.openai], anthropic = !!env[INSTAGRAM_KEYS.anthropic];
  if (openai && anthropic) return new FallbackWriter(new OpenAIWriter(INSTAGRAM_KEYS.openai), new AnthropicWriter(INSTAGRAM_KEYS.anthropic));
  if (openai) return new OpenAIWriter(INSTAGRAM_KEYS.openai);
  if (anthropic) return new AnthropicWriter(INSTAGRAM_KEYS.anthropic);
  return new MissingKeyWriter();
}

/** The writer for a channel: Instagram's own keys for Instagram (the
 *  default channel of a post), the shared configuration for everything else. */
export function copyWriterFor(channel: string | null | undefined): CopyWriter {
  return (channel ?? "instagram") === "instagram" ? instagramCopyWriter() : copyWriter();
}

/** The configured writer. OpenAI unless told otherwise, Anthropic whenever
 *  OpenAI has no key, and Anthropic for any call OpenAI refuses on credit. */
export function copyWriter(): CopyWriter {
  const choice = (process.env.MARKETING_COPY_PROVIDER || "openai").toLowerCase();
  if (choice === "anthropic") return new AnthropicWriter();
  if (!process.env.OPENAI_API_KEY) return new AnthropicWriter();
  return new FallbackWriter(new OpenAIWriter(), new AnthropicWriter());
}
