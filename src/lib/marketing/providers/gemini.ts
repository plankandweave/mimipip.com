import { serviceFetch, transportAvailable } from '@/brand/service-transport';
const fetch: typeof globalThis.fetch = (input, init) => serviceFetch('ai', input, init);
import { istDateKey } from "@/lib/ist";
// Nano Banana (Gemini image) — the first real provider for the synthesized-
// lifestyle lane. Registry-bound per MKTG OS decision D14: the binding lives in
// pos.model_binding (creative.image_generate → google/gemini-2.5-flash-image);
// this file is the adapter, called via a plain REST fetch rather than an SDK,
// so no provider SDK gets hard-coded into the engine.
//
// The contract (see image-gen.ts): OUR real flat pattern goes in as an image
// input; the model renders a styled room AROUND it. Prompts describe a finished
// room only — never printing, machinery or process (voice.ts hard rule).
//
// Spend guard (R34): a per-day generation cap enforced HERE, before the API is
// touched. Over cap → throws, and the pipeline falls back to owned scene
// renders, exactly like any other generation failure.
import {
  buildScenePrompt,
  type ImageGenProvider,
  type LifestylePrompt,
  type LifestyleResult,
} from "./image-gen";

const MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
const DAILY_CAP = Number(process.env.MARKETING_IMAGE_DAILY_CAP || 12);

// In-memory day counter. Serverless instances reset it, so this is a soft
// guard; the hard record is the ledger row each generated asset writes. A
// single cron tick generates at most a handful, so soft is sufficient here.
let day = "";
let generatedToday = 0;

function checkCap() {
  const today = istDateKey();
  if (day !== today) {
    day = today;
    generatedToday = 0;
  }
  if (generatedToday >= DAILY_CAP) {
    throw new Error(
      `generation budget: daily cap of ${DAILY_CAP} images reached — falling back to owned scenes`,
    );
  }
  generatedToday++;
}

export class GeminiImageProvider implements ImageGenProvider {
  readonly name = `google/${MODEL}`;
  get available(): boolean {
    return transportAvailable('ai') && !!process.env.GEMINI_API_KEY;
  }

  async generate(p: LifestylePrompt): Promise<LifestyleResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    checkCap();

    // Fetch our flat pattern and send it as inline image data.
    const patternRes = await fetch(p.patternUrl);
    if (!patternRes.ok) throw new Error(`pattern fetch failed: ${patternRes.status}`);
    const mime = patternRes.headers.get("content-type")?.split(";")[0] || "image/jpeg";
    const patternB64 = Buffer.from(await patternRes.arrayBuffer()).toString("base64");

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { inline_data: { mime_type: mime, data: patternB64 } },
                { text: buildScenePrompt(p) },
              ],
            },
          ],
          generationConfig: {
            responseModalities: ["IMAGE"],
            ...(p.aspect ? { imageConfig: { aspectRatio: p.aspect } } : {}),
          },
        }),
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`gemini ${res.status}: ${body.slice(0, 300)}`);
    }
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[];
    };
    const b64 = json.candidates
      ?.flatMap((c) => c.content?.parts ?? [])
      .find((part) => part.inlineData?.data)?.inlineData?.data;
    if (!b64) throw new Error("gemini returned no image part");
    return {
      image: Buffer.from(b64, "base64"),
      provider: this.name,
      meta: { model: MODEL, capRemainingToday: DAILY_CAP - generatedToday },
    };
  }
}
