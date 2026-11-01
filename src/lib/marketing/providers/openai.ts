import { serviceFetch } from "../../../brand/service-transport";
const fetch: typeof globalThis.fetch = (input,init) => serviceFetch("ai",input,init);
import { istDateKey } from "@/lib/ist";
// OpenAI image provider for the synthesized-lifestyle lane — the slot the
// registry left open ("e.g. gpt-image-1 (image edit with mask)"). Activated
// per Roheena's call (2026-09-05): marketing image generation runs on OpenAI,
// not Gemini. The studio route already speaks this exact API for its room
// scenes (images/edits with the flat as an image input), so the shape here
// mirrors a call that is proven in this codebase.
//
// The contract (see image-gen.ts): OUR real flat pattern goes in as an image
// input; the model renders a styled room AROUND it. Prompts describe a
// finished room only — never printing, machinery or process (voice.ts rule).
//
// Spend guard mirrors gemini.ts: a soft per-day cap enforced before the API
// is touched; over cap → throws, and the pipeline falls back to owned scenes.
import {
  buildScenePrompt,
  type ImageGenProvider,
  type LifestylePrompt,
  type LifestyleResult,
} from "./image-gen";

const MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
const DAILY_CAP = Number(process.env.MARKETING_IMAGE_DAILY_CAP || 12);

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

/** Nearest supported output size for the requested aspect. */
function sizeFor(aspect: LifestylePrompt["aspect"]): string {
  switch (aspect) {
    case "9:16":
    case "4:5":
      return "1024x1536";
    case "1:1":
    default:
      return "1024x1024";
  }
}

export class OpenAIImageProvider implements ImageGenProvider {
  readonly name = `openai/${MODEL}`;
  get available(): boolean {
    return !!process.env.OPENAI_API_KEY;
  }

  async generate(p: LifestylePrompt): Promise<LifestyleResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
    checkCap();

    // Fetch our flat pattern and attach it as the image input.
    const patternRes = await fetch(p.patternUrl);
    if (!patternRes.ok) throw new Error(`pattern fetch failed: ${patternRes.status}`);
    const mime = patternRes.headers.get("content-type")?.split(";")[0] || "image/jpeg";
    const pattern = Buffer.from(await patternRes.arrayBuffer());

    const form = new FormData();
    form.append("model", MODEL);
    form.append("size", sizeFor(p.aspect));
    form.append("quality", "medium");
    form.append("image", new Blob([new Uint8Array(pattern)], { type: mime }), "pattern.jpg");
    form.append("prompt", buildScenePrompt(p));

    const res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`openai images ${res.status}: ${body.slice(0, 300)}`);
    }
    const json = (await res.json()) as { data?: { b64_json?: string }[] };
    const b64 = json.data?.find((d) => d.b64_json)?.b64_json;
    if (!b64) throw new Error("openai returned no image data");
    return {
      image: Buffer.from(b64, "base64"),
      provider: this.name,
      meta: { model: MODEL, capRemainingToday: DAILY_CAP - generatedToday },
    };
  }
}
