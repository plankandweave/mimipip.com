import { AutoProcessor, CLIPVisionModelWithProjection, RawImage, env } from "@xenova/transformers";

// transformers.js caches model weights next to itself, in
// node_modules/@xenova/transformers/.cache, which is read-only inside a Vercel
// serverless function. That is survivable — the library warns and downloads
// into memory anyway (verified locally against an unwritable path) — but it
// re-fetches ~90 MB on every single call instead of once per instance. /tmp is
// the one writable path in the runtime, so point the cache there and let a warm
// instance reuse the download.
//
// This is a speed fix, NOT the reason production has no embeddings. Every
// design created since 2026-07-19 has a null image_embedding: a backfill ran
// that day and live embedding has never once succeeded on Vercel. The cause is
// still unidentified because the only caller swallowed the exception, so
// nothing anywhere recorded what it was. The re-tag worker now writes that
// reason to retag_queue.error (see retag_note_embed_error) — the next run will
// say what actually breaks, and it can be fixed on evidence rather than guessed
// at, which is how this comment nearly ended up claiming a cause it had not
// proved.
env.cacheDir = process.env.TRANSFORMERS_CACHE ?? "/tmp/transformers-cache";
// The weights are not in the deployment, so fetching them must stay allowed.
env.allowRemoteModels = true;
env.allowLocalModels = false;

// Matches the 512-dim `products.image_embedding vector(512)` column + the
// match_products_by_embedding / related_products_by_embedding RPCs already
// applied to the database (migration `visual_search_embeddings`).
const MODEL_ID = "Xenova/clip-vit-base-patch32";

let processorPromise: ReturnType<typeof AutoProcessor.from_pretrained> | null = null;
let modelPromise: ReturnType<typeof CLIPVisionModelWithProjection.from_pretrained> | null = null;

function getProcessor() {
  processorPromise ??= AutoProcessor.from_pretrained(MODEL_ID);
  return processorPromise;
}

function getModel() {
  modelPromise ??= CLIPVisionModelWithProjection.from_pretrained(MODEL_ID);
  return modelPromise;
}

function l2normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return norm > 0 ? v.map((x) => x / norm) : v;
}

async function embed(image: RawImage): Promise<number[]> {
  const [processor, model] = await Promise.all([getProcessor(), getModel()]);
  const inputs = await processor(image);
  const { image_embeds } = await model(inputs);
  return l2normalize(Array.from(image_embeds.data as Float32Array));
}

export async function embedImageUrl(url: string): Promise<number[]> {
  const image = await RawImage.read(url);
  return embed(image);
}

export async function embedImageBuffer(buf: ArrayBuffer): Promise<number[]> {
  const image = await RawImage.fromBlob(new Blob([buf]));
  return embed(image);
}

export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
