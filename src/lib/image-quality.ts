import { printPlan, seamlessPlan, type CropData } from "./visualizer";
/** A source-resolution advisory, never certification of a print master or semantic correctness. */
export function imageQuality(crop: CropData | null | undefined) {
  if (
    !crop ||
    crop.zoom < 1 ||
    ![crop.offsetX, crop.offsetY].every(
      (n) => Number.isFinite(n) && n >= 0 && n <= 1,
    ) ||
    ![
      crop.sourceW,
      crop.sourceH,
      crop.wallWidthCm,
      crop.wallHeightCm,
      crop.zoom,
    ].every((n) => typeof n === "number" && Number.isFinite(n) && n > 0)
  )
    return null;
  const ppi = (
    crop.seamless?.repeatWidthCm ? seamlessPlan(crop) : printPlan(crop)
  ).effectiveDpi;
  return {
    version: 1,
    ppi,
    sourceWidth: crop.sourceW!,
    sourceHeight: crop.sourceH!,
    wallWidthCm: crop.wallWidthCm,
    wallHeightCm: crop.wallHeightCm,
    zoom: crop.zoom,
    band: ppi < 75 ? "review" : ppi < 150 ? "viewing-distance" : "detail",
    basis: "preview-source",
  };
}
