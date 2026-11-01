// The synthesized-lifestyle lane. When we want a FRESH room the catalogue's
// scene renders don't already have (a different interior style, season, or
// vignette), we generate it — but the mural on the wall must be OUR real design,
// not something the model invented. So every provider takes our flat pattern as
// an image input and is instructed to place THAT artwork on the wall of a newly
// generated room. The room is synthetic; the wallpaper is genuinely ours.
//
// This is a provider-agnostic interface. No concrete model is wired yet — that
// waits on the model choice + API key. Until then `activeProvider()` returns the
// null provider and the pipeline simply uses owned scene renders instead, so the
// engine runs fully without this lane.
//
// HARD RULE reminder: prompts here describe a finished, styled ROOM only. They
// never describe or depict printing, machinery, or process. See voice.ts.

export type LifestylePrompt = {
  /** Public URL of our clean flat pattern — the artwork to place on the wall. */
  patternUrl: string;
  /** The room brief, e.g. "a calm north-facing bedroom, morning light, linen bedding". */
  room: string;
  /** Optional style steer, e.g. "editorial, muted, Indian-modern". */
  style?: string;
  aspect?: "4:5" | "9:16" | "1:1";
  /** When true the artwork is rendered as a framed canvas on the wall, not a full-wall mural. */
  canvasWallArt?: boolean;
};

export type LifestyleResult = {
  /** The generated scene as a JPEG/PNG buffer, mural = our pattern. */
  image: Buffer;
  provider: string;
  meta?: Record<string, unknown>;
};

export interface ImageGenProvider {
  readonly name: string;
  readonly available: boolean;
  generate(prompt: LifestylePrompt): Promise<LifestyleResult>;
}

/** Shared prompt scaffold so every provider stays on-brand and leak-free. */
export function buildScenePrompt(p: LifestylePrompt): string {
  const style = p.style ?? "editorial, calm, premium, Indian-modern interior photography";
  const placement = p.canvasWallArt
    ? `The supplied artwork is shown as a single elegant canvas print in a slim premium frame, hung as a striking piece of wall art on the wall — not a wallpaper mural, not covering the whole wall, sized naturally for the room.`
    : `The wall features the supplied artwork as a full-wall mural, edge to edge, at true architectural scale — the artwork is the hero of the room.`;
  return [
    `A photorealistic interior photograph of ${p.room}.`,
    placement,
    `Natural light, realistic shadows and reflections, tasteful styling.`,
    `Style: ${style}.`,
    `Do not alter, redraw, crop, or stylise the supplied artwork — reproduce it faithfully on the wall.`,
    `No text, no logos, no watermarks, no furniture obscuring the artwork.`,
  ].join(" ");
}

/** The no-op provider used until a real model is configured. */
class NullProvider implements ImageGenProvider {
  readonly name = "none";
  readonly available = false;
  async generate(): Promise<LifestyleResult> {
    throw new Error(
      "No image-generation provider configured. Set MARKETING_IMAGE_PROVIDER + its API key, " +
        "or the pipeline will use owned scene renders for this slot.",
    );
  }
}

import { GeminiImageProvider } from "./gemini";
import { OpenAIImageProvider } from "./openai";

// ---- Provider registry -----------------------------------------------------
// To wire a real model later: implement ImageGenProvider (taking patternUrl as
// an image input / reference), register it here keyed by MARKETING_IMAGE_PROVIDER,
// and set `available` from the presence of its API key. The rest of the engine
// needs no changes — it already calls activeProvider().generate().

const REGISTRY: Record<string, () => ImageGenProvider> = {
  none: () => new NullProvider(),
  // Nano Banana. Activates when MARKETING_IMAGE_PROVIDER=gemini (or nano-banana)
  // and GEMINI_API_KEY is set; until then the lane stays on owned scene renders.
  gemini: () => new GeminiImageProvider(),
  "nano-banana": () => new GeminiImageProvider(),
  // Roheena's call (2026-09-05): marketing image generation runs on OpenAI.
  openai: () => new OpenAIImageProvider(),
  // fal:     () => new FalProvider(),           // e.g. Flux + reference
};

export function activeProvider(): ImageGenProvider {
  const key = process.env.MARKETING_IMAGE_PROVIDER || "none";
  const make = REGISTRY[key] ?? REGISTRY.none;
  return make();
}

export function lifestyleLaneReady(): boolean {
  return activeProvider().available;
}
