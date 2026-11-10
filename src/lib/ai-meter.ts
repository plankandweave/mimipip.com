// Every model call this Worker makes is reported to the group's one meter in
// the OS (owner, 10 November 2026: "one agent that's also across everything
// we do … token consumption optimizer"; the OS side is lib/token-optimiser in
// plankandweave/magnitude-global-platform, docs/TOKEN_OPTIMISER.md there).
//
// HOW. One observer on the runtime's `fetch`. The Anthropic SDK and every
// bare fetch to OpenAI, ElevenLabs, Replicate, Google or Vapi go through it,
// so a new call site is metered without anyone remembering to. It sends the
// provider's own usage block to the OS, which reads and prices it; no price
// and no parsing lives here.
//
// WHAT IT MUST NEVER DO. Change a request, change a reply, slow a shopper or
// fail a call. The reply is cloned and read after it has been handed back;
// every step is inside a try; with no OS secret on the Worker it does nothing
// at all. It carries no prompt and no customer text to the OS: only the
// provider's id, model and usage counts.
//
// WHO. An Anthropic call is named for its workflow in ai-keys.ts, found from
// the key it was signed with (the key itself never leaves). Any other call is
// named for its provider and endpoint.
//
// Loaded by ai-keys.ts, and imported directly by the few files that call a
// provider without it; ai-meter.test.ts fails if a file names a model host
// and imports neither.

export const SYSTEM = "mimipip";

/** Every host a model call can go to. Keep equal to MODEL_HOSTS in the OS. */
export const MODEL_HOSTS: Readonly<Record<string, string>> = {
  "api.anthropic.com": "anthropic",
  "api.openai.com": "openai",
  "api.elevenlabs.io": "elevenlabs",
  "api.replicate.com": "replicate",
  "api.vapi.ai": "vapi",
  "generativelanguage.googleapis.com": "google",
  "api.meshy.ai": "meshy",
};

type Json = Record<string, unknown>;
export type Exchange = { url: string; method: string; status: number; req?: Json; res?: Json; headers?: Json; sse?: string };
export type MeterEvent = { id: string; workflow: string; at: string; exchange: Exchange };

export function providerOf(url: string): { provider: string; path: string } | null {
  try {
    const u = new URL(url);
    const provider = MODEL_HOSTS[u.hostname];
    return provider ? { provider, path: u.pathname } : null;
  } catch { return null; }
}

/** Only what the meter needs from a request body: the model and how much was asked for. Never the words. */
export function trimRequest(body: unknown): { req: Json; chars: number } {
  let b: Json = {};
  if (typeof body === "string") { try { b = JSON.parse(body) as Json; } catch { b = {}; } }
  else if (typeof FormData !== "undefined" && body instanceof FormData) {
    for (const k of ["model", "n"]) { const v = body.get(k); if (typeof v === "string") b[k] = v; }
  }
  const req: Json = {};
  for (const k of ["model", "model_id", "ai_model", "n"]) if (b[k] != null) req[k] = b[k];
  const texts = [b["text"], b["input"], ...(Array.isArray(b["inputs"]) ? (b["inputs"] as Json[]).map((i) => i?.["text"]) : [])];
  const chars = texts.reduce<number>((s, t) => s + (typeof t === "string" ? t.length : 0), 0);
  return { req, chars };
}

/** Only the provider's id, model and usage counts from a reply. */
export function trimReply(json: unknown): Json {
  const j = (json && typeof json === "object" ? json : {}) as Json;
  const out: Json = {};
  for (const k of ["id", "model", "usage", "usageMetadata", "status", "metrics", "version", "duration"]) if (j[k] != null) out[k] = j[k];
  if (Array.isArray(j["data"])) out["data"] = (j["data"] as unknown[]).map(() => ({}));
  return out;
}

/**
 * A reply too large to parse whole (an image call returns megabytes of
 * base64): its id and model are at the head and its usage block at the tail,
 * so only those two ends are kept while the body streams past.
 */
export function usageFromEnds(head: string, tail: string): Json {
  const out: Json = {};
  const id = head.match(/"id"\s*:\s*"([^"]{1,120})"/); if (id) out["id"] = id[1];
  const model = (head.match(/"model"\s*:\s*"([^"]{1,120})"/) ?? tail.match(/"model"\s*:\s*"([^"]{1,120})"/)); if (model) out["model"] = model[1];
  const at = tail.lastIndexOf('"usage"');
  if (at >= 0) {
    const open = tail.indexOf("{", at);
    let depth = 0;
    for (let i = open; open >= 0 && i < tail.length; i++) {
      if (tail[i] === "{") depth++;
      else if (tail[i] === "}" && --depth === 0) { try { out["usage"] = JSON.parse(tail.slice(open, i + 1)); } catch { /* not a usage block */ } break; }
    }
  }
  return out;
}

const SMALL = 256 * 1024;

