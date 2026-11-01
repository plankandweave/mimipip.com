import sharp from "sharp";

/**
 * What the Proposal Studio's Claude may be shown of a client photograph.
 *
 * Claude takes an image up to 5 MB; a client's phone photograph is often
 * more. The rendition (1600 px JPEG, the same one the deck ships) is the
 * first choice; where sharp cannot run on the deployed runtime, the original
 * goes as it is when it fits, and otherwise the photograph is left out and
 * described by its label and space read alone rather than failing the whole
 * direction. Kept apart from proposal-studio.ts (server-only) so it can be
 * tested.
 */
export const MODEL_IMAGE_MAX_BYTES = 4_500_000;
export type ModelImage = { data: string; media_type: "image/jpeg" | "image/png" | "image/webp" };

export async function renditionForModel(bytes: Buffer): Promise<Buffer> {
  return sharp(bytes, { failOn: "none" })
    .rotate()
    .resize({ width: 1600, withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
}

export async function imageForModel(
  bytes: Buffer, mime: string, rendition: (b: Buffer) => Promise<Buffer> = renditionForModel,
): Promise<ModelImage | null> {
  try {
    const jpeg = await rendition(bytes);
    if (jpeg.length <= MODEL_IMAGE_MAX_BYTES) return { data: jpeg.toString("base64"), media_type: "image/jpeg" };
  } catch (e) {
    console.warn("[studio] rendition for the model failed; sending the original:", (e as Error)?.message);
  }
  if (bytes.length > MODEL_IMAGE_MAX_BYTES) return null;
  const media_type = /^image\/(jpeg|png|webp)$/.test(mime) ? (mime as ModelImage["media_type"]) : "image/jpeg";
  return { data: bytes.toString("base64"), media_type };
}

export const imageBlock = (im: ModelImage) =>
  ({ type: "image" as const, source: { type: "base64" as const, media_type: im.media_type, data: im.data } });
