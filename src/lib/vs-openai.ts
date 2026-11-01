import { serviceFetch } from "../brand/service-transport";
const fetch: typeof globalThis.fetch = (input,init) => serviceFetch("ai",input,init);
// Vijay Sales composition runs on OpenAI's GPT-6 Astra (founder, 13 October
// 2026: "for the next set of compositions, we should set up GPT-6 Astra as
// the model and not Claude").
//
// One door for every vision/JSON call in the measured-store pipeline —
// design geometry, allocation, revisions, the floor review and the wall
// quad. Each call site asks here first and keeps its Claude call as the
// fallback, so a missing key, an outage or an unparseable reply never stops
// a store: it composes on Claude and says so (`model` on the result is what
// every caller records, so "which model chose this wall" is always on the
// row, never a guess).
//
// Keys follow the one-key-per-workflow rule (ai-keys.ts): the Vijay Sales
// work spends OPENAI_KEY_VIJAY_SALES, set by the founder on the Worker, and
// until it exists the shared OPENAI_API_KEY the Proposal Studio already uses.

export const VS_OPENAI_MODEL_DEFAULT = "gpt-6-astra";

export type VsProvider = "openai" | "anthropic";

/** Which provider the Vijay Sales pipeline asks first. `VIJAY_SALES_AI_PROVIDER=anthropic` puts Claude back without a deploy. */
export function vsProvider(env: Record<string, string | undefined> = process.env): VsProvider {
  return (env.VIJAY_SALES_AI_PROVIDER ?? "").trim().toLowerCase() === "anthropic" ? "anthropic" : "openai";
}

export function vsOpenAIKey(env: Record<string, string | undefined> = process.env): string | null {
  return env.OPENAI_KEY_VIJAY_SALES || env.OPENAI_API_KEY || null;
}

export function vsOpenAIModel(env: Record<string, string | undefined> = process.env): string {
  return (env.VIJAY_SALES_OPENAI_MODEL || VS_OPENAI_MODEL_DEFAULT).trim();
}

export type VsJsonRequest = {
  /** The instruction text (sent after the images). */
  text: string;
  /** Base64 JPEGs, in the order the text refers to them. */
  imagesJpegB64?: string[];
  /** Optional JSON schema for the reply; without one the reply is parsed as the first {...} block. */
  schema?: { name: string; schema: Record<string, unknown> };
  maxOutputTokens?: number;
  timeoutMs?: number;
};

export type VsJsonResult<T> = { json: T; model: string };

/** The text of a Responses API reply, wherever the output item put it. */
export function responsesText(body: unknown): string {
  const b = body as { output_text?: unknown; output?: { type?: string; content?: { type?: string; text?: string }[] }[] };
  if (typeof b?.output_text === "string") return b.output_text;
  const parts: string[] = [];
  for (const item of b?.output ?? []) {
    if (item?.type !== "message") continue;
    for (const c of item.content ?? []) if (c?.type === "output_text" && typeof c.text === "string") parts.push(c.text);
  }
  return parts.join("");
}

/** The first JSON object in a reply (models sometimes wrap it in prose or a fence). */
export function firstJsonObject<T>(text: string): T | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)) as T; } catch { return null; }
}

/**
 * Ask GPT-6 Astra for JSON. Null means "use the Claude fallback": the
 * provider is set to anthropic, there is no key, the call failed, or the
 * reply carried no JSON. Never throws.
 */
export async function vsOpenAIJson<T>(req: VsJsonRequest, label: string): Promise<VsJsonResult<T> | null> {
  if (vsProvider() !== "openai") return null;
  const key = vsOpenAIKey();
  if (!key) {
    console.warn(`[vs-openai] ${label}: no OpenAI key on the Worker, using Claude`);
    return null;
  }
  const model = vsOpenAIModel();
  const content: unknown[] = [
    ...(req.imagesJpegB64 ?? []).map((b64) => ({ type: "input_image", image_url: `data:image/jpeg;base64,${b64}` })),
    { type: "input_text", text: req.text },
  ];
  const body: Record<string, unknown> = {
    model,
    input: [{ role: "user", content }],
    max_output_tokens: req.maxOutputTokens ?? 16000,
  };
  if (req.schema) {
    body.text = { format: { type: "json_schema", name: req.schema.name, schema: req.schema.schema, strict: false } };
  }
  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(req.timeoutMs ?? 240_000),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`[vs-openai] ${label}: ${model} answered ${res.status}, using Claude:`, JSON.stringify(j).slice(0, 300));
      return null;
    }
    const json = firstJsonObject<T>(responsesText(j));
    if (!json) {
      console.error(`[vs-openai] ${label}: ${model} reply carried no JSON, using Claude`);
      return null;
    }
    return { json, model };
  } catch (e) {
    console.error(`[vs-openai] ${label}: ${model} call failed, using Claude:`, (e as Error)?.message);
    return null;
  }
}