/** A JSON reply reduced to id, model and usage, without holding a large body in memory. */
async function readReply(res: Response): Promise<Json> {
  const reader = res.body?.getReader();
  if (!reader) return {};
  const dec = new TextDecoder();
  let head = ""; let tail = ""; let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    const text = dec.decode(value, { stream: true });
    if (size <= SMALL) head += text;
    tail = (tail + text).slice(-8192);
  }
  if (size <= SMALL) { try { return trimReply(JSON.parse(head)); } catch { return {}; } }
  return usageFromEnds(head.slice(0, 4096), tail);
}

/** The usage lines of a Claude stream, and nothing else of it. */
export function usageLines(sse: string): string {
  return sse.split("\n").filter((l) => l.startsWith("data:") && /"type":\s*"message_(start|delta)"/.test(l)).map((l) => {
    try {
      const d = JSON.parse(l.slice(5)) as Json;
      const m = (d["message"] ?? {}) as Json;
      return `data: ${JSON.stringify(d["type"] === "message_start" ? { type: "message_start", message: { model: m["model"], usage: m["usage"] } } : { type: "message_delta", usage: d["usage"] })}`;
    } catch { return ""; }
  }).filter(Boolean).join("\n");
}

/** The ai-keys.ts workflow a key belongs to, from the environment; the key is compared, never sent. */
export function workflowForKey(key: string | null | undefined, env: Record<string, string | undefined>): string {
  if (!key) return "anthropic:unsigned";
  let shared = false;
  for (const [name, value] of Object.entries(env)) {
    if (!value || value.trim() !== key) continue;
    if (name === "ANTHROPIC_API_KEY") { shared = true; continue; }
    const m = name.match(/^ANTHROPIC_KEY_(.+)$/) ?? name.match(/^(IG_.+|INSTAGRAM_.+)$/);
    if (m) return m[1]!.toLowerCase().replace(/_/g, "-");
  }
  return shared ? "anthropic:shared-key" : "anthropic:other-key";
}

const headerOf = (init: RequestInit | undefined, input: unknown, name: string): string | null => {
  try {
    const h = init?.headers ?? (input instanceof Request ? input.headers : undefined);
    if (!h) return null;
    return new Headers(h as HeadersInit).get(name);
  } catch { return null; }
};

const uid = (): string => { try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; } };

const state = globalThis as unknown as { __zyvAiMeter?: boolean };

async function keepAlive(p: Promise<unknown>): Promise<void> {
  // On workerd, let the report outlive the response; elsewhere it simply runs.
  try {
    const mod = (await import(/* @vite-ignore */ "cloudflare:workers")) as { waitUntil?: (p: Promise<unknown>) => void };
    mod.waitUntil?.(p);
  } catch { /* not workerd */ }
}

export function installAiMeter(env: Record<string, string | undefined> = process.env): void {
  if (state.__zyvAiMeter || typeof globalThis.fetch !== "function") return;
  state.__zyvAiMeter = true;
  const real = globalThis.fetch.bind(globalThis);

  const report = (events: MeterEvent[]): void => {
    const token = env.ZYVORAH_WEBHOOK_TOKEN?.trim();
    if (!token) return;
    const base = (env.OS_BASE_URL ?? "https://os.magnitudegroup.in").replace(/\/$/, "");
    const p = real(`${base}/api/ai-meter/events`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-zyvorah-token": token },
      body: JSON.stringify({ system: SYSTEM, events }), signal: AbortSignal.timeout(8000),
    }).then(() => undefined, () => undefined);
    void keepAlive(p);
  };

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const res = await real(input as RequestInfo, init);
    try {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const at = providerOf(url);
      if (!at) return res;
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      const { req, chars } = trimRequest(init?.body);
      const tail = at.path.replace(/^\/v\d+(beta)?\//, "").replace(/\/[A-Za-z0-9_-]{16,}(?=\/|$)/g, "").slice(0, 60);
      const workflow = at.provider === "anthropic" ? workflowForKey(headerOf(init, input, "x-api-key"), env) : `${at.provider}:${tail}`;
      const headers: Json = { "character-cost": res.headers.get("character-cost") ?? res.headers.get("x-character-count") ?? (chars || undefined), "request-id": res.headers.get("request-id") ?? undefined };
      const type = res.headers.get("content-type") ?? "";
      const send = (extra: Partial<Exchange>) => {
        const id = typeof extra.res?.["id"] === "string" ? `${at.provider}:${extra.res["id"] as string}` : `${at.provider}:${uid()}`;
        report([{ id, workflow, at: new Date().toISOString(), exchange: { url: url.split("?")[0]!, method, status: res.status, req, headers, ...extra } }]);
      };
      if (type.includes("json")) void readReply(res.clone()).then((j) => send({ res: j }), () => send({}));
      else if (type.includes("event-stream") && at.provider === "anthropic") void res.clone().text().then((t) => send({ sse: usageLines(t) }), () => send({}));
      else if (method === "POST") send({});
    } catch { /* the meter is never the call's problem */ }
    return res;
  }) as typeof fetch;
}

installAiMeter();
