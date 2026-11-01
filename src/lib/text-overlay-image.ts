import sharp from "sharp";
import { renderTextOverlay } from "./text-overlay-server";
import { overlayPlacementError } from "./text-overlay";
import type { CropData } from "./visualizer";

/** Media-container proof/legacy-master path. Throws on failure; never omits paid lettering. */
export async function addTextToImage(image: Buffer, crop: CropData): Promise<Buffer> {
  const overlay = crop.textOverlay;
  if (!overlay) {
    if (crop.personalisation?.childName) throw new Error("Name order has no approved printable layout");
    return image;
  }
  const problem = overlayPlacementError(overlay, crop.wallWidthCm, crop.wallHeightCm, crop.doors);
  if (problem) throw new Error(problem);
  const meta = await sharp(image, { limitInputPixels: false }).metadata();
  if (!meta.width || !meta.height) throw new Error("Unknown master dimensions");
  const w = Math.max(1, Math.round(meta.width * overlay.width));
  const h = Math.max(1, Math.round(meta.height * overlay.width * crop.wallWidthCm / (2 * crop.wallHeightCm)));
  const r = await renderTextOverlay(overlay, w);
  const tile = await sharp(Buffer.from(await r.arrayBuffer())).resize(w, h).png().toBuffer();
  const composed = await sharp(image, { limitInputPixels: false }).composite([{ input: tile,
    left: Math.round(overlay.x * meta.width), top: Math.round(overlay.y * meta.height) }]).png().toBuffer();
  return overlay.companion ? addTextToImage(composed, { ...crop, textOverlay: overlay.companion }) : composed;
}
